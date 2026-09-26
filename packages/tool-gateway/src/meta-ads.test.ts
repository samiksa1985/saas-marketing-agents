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
  type ExternalMarketingActionProposal,
  type GovernedExternalAction,
} from '@platform/marketing-os-core';
import {
  EnvironmentMetaAdsCredentialResolver,
  MetaAdsApiAdapter,
  MetaAdsProviderError,
  MetaAdsProviderGateway,
  MetaAdsRestTransport,
  MockMetaAdsProvider,
  type MetaAdsFetchResponse,
} from './meta-ads.js';

const context: TenantContext = {
  tenantId: 'tenant-meta-a',
  userId: 'operator-meta-a',
  roles: ['marketing_manager'],
  permissions: ['marketing:admin', 'integration:admin'],
  locale: 'en',
};

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
    const current = this.records.get(id);
    if (!current) throw new Error('APPROVAL_NOT_FOUND');
    this.records.set(id, { ...current, decision: 'approved' });
  }
}

function proposal(
  name: string,
  actionType: string,
  requestedPayload: Record<string, unknown>,
  before: Record<string, unknown>,
): ExternalMarketingActionProposal {
  return {
    actionId: `meta-action-${name}`,
    tenantId: context.tenantId,
    organizationId: 'meta-org-a',
    actor: context.userId!,
    agentIdentity: 'meta-agent-a',
    workflowRunId: `meta-workflow-${name}`,
    recommendationId: `meta-recommendation-${name}`,
    provider: 'META_ADS',
    accountId: 'act_123456789',
    campaignId: '987654321',
    actionType,
    requestedPayload,
    reason: 'governed Meta mutation',
    expectedOutcome: 'fresh provider read matches canonical requested state',
    estimatedImpact: { source: 'deterministic fake' },
    estimatedCost: 100,
    currency: 'SAR',
    riskLevel: 'MEDIUM',
    policyContext: {},
    approvalRequirement: 'REQUIRED',
    idempotencyKey: `meta-idempotency-${name}`,
    requestedAt: '2026-09-13T00:00:00.000Z',
    metadata: {},
    evidence: [{ id: `meta-evidence-${name}`, source: 'test', summary: 'provider-neutral governed path' }],
    confidence: 0.9,
    rollback: { strategy: 'restore durable Meta before state', before },
  };
}

function createHarness() {
  const provider = new MockMetaAdsProvider();
  const approvals = new Approvals();
  const policy: ExternalActionPolicy = {
    tenantId: context.tenantId,
    providerAllowlist: ['META_ADS'],
    actionTypeAllowlist: ['PAUSE_CAMPAIGN', 'ENABLE_CAMPAIGN', 'UPDATE_CAMPAIGN_BUDGET'],
    accountAllowlist: ['act_123456789'],
    campaignAllowlist: ['987654321'],
    minimumConfidence: 0.8,
    requiredEvidence: true,
    requiredApprovalLevel: 'HUMAN',
    killSwitch: false,
    dryRunOnly: false,
  };
  const gateway = new MetaAdsProviderGateway(provider, 'MOCK', false);
  const executor = new GovernedExternalActionExecutor(
    new InMemoryExternalActionStore(),
    gateway,
    new CanonicalExternalActionBudgetAuthority(
      { async authorize(tenantId, key) { return { tenantId, key, allowed: key === 'marketing.external_action.meta_ads', source: 'PLAN', reason: 'test' }; } },
      { tenantId: context.tenantId, hardDailySpendLimit: 10_000, hardMonthlySpendLimit: 300_000 },
    ),
    new ExternalActionPolicyEngine(),
    policy,
    approvals,
  );
  return { provider, approvals, executor, gateway, policy };
}

async function executeApproved(
  harness: ReturnType<typeof createHarness>,
  input: ExternalMarketingActionProposal,
): Promise<GovernedExternalAction> {
  const created = await harness.executor.propose(context, input);
  const simulated = await harness.executor.simulate(context, created.id);
  assert.equal(simulated.status, 'SIMULATED');
  const awaiting = await harness.executor.requestApproval(context, created.id);
  assert.equal(awaiting.status, 'AWAITING_APPROVAL');
  harness.approvals.approve(awaiting.approvalId!);
  return harness.executor.execute(context, created.id);
}

