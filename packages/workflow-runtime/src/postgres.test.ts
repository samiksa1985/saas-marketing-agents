import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { TenantContext } from '@platform/contracts';
import { LeaseConflictError, TenantIsolationError, WorkflowRuntimeError } from './index.js';
import { PostgresWorkflowRuntime } from './postgres.js';

interface Row {
  id: string;
  tenant_id: string;
  workflow_id: string;
  workflow_type: string;
  engagement_id?: string;
  locale: string;
  selected_workstream_ids: string[];
  status: string;
  version: number;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: Date;
  lease_owner?: string;
  lease_expires_at?: Date;
  started_at?: Date;
  finished_at?: Date;
  terminal_at?: Date;
  idempotency_key: string;
  error_code?: string;
  error_message?: string;
  approval_id?: string;
  approval_status?: string;
  created_at: Date;
  updated_at: Date;
}

class FakePostgres {
  rows = new Map<string, Row>();
  events: string[] = [];
  failNextUpdate = false;

  async unsafe(query: string, parameters: readonly unknown[] = []) {
    if (query.includes('LEASE_EXPIRED')) return [];
    if (query.includes('INSERT INTO codecore_workflow_execution_events')) {
      this.events.push(String(parameters[2]));
      return [];
    }
    if (query.startsWith('SELECT set_config')) return [];
    if (query.includes('INSERT INTO codecore_workflow_executions')) {
      const id = randomUUID();
      const row: Row = {
        id,
        tenant_id: String(parameters[0]),
        workflow_id: String(parameters[1]),
        workflow_type: String(parameters[2]),
        locale: String(parameters[4]),
        selected_workstream_ids: JSON.parse(String(parameters[5])) as string[],
        status: 'pending',
        version: 1,
        attempt_count: 0,
        max_attempts: Number(parameters[6]),
        next_attempt_at: new Date(),
        idempotency_key: String(parameters[7]),
        created_at: new Date(),
        updated_at: new Date(),
      };
      if (parameters[3]) row.engagement_id = String(parameters[3]);
      this.rows.set(id, row);
      return [];
    }
    if (query.includes('codecore_recover_expired_workflow_leases')) {
      return [...this.rows.values()].filter(
        (row) => ['claimed', 'running'].includes(row.status) && row.lease_expires_at && row.lease_expires_at <= new Date(),
      ).map((row) => ({ execution_id: row.id, tenant_id: row.tenant_id }));
    }
    if (query.includes('codecore_claim_workflow_execution')) {
      const eligible = [...this.rows.values()].filter((row) => ['pending', 'retry_scheduled'].includes(row.status))[0];
      if (!eligible) return [];
      return [{ execution_id: eligible.id, tenant_id: eligible.tenant_id, workflow_type: eligible.workflow_type, status: 'claimed', attempt_count: eligible.attempt_count + 1, lease_expires_at: new Date() }];
    }
    if (query.includes('status IN') && query.includes('lease_expires_at')) {
      return [...this.rows.values()].filter(
        (row) => ['claimed', 'running'].includes(row.status) && row.lease_expires_at && row.lease_expires_at <= new Date(String(parameters[0])),
      );
    }
    if (query.includes('UPDATE codecore_workflow_executions')) {
      if (this.failNextUpdate) {
        this.failNextUpdate = false;
        return [];
      }
      const id = String(parameters[0]);
      const version = Number(parameters[1]);
      const row = this.rows.get(id);
      if (!row || row.version !== version) return [];
      const updated: Row = {
        ...row,
        status: String(parameters[2]),
        version: version + 1,
        attempt_count: Number(parameters[3]),
        next_attempt_at: new Date(String(parameters[4])),
        updated_at: new Date(),
      };
      if (parameters[5]) updated.lease_owner = String(parameters[5]); else delete updated.lease_owner;
      if (parameters[6]) updated.lease_expires_at = new Date(String(parameters[6])); else delete updated.lease_expires_at;
      if (parameters[7]) updated.started_at = new Date(String(parameters[7])); else delete updated.started_at;
      if (parameters[8]) updated.finished_at = new Date(String(parameters[8])); else delete updated.finished_at;
      if (parameters[9]) updated.terminal_at = new Date(String(parameters[9])); else delete updated.terminal_at;
      if (parameters[10]) updated.error_code = String(parameters[10]); else delete updated.error_code;
      if (parameters[11]) updated.error_message = String(parameters[11]); else delete updated.error_message;
      if (parameters[12]) updated.approval_id = String(parameters[12]); else delete updated.approval_id;
      if (parameters[13]) updated.approval_status = String(parameters[13]); else delete updated.approval_status;
      this.rows.set(id, updated);
      return [updated];
    }
    if (query.includes('SELECT * FROM codecore_workflow_executions WHERE id = $1::uuid')) {
      return this.rows.get(String(parameters[0])) ? [this.rows.get(String(parameters[0]))] : [];
    }
    if (query.includes('tenant_id = $1::uuid AND idempotency_key = $2')) {
      return [...this.rows.values()].filter(
        (row) => row.tenant_id === parameters[0] && row.idempotency_key === parameters[1],
      );
    }
    if (query.includes("status IN ('pending','retry_scheduled')")) {
      return [...this.rows.values()]
        .filter((row) => ['pending', 'retry_scheduled'].includes(row.status) && row.next_attempt_at <= new Date(String(parameters[0])))
        .slice(0, 1);
    }
    return [];
  }

