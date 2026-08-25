import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorkflowRuntime } from '@platform/workflow-runtime';
import { MarketingOSExecutionService } from './execution.js';

function validPlan() {
  return {
    plan: {
      planId: 'plan-vslice-1',
      tenantId: 'tenant-a',
      goal: 'Generate qualified leads and pipeline in 90 days',
      objective: 'generate_leads' as const,
      assumptions: [],
      needsInput: [],
      domainLeaders: [
        {
          id: 'sales',
          reason: 'Lead generation',
          priority: 1,
          approval: 'NONE' as const,
        },
      ],
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
      knowledge: [{
        id: 'k1',
        tenantId: 'tenant-a',
        documentId: 'doc-1',
        text: 'Approved B2B ICP',
        score: 0.9,
        evidenceIds: ['doc-1'],
      }],
      artifacts: [],
      sources: [],
    },
    acquisition: {
      tenantId: 'tenant-a',
      nodes: [],
      edges: [],
      generatedAt: new Date().toISOString(),
    },
    readiness: {
      blocked: false,
      reasons: [],
    },
  };
}

test('vertical slice creates a workflow but blocks execution before approval', async () => {
  const service = new MarketingOSExecutionService(new InMemoryWorkflowRuntime());

  const prepared = await service.prepare({
    plan: validPlan(),
    engagementId: 'engagement-a',
    locale: 'en',
    idempotencyKey: 'vslice-001',
  });

  assert.equal(prepared.status, 'APPROVAL_REQUIRED');
  assert.equal(prepared.approved, false);
  assert.ok(prepared.workflow);

  const blocked = await service.start(
    prepared.plan.plan.planId,
    { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' },
    {
      actor: 'test',
      reason: 'test',
      timestamp: new Date().toISOString(),
      idempotencyKey: 'start-001',
    },
  );

  assert.equal(blocked.status, 'APPROVAL_REQUIRED');

  const approved = service.approve(
    prepared.plan.plan.planId,
    { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' },
  );

  assert.equal(approved.status, 'PREPARED');
  assert.equal(approved.approved, true);

  const started = await service.start(
    prepared.plan.plan.planId,
    { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' },
    {
      actor: 'test',
      reason: 'approved execution',
      timestamp: new Date().toISOString(),
      idempotencyKey: 'start-002',
    },
  );

  assert.equal(started.status, 'RUNNING');
  assert.equal(started.workflow?.status, 'running');
});

test('vertical slice is tenant isolated', async () => {
  const service = new MarketingOSExecutionService(new InMemoryWorkflowRuntime());

  const prepared = await service.prepare({
    plan: validPlan(),
    engagementId: 'engagement-a',
    locale: 'en',
    idempotencyKey: 'vslice-002',
  });

  assert.throws(
    () =>
      service.get(
        prepared.plan.plan.planId,
        { tenantId: 'tenant-b', roles: [], permissions: [], locale: 'en' },
      ),
    /Cross-tenant access denied/,
  );
});

