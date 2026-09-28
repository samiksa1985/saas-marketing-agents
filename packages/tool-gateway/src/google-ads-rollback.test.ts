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
  type ExternalActionStore,
  type ExternalMarketingActionProposal,
  type GovernedExternalAction,
} from '@platform/marketing-os-core';

import { GoogleAdsProviderGateway, MockGoogleAdsProvider } from './index.js';

const context: TenantContext = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  roles: ['marketing_manager'],
  permissions: ['marketing:admin', 'integration:admin'],
  locale: 'en',
};

const allGoogleActions = [
  'PAUSE_CAMPAIGN',
  'ENABLE_CAMPAIGN',
  'UPDATE_CAMPAIGN_BUDGET',
  'UPDATE_TARGET_CPA',
  'UPDATE_TARGET_ROAS',
];

class Approvals implements ExternalActionApprovalGateway {
  private readonly records = new Map<string, ExternalActionApprovalRecord>();

  async create(ctx: TenantContext, input: { artifactId: string }): Promise<ExternalActionApprovalRecord> {
    const record = { id: `approval:${input.artifactId}`, tenantId: ctx.tenantId };
    this.records.set(record.id, record);
    return record;
  }

  async get(id: string, ctx: TenantContext): Promise<ExternalActionApprovalRecord> {
    const record = this.records.get(id);
    if (!record || record.tenantId !== ctx.tenantId) throw new Error('APPROVAL_NOT_FOUND_OR_ACCESS_DENIED');
    return { ...record };
  }

  approve(id: string): void {
    const record = this.records.get(id);
    if (!record) throw new Error('APPROVAL_NOT_FOUND');
    this.records.set(id, { ...record, decision: 'approved' });
  }
}

class CapturingStore implements ExternalActionStore {
  readonly createdActionIds: string[] = [];
  private readonly delegate = new InMemoryExternalActionStore();

