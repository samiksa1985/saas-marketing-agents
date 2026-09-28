import assert from 'node:assert/strict';
import test from 'node:test';

import { ExternalActionPolicyEngine, type ExternalMarketingActionProposal } from '@platform/marketing-os-core';

import {
  toEvaluatedExternalActionPolicy,
  type DurableExternalActionPolicy,
} from './external-action-policies.js';

const proposal: ExternalMarketingActionProposal = {
  actionId: 'action-a', tenantId: 'tenant-a', organizationId: 'org-a', actor: 'operator-a',
  agentIdentity: 'agent-a', workflowRunId: 'workflow-a', recommendationId: 'recommendation-a',
  provider: 'GOOGLE_ADS', accountId: 'account-a', campaignId: 'campaign-a',
  actionType: 'UPDATE_CAMPAIGN_BUDGET', requestedPayload: { dailyBudget: 120 },
  reason: 'test', expectedOutcome: 'test', estimatedImpact: {}, estimatedCost: 1, currency: 'USD',
  riskLevel: 'LOW', policyContext: {}, approvalRequirement: 'OPTIONAL', idempotencyKey: 'idem-a',
  requestedAt: '2026-09-08T00:00:00.000Z', metadata: {}, evidence: [{ id: 'evidence-a', source: 'test', summary: 'test' }],
  confidence: 0.9, rollback: { strategy: 'restore', before: {} },
};

function durable(overrides: Partial<DurableExternalActionPolicy> = {}): DurableExternalActionPolicy {
  return {
    id: 'policy-a', tenantId: 'tenant-a', organizationId: 'org-a', provider: 'GOOGLE_ADS',
    enabled: true, executionMode: 'DRY_RUN', allowedActionTypes: ['UPDATE_CAMPAIGN_BUDGET'],
    allowedAccounts: ['account-a'], deniedAccounts: [], allowedCampaigns: ['campaign-a'], deniedCampaigns: [],
    maxAbsoluteBudgetDelta: 50, maxPercentageBudgetDelta: 50, monthlySpendCeiling: 1000,
    minimumConfidence: 0.8, requiredEvidence: true, approvalMode: 'HUMAN', requiredApprovalRole: 'tenant_admin',
    killSwitch: false, dryRunOnly: true, version: 7, createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z', createdBy: 'admin-a', updatedBy: 'admin-a', ...overrides,
  };
}

test('durable external action policy records its identity, revision, and approval role in the decision', () => {
  const evaluated = toEvaluatedExternalActionPolicy(durable());
  const decision = new ExternalActionPolicyEngine(() => '2026-09-08T00:00:00.000Z').evaluate(
    { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' },
    proposal,
    { assessment: 'ALLOW', reasons: [], currentValue: 100, proposedValue: 120, absoluteDelta: 20, percentageDelta: 20, confidence: 0.9, assumptions: [], providerState: {}, simulatedAt: '2026-09-08T00:00:00.000Z' },
    evaluated,
  );
  assert.equal(decision.outcome, 'REQUIRE_APPROVAL');
  assert.equal(decision.policyId, 'policy-a');
  assert.equal(decision.policyVersion, 7);
  assert.equal(decision.requiredApprovalRole, 'tenant_admin');
  assert.equal(decision.dryRunOnly, true);
});

test('disabled or killed durable policy fails closed before a provider can be allowed', () => {
  const engine = new ExternalActionPolicyEngine(() => '2026-09-08T00:00:00.000Z');
  const context = { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' as const };
  const simulation = { assessment: 'ALLOW' as const, reasons: [], confidence: 0.9, assumptions: [], providerState: {}, simulatedAt: '2026-09-08T00:00:00.000Z' };
  const disabled = engine.evaluate(context, proposal, simulation, toEvaluatedExternalActionPolicy(durable({ enabled: false })));
  const killed = engine.evaluate(context, proposal, simulation, toEvaluatedExternalActionPolicy(durable({ killSwitch: true })));
  assert.equal(disabled.outcome, 'DENY');
  assert.equal(killed.outcome, 'DENY');
});