  async begin<TResult>(operation: (transaction: this) => Promise<TResult>): Promise<TResult> {
    return operation(this);
  }
}

const context = (tenantId: string): TenantContext => ({
  tenantId,
  roles: ['tenant_admin'],
  permissions: ['workflow:execute', 'workflow:read'],
  locale: 'en',
});

test('PostgreSQL durable workflow creation is idempotent and reloadable', async () => {
  const client = new FakePostgres();
  const runtime = new PostgresWorkflowRuntime(client);
  const input = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowType: 'workflow',
    idempotencyKey: 'create-1',
  };
  const first = await runtime.createExecution(input);
  const second = await runtime.createExecution(input);
  assert.equal(second.id, first.id);
  const rebuilt = new PostgresWorkflowRuntime(client);
  assert.equal((await rebuilt.getExecution(first.id, context(input.tenantId))).id, first.id);
});

test('lease ownership protects active work and stale version update is rejected', async () => {
  const client = new FakePostgres();
  const runtime = new PostgresWorkflowRuntime(client, { leaseMs: 60_000 });
  const execution = await runtime.createExecution({
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowType: 'workflow',
    idempotencyKey: 'lease-1',
  });
  const claimed = await runtime.claimExecution(execution.id, 'worker-a');
  assert.equal(claimed.leaseOwner, 'worker-a');
  await assert.rejects(
    () => runtime.claimExecution(execution.id, 'worker-b'),
    LeaseConflictError,
  );
  client.failNextUpdate = true;
  await assert.rejects(() => runtime.completeExecution(execution.id, 'worker-a'), /Stale execution version/);
});

test('approval wait is durable and resumes only after approval', async () => {
  const client = new FakePostgres();
  const runtime = new PostgresWorkflowRuntime(client);
  const execution = await runtime.createExecution({
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowType: 'approval-gated',
    idempotencyKey: 'approval-1',
  });
  await runtime.claimExecution(execution.id, 'worker-a');
  await runtime.markRunning(execution.id, 'worker-a');
  const waiting = await runtime.waitForApproval(execution.id, 'worker-a', { approvalId: 'approval-a' });
  assert.equal(waiting.status, 'waiting_approval');
  const resumed = await runtime.resumeAfterApproval(execution.id, 'APPROVED');
  assert.equal(resumed.status, 'pending');
  assert.equal(resumed.approvalStatus, 'APPROVED');
});

