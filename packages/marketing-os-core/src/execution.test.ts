import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryWorkflowQuery,
  InMemoryWorkflowRuntime,
  type WorkflowRuntime,
} from '@platform/workflow-runtime';
import {
  InMemoryMarketingOSExecutionRecordRepository,
  MarketingOSExecutionService,
  type MarketingOSApprovalGateway,
} from './execution.js';

function context(tenantId = 'tenant-a') {
  return { tenantId, roles: [], permissions: [], locale: 'en' as const };
}

function validPlan(planId = 'plan-approval-1') {
  return {
    plan: {
      planId,
      tenantId: 'tenant-a',
      goal: 'Generate qualified leads and pipeline in 90 days',
      objective: 'generate_leads' as const,
      assumptions: [],
      needsInput: [],
      domainLeaders: [{ id: 'sales', reason: 'Lead generation', priority: 1, approval: 'NONE' as const }],
      capabilities: [],
      workstreams: [
        { id: '01', reason: 'Audience intelligence', priority: 1, approval: 'NONE' as const },
        { id: '08', reason: 'Acquisition motion', priority: 2, approval: 'NONE' as const },
      ],
      specialistAgentIds: [],
      sequence: [],
      governance: {
        requiresHumanApproval: true,
        approvalReasons: ['External execution requires approval.'],
        externalExecutionBlockedUntilApproval: true,
      },
    },
    context: {
      tenantId: 'tenant-a',
      generatedAt: new Date().toISOString(),
      memories: [],
      knowledge: [
        {
          id: 'k1',
          tenantId: 'tenant-a',
          documentId: 'doc-1',
          text: 'Approved B2B ICP',
          score: 0.9,
          evidenceIds: ['doc-1'],
        },
      ],
      artifacts: [],
      sources: [],
    },
    acquisition: { tenantId: 'tenant-a', nodes: [], edges: [], generatedAt: new Date().toISOString() },
    readiness: { blocked: false, reasons: [] },
  };
}

function service(
  runtime: InMemoryWorkflowRuntime,
  records: InMemoryMarketingOSExecutionRecordRepository,
  approvals: MarketingOSApprovalGateway,
) {
  return new MarketingOSExecutionService({
    runtime,
    query: new InMemoryWorkflowQuery(runtime),
    records,
    approvals,
  });
}

test('canonical approval blocks execution until approved', async () => {
  let decision: 'approved' | 'approved_with_conditions' | 'rejected' | 'expired' | undefined;
  let approvalId = '';
  const gateway: MarketingOSApprovalGateway = {
    async create(_ctx, input) {
      approvalId = `approval-${input.artifactId}`;
      return { id: approvalId, tenantId: 'tenant-a', artifactId: input.artifactId, ...(decision ? { decision } : {}) };
    },
    async get(id, ctx) {
      if (ctx.tenantId !== 'tenant-a' || id !== approvalId) throw new Error('Cross-tenant access denied');
      return { id, tenantId: 'tenant-a', artifactId: 'x', ...(decision ? { decision } : {}) };
    },
  };
  const runtime = new InMemoryWorkflowRuntime();
  const records = new InMemoryMarketingOSExecutionRecordRepository();
  const executions = service(runtime, records, gateway);
  const prepared = await executions.prepare({
    plan: validPlan(),
    engagementId: 'engagement-approval',
    locale: 'en',
    idempotencyKey: 'approval-v1',
    context: context(),
  });
  assert.equal(prepared.status, 'APPROVAL_REQUIRED');
  assert.ok(prepared.approvalId);
  const blocked = await executions.start(prepared.planId, context(), {
    actor: 'test',
    reason: 'blocked',
    timestamp: new Date().toISOString(),
    idempotencyKey: 'start-before-approval',
  });
  assert.equal(blocked.status, 'APPROVAL_REQUIRED');
  decision = 'approved';
  const started = await executions.start(prepared.planId, context(), {
    actor: 'test',
    reason: 'approved',
    timestamp: new Date().toISOString(),
    idempotencyKey: 'start-after-approval',
  });
  assert.equal(started.approved, true);
  assert.equal(started.status, 'RUNNING');
  assert.equal(runtime.getWorkflow(started.workflowId!, context()).status, 'running');
});

