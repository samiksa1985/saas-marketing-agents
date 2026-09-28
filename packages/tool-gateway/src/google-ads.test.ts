import assert from 'node:assert/strict';
import test from 'node:test';

import type { TenantContext } from '@platform/contracts';
import {
  CanonicalExternalActionBudgetAuthority,
  ExternalActionPolicyEngine,
  GovernedExternalActionExecutor,
  InMemoryExternalActionStore,
  type ExternalActionApprovalGateway,
  type ExternalActionApprovalRecord,
  type ExternalActionPolicy,
  type GovernedExternalAction,
  type ExternalMarketingActionProposal,
} from '@platform/marketing-os-core';
import {
  EnvironmentGoogleAdsCredentialResolver,
  GoogleAdsProviderGateway,
  MockGoogleAdsProvider,
} from './index.js';

const context: TenantContext = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  roles: ['marketing_manager'],
  permissions: ['marketing:admin', 'integration:admin'],
  locale: 'en',
};

const proposal: ExternalMarketingActionProposal = {
  actionId: 'action-a', tenantId: 'tenant-a', organizationId: 'org-a', actor: 'user-a', agentIdentity: 'agent-a',
  workflowRunId: 'workflow-a', recommendationId: 'recommendation-a', provider: 'GOOGLE_ADS', accountId: 'account-a', campaignId: 'campaign-a',
  actionType: 'UPDATE_CAMPAIGN_BUDGET', requestedPayload: { dailyBudget: 2_500 }, reason: 'test', expectedOutcome: 'test',
  estimatedImpact: {}, estimatedCost: 500, currency: 'SAR', riskLevel: 'MEDIUM', policyContext: {}, approvalRequirement: 'REQUIRED',
  idempotencyKey: 'key-a', requestedAt: '2026-09-08T00:00:00.000Z', metadata: {}, evidence: [{ id: 'evidence-a', source: 'test', summary: 'test' }],
  confidence: 0.9, rollback: { strategy: 'restore', before: { dailyBudget: 2_000 } },
};

function action(status: GovernedExternalAction['status'] = 'EXECUTING'): GovernedExternalAction {
  return {
    id: proposal.actionId, tenantId: proposal.tenantId, planId: proposal.recommendationId, workflowId: proposal.workflowRunId,
    type: proposal.actionType, idempotencyKey: proposal.idempotencyKey, status, approvalId: 'approval-a', requestedAt: proposal.requestedAt,
    updatedAt: proposal.requestedAt, proposal, evidence: [], version: 1,
  };
}

class ApprovedApprovals implements ExternalActionApprovalGateway {
  async create(ctx: TenantContext, input: { artifactId: string }): Promise<ExternalActionApprovalRecord> {
    return { id: `approval:${input.artifactId}`, tenantId: ctx.tenantId, decision: 'approved' };
  }

  async get(id: string, ctx: TenantContext): Promise<ExternalActionApprovalRecord> {
    return { id, tenantId: ctx.tenantId, decision: 'approved' };
  }
}

function governedExecutor(gateway: GoogleAdsProviderGateway): GovernedExternalActionExecutor {
  const policy: ExternalActionPolicy = {
    tenantId: 'tenant-a',
    providerAllowlist: ['GOOGLE_ADS'],
    actionTypeAllowlist: ['UPDATE_CAMPAIGN_BUDGET'],
    accountAllowlist: ['account-a'],
    minimumConfidence: 0.8,
    requiredEvidence: true,
    requiredApprovalLevel: 'HUMAN',
    killSwitch: false,
    dryRunOnly: false,
  };
  return new GovernedExternalActionExecutor(
    new InMemoryExternalActionStore(),
    gateway,
    new CanonicalExternalActionBudgetAuthority(
      { async authorize(tenantId) { return { tenantId, key: 'marketing.external_action.google_ads', allowed: true, source: 'PLAN', reason: 'test' }; } },
      { tenantId: 'tenant-a', hardDailySpendLimit: 1_000, hardMonthlySpendLimit: 30_000 },
    ),
    new ExternalActionPolicyEngine(),
    policy,
    new ApprovedApprovals(),
  );
}

async function executeThroughGovernance(
  gateway: GoogleAdsProviderGateway,
  proposalOverrides: Partial<ExternalMarketingActionProposal> = {},
) {
  const executor = governedExecutor(gateway);
  const created = await executor.propose(context, { ...proposal, ...proposalOverrides });
  await executor.requestApproval(context, created.id);
  return { executor, action: await executor.execute(context, created.id) };
}

test('mock Google Ads gateway simulates, mutates idempotently, and independently verifies the provider state', async () => {
  const provider = new MockGoogleAdsProvider();
  provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: true, dailyBudget: 2_000 });
  const gateway = new GoogleAdsProviderGateway(provider, 'MOCK', false);

  const simulation = await gateway.simulate(context, proposal);
  assert.equal(simulation.currentValue, 2_000);
  const first = await executeThroughGovernance(gateway);
  assert.equal(first.action.status, 'VERIFIED');
  assert.equal((await first.executor.execute(context, first.action.id)).status, 'VERIFIED');
});

test('gateway fails closed for disabled provider, absent approval, and provider failure', async () => {
  const provider = new MockGoogleAdsProvider();
  provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: true, dailyBudget: 2_000 });
  await assert.rejects(
    () => new GoogleAdsProviderGateway(provider, 'DISABLED', false).simulate(context, proposal),
    /GOOGLE_ADS_PROVIDER_DISABLED/,
  );
  const gateway = new GoogleAdsProviderGateway(provider, 'MOCK', false);
  await assert.rejects(() => gateway.execute(context, action() as never), /GOVERNED_DISPATCH_REQUIRED/);
  await assert.rejects(() => provider.mutate(context, action() as never), /GOVERNED_DISPATCH_REQUIRED/);
  provider.failNext('GOOGLE_ADS_TIMEOUT', true);
  const result = await executeThroughGovernance(gateway);
  assert.equal(result.action.status, 'FAILED');
  assert.equal(result.action.failureCode, 'GOOGLE_ADS_TIMEOUT');
});

test('mock provider preserves idempotency after a timeout that follows the mutation', async () => {
  const provider = new MockGoogleAdsProvider();
  provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: true, dailyBudget: 2_000 });
  provider.timeoutAfterMutationOnce();
  const gateway = new GoogleAdsProviderGateway(provider, 'MOCK', false);
  const first = await executeThroughGovernance(gateway);
  assert.equal(first.action.status, 'VERIFIED');
  assert.equal(provider.mutationCount, 1, 'read-back reconciliation must prevent a second provider mutation');
  assert.equal((await first.executor.execute(context, first.action.id)).status, 'VERIFIED');
  assert.equal(provider.mutationCount, 1);
});

test('credential diagnostics report names only and never return credential values', () => {
  const resolver = new EnvironmentGoogleAdsCredentialResolver({ GOOGLE_ADS_CLIENT_ID: 'present' });
  const result = resolver.validate();
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes('GOOGLE_ADS_REFRESH_TOKEN'));
  assert.deepEqual(Object.keys(result), ['valid', 'missing']);
});
