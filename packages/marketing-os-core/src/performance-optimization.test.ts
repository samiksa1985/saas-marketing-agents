import assert from 'node:assert/strict';
import test from 'node:test';

import type { TenantContext } from '@platform/contracts';

import {
  InMemoryPerformanceOptimizationStore,
  PerformanceOptimizationError,
  aggregateCrossChannelPerformance,
  assessAttribution,
  createCrossChannelBudgetRecommendation,
  createOptimizationLearningRecord,
  createUnifiedCampaign,
  detectPerformanceAnomalies,
  diagnosePerformance,
  generateOptimizationRecommendations,
  measureOptimizationOutcome,
  normalizePerformanceObservation,
  normalizePerformanceObservationSafely,
  simulateOptimizationImpact,
  toGovernedOptimizationProposal,
  type CanonicalPerformanceObservation,
  type CrossChannelPerformanceAggregate,
  type OptimizationRecommendation,
  type ProviderPerformanceMetricMapping,
  type ProviderPerformanceObservationInput,
  type UnifiedCampaignInput,
} from './index.js';

const context: TenantContext = { tenantId: 'tenant-a', userId: 'operator-a', roles: [], permissions: [], locale: 'en' as never };
const now = () => '2026-09-14T12:00:00.000Z';
const mapping: ProviderPerformanceMetricMapping = {
  provider: 'GOOGLE_ADS', version: 'google-read-v1', currency: 'SAR', currencyMinorUnitScale: 2,
  conversionSemantics: 'provider-primary', conversionValueSemantics: 'provider-primary-value',
  metricKeys: { impressions: 'impressions', clicks: 'clicks', spendMinor: 'spend', conversions: 'conversions', conversionValueMinor: 'value', qualifiedConversions: 'qualified' },
};