test('Meta campaigns use the complete provider-neutral governed lifecycle and independently verify state', async () => {
  const harness = createHarness();
  harness.provider.seed({ accountId: 'act_123456789', campaignId: '987654321', enabled: true, status: 'ACTIVE', dailyBudget: 20_000 });
  const result = await executeApproved(harness, proposal('pause', 'PAUSE_CAMPAIGN', { enabled: false }, { enabled: true }));
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.proposal.provider, 'META_ADS');
  assert.equal((await harness.provider.getCampaign(context, 'act_123456789', '987654321')).enabled, false);
  assert.ok(result.evidence.some((item) => item.type === 'PROVIDER_VERIFICATION'));
  assert.equal((await harness.executor.execute(context, result.id)).status, 'VERIFIED');
  assert.equal(harness.provider.mutationCount, 1, 'repeat execute cannot mutate Meta twice');
});

test('Meta maps canonical pause, enable, and budget actions and derives governed rollback proposals', async () => {
  for (const scenario of [
    { name: 'enable', action: 'ENABLE_CAMPAIGN', requested: { enabled: true }, before: { enabled: false }, seed: { enabled: false, status: 'PAUSED', dailyBudget: 20_000 }, rollback: 'PAUSE_CAMPAIGN' },
    { name: 'pause', action: 'PAUSE_CAMPAIGN', requested: { enabled: false }, before: { enabled: true }, seed: { enabled: true, status: 'ACTIVE', dailyBudget: 20_000 }, rollback: 'ENABLE_CAMPAIGN' },
    { name: 'budget', action: 'UPDATE_CAMPAIGN_BUDGET', requested: { dailyBudget: 30_000 }, before: { dailyBudget: 20_000 }, seed: { enabled: true, status: 'ACTIVE', dailyBudget: 20_000 }, rollback: 'UPDATE_CAMPAIGN_BUDGET' },
  ]) {
    const harness = createHarness();
    harness.provider.seed({ accountId: 'act_123456789', campaignId: '987654321', ...scenario.seed });
    const original = await executeApproved(harness, proposal(scenario.name, scenario.action, scenario.requested, scenario.before));
    assert.equal(original.status, 'VERIFIED');
    const rollback = await harness.executor.proposeRollback(context, original.id);
    assert.equal(rollback.proposal.actionType, scenario.rollback);
    const awaiting = await harness.executor.requestApproval(context, rollback.id);
    harness.approvals.approve(awaiting.approvalId!);
    const restored = await harness.executor.execute(context, rollback.id);
    assert.equal(restored.status, 'VERIFIED');
    const campaign = await harness.provider.getCampaign(context, 'act_123456789', '987654321');
    if ('enabled' in scenario.before) assert.equal(campaign.enabled, scenario.before.enabled);
    if ('dailyBudget' in scenario.before) assert.equal(campaign.dailyBudget, scenario.before.dailyBudget);
  }
});

test('Meta gateway fails closed when disabled or a real account is not explicitly allowlisted', async () => {
  const provider = new MockMetaAdsProvider();
  provider.seed({ accountId: 'act_123456789', campaignId: '987654321', enabled: true, status: 'ACTIVE' });
  const input = proposal('disabled', 'PAUSE_CAMPAIGN', { enabled: false }, { enabled: true });
  await assert.rejects(() => new MetaAdsProviderGateway(provider, 'DISABLED', false).simulate(context, input), /META_ADS_PROVIDER_DISABLED/);
  const real = new MetaAdsProviderGateway(provider, 'REAL', true, undefined, {
    approvedAdAccountId: 'act_123456789',
    sandboxAdAccountIds: ['act_111111111'],
  });
  await assert.rejects(() => real.simulate(context, input), /META_ADS_PRODUCTION_ACCOUNT_BLOCKED/);
  await assert.rejects(() => new MetaAdsProviderGateway(provider, 'REAL', false, undefined, {
    approvedAdAccountId: 'act_123456789', sandboxAdAccountIds: ['act_123456789'],
  }).execute(context, {} as never), /GOVERNED_DISPATCH_REQUIRED/);
});

test('timeout after a Meta mutation is reconciled by read-back without duplicate mutation', async () => {
  const harness = createHarness();
  harness.provider.seed({ accountId: 'act_123456789', campaignId: '987654321', enabled: true, status: 'ACTIVE' });
  harness.provider.timeoutAfterMutationOnce();
  const result = await executeApproved(harness, proposal('timeout', 'PAUSE_CAMPAIGN', { enabled: false }, { enabled: true }));
  assert.equal(result.status, 'VERIFIED');
  assert.equal(harness.provider.mutationCount, 1);
});

