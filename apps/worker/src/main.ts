import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '@platform/config';
import {
  assertBrowserAuthRuntimePrivileges,
  assertProductionRuntimeAuthority,
  assertWorkflowRuntimePrivileges,
  assertWorkflowSchedulerPrivileges,
  createDb,
} from '@platform/db';
import { createStructuredLogger, platformMetrics } from '@platform/observability';
import { PostgresWorkflowRuntime } from '@platform/workflow-runtime';

const config = loadConfig();
const logger = createStructuredLogger('worker');
const database = createDb(config.databaseUrl);
const client = database.$client;

// WAVE-AB P1: the worker fails closed unless its runtime identity is safe and
// the narrow scheduler/DML boundaries are exactly as expected.
const runtimeRole = await assertProductionRuntimeAuthority(client);
await assertBrowserAuthRuntimePrivileges(client, runtimeRole);
await assertWorkflowRuntimePrivileges(client, runtimeRole);
await assertWorkflowSchedulerPrivileges(client, runtimeRole);
logger.emit('info', 'worker.authority_verified', { role: runtimeRole });

const runtime = new PostgresWorkflowRuntime(client);
const workerId = `${hostname()}-${process.pid}-${randomUUID()}`;
let stopping = false;
let active = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  logger.emit('info', 'worker.shutdown', { signal });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

async function executeClaimed(claimed: { id: string; tenantId: string; workflowType: string; approvalId?: string }): Promise<void> {
  active = true;
  // The scheduler's authoritative tenant flows into every tenant-scoped
  // transition, including failure handling; there is no second unscoped
  // claim inside the worker.
  const context = { tenantId: claimed.tenantId, roles: [], permissions: [], locale: 'en' as const };
  try {
    await runtime.markRunning(claimed.id, workerId, context);
    platformMetrics.recordSignal('workflow', 'started');
    logger.emit('info', 'workflow.claimed', { workflowType: claimed.workflowType });

    if (claimed.workflowType === 'approval-gated') {
      await runtime.waitForApproval(claimed.id, workerId, { approvalId: claimed.approvalId ?? `approval-${claimed.id}` }, context);
      platformMetrics.recordSignal('workflow', 'blocked');
      logger.emit('info', 'workflow.waiting_approval', { workflowType: claimed.workflowType });
      return;
    }

    await runtime.completeExecution(claimed.id, workerId, { result: { status: 'simulated' } }, context);
    platformMetrics.recordSignal('workflow', 'succeeded');
    logger.emit('info', 'workflow.completed', { workflowType: claimed.workflowType });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'worker execution failed';
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.name) ? error.name : 'WORKER_EXECUTION_FAILED';
    try {
      await runtime.failExecution(claimed.id, workerId, {
        code,
        message,
        retryable: !/validation|authorization|tenant|approval/i.test(message),
      }, context);
    } catch {
      // A lost/expired lease cannot be failed by this worker; recovery reclaims it.
    }
    platformMetrics.recordSignal('workflow', 'failed');
    logger.emit('error', 'workflow.failed', { code });
  } finally {
    active = false;
  }
}

while (!stopping) {
  try {
    const recovered = await runtime.recoverExpiredLeases();
    if (recovered > 0) {
      platformMetrics.recordSignal('workflow', 'verified');
      logger.emit('warn', 'workflow.recovered', { recovered });
    }
    const claimed = await runtime.claimNext(workerId);
    if (claimed) {
      await executeClaimed(claimed);
    } else {
      await sleep(1000);
    }
  } catch (error) {
    platformMetrics.recordSignal('workflow', 'failed');
    logger.emit('error', 'worker.poll_failed', {
      code: error instanceof Error ? error.name : 'WORKER_POLL_FAILED',
    });
    await sleep(2000);
  }
}

while (active) {
  await sleep(100);
}
await client.end({ timeout: 5 });
process.exitCode = 0;