  async create(ctx: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction> {
    const persisted = await this.delegate.create(ctx, action);
    if (!this.createdActionIds.includes(persisted.id)) this.createdActionIds.push(persisted.id);
    return persisted;
  }

  get(ctx: TenantContext, actionId: string): Promise<GovernedExternalAction | undefined> {
    return this.delegate.get(ctx, actionId);
  }

  save(ctx: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction> {
    return this.delegate.save(ctx, action);
  }

  findByIdempotency(
    ctx: TenantContext,
    provider: string,
    actionId: string,
    idempotencyKey: string,
  ): Promise<GovernedExternalAction | undefined> {
    return this.delegate.findByIdempotency(ctx, provider, actionId, idempotencyKey);
  }
}

function createHarness(actionTypeAllowlist = [...allGoogleActions]) {
  const provider = new MockGoogleAdsProvider();
  const store = new CapturingStore();
  const approvals = new Approvals();
  const policy: ExternalActionPolicy = {
    tenantId: context.tenantId,
    providerAllowlist: ['GOOGLE_ADS'],
    actionTypeAllowlist,
    accountAllowlist: ['account-a'],
    campaignAllowlist: ['campaign-a'],
    minimumConfidence: 0.8,
    requiredEvidence: true,
    requiredApprovalLevel: 'HUMAN',
    killSwitch: false,
    dryRunOnly: false,
  };
  const executor = new GovernedExternalActionExecutor(
    store,
    new GoogleAdsProviderGateway(provider, 'MOCK', false),
    new CanonicalExternalActionBudgetAuthority(
      {
        async authorize(tenantId) {
          return {
            tenantId,
            key: 'marketing.external_action.google_ads',
            allowed: true,
            source: 'PLAN',
            reason: 'test',
          };
        },
      },
      { tenantId: context.tenantId, hardDailySpendLimit: 10_000, hardMonthlySpendLimit: 100_000 },
    ),
    new ExternalActionPolicyEngine(),
    policy,
    approvals,
  );
  return { approvals, executor, policy, provider, store };
}

function proposal(
  name: string,
  actionType: string,
  requestedPayload: Record<string, unknown>,
  before: Record<string, unknown>,
): ExternalMarketingActionProposal {
  return {
    actionId: `action-${name}`,
    tenantId: context.tenantId,
    organizationId: 'org-a',
    actor: context.userId!,
    agentIdentity: 'agent-a',
    workflowRunId: `workflow-${name}`,
    recommendationId: `recommendation-${name}`,
    provider: 'GOOGLE_ADS',
    accountId: 'account-a',
    campaignId: 'campaign-a',
    actionType,
    requestedPayload,
    reason: `governed ${actionType}`,
    expectedOutcome: 'provider state matches the governed action',
    estimatedImpact: {},
    estimatedCost: 10,
    currency: 'SAR',
    riskLevel: 'MEDIUM',
    policyContext: {},
    approvalRequirement: 'REQUIRED',
    idempotencyKey: `idempotency-${name}`,
    requestedAt: '2026-09-10T00:00:00.000Z',
    metadata: {},
    evidence: [{ id: `evidence-${name}`, source: 'test', summary: 'rollback regression' }],
    confidence: 0.9,
    rollback: { strategy: 'restore durable before-state', before },
  };
}

async function executeApproved(
  harness: ReturnType<typeof createHarness>,
  input: ExternalMarketingActionProposal,
): Promise<GovernedExternalAction> {
  const created = await harness.executor.propose(context, input);
  const awaiting = await harness.executor.requestApproval(context, created.id);
  assert.equal(awaiting.status, 'AWAITING_APPROVAL');
  harness.approvals.approve(awaiting.approvalId!);
  const verified = await harness.executor.execute(context, created.id);
  assert.equal(verified.status, 'VERIFIED');
  return verified;
}

async function executeApprovedRollback(
  harness: ReturnType<typeof createHarness>,
  original: GovernedExternalAction,
): Promise<GovernedExternalAction> {
  const rollback = await harness.executor.proposeRollback(context, original.id);
  const awaiting = await harness.executor.requestApproval(context, rollback.id);
  assert.equal(awaiting.status, 'AWAITING_APPROVAL');
  harness.approvals.approve(awaiting.approvalId!);
  const verified = await harness.executor.execute(context, rollback.id);
  assert.equal(verified.status, 'VERIFIED');
  return verified;
}

test('PAUSED campaign enable derives PAUSE_CAMPAIGN rollback and restores the durable before-state through governance', async () => {
  const harness = createHarness();
  harness.provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: false, dailyBudget: 2_000 });
  const original = await executeApproved(harness, proposal('enable', 'ENABLE_CAMPAIGN', { enabled: true }, { enabled: false }));
  const rollback = await harness.executor.proposeRollback(context, original.id);
  assert.equal(rollback.proposal.actionType, 'PAUSE_CAMPAIGN');
  assert.deepEqual(rollback.proposal.requestedPayload, { enabled: false });
  const restored = await executeApprovedRollback(harness, original);
  assert.equal(restored.id, rollback.id, 'same original rollback must replay idempotently');
  assert.equal((await harness.provider.getCampaign(context, 'account-a', 'campaign-a')).enabled, false);
});

test('ENABLED campaign pause derives ENABLE_CAMPAIGN rollback and restores the durable before-state through governance', async () => {
  const harness = createHarness();
  harness.provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: true, dailyBudget: 2_000 });
  const original = await executeApproved(harness, proposal('pause', 'PAUSE_CAMPAIGN', { enabled: false }, { enabled: true }));
  const rollback = await harness.executor.proposeRollback(context, original.id);
  assert.equal(rollback.proposal.actionType, 'ENABLE_CAMPAIGN');
  assert.deepEqual(rollback.proposal.requestedPayload, { enabled: true });
  await executeApprovedRollback(harness, original);
  assert.equal((await harness.provider.getCampaign(context, 'account-a', 'campaign-a')).enabled, true);
});

for (const scenario of [
  { name: 'budget', actionType: 'UPDATE_CAMPAIGN_BUDGET', requested: { dailyBudget: 3_000 }, before: { dailyBudget: 2_000 }, campaign: { dailyBudget: 2_000 }, expected: { dailyBudget: 2_000 } },
  { name: 'target-cpa', actionType: 'UPDATE_TARGET_CPA', requested: { targetCpa: 25 }, before: { targetCpa: 20 }, campaign: { targetCpa: 20 }, expected: { targetCpa: 20 } },
  { name: 'target-roas', actionType: 'UPDATE_TARGET_ROAS', requested: { targetRoas: 4.5 }, before: { targetRoas: 4 }, campaign: { targetRoas: 4 }, expected: { targetRoas: 4 } },
]) {
  test(`${scenario.name} rollback restores the durable previous value`, async () => {
    const harness = createHarness();
    harness.provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: true, ...scenario.campaign });
    const original = await executeApproved(harness, proposal(scenario.name, scenario.actionType, scenario.requested, scenario.before));
    const rollback = await harness.executor.proposeRollback(context, original.id);
    assert.equal(rollback.proposal.actionType, scenario.actionType);
    assert.deepEqual(rollback.proposal.requestedPayload, scenario.expected);
    await executeApprovedRollback(harness, original);
    const campaign = await harness.provider.getCampaign(context, 'account-a', 'campaign-a');
    for (const [key, value] of Object.entries(scenario.expected)) {
      assert.equal(campaign[key as 'dailyBudget' | 'targetCpa' | 'targetRoas'], value);
    }
  });
}

