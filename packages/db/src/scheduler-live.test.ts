/**
 * WAVE-AB R2 P1: mandatory live actual-role scheduler proof.
 *
 * Real PostgreSQL, real codecore_app runtime identity, real
 * PostgresWorkflowRuntime.claimNext()/recoverExpiredLeases() through the
 * SECURITY DEFINER boundary — never FakePostgres and never migration-owner
 * masquerade for the scheduler path.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import postgres from 'postgres';

import { PostgresWorkflowRuntime } from '@platform/workflow-runtime';
import { productionPostgresOptions } from './postgres-connection.js';
import {
  assertProductionRuntimeAuthority,
  assertBrowserAuthRuntimePrivileges,
  assertWorkflowRuntimePrivileges,
  assertWorkflowSchedulerPrivileges,
  PRODUCTION_APP_ROLE,
} from './runtime-role-verify.js';
import { sharedTestAppPassword } from './test-app-password.js';

function resolvePilotDatabaseUrl(): string | undefined {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) return envUrl;
  try {
    const passwordFile = join(homedir(), '.nawa-secrets', 'phase1-postgres-password.txt');
    const password = readFileSync(passwordFile, 'utf8').trim();
    if (!password) return undefined;
    return `postgresql://phase1_owner:${encodeURIComponent(password)}@127.0.0.1:55432/ai_marketing_phase1`;
  } catch {
    return undefined;
  }
}

const ownerUrl = resolvePilotDatabaseUrl();
const tlsReady = (() => {
  try {
    return ownerUrl !== undefined &&
      new URL(ownerUrl).searchParams.getAll('sslmode').join() === 'verify-full';
  } catch {
    return false;
  }
})();
const skipReason = ownerUrl
  ? 'pilot PostgreSQL must use sslmode=verify-full for live scheduler tests'
  : 'pilot PostgreSQL unavailable';

function appUrl(): string {
  const url = new URL(ownerUrl!);
  url.username = PRODUCTION_APP_ROLE;
  url.password = sharedTestAppPassword();
  return url.toString();
}

test(
  'live actual-role scheduler: claimNext, tenant propagation, lease safety, and final-attempt semantics',
  { skip: !tlsReady && skipReason, timeout: 180_000 },
  async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const owner = postgres(ownerUrl!, productionPostgresOptions(ownerUrl!, { max: 1, prepare: false }));
    const app = postgres(appUrl(), productionPostgresOptions(appUrl(), { max: 2, prepare: false }));
    const runtimeA = new PostgresWorkflowRuntime(app);
    const runtimeB = new PostgresWorkflowRuntime(app);
    const contextA = { tenantId: tenantA, roles: ['tenant_admin' as const], permissions: [], locale: 'en' as const };
    const contextB = { tenantId: tenantB, roles: ['tenant_admin' as const], permissions: [], locale: 'en' as const };
    const results: Record<string, boolean> = {};
    try {
      await owner.unsafe(
        `INSERT INTO tenants(id, name) VALUES ($1::uuid, $2), ($3::uuid, $4)`,
        [tenantA, `ABREM2 synthetic A ${tenantA}`, tenantB, `ABREM2 synthetic B ${tenantB}`],
      );

      // 1. Owner inserts an eligible row (migration-authority seeding only).
      const eligibleId = randomUUID();
      await owner.unsafe(
        `INSERT INTO codecore_workflow_executions(id, tenant_id, workflow_id, workflow_type, idempotency_key, next_attempt_at)
         VALUES ($1::uuid, $2::uuid, $3, 'workflow', $4, now())`,
        [eligibleId, tenantA, `wf-${eligibleId}`, `abrem2-eligible-${eligibleId}`],
      );

      // 2. Unscoped runtime cannot see the row.
      const unscoped = await app.unsafe(`SELECT count(*)::int AS c FROM codecore_workflow_executions WHERE id = $1::uuid`, [eligibleId]);
      assert.equal(unscoped[0]?.c, 0, 'unscoped runtime read must see nothing');
      results.unscopedInvisible = true;

      // 3-4. Runtime claimNext claims exactly that row through the boundary.
      const claimed = await runtimeA.claimNext('live-worker-a');
      assert.ok(claimed, 'claimNext must claim the eligible row');
      assert.equal(claimed.id, eligibleId);
      assert.equal(claimed.status, 'claimed');
      results.claimNextWorks = true;

      // 5. Authoritative tenant matches the seeded tenant.
      assert.equal(claimed.tenantId, tenantA);
      results.authoritativeTenant = true;

      // 6. Second worker cannot steal the active lease.
      const second = await runtimeB.claimNext('live-worker-b');
      assert.ok(!second || second.id !== eligibleId, 'active lease must not be claimable by another worker');
      results.noSteal = true;

      // 7-8. Worker transitions under the authoritative tenant succeed.
      await runtimeA.markRunning(claimed.id, 'live-worker-a', contextA);
      await runtimeA.completeExecution(claimed.id, 'live-worker-a', {}, contextA);
      const completed = await runtimeA.getExecution(eligibleId, contextA);
      assert.equal(completed.status, 'completed');
      results.tenantScopedTransitions = true;

      // 9. Wrong tenant is rejected before mutation.
      const wrongId = randomUUID();
      await owner.unsafe(
        `INSERT INTO codecore_workflow_executions(id, tenant_id, workflow_id, workflow_type, idempotency_key, next_attempt_at)
         VALUES ($1::uuid, $2::uuid, $3, 'workflow', $4, now())`,
        [wrongId, tenantA, `wf-${wrongId}`, `abrem2-wrong-${wrongId}`],
      );
      await assert.rejects(
        () => runtimeB.claimExecution(wrongId, 'live-worker-b', new Date(), contextB),
        /Cross-tenant|not found/i,
      );
      const wrongAfter = await owner.unsafe(`SELECT status, version FROM codecore_workflow_executions WHERE id = $1::uuid`, [wrongId]);
      assert.equal(String(wrongAfter[0]?.status), 'pending', 'wrong-tenant rejection must not mutate');
      assert.equal(Number(wrongAfter[0]?.version), 1);
      results.wrongTenantNoMutation = true;

      // 10. Tenant scope never leaks to the pool outside a transaction.
      const leaked = await app.unsafe(`SELECT current_setting('app.tenant_id', true) AS t`);
      assert.equal(leaked[0]?.t ?? '', '');
      results.noPoolLeak = true;

      // 11-12. Expired lease recovered; active lease preserved.
      const expiredId = randomUUID();
      const activeId = randomUUID();
      await owner.unsafe(
        `INSERT INTO codecore_workflow_executions(id, tenant_id, workflow_id, workflow_type, idempotency_key, status, attempt_count, max_attempts, lease_owner, lease_expires_at, next_attempt_at)
         VALUES ($1::uuid, $2::uuid, $3, 'workflow', $4, 'claimed', 1, 3, 'dead-worker', now() - interval '1 minute', now()),
                ($5::uuid, $2::uuid, $6, 'workflow', $7, 'claimed', 1, 3, 'busy-worker', now() + interval '10 minutes', now())`,
        [expiredId, tenantA, `wf-${expiredId}`, `abrem2-expired-${expiredId}`, activeId, `wf-${activeId}`, `abrem2-active-${activeId}`],
      );
      const recovered = await runtimeA.recoverExpiredLeases();
      assert.ok(recovered >= 1, 'expired lease must be reclaimed');
      const recoveredRow = await owner.unsafe(`SELECT status, lease_owner FROM codecore_workflow_executions WHERE id = $1::uuid`, [expiredId]);
      assert.equal(String(recoveredRow[0]?.status), 'retry_scheduled');
      assert.equal(recoveredRow[0]?.lease_owner, null);
      const activeRow = await owner.unsafe(`SELECT status, lease_owner FROM codecore_workflow_executions WHERE id = $1::uuid`, [activeId]);
      assert.equal(String(activeRow[0]?.status), 'claimed');
      assert.equal(String(activeRow[0]?.lease_owner), 'busy-worker');
      results.expiredRecovered = true;
      results.activePreserved = true;

      // Recovery audit recorded exact rows.
      const audit = await owner.unsafe(
        `SELECT count(*)::int AS c FROM codecore_workflow_execution_events WHERE execution_id = $1::uuid AND event_type = 'workflow_recovered'`,
        [expiredId],
      );
      assert.equal(audit[0]?.c, 1, 'recovery audit must record exactly the recovered row');
      results.exactRecoveryAudit = true;

      // 13. Final-attempt expiration terminalizes instead of requeueing.
      const finalId = randomUUID();
      await owner.unsafe(
        `INSERT INTO codecore_workflow_executions(id, tenant_id, workflow_id, workflow_type, idempotency_key, status, attempt_count, max_attempts, lease_owner, lease_expires_at, next_attempt_at)
         VALUES ($1::uuid, $2::uuid, $3, 'workflow', $4, 'claimed', 3, 3, 'dead-final', now() - interval '1 minute', now())`,
        [finalId, tenantA, `wf-${finalId}`, `abrem2-final-${finalId}`],
      );
      await runtimeA.recoverExpiredLeases();
      const finalRow = await owner.unsafe(`SELECT status, error_code, attempt_count, terminal_at FROM codecore_workflow_executions WHERE id = $1::uuid`, [finalId]);
      assert.equal(String(finalRow[0]?.status), 'failed');
      assert.equal(String(finalRow[0]?.error_code), 'MAX_ATTEMPTS_EXHAUSTED');
      assert.ok(finalRow[0]?.terminal_at, 'final attempt must terminalize');
      assert.equal(Number(finalRow[0]?.attempt_count), 3, 'attempts must never exceed max');
      results.finalAttemptTerminal = true;

      // 14. Runnable row behind an exhausted row still progresses. Remove
      // earlier eligible fixtures so only the exhausted blocker and the
      // runnable row remain.
      await owner.unsafe(`DELETE FROM codecore_workflow_executions WHERE id IN ($1::uuid, $2::uuid)`, [wrongId, expiredId]);
      const behindId = randomUUID();
      await owner.unsafe(
        `INSERT INTO codecore_workflow_executions(id, tenant_id, workflow_id, workflow_type, idempotency_key, status, attempt_count, max_attempts, next_attempt_at)
         VALUES ($1::uuid, $2::uuid, $3, 'workflow', $4, 'pending', 0, 3, now() + interval '1 second'),
                ($5::uuid, $2::uuid, $6, 'workflow', $7, 'pending', 3, 3, now() - interval '1 hour')`,
        [behindId, tenantA, `wf-${behindId}`, `abrem2-behind-${behindId}`, randomUUID(), `wf-behind-blocker`, `abrem2-blocker-${randomUUID()}`],
      );
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const progressed = await runtimeA.claimNext('live-worker-c');
      assert.ok(progressed, 'runnable row behind exhausted row must be claimable');
      assert.equal(progressed.id, behindId);
      results.noStarvation = true;

      // Startup authority primitives pass against the actual session.
      const role = await assertProductionRuntimeAuthority(app);
      await assertWorkflowSchedulerPrivileges(app, role);
      await assertWorkflowRuntimePrivileges(app, role);
      await assertBrowserAuthRuntimePrivileges(app, role);
      results.startupAuthority = true;

      console.log(`LIVE_SCHEDULER_EVIDENCE=${JSON.stringify(results)}`);
    } finally {
      await owner.unsafe(`DELETE FROM codecore_workflow_executions WHERE tenant_id IN ($1::uuid, $2::uuid)`, [tenantA, tenantB]);
      await owner.unsafe(`DELETE FROM tenants WHERE id IN ($1::uuid, $2::uuid)`, [tenantA, tenantB]);
      await app.end();
      await owner.end();
    }
  },
);

test(
  'live actual-role scheduler: concurrent recovery is bounded and single-ownership',
  { skip: !tlsReady && skipReason, timeout: 120_000 },
  async () => {
    const tenant = randomUUID();
    const owner = postgres(ownerUrl!, productionPostgresOptions(ownerUrl!, { max: 1, prepare: false }));
    const app1 = postgres(appUrl(), productionPostgresOptions(appUrl(), { max: 1, prepare: false }));
    const app2 = postgres(appUrl(), productionPostgresOptions(appUrl(), { max: 1, prepare: false }));
    try {
      await owner.unsafe(`INSERT INTO tenants(id, name) VALUES ($1::uuid, $2)`, [tenant, `ABREM2 concurrent ${tenant}`]);
      const id = randomUUID();
      await owner.unsafe(
        `INSERT INTO codecore_workflow_executions(id, tenant_id, workflow_id, workflow_type, idempotency_key, status, attempt_count, max_attempts, lease_owner, lease_expires_at, next_attempt_at)
         VALUES ($1::uuid, $2::uuid, $3, 'workflow', $4, 'claimed', 1, 3, 'dead-worker', now() - interval '1 minute', now())`,
        [id, tenant, `wf-${id}`, `abrem2-concurrent-${id}`],
      );
      const [first, second] = await Promise.all([
        new PostgresWorkflowRuntime(app1).recoverExpiredLeases(),
        new PostgresWorkflowRuntime(app2).recoverExpiredLeases(),
      ]);
      assert.equal(first + second, 1, 'exactly one concurrent recovery may reclaim the lease');
      const audit = await owner.unsafe(
        `SELECT count(*)::int AS c FROM codecore_workflow_execution_events WHERE execution_id = $1::uuid AND event_type = 'workflow_recovered'`,
        [id],
      );
      assert.equal(audit[0]?.c, 1, 'concurrent recovery must produce exactly one audit row');
    } finally {
      await owner.unsafe(`DELETE FROM codecore_workflow_executions WHERE tenant_id = $1::uuid`, [tenant]);
      await owner.unsafe(`DELETE FROM tenants WHERE id = $1::uuid`, [tenant]);
      await app1.end();
      await app2.end();
      await owner.end();
    }
  },
);