test('execution binding survives service reconstruction and prepare is idempotent', async () => {
  let approvalCreates = 0;
  const gateway: MarketingOSApprovalGateway = {
    async create(_ctx, input) {
      approvalCreates += 1;
      return { id: `approval-${input.artifactId}`, tenantId: 'tenant-a', artifactId: input.artifactId };
    },
    async get(id) {
      return { id, tenantId: 'tenant-a', artifactId: 'workflow' };
    },
  };
  const runtime = new InMemoryWorkflowRuntime();
  const records = new InMemoryMarketingOSExecutionRecordRepository();
  const firstService = service(runtime, records, gateway);
  const input = {
    plan: validPlan('plan-reconstructed'),
    engagementId: 'engagement-reconstructed',
    locale: 'en' as const,
    idempotencyKey: 'reconstruct-v1',
    context: context(),
  };
  const first = await firstService.prepare(input);
  const reconstructedService = service(runtime, records, gateway);
  const repeated = await reconstructedService.prepare(input);
  const restored = await reconstructedService.get(first.planId, context());

  assert.equal(repeated.workflowId, first.workflowId);
  assert.equal(restored.approvalId, first.approvalId);
  assert.equal(approvalCreates, 1);
});

test('repeated prepare does not create a second workflow or approval', async () => {
  let workflowCreates = 0;
  let approvalCreates = 0;
  const backingRuntime = new InMemoryWorkflowRuntime();
  const runtime: WorkflowRuntime = {
    async createWorkflow(input) {
      workflowCreates += 1;
      return backingRuntime.createWorkflow(input);
    },
    start: (workflowId, ctx, metadata) => backingRuntime.start(workflowId, ctx, metadata),
    pause: (workflowId, ctx, metadata) => backingRuntime.pause(workflowId, ctx, metadata),
    resume: (workflowId, ctx, metadata) => backingRuntime.resume(workflowId, ctx, metadata),
    cancel: (workflowId, ctx, metadata) => backingRuntime.cancel(workflowId, ctx, metadata),
  };
  const gateway: MarketingOSApprovalGateway = {
    async create(_ctx, input) {
      approvalCreates += 1;
      return { id: `approval-${input.artifactId}`, tenantId: 'tenant-a', artifactId: input.artifactId };
    },
    async get(id) {
      return { id, tenantId: 'tenant-a', artifactId: 'workflow' };
    },
  };
  const records = new InMemoryMarketingOSExecutionRecordRepository();
  const executions = new MarketingOSExecutionService({
    runtime,
    query: new InMemoryWorkflowQuery(backingRuntime),
    records,
    approvals: gateway,
  });
  const input = {
    plan: validPlan('plan-no-duplicates'),
    engagementId: 'engagement-no-duplicates',
    locale: 'en' as const,
    idempotencyKey: 'no-duplicates-v1',
    context: context(),
  };

  await executions.prepare(input);
  await executions.prepare(input);
  assert.equal(workflowCreates, 1);
  assert.equal(approvalCreates, 1);
});

test('approval and execution access remain tenant isolated', async () => {
  const gateway: MarketingOSApprovalGateway = {
    async create(_ctx, input) {
      return { id: 'approval-1', tenantId: 'tenant-a', artifactId: input.artifactId };
    },
    async get() {
      throw new Error('Cross-tenant access denied');
    },
  };
  const runtime = new InMemoryWorkflowRuntime();
  const records = new InMemoryMarketingOSExecutionRecordRepository();
  const executions = service(runtime, records, gateway);
  const prepared = await executions.prepare({
    plan: validPlan(),
    engagementId: 'engagement-tenant',
    locale: 'en',
    idempotencyKey: 'approval-tenant-v1',
    context: context(),
  });
  await assert.rejects(
    executions.get(prepared.planId, context('tenant-b')),
    /Cross-tenant access denied/,
  );
});