test('missing durable before-state fails closed before a rollback proposal is created', async () => {
  const harness = createHarness();
  harness.provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: true, dailyBudget: 2_000 });
  const original = await executeApproved(harness, proposal('invalid-before', 'UPDATE_CAMPAIGN_BUDGET', { dailyBudget: 3_000 }, { dailyBudget: 2_000 }));
  const persisted = await harness.store.get(context, original.id);
  await harness.store.save(context, {
    ...persisted!,
    proposal: { ...persisted!.proposal, rollback: { ...persisted!.proposal.rollback, before: {} } },
  });
  const createdBeforeRollback = harness.store.createdActionIds.length;
  await assert.rejects(() => harness.executor.proposeRollback(context, original.id), /GOOGLE_ADS_ROLLBACK_BEFORE_STATE_INVALID/);
  assert.equal(harness.store.createdActionIds.length, createdBeforeRollback);
  assert.equal((await harness.provider.getCampaign(context, 'account-a', 'campaign-a')).dailyBudget, 3_000);
});

test('rollback cannot bypass policy or durable approval', async () => {
  const policyHarness = createHarness();
  policyHarness.provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: false, dailyBudget: 2_000 });
  const policyOriginal = await executeApproved(policyHarness, proposal('policy', 'ENABLE_CAMPAIGN', { enabled: true }, { enabled: false }));
  policyHarness.policy.actionTypeAllowlist.splice(0, policyHarness.policy.actionTypeAllowlist.length, 'ENABLE_CAMPAIGN');
  const policyRollback = await policyHarness.executor.proposeRollback(context, policyOriginal.id);
  assert.equal((await policyHarness.executor.requestApproval(context, policyRollback.id)).status, 'REJECTED');
  assert.equal((await policyHarness.provider.getCampaign(context, 'account-a', 'campaign-a')).enabled, true);

  const approvalHarness = createHarness();
  approvalHarness.provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: false, dailyBudget: 2_000 });
  const approvalOriginal = await executeApproved(approvalHarness, proposal('approval', 'ENABLE_CAMPAIGN', { enabled: true }, { enabled: false }));
  const approvalRollback = await approvalHarness.executor.proposeRollback(context, approvalOriginal.id);
  assert.equal((await approvalHarness.executor.requestApproval(context, approvalRollback.id)).status, 'AWAITING_APPROVAL');
  assert.equal((await approvalHarness.executor.execute(context, approvalRollback.id)).status, 'REJECTED');
  assert.equal((await approvalHarness.provider.getCampaign(context, 'account-a', 'campaign-a')).enabled, true);
});

test('rollback remains tenant-bound and idempotent under concurrent requests', async () => {
  const harness = createHarness();
  harness.provider.seed({ accountId: 'account-a', campaignId: 'campaign-a', enabled: false, dailyBudget: 2_000 });
  const original = await executeApproved(harness, proposal('concurrent', 'ENABLE_CAMPAIGN', { enabled: true }, { enabled: false }));
  const createdBeforeRollback = harness.store.createdActionIds.length;
  await assert.rejects(
    () => harness.executor.proposeRollback({ ...context, tenantId: 'tenant-b' }, original.id),
    /EXTERNAL_ACTION_NOT_FOUND_OR_ACCESS_DENIED/,
  );
  const [first, second] = await Promise.all([
    harness.executor.proposeRollback(context, original.id),
    harness.executor.proposeRollback(context, original.id),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(harness.store.createdActionIds.length, createdBeforeRollback + 1, 'only one rollback action reaches durable creation');
  await executeApprovedRollback(harness, original);
  assert.equal((await harness.provider.getCampaign(context, 'account-a', 'campaign-a')).enabled, false);
});