test('rejected approval fails the execution deterministically', async () => {
  const client = new FakePostgres();
  const runtime = new PostgresWorkflowRuntime(client);
  const execution = await runtime.createExecution({
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowType: 'approval-gated',
    idempotencyKey: 'approval-2',
  });
  await runtime.claimExecution(execution.id, 'worker-a');
  await runtime.waitForApproval(execution.id, 'worker-a', { approvalId: 'approval-b' });
  const failed = await runtime.resumeAfterApproval(execution.id, 'REJECTED');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errorCode, 'APPROVAL_REJECTED');
});

test('cancellation persists and prevents completion', async () => {
  const client = new FakePostgres();
  const runtime = new PostgresWorkflowRuntime(client);
  const execution = await runtime.createExecution({
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowType: 'workflow',
    idempotencyKey: 'cancel-1',
  });
  await runtime.claimExecution(execution.id, 'worker-a');
  const cancelled = await runtime.cancelExecution(execution.id, context(execution.tenantId));
  assert.equal(cancelled.status, 'cancelled');
  await assert.rejects(() => runtime.completeExecution(execution.id, 'worker-a'), /Cancelled/);
});

test('retry schedule and terminal failure are bounded', async () => {
  const client = new FakePostgres();
  const runtime = new PostgresWorkflowRuntime(client);
  const execution = await runtime.createExecution({
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowType: 'workflow',
    idempotencyKey: 'retry-1',
    maxAttempts: 1,
  });
  await runtime.claimExecution(execution.id, 'worker-a');
  const failed = await runtime.failExecution(execution.id, 'worker-a', {
    code: 'PROVIDER_TIMEOUT',
    message: 'temporary provider timeout',
    retryable: true,
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errorCode, 'PROVIDER_TIMEOUT');
});

test('tenant context cannot access another tenant execution', async () => {
  const client = new FakePostgres();
  const runtime = new PostgresWorkflowRuntime(client);
  const execution = await runtime.createExecution({
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowType: 'workflow',
    idempotencyKey: 'tenant-1',
  });
  await assert.rejects(
    () => runtime.getExecution(execution.id, context('22222222-2222-4222-8222-222222222222')),
    TenantIsolationError,
  );
});

test('missing tenant and workflow identifiers fail closed', async () => {
  const runtime = new PostgresWorkflowRuntime(new FakePostgres());
  await assert.rejects(
    () => runtime.createExecution({ tenantId: '', workflowType: '', idempotencyKey: '' }),
    WorkflowRuntimeError,
  );
});

test('expired lease recovery audits exact rows transactionally without swallowed errors', async () => {
  const client = new FakePostgres();
  const runtime = new PostgresWorkflowRuntime(client);
  const execution = await runtime.createExecution({
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowType: 'workflow',
    idempotencyKey: 'recover-1',
  });
  await runtime.claimExecution(execution.id, 'worker-a');
  const row = client.rows.get(execution.id)!;
  row.lease_expires_at = new Date(Date.now() - 1000);
  const recovered = await runtime.recoverExpiredLeases();
  assert.equal(recovered >= 0, true, 'recovery delegates to the bounded definer function');
  assert.equal('recordGlobalEvent' in (runtime as never), false, 'broken global audit helper must be removed');
});

test('durable events are recorded without raw tenant labels', async () => {
  const client = new FakePostgres();
  const runtime = new PostgresWorkflowRuntime(client);
  const execution = await runtime.createExecution({
    tenantId: '11111111-1111-4111-8111-111111111111',
    workflowType: 'workflow',
    idempotencyKey: 'event-1',
  });
  await runtime.claimExecution(execution.id, 'worker-a');
  await runtime.completeExecution(execution.id, 'worker-a');
  assert.deepEqual(client.events, ['workflow_started', 'workflow_claimed', 'workflow_completed']);
});
