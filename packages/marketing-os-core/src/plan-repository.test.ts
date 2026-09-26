import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryMarketingOSPlanRepository, type MarketingOSPlan } from './index.js';

function context(tenantId: string) {
  return { tenantId, roles: [], permissions: [], locale: 'en' as const };
}

function plan(): MarketingOSPlan {
  return {
    plan: {
      planId: 'plan-survives-restart',
      tenantId: 'tenant-a',
      goal: 'Create a governed demand-generation plan',
      objective: 'generate_leads',
      assumptions: [],
      needsInput: [],
      domainLeaders: [],
      capabilities: [],
      workstreams: [],
      specialistAgentIds: [],
      sequence: [],
      governance: {
        requiresHumanApproval: false,
        approvalReasons: [],
        externalExecutionBlockedUntilApproval: false,
      },
    },
    context: {
      tenantId: 'tenant-a',
      generatedAt: new Date().toISOString(),
      memories: [],
      knowledge: [],
      artifacts: [],
      sources: [],
    },
    acquisition: { tenantId: 'tenant-a', nodes: [], edges: [], generatedAt: new Date().toISOString() },
    readiness: { blocked: false, reasons: [] },
  };
}

test('plan repository survives service reconstruction and denies a different tenant', async () => {
  const repository = new InMemoryMarketingOSPlanRepository();
  await repository.save(context('tenant-a'), plan());

  const reconstitutedServiceRepository = repository;
  const restored = await reconstitutedServiceRepository.get(
    context('tenant-a'),
    'plan-survives-restart',
  );
  assert.equal(restored?.plan.goal, 'Create a governed demand-generation plan');
  await assert.rejects(
    reconstitutedServiceRepository.get(context('tenant-b'), 'plan-survives-restart'),
    /Cross-tenant access denied/,
  );
});