test('concurrent Meta execute requests retain the existing governed target lock and mutate once', async () => {
  const harness = createHarness();
  harness.provider.seed({ accountId: 'act_123456789', campaignId: '987654321', enabled: true, status: 'ACTIVE' });
  const created = await harness.executor.propose(context, proposal('concurrent', 'PAUSE_CAMPAIGN', { enabled: false }, { enabled: true }));
  await harness.executor.simulate(context, created.id);
  const awaiting = await harness.executor.requestApproval(context, created.id);
  harness.approvals.approve(awaiting.approvalId!);
  const results = await Promise.allSettled([
    harness.executor.execute(context, created.id),
    harness.executor.execute(context, created.id),
  ]);
  assert.ok(results.some((result) => result.status === 'fulfilled' && result.value.status === 'VERIFIED'));
  assert.equal(harness.provider.mutationCount, 1, 'a concurrent duplicate cannot issue a second Meta mutation');
});

test('Meta verification reports mismatch from an independent fresh campaign read', async () => {
  const provider = new MockMetaAdsProvider();
  provider.seed({ accountId: 'act_123456789', campaignId: '987654321', enabled: true, status: 'ACTIVE' });
  const gateway = new MetaAdsProviderGateway(provider, 'MOCK', false);
  const input = proposal('mismatch', 'PAUSE_CAMPAIGN', { enabled: false }, { enabled: true });
  const verification = await gateway.verify(context, {
    id: input.actionId, tenantId: input.tenantId, planId: input.recommendationId, workflowId: input.workflowRunId,
    type: input.actionType, idempotencyKey: input.idempotencyKey, status: 'VERIFYING', approvalId: 'approval-a',
    requestedAt: input.requestedAt, updatedAt: input.requestedAt, proposal: input, evidence: [], version: 1,
  }, { providerReference: 'test' });
  assert.equal(verification.status, 'MISMATCH');
});

test('Meta credential boundary exposes names only and maps safe Graph errors', async () => {
  const resolver = new EnvironmentMetaAdsCredentialResolver({ META_ADS_AD_ACCOUNT_ID: 'act_123456789' });
  assert.deepEqual(resolver.validate(), { valid: false, missing: ['META_ADS_ACCESS_TOKEN'] });
  const revoked = new MetaAdsRestTransport({
    fetcher: async () => response(401, { error: { code: 190, message: 'token is invalid or revoked' } }),
  });
  await assert.rejects(
    () => revoked.validateConnection({ accessToken: 'not-a-real-token', adAccountId: 'act_123456789' }),
    (error: unknown) => error instanceof MetaAdsProviderError
      && error.code === 'META_ADS_TOKEN_REVOKED'
      && !error.message.includes('not-a-real-token'),
  );
  const limited = new MetaAdsRestTransport({
    fetcher: async () => response(429, { error: { code: 4 } }, { 'retry-after': '12' }),
  });
  await assert.rejects(
    () => limited.validateConnection({ accessToken: 'not-a-real-token', adAccountId: 'act_123456789' }),
    (error: unknown) => error instanceof MetaAdsProviderError
      && error.code === 'META_ADS_RATE_LIMITED'
      && error.retryable
      && error.retryAfterMs === 12_000,
  );
});

test('Meta Graph transport parses campaign reads and maps canonical mutations without putting tokens in URLs', async () => {
  const calls: Array<{ url: string; body?: string }> = [];
  const transport = new MetaAdsRestTransport({
    fetcher: async (url, request) => {
      calls.push({ url, ...(request.body !== undefined ? { body: request.body } : {}) });
      if (request.method === 'POST') return response(200, { success: true });
      return response(200, {
        id: '987654321', account_id: '123456789', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '20000',
      });
    },
  });
  const adapter = new MetaAdsApiAdapter(
    { validate: () => ({ valid: true, missing: [] }), resolve: () => ({ accessToken: 'not-a-real-token', adAccountId: 'act_123456789' }) },
    transport,
  );
  const campaign = await adapter.getCampaign(context, 'act_123456789', '987654321');
  assert.deepEqual(campaign, { accountId: 'act_123456789', campaignId: '987654321', status: 'ACTIVE', enabled: true, dailyBudget: 20_000 });
  await transport.executeAction(
    { accessToken: 'not-a-real-token', adAccountId: 'act_123456789' },
    proposal('transport', 'UPDATE_CAMPAIGN_BUDGET', { dailyBudget: 30_000 }, { dailyBudget: 20_000 }),
  );
  assert.ok(calls.some((call) => call.body?.includes('daily_budget=30000')));
  assert.ok(calls.every((call) => !call.url.includes('not-a-real-token')));
});

function response(status: number, body: unknown, headers: Record<string, string> = {}): MetaAdsFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  };
}