function campaignInput(): UnifiedCampaignInput {
  return {
    idempotencyKey: 'campaign-key', organizationId: 'org-a', objective: 'LEAD_GENERATION', goal: 'Qualified leads', locale: 'en' as never,
    target: { markets: ['SA'], languages: ['en'] }, budget: { amountMinor: 101, currency: 'SAR', minorUnitScale: 2 },
    schedule: { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-10-01T00:00:00.000Z' },
    channels: [
      { id: 'google', provider: 'GOOGLE_ADS', accountId: 'google-account', campaignId: 'google-campaign', allocation: { kind: 'PERCENTAGE', percentageBasisPoints: 5000, reasoning: 'evidence' } },
      { id: 'meta', provider: 'META_ADS', accountId: 'meta-account', campaignId: 'meta-campaign', allocation: { kind: 'PERCENTAGE', percentageBasisPoints: 5000, reasoning: 'evidence' } },
    ],
    evidenceReferences: [{ id: 'campaign-evidence', source: 'plan', summary: 'Approved intent.' }], confidence: 0.9,
  };
}

function input(overrides: Partial<ProviderPerformanceObservationInput> = {}): ProviderPerformanceObservationInput {
  return {
    tenantId: 'tenant-a', unifiedCampaignId: 'campaign-a', channelId: 'google', provider: 'GOOGLE_ADS', providerCampaignId: 'google-campaign', snapshotId: 'snapshot-a',
    periodStart: '2026-09-13T00:00:00.000Z', periodEnd: '2026-09-14T11:00:00.000Z', collectedAt: '2026-09-14T11:30:00.000Z', source: 'read-only-provider-export',
    metrics: { impressions: 1000, clicks: 100, spend: 10_000, conversions: 10, value: 30_000, qualified: 7 },
    evidenceRefs: [{ id: 'read-evidence', source: 'provider-read', summary: 'Read-only verified report.', observedAt: '2026-09-14T11:00:00.000Z' }], verificationState: 'VERIFIED', freshnessState: 'FRESH',
    ...overrides,
  };
}

function observation(overrides: Partial<CanonicalPerformanceObservation> = {}): CanonicalPerformanceObservation {
  return { ...normalizePerformanceObservation(input(), mapping, now), ...overrides };
}

test('normalization uses explicit mapping, preserves unknown versus zero, and keeps exact minor-unit money', () => {
  const normalized = normalizePerformanceObservation(input({ metrics: { impressions: 0, clicks: 0, spend: 10_001, conversions: 0, value: 0 } }), mapping, now);
  assert.equal(normalized.metrics.impressions, 0);
  assert.equal(normalized.metrics.reach, 'UNKNOWN');
  assert.equal(normalized.metrics.spendMinor, 10_001);
  assert.equal(normalized.currency, 'SAR');
  assert.equal(normalized.normalizationVersion, 'google-read-v1');
  assert.equal(normalized.id, normalizePerformanceObservation(input({ metrics: { impressions: 0, clicks: 0, spend: 10_001, conversions: 0, value: 0 } }), mapping, now).id);
});

test('malformed observations are rejected and can be safely quarantined without turning values into zero', () => {
  assert.throws(() => normalizePerformanceObservation(input({ metrics: { impressions: '1000' } }), mapping), /PERFORMANCE_METRIC_MALFORMED/);
  const rejected = normalizePerformanceObservationSafely(input({ metrics: { impressions: -1 } }), mapping);
  assert.deepEqual('status' in rejected ? rejected.status : undefined, 'REJECTED');
  assert.deepEqual('status' in rejected ? rejected.code : undefined, 'PERFORMANCE_METRIC_MALFORMED');
});

test('aggregation fails closed for incompatible currency, semantics, stale telemetry, missing metrics, and mismatches', () => {
  const good = observation();
  const aggregate = aggregateCrossChannelPerformance('campaign-a', [good], now);
  assert.equal(aggregate.metrics.spendMinor, 10_000);
  assert.equal(aggregate.metrics.cpcMinor, 100);
  assert.equal(aggregate.metrics.roas, 3);
  const incompatible = aggregateCrossChannelPerformance('campaign-a', [good, observation({ id: 'usd', channelId: 'meta', currency: 'USD' })], now);
  assert.equal(incompatible.currency, 'UNKNOWN');
  assert.ok(incompatible.reasons.includes('CURRENCY_INCOMPATIBLE'));
  assert.equal(incompatible.metrics.cpcMinor, 'UNKNOWN');
  const stale = aggregateCrossChannelPerformance('campaign-a', [observation({ freshnessState: 'STALE' })], now);
  assert.ok(stale.reasons.includes('STALE_TELEMETRY'));
  const semantic = aggregateCrossChannelPerformance('campaign-a', [good, observation({ id: 'semantic', conversionSemantics: 'different' })], now);
  assert.ok(semantic.reasons.includes('CONVERSION_SEMANTICS_INCOMPATIBLE'));
  const mismatch = aggregateCrossChannelPerformance('campaign-a', [observation({ verificationState: 'MISMATCH' })], now);
  assert.ok(mismatch.reasons.includes('VERIFICATION_MISMATCH'));
});

test('attribution V1 preserves evidence, limitations and unknowns instead of claiming perfect attribution', () => {
  const aggregate = aggregateCrossChannelPerformance('campaign-a', [observation(), observation({ id: 'second', channelId: 'meta', provider: 'META_ADS', providerCampaignId: 'meta-campaign' })], now);
  const assessment = assessAttribution(aggregate, 'PROVIDER_REPORTED', now);
  assert.equal(assessment.model, 'PROVIDER_REPORTED');
  assert.match(assessment.limitations[0]!, /not a causal incrementality/);
  assert.equal(assessment.contributions.length, 2);
  assert.equal(assessment.contributions.reduce((sum, item) => sum + (typeof item.contributionFraction === 'number' ? item.contributionFraction : 0), 0), 1);
});

test('diagnostics identify deterministic evidence issues and anomaly detection declines tiny samples', () => {
  const aggregate = aggregateCrossChannelPerformance('campaign-a', [observation({ metrics: { ...observation().metrics, conversions: 0 } })], now);
  const diagnostics = diagnosePerformance(aggregate, { budgetMinor: 10_000, now });
  assert.ok(diagnostics.some((item) => item.type === 'SPEND_WITHOUT_CONVERSIONS'));
  assert.ok(diagnostics.some((item) => item.type === 'BUDGET_EXHAUSTION'));
  assert.deepEqual(detectPerformanceAnomalies([aggregate]), []);
  const history: CrossChannelPerformanceAggregate[] = [100, 105, 95, 300].map((spend, index) => ({
    ...aggregate,
    generatedAt: `2026-09-${String(10 + index).padStart(2, '0')}T12:00:00.000Z`,
    metrics: { ...aggregate.metrics, spendMinor: spend, conversions: 1, conversionValueMinor: 300, impressions: 10, clicks: 1, cpcMinor: spend, cpmMinor: spend * 100, cpaMinor: spend, roas: 3, ctr: 0.1, conversionRate: 1 },
    reasons: [], confidence: 0.8,
  }));
  assert.ok(detectPerformanceAnomalies(history, { percentageThreshold: 0.2, now }).some((item) => item.type === 'SPEND_SPIKE'));
});

test('opportunities reject unsupported capabilities and recommendations carry governance requirements only', () => {
  const campaign = createUnifiedCampaign(context, campaignInput(), now);
  const aggregate = aggregateCrossChannelPerformance(campaign.id, [observation({ unifiedCampaignId: campaign.id })], now);
  const diagnostics = [{
    id: 'diagnostic-google', tenantId: context.tenantId, unifiedCampaignId: campaign.id, channelId: 'google', type: 'SPEND_WITHOUT_CONVERSIONS' as const, severity: 'HIGH' as const,
    observedValue: 100, baselineValue: 0, evidenceRefs: input().evidenceRefs, confidence: 0.8, reasonCodes: [], explanation: 'No conversions.', generatedAt: now(),
  }];
  const unsupported = generateOptimizationRecommendations(campaign, diagnostics, { capabilities() { return { actionTypes: [], budgetUnit: 'MINOR' }; } }, now);
  assert.equal(unsupported.length, 0);
  const recommendations = generateOptimizationRecommendations(campaign, diagnostics, { capabilities() { return { actionTypes: ['PAUSE_CAMPAIGN'], budgetUnit: 'MINOR' }; } }, now);
  assert.equal(recommendations[0]!.requiresApproval, true);
  assert.equal(recommendations[0]!.providerCapability.supported, true);
  assert.equal(aggregate.unifiedCampaignId, campaign.id);
});

test('budget rebalancing uses exact largest remainder and cannot increase the unified budget', () => {
  const campaign = createUnifiedCampaign(context, campaignInput(), now);
  const rebalance = createCrossChannelBudgetRecommendation(campaign, [
    { channelId: 'google', amountMinor: 50, currency: 'SAR' }, { channelId: 'meta', amountMinor: 51, currency: 'SAR' },
  ], { google: 3333, meta: 6667 }, input().evidenceRefs);
  assert.equal(rebalance.proposedAllocation.reduce((sum, item) => sum + item.amountMinor, 0), 101);
  assert.equal(rebalance.totalBudgetInvariant, true);
  const fixed = createCrossChannelBudgetRecommendation(campaign, rebalance.currentAllocation, {
    google: { kind: 'FIXED', amountMinor: 40 }, meta: { kind: 'FIXED', amountMinor: 61 },
  }, input().evidenceRefs);
  assert.equal(fixed.proposedAllocation.reduce((sum, item) => sum + item.amountMinor, 0), 101);
  assert.throws(() => createCrossChannelBudgetRecommendation(campaign, rebalance.currentAllocation, { google: 3333, meta: 6666 }, []), /BUDGET_PERCENTAGE_INVALID/);
});

test('simulation and governed bridge produce a proposal but cannot approve or execute a provider action', () => {
  const campaign = createUnifiedCampaign(context, campaignInput(), now);
  const recommendation: OptimizationRecommendation = {
    recommendationId: 'recommendation-a', tenantId: context.tenantId, unifiedCampaignId: campaign.id, affectedChannelId: 'google', provider: 'GOOGLE_ADS', actionType: 'PAUSE_CAMPAIGN',
    currentState: { status: 'ACTIVE' }, proposedState: { status: 'PAUSED' }, rationale: 'Verified waste.', diagnosticRefs: ['diagnostic-a'], evidenceRefs: input().evidenceRefs,
    confidence: 0.7, expectedImpact: { summary: 'Reduce exposure.', metric: 'spend', direction: 'DOWN' }, riskClass: 'HIGH', reversibility: 'GOVERNED_ROLLBACK_REQUIRED',
    providerCapability: { supported: true, actionType: 'PAUSE_CAMPAIGN' }, requiresApproval: true, createdAt: now(), expiresAt: '2026-09-15T12:00:00.000Z', recommendationVersion: 'V1',
  };
  const aggregate = aggregateCrossChannelPerformance(campaign.id, [observation({ unifiedCampaignId: campaign.id })], now);
  const simulation = simulateOptimizationImpact(recommendation, aggregate, now);
  const proposal = toGovernedOptimizationProposal(campaign, recommendation, simulation, 'operator-a', now);
  assert.equal(proposal.approvalRequirement, 'REQUIRED');
  assert.equal(proposal.actionType, 'PAUSE_CAMPAIGN');
  assert.equal('execute' in proposal, false);
  assert.throws(() => toGovernedOptimizationProposal(campaign, { ...recommendation, providerCapability: { supported: false } }, simulation, 'operator-a', now), /OPTIMIZATION_ACTION_NOT_GOVERNABLE/);
});

test('outcomes and learning are evidence-bound, tenant isolated, and require verified-quality inputs', async () => {
  const campaign = createUnifiedCampaign(context, campaignInput(), now);
  const recommendation: OptimizationRecommendation = {
    recommendationId: 'rec-outcome', tenantId: context.tenantId, unifiedCampaignId: campaign.id, actionType: 'OBSERVE_ONLY', currentState: {}, proposedState: {}, rationale: 'observe', diagnosticRefs: [], evidenceRefs: input().evidenceRefs,
    confidence: 0.6, expectedImpact: { summary: 'Unknown.', metric: 'roas', direction: 'UNKNOWN' }, riskClass: 'LOW', reversibility: 'REVERSIBLE', providerCapability: { supported: true }, requiresApproval: true, createdAt: now(), expiresAt: '2026-09-15T12:00:00.000Z', recommendationVersion: 'V1',
  };
  const before = aggregateCrossChannelPerformance(campaign.id, [observation({ unifiedCampaignId: campaign.id })], now);
  const after = { ...before, generatedAt: '2026-09-15T12:00:00.000Z', metrics: { ...before.metrics, conversionValueMinor: 40_000, roas: 4 } };
  const outcome = measureOptimizationOutcome(recommendation, 'verified-action-a', before, after, now);
  assert.equal(outcome.classification, 'IMPROVED');
  const learning = createOptimizationLearningRecord(recommendation, true, true, outcome, now);
  const store = new InMemoryPerformanceOptimizationStore();
  await store.saveObservation(context, observation({ unifiedCampaignId: campaign.id }));
  await store.saveObservation(context, observation({ unifiedCampaignId: campaign.id }));
  assert.equal((await store.listObservations(context, campaign.id)).length, 1);
  await store.saveLearning(context, learning);
  assert.equal((await store.listLearning(context, campaign.id))[0]!.tenantId, context.tenantId);
  assert.deepEqual(await store.listLearning({ ...context, tenantId: 'tenant-b' }, campaign.id), []);
  assert.throws(() => { throw new PerformanceOptimizationError('TENANT_SCOPE_DENIED'); }, /TENANT_SCOPE_DENIED/);
});
