import { createHash, randomUUID } from 'node:crypto';
import type { TenantContext } from '@platform/contracts';
import type {
  CreateWorkflowInput,
  ExecutionLease,
  TransitionMetadata,
  Workflow,
  WorkflowRuntime,
  WorkflowState,
  WorkflowTaskCommandRuntime,
  Task,
} from './index.js';
import {
  InvalidTransitionError,
  LeaseConflictError,
  TenantIsolationError,
  WorkflowRuntimeError,
} from './index.js';

export type DurableExecutionStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'waiting_approval'
  | 'retry_scheduled'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DurableExecution {
  id: string;
  tenantId: string;
  workflowId: string;
  workflowType: string;
  engagementId?: string;
  locale: string;
  selectedWorkstreamIds: string[];
  status: DurableExecutionStatus;
  version: number;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  startedAt?: Date;
  finishedAt?: Date;
  terminalAt?: Date;
  idempotencyKey: string;
  errorCode?: string;
  errorMessage?: string;
  approvalId?: string;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDurableExecutionInput {
  tenantId: string;
  workflowType: string;
  idempotencyKey: string;
  workflowId?: string;
  engagementId?: string;
  locale?: string;
  selectedWorkstreamIds?: string[];
  maxAttempts?: number;
  inputMetadata?: Record<string, unknown>;
}

export interface DurableExecutionOutcome {
  result?: Record<string, unknown>;
}

export interface DurableExecutionFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface DurableApprovalGate {
  approvalId: string;
}

export interface PostgresWorkflowSqlClient {
  unsafe(source: string, parameters?: readonly unknown[]): Promise<unknown>;
  begin<T>(operation: (transaction: {
    unsafe(source: string, parameters?: readonly unknown[]): Promise<unknown>;
  }) => T | Promise<T>): Promise<T>;
}

type SqlClient = PostgresWorkflowSqlClient;

interface Row {
  [key: string]: unknown;
}

function rows(result: unknown): Row[] {
  return Array.from(result as Iterable<Row>);
}

function first(result: unknown): Row | undefined {
  return rows(result)[0];
}

function mapExecution(row: Row): DurableExecution {
  const execution: DurableExecution = {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workflowId: String(row.workflow_id),
    workflowType: String(row.workflow_type),
    locale: String(row.locale),
    selectedWorkstreamIds: Array.isArray(row.selected_workstream_ids)
      ? row.selected_workstream_ids.map(String)
      : [],
    status: String(row.status) as DurableExecutionStatus,
    version: Number(row.version),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    nextAttemptAt: new Date(String(row.next_attempt_at)),
    idempotencyKey: String(row.idempotency_key),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
  if (row.engagement_id) execution.engagementId = String(row.engagement_id);
  if (row.lease_owner) execution.leaseOwner = String(row.lease_owner);
  if (row.lease_expires_at) execution.leaseExpiresAt = new Date(String(row.lease_expires_at));
  if (row.started_at) execution.startedAt = new Date(String(row.started_at));
  if (row.finished_at) execution.finishedAt = new Date(String(row.finished_at));
  if (row.terminal_at) execution.terminalAt = new Date(String(row.terminal_at));
  if (row.error_code) execution.errorCode = String(row.error_code);
  if (row.error_message) execution.errorMessage = String(row.error_message);
  if (row.approval_id) execution.approvalId = String(row.approval_id);
  if (row.approval_status) {
    execution.approvalStatus = String(row.approval_status) as NonNullable<DurableExecution['approvalStatus']>;
  }
  return execution;
}

function safeErrorCode(error: DurableExecutionFailure): string {
  return /^[A-Z][A-Z0-9_]{1,119}$/.test(error.code) ? error.code : 'WORKFLOW_EXECUTION_FAILED';
}

function safeErrorMessage(error: DurableExecutionFailure): string {
  return error.message.replace(/[^\x20-\x7e]/g, ' ').slice(0, 300);
}

function requireTenant(context: TenantContext | undefined): TenantContext {
  if (!context?.tenantId) throw new TenantIsolationError('Tenant context is required');
  return context;
}

function assertTenant(expected: string, context: TenantContext | undefined): TenantContext {
  const valid = requireTenant(context);
  if (valid.tenantId !== expected) throw new TenantIsolationError('Cross-tenant access denied');
  return valid;
}

function metadata(input?: Partial<TransitionMetadata>): TransitionMetadata {
  return {
    actor: input?.actor ?? 'system',
    reason: input?.reason ?? 'durable workflow operation',
    timestamp: input?.timestamp ?? new Date().toISOString(),
    idempotencyKey: input?.idempotencyKey ?? randomUUID(),
  };
}

function durationMs(value: Date | string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? Math.max(0, parsed - Date.now()) : fallback;
}

function retryDelayMs(attempt: number): number {
  return Math.min(60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

export class PostgresWorkflowRuntime implements WorkflowRuntime, WorkflowTaskCommandRuntime {
  private readonly leaseMs: number;

  constructor(
    private readonly client: SqlClient,
    options: { leaseMs?: number } = {},
  ) {
    this.leaseMs = options.leaseMs ?? 30_000;
  }

  async createExecution(input: CreateDurableExecutionInput): Promise<DurableExecution> {
    if (!input.tenantId.trim() || !input.workflowType.trim() || !input.idempotencyKey.trim()) {
      throw new WorkflowRuntimeError('tenantId, workflowType, and idempotencyKey are required');
    }
    const workflowId = input.workflowId?.trim() || `workflow-${createHash('sha256').update(`${input.tenantId}:${input.workflowType}:${input.idempotencyKey}`).digest('hex').slice(0, 32)}`;
    const inserted = await this.client.begin(async (transaction) => {
      await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [input.tenantId]);
      const existing = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE tenant_id = $1::uuid AND idempotency_key = $2`,
        [input.tenantId, input.idempotencyKey],
      ));
      if (existing) return mapExecution(existing);
      await transaction.unsafe(
        `INSERT INTO codecore_workflow_executions (
          tenant_id, workflow_id, workflow_type, engagement_id, locale,
          selected_workstream_ids, status, version, attempt_count, max_attempts,
          next_attempt_at, idempotency_key, input_metadata
        ) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb,'pending',1,0,$7,now(),$8,$9::jsonb)`,
        [
          input.tenantId,
          workflowId,
          input.workflowType,
          input.engagementId ?? null,
          input.locale ?? 'en',
          JSON.stringify(input.selectedWorkstreamIds ?? []),
          Math.max(1, Math.min(input.maxAttempts ?? 3, 100)),
          input.idempotencyKey,
          JSON.stringify(input.inputMetadata ?? {}),
        ],
      );
      const created = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE tenant_id = $1::uuid AND idempotency_key = $2`,
        [input.tenantId, input.idempotencyKey],
      ));
      if (!created) throw new WorkflowRuntimeError('Durable execution creation failed');
      await this.recordEvent(transaction, mapExecution(created), 'workflow_started', 'system', 'Execution created');
      return mapExecution(created);
    });
    return inserted as DurableExecution;
  }

  async getExecution(executionId: string, context: TenantContext): Promise<DurableExecution> {
    requireTenant(context);
    return this.client.begin(async (transaction) => {
      await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      assertTenant(String(row.tenant_id), context);
      return mapExecution(row);
    }) as Promise<DurableExecution>;
  }

  async listExecutions(context: TenantContext): Promise<DurableExecution[]> {
    requireTenant(context);
    return this.client.begin(async (transaction) => {
      await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      return rows(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE tenant_id = $1::uuid ORDER BY created_at, id`,
        [context.tenantId],
      )).map(mapExecution);
    }) as Promise<DurableExecution[]>;
  }

  async claimNext(workerId: string, now = new Date()): Promise<DurableExecution | undefined> {
    if (!workerId.trim()) throw new WorkflowRuntimeError('workerId is required');
    const result = await this.client.begin(async (transaction) => {
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions
         WHERE status IN ('pending','retry_scheduled')
           AND next_attempt_at <= $1
         ORDER BY next_attempt_at, id
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [now.toISOString()],
      ));
      if (!row) return undefined;
      const current = mapExecution(row);
      const claimed = await this.updateExecution(transaction, current, ['pending', 'retry_scheduled'], {
        status: 'claimed',
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
        attemptCount: current.attemptCount + 1,
        startedAt: current.startedAt ?? now,
      });
      await this.recordEvent(transaction, claimed, 'workflow_claimed', workerId, 'Execution claimed');
      return claimed;
    });
    return result as DurableExecution | undefined;
  }

  async claimExecution(executionId: string, workerId: string, now = new Date(), context?: TenantContext): Promise<DurableExecution> {
    const claimed = await this.client.begin(async (transaction) => {
      if (context?.tenantId) {
        await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      }
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid FOR UPDATE`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      const current = mapExecution(row);
      if (context?.tenantId) assertTenant(current.tenantId, context);
      if (current.status === 'claimed' && current.leaseOwner && current.leaseExpiresAt && current.leaseExpiresAt > now && current.leaseOwner !== workerId) {
        throw new LeaseConflictError('Execution lease is held by another worker');
      }
      if (current.status === 'claimed' && current.leaseOwner === workerId && current.leaseExpiresAt && current.leaseExpiresAt > now) {
        return current;
      }
      if (!['pending', 'retry_scheduled', 'claimed'].includes(current.status)) {
        throw new InvalidTransitionError(`Execution cannot be claimed from ${current.status}`);
      }
      if (current.status !== 'claimed' && current.nextAttemptAt > now) {
        throw new InvalidTransitionError('Execution is not due for claim');
      }
      const claimed = await this.updateExecution(transaction, current, ['pending', 'retry_scheduled', 'claimed'], {
        status: 'claimed',
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
        attemptCount: current.status === 'claimed' ? current.attemptCount : current.attemptCount + 1,
        startedAt: current.startedAt ?? now,
      });
      await this.recordEvent(transaction, claimed, 'workflow_claimed', workerId, 'Execution claimed');
      return claimed;
    });
    return claimed as DurableExecution;
  }

  async markRunning(executionId: string, workerId: string, context?: TenantContext): Promise<DurableExecution> {
    return this.transitionForWorker(executionId, workerId, ['claimed'], 'running', 'workflow_started', 'Execution started', {}, context);
  }

  async waitForApproval(executionId: string, workerId: string, gate: DurableApprovalGate, context?: TenantContext): Promise<DurableExecution> {
    if (!gate.approvalId.trim()) throw new WorkflowRuntimeError('approvalId is required');
    return this.transitionForWorker(executionId, workerId, ['claimed', 'running'], 'waiting_approval', 'workflow_waiting_approval', 'Execution awaits approval', {
      approvalId: gate.approvalId,
      approvalStatus: 'PENDING',
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    }, context);
  }

  async resumeAfterApproval(executionId: string, approvalStatus: 'APPROVED' | 'REJECTED' | 'EXPIRED', actor = 'system', context?: TenantContext): Promise<DurableExecution> {
    return this.client.begin(async (transaction) => {
      if (context?.tenantId) {
        await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      }
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid FOR UPDATE`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      const current = mapExecution(row);
      if (context?.tenantId) assertTenant(current.tenantId, context);
      if (current.status !== 'waiting_approval') return current;
      if (approvalStatus === 'APPROVED') {
        const resumed = await this.updateExecution(transaction, current, ['waiting_approval'], {
          status: 'pending',
          approvalStatus,
          nextAttemptAt: new Date(),
          leaseOwner: undefined,
          leaseExpiresAt: undefined,
        });
        await this.recordEvent(transaction, resumed, 'workflow_resumed', actor, 'Approval accepted');
        return resumed;
      }
      const failed = await this.updateExecution(transaction, current, ['waiting_approval'], {
        status: 'failed',
        approvalStatus,
        errorCode: 'APPROVAL_REJECTED',
        errorMessage: `Approval ${approvalStatus.toLowerCase()}`,
        finishedAt: new Date(),
        terminalAt: new Date(),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      });
      await this.recordEvent(transaction, failed, 'workflow_failed', actor, `Approval ${approvalStatus.toLowerCase()}`);
      return failed;
    }) as Promise<DurableExecution>;
  }

  async completeExecution(executionId: string, workerId: string, outcome: DurableExecutionOutcome = {}, context?: TenantContext): Promise<DurableExecution> {
    return this.client.begin(async (transaction) => {
      if (context?.tenantId) {
        await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      }
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid FOR UPDATE`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      const current = mapExecution(row);
      if (context?.tenantId) assertTenant(current.tenantId, context);
      if (current.status === 'completed') return current;
      if (current.status === 'cancelled') throw new InvalidTransitionError('Cancelled execution cannot complete');
      this.assertLease(current, workerId);
      const completed = await this.updateExecution(transaction, current, ['claimed', 'running'], {
        status: 'completed',
        resultMetadata: outcome.result ?? {},
        finishedAt: new Date(),
        terminalAt: new Date(),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      });
      await this.recordEvent(transaction, completed, 'workflow_completed', workerId, 'Execution completed');
      return completed;
    }) as Promise<DurableExecution>;
  }

  async failExecution(executionId: string, workerId: string, failure: DurableExecutionFailure, context?: TenantContext): Promise<DurableExecution> {
    return this.client.begin(async (transaction) => {
      if (context?.tenantId) {
        await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      }
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid FOR UPDATE`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      const current = mapExecution(row);
      if (context?.tenantId) assertTenant(current.tenantId, context);
      if (current.status === 'cancelled') throw new InvalidTransitionError('Cancelled execution cannot fail');
      if (['completed', 'failed'].includes(current.status)) return current;
      this.assertLease(current, workerId);
      if (failure.retryable && current.attemptCount < current.maxAttempts) {
        const retry = await this.updateExecution(transaction, current, ['claimed', 'running'], {
          status: 'retry_scheduled',
          nextAttemptAt: new Date(Date.now() + retryDelayMs(current.attemptCount)),
          errorCode: safeErrorCode(failure),
          errorMessage: safeErrorMessage(failure),
          leaseOwner: undefined,
          leaseExpiresAt: undefined,
        });
        await this.recordEvent(transaction, retry, 'workflow_retry', workerId, 'Retry scheduled');
        return retry;
      }
      const failed = await this.updateExecution(transaction, current, ['claimed', 'running', 'retry_scheduled'], {
        status: 'failed',
        errorCode: safeErrorCode(failure),
        errorMessage: safeErrorMessage(failure),
        finishedAt: new Date(),
        terminalAt: new Date(),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      });
      await this.recordEvent(transaction, failed, 'workflow_failed', workerId, 'Execution failed');
      return failed;
    }) as Promise<DurableExecution>;
  }

  async cancelExecution(executionId: string, context: TenantContext, input?: Partial<TransitionMetadata>): Promise<DurableExecution> {
    requireTenant(context);
    const meta = metadata({ ...input, actor: input?.actor ?? context.userId ?? 'api-user' });
    return this.client.begin(async (transaction) => {
      await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid FOR UPDATE`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      const current = mapExecution(row);
      assertTenant(current.tenantId, context);
      if (current.status === 'cancelled') return current;
      if (['completed', 'failed'].includes(current.status)) {
        throw new InvalidTransitionError('Terminal execution cannot be cancelled');
      }
      const cancelled = await this.updateExecution(transaction, current, ['pending', 'claimed', 'running', 'waiting_approval', 'retry_scheduled'], {
        status: 'cancelled',
        errorCode: 'WORKFLOW_CANCELLED',
        errorMessage: meta.reason,
        finishedAt: new Date(),
        terminalAt: new Date(),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      });
      await this.recordEvent(transaction, cancelled, 'workflow_cancelled', meta.actor, meta.reason);
      return cancelled;
    }) as Promise<DurableExecution>;
  }

  async renewLease(executionId: string, workerId: string, now = new Date(), context?: TenantContext): Promise<DurableExecution> {
    return this.client.begin(async (transaction) => {
      if (context?.tenantId) {
        await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      }
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid FOR UPDATE`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      const current = mapExecution(row);
      if (context?.tenantId) assertTenant(current.tenantId, context);
      this.assertLease(current, workerId);
      return this.updateExecution(transaction, current, ['claimed', 'running'], {
        leaseExpiresAt: new Date(now.getTime() + this.leaseMs),
      });
    }) as Promise<DurableExecution>;
  }

  async releaseLease(executionId: string, workerId: string, context?: TenantContext): Promise<DurableExecution> {
    return this.client.begin(async (transaction) => {
      if (context?.tenantId) {
        await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      }
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid FOR UPDATE`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      const current = mapExecution(row);
      if (context?.tenantId) assertTenant(current.tenantId, context);
      this.assertLease(current, workerId);
      return this.updateExecution(transaction, current, ['claimed', 'running'], {
        status: 'pending',
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      });
    }) as Promise<DurableExecution>;
  }

  async recoverExpiredLeases(now = new Date()): Promise<number> {
    const result = await this.client.unsafe(
      `UPDATE codecore_workflow_executions
       SET status = 'retry_scheduled', next_attempt_at = now(), lease_owner = NULL, lease_expires_at = NULL,
           error_code = 'LEASE_EXPIRED', error_message = 'Worker lease expired'
       WHERE status IN ('claimed','running') AND lease_expires_at IS NOT NULL AND lease_expires_at <= $1
       RETURNING id`,
      [now.toISOString()],
    );
    const recovered = rows(result).length;
    if (recovered > 0) {
      await this.recordGlobalEvent('workflow_recovered', 'system', `${recovered} expired lease(s) recovered`);
    }
    return recovered;
  }

  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    const execution = await this.createExecution({
      tenantId: input.tenantId,
      workflowType: 'workflow',
      engagementId: input.engagementId,
      locale: input.locale,
      selectedWorkstreamIds: input.selectedWorkstreamIds,
      idempotencyKey: input.idempotencyKey,
    });
    return this.toLegacyWorkflow(execution);
  }

  async start(workflowId: string, context: TenantContext, input: TransitionMetadata): Promise<Workflow> {
    const execution = await this.transitionForTenant(workflowId, context, ['pending', 'retry_scheduled'], 'running', input, 'Workflow started');
    return this.toLegacyWorkflow(execution);
  }

  async pause(workflowId: string, context: TenantContext, input: TransitionMetadata): Promise<Workflow> {
    const execution = await this.transitionForTenant(workflowId, context, ['running', 'claimed'], 'pending', input, 'Workflow paused');
    return this.toLegacyWorkflow(execution);
  }

  async resume(workflowId: string, context: TenantContext, input: TransitionMetadata): Promise<Workflow> {
    const execution = await this.transitionForTenant(workflowId, context, ['pending', 'waiting_approval', 'retry_scheduled'], 'pending', input, 'Workflow resumed');
    return this.toLegacyWorkflow(execution);
  }

  async cancel(workflowId: string, context: TenantContext, input: TransitionMetadata): Promise<Workflow> {
    const execution = await this.cancelExecution(workflowId, context, input);
    return this.toLegacyWorkflow(execution);
  }

  async claimTask(
    taskId: string,
    workerId: string,
    idempotencyKey: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<ExecutionLease> {
    requireTenant(context);
    const execution = await this.claimExecution(taskId, workerId);
    assertTenant(execution.tenantId, context);
    return {
      taskId: execution.id,
      tenantId: execution.tenantId,
      workerId,
      idempotencyKey,
      acquiredAt: metadata.timestamp,
      expiresAt: execution.leaseExpiresAt?.toISOString() ?? new Date(Date.now() + this.leaseMs).toISOString(),
    };
  }

  async retryTask(taskId: string, context: TenantContext, input: TransitionMetadata): Promise<Task> {
    const execution = await this.transitionForTenant(taskId, context, ['failed', 'retry_scheduled'], 'pending', input, 'Task retry requested');
    return this.toLegacyTask(execution);
  }

  async repairTask(taskId: string, context: TenantContext, input: TransitionMetadata): Promise<Task> {
    const execution = await this.transitionForTenant(taskId, context, ['failed', 'retry_scheduled'], 'pending', input, 'Task repair requested');
    return this.toLegacyTask(execution);
  }

  async cancelTask(taskId: string, context: TenantContext, input: TransitionMetadata): Promise<Task> {
    const execution = await this.cancelExecution(taskId, context, input);
    return this.toLegacyTask(execution);
  }

  private async transitionForWorker(
    executionId: string,
    workerId: string,
    allowedFrom: DurableExecutionStatus[],
    to: DurableExecutionStatus,
    eventType: string,
    reason: string,
    patch: Partial<{
      status: DurableExecutionStatus;
      approvalId: string;
      approvalStatus: DurableExecution['approvalStatus'];
      leaseOwner: string | undefined;
      leaseExpiresAt: Date | undefined;
    }> = {},
    context?: TenantContext,
  ): Promise<DurableExecution> {
    return this.client.begin(async (transaction) => {
      if (context?.tenantId) {
        await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      }
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid FOR UPDATE`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      const current = mapExecution(row);
      if (context?.tenantId) assertTenant(current.tenantId, context);
      this.assertLease(current, workerId);
      const updated = await this.updateExecution(transaction, current, allowedFrom, {
        status: to,
        ...patch,
      });
      await this.recordEvent(transaction, updated, eventType, workerId, reason);
      return updated;
    }) as Promise<DurableExecution>;
  }

  private async transitionForTenant(
    executionId: string,
    context: TenantContext,
    allowedFrom: DurableExecutionStatus[],
    to: DurableExecutionStatus,
    input: TransitionMetadata,
    reason: string,
  ): Promise<DurableExecution> {
    requireTenant(context);
    return this.client.begin(async (transaction) => {
      await transaction.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [context.tenantId]);
      const row = first(await transaction.unsafe(
        `SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid FOR UPDATE`,
        [executionId],
      ));
      if (!row) throw new WorkflowRuntimeError('Workflow execution not found');
      const current = mapExecution(row);
      assertTenant(current.tenantId, context);
      const updated = await this.updateExecution(transaction, current, allowedFrom, { status: to });
      await this.recordEvent(transaction, updated, to === 'cancelled' ? 'workflow_cancelled' : 'workflow_resumed', input.actor, reason);
      return updated;
    }) as Promise<DurableExecution>;
  }

  private async updateExecution(
    transaction: {
      unsafe(source: string, parameters?: readonly unknown[]): Promise<unknown>;
    },
    current: DurableExecution,
    allowedFrom: DurableExecutionStatus[],
    patch: Partial<{
      status: DurableExecutionStatus;
      attemptCount: number;
      nextAttemptAt: Date;
      leaseOwner: string | undefined;
      leaseExpiresAt: Date | undefined;
      startedAt: Date;
      finishedAt: Date;
      terminalAt: Date;
      errorCode: string | undefined;
      errorMessage: string | undefined;
      approvalId: string | undefined;
      approvalStatus: DurableExecution['approvalStatus'] | undefined;
      resultMetadata: Record<string, unknown>;
    }>,
  ): Promise<DurableExecution> {
    if (!allowedFrom.includes(current.status)) {
      throw new InvalidTransitionError(`Invalid execution transition: ${current.status}`);
    }
    const rows = await transaction.unsafe(
      `UPDATE codecore_workflow_executions
       SET status = $3,
           version = version + 1,
           attempt_count = $4,
           next_attempt_at = $5,
           lease_owner = $6,
           lease_expires_at = $7,
           started_at = $8,
           finished_at = $9,
           terminal_at = $10,
           error_code = $11,
           error_message = $12,
           approval_id = $13,
           approval_status = $14,
           result_metadata = $15::jsonb
       WHERE id = $1::uuid AND version = $2
       RETURNING *`,
      [
        current.id,
        current.version,
        patch.status ?? current.status,
        patch.attemptCount ?? current.attemptCount,
        (patch.nextAttemptAt ?? current.nextAttemptAt).toISOString(),
        Object.hasOwn(patch, 'leaseOwner') ? patch.leaseOwner ?? null : current.leaseOwner ?? null,
        Object.hasOwn(patch, 'leaseExpiresAt')
          ? patch.leaseExpiresAt?.toISOString() ?? null
          : current.leaseExpiresAt?.toISOString() ?? null,
        Object.hasOwn(patch, 'startedAt')
          ? patch.startedAt?.toISOString() ?? null
          : current.startedAt?.toISOString() ?? null,
        Object.hasOwn(patch, 'finishedAt')
          ? patch.finishedAt?.toISOString() ?? null
          : current.finishedAt?.toISOString() ?? null,
        Object.hasOwn(patch, 'terminalAt')
          ? patch.terminalAt?.toISOString() ?? null
          : current.terminalAt?.toISOString() ?? null,
        Object.hasOwn(patch, 'errorCode') ? patch.errorCode ?? null : current.errorCode ?? null,
        Object.hasOwn(patch, 'errorMessage') ? patch.errorMessage ?? null : current.errorMessage ?? null,
        Object.hasOwn(patch, 'approvalId') ? patch.approvalId ?? null : current.approvalId ?? null,
        Object.hasOwn(patch, 'approvalStatus')
          ? patch.approvalStatus ?? null
          : current.approvalStatus ?? null,
        JSON.stringify(patch.resultMetadata ?? {}),
      ],
    );
    const updated = first(rows);
    if (!updated) throw new InvalidTransitionError('Stale execution version');
    return mapExecution(updated);
  }

  private assertLease(current: DurableExecution, workerId: string): void {
    if (current.leaseOwner !== workerId) throw new LeaseConflictError('Execution lease is not held by worker');
    if (current.leaseExpiresAt && current.leaseExpiresAt <= new Date()) {
      throw new LeaseConflictError('Execution lease expired');
    }
  }

  private async recordEvent(
    transaction: {
      unsafe(source: string, parameters?: readonly unknown[]): Promise<unknown>;
    },
    execution: DurableExecution,
    eventType: string,
    actor: string,
    reason: string,
  ): Promise<void> {
    await transaction.unsafe(
      `INSERT INTO codecore_workflow_execution_events (tenant_id, execution_id, event_type, actor, reason, payload)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb)`,
      [execution.tenantId, execution.id, eventType, actor.slice(0, 255), reason.slice(0, 500), '{}'],
    );
  }

  private async recordGlobalEvent(eventType: string, actor: string, reason: string): Promise<void> {
    // Recovery is system-owned; no tenant context is established by a pooled worker.
    await this.client.unsafe(
      `INSERT INTO codecore_workflow_execution_events (tenant_id, execution_id, event_type, actor, reason, payload)
       SELECT tenant_id, id, $2, $3, $4, '{}'::jsonb
       FROM codecore_workflow_executions
       WHERE error_code = 'LEASE_EXPIRED' AND updated_at > now() - interval '1 minute'`,
      [eventType, actor.slice(0, 255), reason.slice(0, 500)],
    ).catch(() => undefined);
  }

  toLegacyWorkflow(execution: DurableExecution): Workflow {
    const statusMap: Record<DurableExecutionStatus, WorkflowState> = {
      pending: 'created',
      claimed: 'ready',
      running: 'running',
      waiting_approval: 'awaiting_human',
      retry_scheduled: 'retryable_failure',
      completed: 'accepted',
      failed: 'failed',
      cancelled: 'cancelled',
    };
    return {
      id: execution.id,
      tenantId: execution.tenantId,
      engagementId: execution.engagementId ?? execution.workflowId,
      locale: execution.locale as Workflow['locale'],
      selectedWorkstreamIds: execution.selectedWorkstreamIds,
      graphSnapshot: {
        version: 'postgres-durable-v1',
        sourcePath: 'database',
        sourceRevision: String(execution.version),
        workstreamIds: execution.selectedWorkstreamIds,
        edges: [],
        hasCycles: false,
        workstreamDefinitions: [],
        gateDefinitions: [],
      },
      status: statusMap[execution.status],
      createdAt: execution.createdAt.toISOString(),
      updatedAt: execution.updatedAt.toISOString(),
      creationIdempotencyKey: execution.idempotencyKey,
    };
  }

  toLegacyTask(execution: DurableExecution): Task {
    return {
      id: execution.id,
      tenantId: execution.tenantId,
      workflowId: execution.id,
      workstreamId: execution.workflowType.slice(0, 20),
      status: execution.status === 'pending'
        ? 'created'
        : execution.status === 'claimed'
          ? 'claimed'
          : execution.status === 'running'
            ? 'running'
            : execution.status === 'waiting_approval'
              ? 'awaiting_human'
              : execution.status === 'retry_scheduled'
                ? 'retryable_failure'
                : execution.status === 'completed'
                  ? 'accepted'
                  : execution.status,
      inputArtifactReferences: [],
      dependencyReferences: [],
      attempts: [],
      createdAt: execution.createdAt.toISOString(),
      updatedAt: execution.updatedAt.toISOString(),
      requiredApprovalIds: execution.approvalId ? [execution.approvalId] : [],
      acceptedApprovalIds: execution.approvalStatus === 'APPROVED' && execution.approvalId ? [execution.approvalId] : [],
      unresolvedInputs: [],
    };
  }

  get leaseDurationMs(): number {
    return this.leaseMs;
  }
}
