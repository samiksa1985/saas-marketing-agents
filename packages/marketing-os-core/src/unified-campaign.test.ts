import assert from 'node:assert/strict';
import test from 'node:test';

import type { TenantContext } from '@platform/contracts';

import {
  InMemoryUnifiedCampaignStore,
  UnifiedCampaignError,
  UnifiedCampaignPlanner,
  aggregateCampaignLifecycle,
  aggregateCampaignPerformance,
  allocateCampaignBudget,
  canTransitionUnifiedCampaign,
  createUnifiedCampaign,
  deriveCampaignCompensationPlan,
  recommendCampaignOptimization,
  transitionUnifiedCampaign,
  type CampaignPerformanceSnapshot,
  type UnifiedCampaignInput,
} from './unified-campaign.js';

const context: TenantContext = {
  tenantId: 'tenant-a', userId: 'operator-a', roles: [], permissions: [], locale: 'en' as never,
};

function input(overrides: Partial<UnifiedCampaignInput> = {}): UnifiedCampaignInput {
  return {
    idempotencyKey: 'unified-campaign-key-a',
    organizationId: 'org-a',
    objective: 'LEAD_GENERATION',
    goal: 'Generate qualified leads in Saudi Arabia',
    locale: 'ar' as never,
    target: { markets: ['SA'], languages: ['ar'], keywords: ['growth'] },
    budget: { amountMinor: 1_000_000, currency: 'SAR', minorUnitScale: 2 },
    schedule: { startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-10-31T00:00:00.000Z' },
    channels: [
      {
        id: 'google', provider: 'GOOGLE_ADS', accountId: 'google-account', campaignId: 'google-campaign',
        allocation: { kind: 'PERCENTAGE', percentageBasisPoints: 6000, reasoning: 'Search demand evidence.' },
      },
      {
        id: 'meta', provider: 'META_ADS', accountId: 'act_123456', campaignId: 'meta-campaign',
        allocation: { kind: 'PERCENTAGE', percentageBasisPoints: 4000, reasoning: 'Audience evidence.' },
      },
    ],
    evidenceReferences: [{ id: 'evidence-a', source: 'strategy', summary: 'Approved market strategy.' }],
    confidence: 0.9,
    ...overrides,
  };
}

function planner(allowed = true) {
  return new UnifiedCampaignPlanner(
    {
      capabilities(provider) {
        if (provider === 'GOOGLE_ADS') {
          return { actionTypes: ['UPDATE_CAMPAIGN_BUDGET', 'UPDATE_TARGET_CPA'], budgetUnit: 'MAJOR' };
        }
        if (provider === 'META_ADS') {
          return { actionTypes: ['UPDATE_CAMPAIGN_BUDGET'], budgetUnit: 'MINOR' };
        }
        throw new UnifiedCampaignError('EXTERNAL_ACTION_PROVIDER_CAPABILITY_UNSUPPORTED');
      },
    },
    { async authorize() { return { allowed, reason: allowed ? 'plan' : 'denied' }; } },
    () => '2026-09-14T00:00:00.000Z',
  );
}

function snapshot(overrides: Partial<CampaignPerformanceSnapshot> = {}): CampaignPerformanceSnapshot {
  return {
    id: 'snapshot-google', tenantId: 'tenant-a', campaignId: 'campaign-a', channelId: 'google', provider: 'GOOGLE_ADS',
    currency: 'SAR', capturedAt: '2026-09-14T00:00:00.000Z', freshnessExpiresAt: '2026-09-15T00:00:00.000Z',
    verification: 'VERIFIED', provenance: [{ id: 'performance-google', source: 'provider-read', summary: 'Read snapshot.' }],
    metrics: {
      impressions: 1_000, clicks: 100, spend: 1_000, conversions: 10, conversionValue: 3_000,
      ctr: 0.1, cpc: 10, cpm: 1_000, cpa: 100, roas: 3,
    },
    ...overrides,
  };
}

test('unified campaign validates Saudi currency, schedule, allocations, evidence, and explicit target', () => {
  const campaign = createUnifiedCampaign(context, input(), () => '2026-09-14T00:00:00.000Z');
  assert.equal(campaign.lifecycle, 'DRAFT');
  assert.equal(campaign.budget.currency, 'SAR');
  assert.throws(() => createUnifiedCampaign(context, input({ evidenceReferences: [] })), /UNIFIED_CAMPAIGN_EVIDENCE_REQUIRED/);
  assert.throws(() => createUnifiedCampaign(context, input({ schedule: { startsAt: 'later', endsAt: 'earlier' } })), /UNIFIED_CAMPAIGN_SCHEDULE_INVALID/);
  assert.throws(() => createUnifiedCampaign(context, input({ budget: { amountMinor: 1, currency: 'SAR', minorUnitScale: 7 } })), /UNIFIED_CAMPAIGN_CURRENCY_SCALE_INVALID/);
});

test('allocation uses deterministic largest-remainder rounding and refuses conflicting or unallocated definitions', () => {
  const channels = input().channels.map((channel, index) => ({
    ...channel,
    id: index === 0 ? 'a' : 'b',
    allocation: { kind: 'PERCENTAGE' as const, percentageBasisPoints: 5000, reasoning: channel.allocation.reasoning },
  }));
  const rounded = allocateCampaignBudget({ amountMinor: 101, currency: 'SAR', minorUnitScale: 2 }, channels);
  assert.deepEqual(rounded.map((item) => [item.channelId, item.amountMinor]), [['a', 51], ['b', 50]]);
  const conflicting = input().channels.map((channel) => ({
    ...channel,
    allocation: { kind: 'FIXED' as const, amountMinor: 500_000, percentageBasisPoints: 5000, reasoning: 'conflict' },
  }));
  assert.throws(() => allocateCampaignBudget(input().budget, conflicting), /UNIFIED_CAMPAIGN_ALLOCATION_CONFLICT/);
  const incomplete = input().channels.map((channel) => ({ ...channel, allocation: { kind: 'PERCENTAGE' as const, percentageBasisPoints: 2000, reasoning: 'incomplete' } }));
  assert.throws(() => allocateCampaignBudget(input().budget, incomplete), /UNIFIED_CAMPAIGN_ALLOCATION_MUST_EQUAL_TOTAL/);
});

test('planner is deterministic, entitlement-gated, capability-gated, and never invokes a provider gateway', async () => {
  const campaign = createUnifiedCampaign(context, input(), () => '2026-09-14T00:00:00.000Z');
  const first = await planner().plan(context, campaign);
  const second = await planner().plan(context, campaign);
  assert.deepEqual(first, second);
  assert.deepEqual(first.steps.map((step) => [step.channelId, step.providerBudgetValue, step.providerBudgetUnit]), [
    ['google', 6000, 'MAJOR'], ['meta', 400_000, 'MINOR'],
  ]);
  assert.ok(first.steps.every((step) => step.proposal.approvalRequirement === 'REQUIRED'));
  assert.ok(first.steps.every((step) => step.proposal.metadata.unifiedCampaignId === campaign.id));
  await assert.rejects(() => planner(false).plan(context, campaign), /UNIFIED_CAMPAIGN_ENTITLEMENT_DENIED/);
  const unsupported = createUnifiedCampaign(context, input({
    channels: [{
      ...input().channels[1]!,
      actionType: 'UPDATE_TARGET_CPA',
      allocation: { kind: 'PERCENTAGE', percentageBasisPoints: 10_000, reasoning: 'Capability test.' },
    }],
  }));
  await assert.rejects(() => planner().plan(context, unsupported), /UNIFIED_CAMPAIGN_PROVIDER_CAPABILITY_UNSUPPORTED/);
  assert.throws(
    () => allocateCampaignBudget({ amountMinor: Number.MAX_SAFE_INTEGER, currency: 'SAR', minorUnitScale: 2 }, input().channels),
    /UNIFIED_CAMPAIGN_BUDGET_RANGE_UNSUPPORTED/,
  );
});

test('lifecycle transitions and aggregate outcome never report ACTIVE after partial provider failure', async () => {
  const campaign = createUnifiedCampaign(context, input());
  const plan = await planner().plan(context, campaign);
  assert.equal(canTransitionUnifiedCampaign('DRAFT', 'PLANNED'), true);
  assert.equal(canTransitionUnifiedCampaign('DRAFT', 'ACTIVE'), false);
  const planned = transitionUnifiedCampaign(campaign, 'PLANNED', () => '2026-09-14T00:00:00.000Z');
  assert.equal(planned.lifecycle, 'PLANNED');
  assert.throws(() => transitionUnifiedCampaign(campaign, 'ACTIVE'), /UNIFIED_CAMPAIGN_INVALID_TRANSITION/);
  const partial = aggregateCampaignLifecycle(plan, [
    { stepId: plan.steps[0]!.id, channelId: 'google', provider: 'GOOGLE_ADS', status: 'VERIFIED', externalActionId: 'action-google', beforeStateEvidence: [], verificationEvidence: [], reasons: [], observedAt: '2026-09-14T00:00:00.000Z' },
    { stepId: plan.steps[1]!.id, channelId: 'meta', provider: 'META_ADS', status: 'UNAVAILABLE', beforeStateEvidence: [], verificationEvidence: [], reasons: ['provider unavailable'], observedAt: '2026-09-14T00:00:00.000Z' },
  ]);
  assert.equal(partial, 'DEGRADED');
  assert.equal(aggregateCampaignLifecycle(plan, plan.steps.map((step) => ({ stepId: step.id, channelId: step.channelId, provider: step.provider, status: 'FAILED', beforeStateEvidence: [], verificationEvidence: [], reasons: [], observedAt: '2026-09-14T00:00:00.000Z' }))), 'FAILED');
});

test('compensation plans only reference successful actions for existing governed rollback proposals', () => {
  const plan = deriveCampaignCompensationPlan('campaign-a', [
    { stepId: 'step-a', channelId: 'google', provider: 'GOOGLE_ADS', status: 'VERIFIED', externalActionId: 'action-a', beforeStateEvidence: [{ id: 'before-a', source: 'action', summary: 'durable before state' }], verificationEvidence: [], reasons: [], observedAt: '2026-09-14T00:00:00.000Z' },
    { stepId: 'step-b', channelId: 'meta', provider: 'META_ADS', status: 'FAILED', externalActionId: 'action-b', beforeStateEvidence: [], verificationEvidence: [], reasons: [], observedAt: '2026-09-14T00:00:00.000Z' },
  ]);
  assert.equal(plan.requests.length, 1);
  assert.equal(plan.requests[0]!.originalExternalActionId, 'action-a');
  assert.equal(plan.requests[0]!.status, 'REQUIRES_GOVERNED_ROLLBACK');
  assert.equal(plan.requiresApproval, true);
});

test('performance aggregation preserves currency safety, stale state, and unknown metrics rather than fabricating totals', () => {
  const aggregate = aggregateCampaignPerformance('campaign-a', [
    snapshot(),
    snapshot({ id: 'snapshot-meta', channelId: 'meta', provider: 'META_ADS', metrics: { ...snapshot().metrics, roas: 1 } }),
  ], () => '2026-09-14T12:00:00.000Z');
  assert.equal(aggregate.currency, 'SAR');
  assert.equal(aggregate.metrics.impressions, 2_000);
  assert.equal(aggregate.metrics.spend, 2_000);
  assert.equal(aggregate.freshness, 'FRESH');
  const mixed = aggregateCampaignPerformance('campaign-a', [snapshot(), snapshot({ id: 'usd', channelId: 'meta', currency: 'USD' })]);
  assert.equal(mixed.currency, 'UNKNOWN');
  assert.equal(mixed.metrics.spend, 'UNKNOWN');
  assert.equal(mixed.metrics.cpc, 'UNKNOWN');
  const stale = aggregateCampaignPerformance('campaign-a', [snapshot({ freshnessExpiresAt: '2026-09-13T00:00:00.000Z' })], () => '2026-09-14T00:00:00.000Z');
  assert.equal(stale.freshness, 'STALE');
});

test('recommendations are deterministic, evidence-backed, approval-required, and cannot execute themselves', () => {
  const campaign = createUnifiedCampaign(context, input());
  const aggregate = aggregateCampaignPerformance(campaign.id, [
    snapshot(),
    snapshot({ id: 'snapshot-meta', channelId: 'meta', provider: 'META_ADS', metrics: { ...snapshot().metrics, roas: 1 } }),
  ], () => '2026-09-14T00:00:00.000Z');
  const recommendations = recommendCampaignOptimization(campaign, aggregate, () => '2026-09-14T00:00:00.000Z');
  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0]!.type, 'SHIFT_BUDGET');
  assert.equal(recommendations[0]!.requiresApproval, true);
  assert.equal('execute' in recommendations[0]!, false);
  assert.deepEqual(recommendCampaignOptimization(campaign, aggregate, () => '2026-09-14T00:00:00.000Z'), recommendations);
});

test('in-memory campaign persistence is tenant-isolated and idempotent', async () => {
  const store = new InMemoryUnifiedCampaignStore();
  const campaign = createUnifiedCampaign(context, input());
  assert.equal((await store.create(context, campaign)).id, campaign.id);
  assert.equal((await store.create(context, campaign)).id, campaign.id);
  await assert.rejects(() => store.get({ ...context, tenantId: 'tenant-b' }, campaign.id), /TENANT_SCOPE_DENIED/);
  await store.savePerformanceSnapshot(context, snapshot({ campaignId: campaign.id }));
  assert.equal((await store.listPerformanceSnapshots(context, campaign.id)).length, 1);
  await store.saveRecommendation(context, {
    id: 'recommendation-a', tenantId: campaign.tenantId, campaignId: campaign.id, type: 'REVIEW_TARGET_CPA', reason: 'review', evidenceReferences: [], confidence: 0.5,
    expectedImpact: 'review', affectedChannelIds: ['google'], requiresApproval: true, createdAt: '2026-09-14T00:00:00.000Z',
  });
  assert.equal((await store.listRecommendations(context, campaign.id)).length, 1);
});
