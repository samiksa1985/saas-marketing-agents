import { createHash } from 'node:crypto';

import type { TenantContext } from '@platform/contracts';

import type { ExternalMarketingActionProposal } from './external-marketing-action.js';
import type {
  CampaignChannel,
  CampaignEvidenceReference,
  CampaignProviderCapabilityRegistry,
  UnifiedCampaign,
} from './unified-campaign.js';

/** A provider adapter maps its read-only telemetry into this input. It is not a provider DTO. */
export interface ProviderPerformanceObservationInput {
  tenantId: string;
  unifiedCampaignId: string;
  channelId: string;
  provider: string;
  providerCampaignId: string;
  snapshotId: string;
  periodStart: string;
  periodEnd: string;
  collectedAt: string;
  providerObservedAt?: string;
  source: string;
  /** The adapter's raw, read-only metric record. It is never persisted as an authority for a mutation. */
  metrics: Record<string, unknown>;
  evidenceRefs: CampaignEvidenceReference[];
  verificationState: VerificationState;
  freshnessState?: FreshnessState;
}

export type CanonicalMetricName =
  | 'impressions'
  | 'reach'
  | 'frequency'
  | 'clicks'
  | 'engagements'
  | 'videoViews'
  | 'spendMinor'
  | 'conversions'
  | 'conversionValueMinor'
  | 'qualifiedConversions';

/** Explicit mapping keeps provider-specific naming out of the optimization engine. */
export interface ProviderPerformanceMetricMapping {
  provider: string;
  version: string;
  metricKeys: Partial<Record<CanonicalMetricName, string>>;
  currency?: string;
  currencyMinorUnitScale?: number;
  conversionSemantics: string;
  conversionValueSemantics?: string;
}

export type MetricValue = number | 'UNKNOWN';
export type VerificationState = 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN' | 'MISMATCH';
export type FreshnessState = 'FRESH' | 'STALE' | 'UNKNOWN';

export interface CanonicalPerformanceMetrics {
  impressions: MetricValue;
  reach: MetricValue;
  frequency: MetricValue;
  clicks: MetricValue;
  engagements: MetricValue;
  videoViews: MetricValue;
  /** Exact integer minor units. Never use a floating point value for this field. */
  spendMinor: MetricValue;
  conversions: MetricValue;
  /** Exact integer minor units when the provider's conversion-value meaning is known. */
  conversionValueMinor: MetricValue;
  qualifiedConversions: MetricValue;
}

export interface CanonicalPerformanceObservation {
  id: string;
  idempotencyKey: string;
  tenantId: string;
  unifiedCampaignId: string;
  channelId: string;
  provider: string;
  providerCampaignId: string;
  snapshotId: string;
  periodStart: string;
  periodEnd: string;
  collectedAt: string;
  providerObservedAt?: string;
  freshnessState: FreshnessState;
  metrics: CanonicalPerformanceMetrics;
  currency: string | 'UNKNOWN';
  currencyMinorUnitScale?: number;
  conversionSemantics: string;
  conversionValueSemantics?: string;
  provenance: CampaignEvidenceReference[];
  source: string;
  verificationState: VerificationState;
  completeness: number;
  confidence: number;
  normalizationVersion: string;
}

export interface PerformanceNormalizationRejection {
  status: 'REJECTED';
  code: 'PERFORMANCE_METRIC_MALFORMED' | 'PERFORMANCE_OBSERVATION_INVALID';
  provider: string;
  snapshotId: string;
  reason: string;
}

export class PerformanceOptimizationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PerformanceOptimizationError';
  }
}

/**
 * Converts only explicitly mapped, read-only provider values. Missing metrics
 * stay UNKNOWN; they never become zero. Invalid metrics are rejected, rather
 * than silently accepted or repaired.
 */
export function normalizePerformanceObservation(
  input: ProviderPerformanceObservationInput,
  mapping: ProviderPerformanceMetricMapping,
  now: () => string = () => new Date().toISOString(),
): CanonicalPerformanceObservation {
  validateObservationInput(input, mapping);
  const metrics = {} as CanonicalPerformanceMetrics;
  for (const name of canonicalMetricNames) {
    const sourceKey = mapping.metricKeys[name];
    metrics[name] = sourceKey === undefined ? 'UNKNOWN' : normalizeMetric(input.metrics[sourceKey], name);
  }
  const monetaryValueKnown = isNumber(metrics.spendMinor) || isNumber(metrics.conversionValueMinor);
  const currency = mapping.currency ?? 'UNKNOWN';
  if (monetaryValueKnown && currency === 'UNKNOWN') {
    throw new PerformanceOptimizationError('PERFORMANCE_CURRENCY_REQUIRED');
  }
  const timestamp = now();
  const known = canonicalMetricNames.filter((name) => isNumber(metrics[name])).length;
  return {
    id: deterministicId('performance-observation', [input.tenantId, input.provider, input.providerCampaignId, input.snapshotId, mapping.version]),
    idempotencyKey: deterministicId('performance-observation-key', [input.tenantId, input.provider, input.providerCampaignId, input.snapshotId, mapping.version]),
    tenantId: input.tenantId,
    unifiedCampaignId: input.unifiedCampaignId,
    channelId: input.channelId,
    provider: input.provider,
    providerCampaignId: input.providerCampaignId,
    snapshotId: input.snapshotId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    collectedAt: input.collectedAt || timestamp,
    ...(input.providerObservedAt ? { providerObservedAt: input.providerObservedAt } : {}),
    freshnessState: input.freshnessState ?? freshnessFromPeriod(input.periodEnd, now()),
    metrics,
    currency,
    ...(mapping.currencyMinorUnitScale === undefined ? {} : { currencyMinorUnitScale: mapping.currencyMinorUnitScale }),
    conversionSemantics: mapping.conversionSemantics,
    ...(mapping.conversionValueSemantics ? { conversionValueSemantics: mapping.conversionValueSemantics } : {}),
    provenance: copy(input.evidenceRefs),
    source: input.source,
    verificationState: input.verificationState,
    completeness: known / canonicalMetricNames.length,
    confidence: confidenceFor(input, metrics),
    normalizationVersion: mapping.version,
  };
}

export function normalizePerformanceObservationSafely(
  input: ProviderPerformanceObservationInput,
  mapping: ProviderPerformanceMetricMapping,
): CanonicalPerformanceObservation | PerformanceNormalizationRejection {
  try {
    return normalizePerformanceObservation(input, mapping);
  } catch (error) {
    const code = error instanceof PerformanceOptimizationError && error.code === 'PERFORMANCE_METRIC_MALFORMED'
      ? 'PERFORMANCE_METRIC_MALFORMED'
      : 'PERFORMANCE_OBSERVATION_INVALID';
    return {
      status: 'REJECTED',
      code,
      provider: input.provider,
      snapshotId: input.snapshotId,
      reason: error instanceof Error ? error.message : code,
    };
  }
}

export interface CrossChannelPerformanceAggregate {
  unifiedCampaignId: string;
  currency: string | 'UNKNOWN';
  metrics: CanonicalPerformanceMetrics & DerivedPerformanceMetrics;
  observations: CanonicalPerformanceObservation[];
  freshnessState: FreshnessState;
  confidence: number;
  reasons: AggregationReasonCode[];
  generatedAt: string;
}

export interface DerivedPerformanceMetrics {
  ctr: MetricValue;
  cpcMinor: MetricValue;
  cpmMinor: MetricValue;
  cpaMinor: MetricValue;
  roas: MetricValue;
  conversionRate: MetricValue;
}

export type AggregationReasonCode =
  | 'NO_PERFORMANCE_OBSERVATIONS'
  | 'CURRENCY_INCOMPATIBLE'
  | 'CONVERSION_SEMANTICS_INCOMPATIBLE'
  | 'CONVERSION_VALUE_SEMANTICS_INCOMPATIBLE'
  | 'STALE_TELEMETRY'
  | 'UNVERIFIED_TELEMETRY'
  | 'VERIFICATION_MISMATCH'
  | 'REQUIRED_METRIC_UNKNOWN'
  | 'INSUFFICIENT_EVIDENCE';

/** Safe aggregation refuses partial, stale, semantically incompatible totals. */
export function aggregateCrossChannelPerformance(
  unifiedCampaignId: string,
  observations: readonly CanonicalPerformanceObservation[],
  now: () => string = () => new Date().toISOString(),
): CrossChannelPerformanceAggregate {
  const ordered = observations
    .filter((observation) => observation.unifiedCampaignId === unifiedCampaignId)
    .sort(compareObservation);
  const reasons = new Set<AggregationReasonCode>();
  if (ordered.length === 0) reasons.add('NO_PERFORMANCE_OBSERVATIONS');
  if (ordered.some((observation) => observation.freshnessState !== 'FRESH')) reasons.add('STALE_TELEMETRY');
  if (ordered.some((observation) => observation.verificationState === 'MISMATCH')) reasons.add('VERIFICATION_MISMATCH');
  if (ordered.some((observation) => observation.verificationState !== 'VERIFIED')) reasons.add('UNVERIFIED_TELEMETRY');
  if (ordered.some((observation) => observation.provenance.length === 0)) reasons.add('INSUFFICIENT_EVIDENCE');
  const monetaryObservations = ordered.filter((observation) => isNumber(observation.metrics.spendMinor));
  const currencies = new Set(monetaryObservations.map((observation) => observation.currency));
  const conversionObservations = ordered.filter((observation) => isNumber(observation.metrics.conversions));
  const conversionSemantics = new Set(conversionObservations.map((observation) => observation.conversionSemantics));
  const valueObservations = ordered.filter((observation) => isNumber(observation.metrics.conversionValueMinor));
  const valueSemantics = new Set(valueObservations.map((observation) => observation.conversionValueSemantics ?? 'UNKNOWN'));
  if (monetaryObservations.length && (currencies.size !== 1 || currencies.has('UNKNOWN'))) reasons.add('CURRENCY_INCOMPATIBLE');
  if (conversionObservations.length && conversionSemantics.size !== 1) reasons.add('CONVERSION_SEMANTICS_INCOMPATIBLE');
  if (valueObservations.length && (valueSemantics.size !== 1 || valueSemantics.has('UNKNOWN'))) reasons.add('CONVERSION_VALUE_SEMANTICS_INCOMPATIBLE');
  const base = unknownCanonicalMetrics();
  const requiredForBlendedMetrics: readonly CanonicalMetricName[] = ['impressions', 'clicks', 'spendMinor', 'conversions'];
  for (const metric of canonicalMetricNames) {
    const values = ordered.map((observation) => observation.metrics[metric]);
    if (values.length > 0 && values.every(isNumber)) base[metric] = values.reduce((sum, value) => sum + value, 0);
    else if (values.length > 0 && requiredForBlendedMetrics.includes(metric)) reasons.add('REQUIRED_METRIC_UNKNOWN');
  }
  const reliable = reasons.size === 0;
  const metrics = { ...base, ...unknownDerivedMetrics() };
  if (reliable) assignDerivedMetrics(metrics);
  return {
    unifiedCampaignId,
    currency: reliable ? ordered[0]!.currency : 'UNKNOWN',
    metrics,
    observations: ordered.map(copy),
    freshnessState: ordered.length === 0 ? 'UNKNOWN' : ordered.some((item) => item.freshnessState !== 'FRESH') ? 'STALE' : 'FRESH',
    confidence: reliable ? average(ordered.map((item) => item.confidence)) : 0,
    reasons: [...reasons].sort(),
    generatedAt: now(),
  };
}

export type AttributionModel = 'PROVIDER_REPORTED' | 'FIRST_TOUCH' | 'LAST_TOUCH' | 'ASSISTED' | 'UNATTRIBUTED';

export interface AttributionChannelContribution {
  channelId: string;
  provider: string;
  conversions: MetricValue;
  contributionFraction: MetricValue;
  evidenceRefs: CampaignEvidenceReference[];
}

/** V1 records the selected evidence model and its limits; it does not assert causal truth. */
export interface AttributionAssessment {
  id: string;
  tenantId: string;
  unifiedCampaignId: string;
  model: AttributionModel;
  window: { start: string; end: string };
  contributions: AttributionChannelContribution[];
  confidence: number;
  evidenceRefs: CampaignEvidenceReference[];
  limitations: string[];
  unknowns: string[];
  createdAt: string;
  attributionVersion: 'V1';
}

export function assessAttribution(
  aggregate: CrossChannelPerformanceAggregate,
  model: AttributionModel,
  now: () => string = () => new Date().toISOString(),
): AttributionAssessment {
  const observations = aggregate.observations;
  const total = observations.every((item) => isNumber(item.metrics.conversions))
    ? observations.reduce((sum, item) => sum + (item.metrics.conversions as number), 0)
    : 'UNKNOWN';
  const evidenceRefs = observations.flatMap((item) => item.provenance).sort(compareEvidence);
  const limitations = ['Attribution V1 is evidence-backed reporting, not a causal incrementality measurement.'];
  const unknowns: string[] = [];
  if (!isNumber(total) || total === 0) unknowns.push('CHANNEL_CONTRIBUTION_FRACTION_UNKNOWN');
  if (aggregate.reasons.length) unknowns.push(...aggregate.reasons);
  return {
    id: deterministicId('attribution', [aggregate.unifiedCampaignId, model, ...observations.map((item) => item.id)]),
    tenantId: observations[0]?.tenantId ?? 'UNKNOWN',
    unifiedCampaignId: aggregate.unifiedCampaignId,
    model,
    window: {
      start: observations.map((item) => item.periodStart).sort()[0] ?? now(),
      end: observations.map((item) => item.periodEnd).sort().at(-1) ?? now(),
    },
    contributions: observations.map((item) => ({
      channelId: item.channelId,
      provider: item.provider,
      conversions: item.metrics.conversions,
      contributionFraction: isNumber(total) && total > 0 && isNumber(item.metrics.conversions)
        ? item.metrics.conversions / total
        : 'UNKNOWN',
      evidenceRefs: copy(item.provenance),
    })),
    confidence: unknowns.length === 0 ? Math.min(aggregate.confidence, model === 'PROVIDER_REPORTED' ? 0.8 : 0.65) : 0,
    evidenceRefs,
    limitations,
    unknowns: [...new Set(unknowns)].sort(),
    createdAt: now(),
    attributionVersion: 'V1',
  };
}

export type PerformanceDiagnosticType =
  | 'SPEND_WITHOUT_CONVERSIONS'
  | 'RISING_CPA'
  | 'FALLING_ROAS'
  | 'CTR_DEGRADATION'
  | 'CPC_INFLATION'
  | 'CPM_INFLATION'
  | 'CONVERSION_RATE_DEGRADATION'
  | 'BUDGET_UNDER_UTILIZATION'
  | 'BUDGET_EXHAUSTION'
  | 'CHANNEL_IMBALANCE'
  | 'STALE_TELEMETRY'
  | 'VERIFICATION_MISMATCH'
  | 'INSUFFICIENT_EVIDENCE'
  | 'PERFORMANCE_DETERIORATION';

export interface PerformanceDiagnostic {
  id: string;
  tenantId: string;
  unifiedCampaignId: string;
  channelId?: string;
  type: PerformanceDiagnosticType;
  severity: 'INFO' | 'WARNING' | 'HIGH';
  observedValue: MetricValue;
  baselineValue: MetricValue;
  evidenceRefs: CampaignEvidenceReference[];
  confidence: number;
  reasonCodes: string[];
  explanation: string;
  generatedAt: string;
}

export interface DiagnosticOptions {
  budgetMinor?: number;
  prior?: CrossChannelPerformanceAggregate;
  now?: () => string;
}

export function diagnosePerformance(
  aggregate: CrossChannelPerformanceAggregate,
  options: DiagnosticOptions = {},
): PerformanceDiagnostic[] {
  const now = options.now ?? (() => new Date().toISOString());
  const diagnostics: PerformanceDiagnostic[] = [];
  const evidence = aggregate.observations.flatMap((item) => item.provenance).sort(compareEvidence);
  const add = (type: PerformanceDiagnosticType, severity: PerformanceDiagnostic['severity'], observedValue: MetricValue, baselineValue: MetricValue, explanation: string, reasonCodes: string[], channelId?: string) => {
    diagnostics.push({
      id: deterministicId('performance-diagnostic', [aggregate.unifiedCampaignId, type, ...aggregate.observations.map((item) => item.id)]),
      tenantId: aggregate.observations[0]?.tenantId ?? 'UNKNOWN',
      unifiedCampaignId: aggregate.unifiedCampaignId,
      ...(channelId ? { channelId } : {}),
      type,
      severity,
      observedValue,
      baselineValue,
      evidenceRefs: evidence,
      confidence: aggregate.confidence,
      reasonCodes: [...new Set(reasonCodes)].sort(),
      explanation,
      generatedAt: now(),
    });
  };
  if (aggregate.reasons.includes('STALE_TELEMETRY')) add('STALE_TELEMETRY', 'HIGH', 'UNKNOWN', 'UNKNOWN', 'Telemetry is stale and cannot support an optimization action.', ['STALE_TELEMETRY']);
  if (aggregate.reasons.includes('VERIFICATION_MISMATCH')) add('VERIFICATION_MISMATCH', 'HIGH', 'UNKNOWN', 'UNKNOWN', 'Verification mismatch blocks consequential recommendations.', ['VERIFICATION_MISMATCH']);
  if (aggregate.reasons.some((reason) => ['INSUFFICIENT_EVIDENCE', 'REQUIRED_METRIC_UNKNOWN', 'NO_PERFORMANCE_OBSERVATIONS'].includes(reason))) add('INSUFFICIENT_EVIDENCE', 'WARNING', 'UNKNOWN', 'UNKNOWN', 'Evidence or required metrics are incomplete.', aggregate.reasons);
  const metrics = aggregate.metrics;
  if (isPositive(metrics.spendMinor) && metrics.conversions === 0) add('SPEND_WITHOUT_CONVERSIONS', 'HIGH', metrics.spendMinor, 0, 'Verified spend has no verified conversions in this observation window.', []);
  for (const observation of aggregate.observations) {
    if (isPositive(observation.metrics.spendMinor) && observation.metrics.conversions === 0) {
      add('SPEND_WITHOUT_CONVERSIONS', 'HIGH', observation.metrics.spendMinor, 0, 'This channel has verified spend but no verified conversions in its observation window.', [], observation.channelId);
    }
  }
  if (isPositive(metrics.spendMinor) && aggregate.observations.length > 1) {
    const dominant = aggregate.observations
      .filter((observation) => isNumber(observation.metrics.spendMinor))
      .sort((left, right) => (right.metrics.spendMinor as number) - (left.metrics.spendMinor as number) || left.channelId.localeCompare(right.channelId))[0];
    if (dominant && isNumber(dominant.metrics.spendMinor) && dominant.metrics.spendMinor / metrics.spendMinor >= 0.8) {
      add('CHANNEL_IMBALANCE', 'WARNING', dominant.metrics.spendMinor, metrics.spendMinor, 'One channel represents at least 80% of comparable verified spend.', [], dominant.channelId);
    }
  }
  if (options.budgetMinor !== undefined && isNumber(metrics.spendMinor)) {
    if (metrics.spendMinor >= options.budgetMinor) add('BUDGET_EXHAUSTION', 'WARNING', metrics.spendMinor, options.budgetMinor, 'Spend reached the configured unified budget.', []);
    if (metrics.spendMinor < Math.floor(options.budgetMinor / 2)) add('BUDGET_UNDER_UTILIZATION', 'INFO', metrics.spendMinor, options.budgetMinor, 'Spend is below half of the configured unified budget.', []);
  }
  const previous = options.prior?.metrics;
  if (previous) {
    addDeterioration(add, 'RISING_CPA', metrics.cpaMinor, previous.cpaMinor, true, 'CPA increased versus the prior comparable window.');
    addDeterioration(add, 'FALLING_ROAS', metrics.roas, previous.roas, false, 'ROAS declined versus the prior comparable window.');
    addDeterioration(add, 'CTR_DEGRADATION', metrics.ctr, previous.ctr, false, 'CTR declined versus the prior comparable window.');
    addDeterioration(add, 'CPC_INFLATION', metrics.cpcMinor, previous.cpcMinor, true, 'CPC increased versus the prior comparable window.');
    addDeterioration(add, 'CPM_INFLATION', metrics.cpmMinor, previous.cpmMinor, true, 'CPM increased versus the prior comparable window.');
    addDeterioration(add, 'CONVERSION_RATE_DEGRADATION', metrics.conversionRate, previous.conversionRate, false, 'Conversion rate declined versus the prior comparable window.');
  }
  return diagnostics.sort((left, right) => left.type.localeCompare(right.type));
}

export type PerformanceAnomalyType = 'SPEND_SPIKE' | 'SPEND_DROP' | 'CPC_SPIKE' | 'CPA_SPIKE' | 'ROAS_DROP' | 'CONVERSION_COLLAPSE' | 'TRAFFIC_ANOMALY';
export interface PerformanceAnomaly {
  id: string;
  tenantId: string;
  unifiedCampaignId: string;
  type: PerformanceAnomalyType;
  metric: keyof DerivedPerformanceMetrics | 'spendMinor' | 'conversions' | 'impressions';
  observedValue: number;
  baselineValue: number;
  deviation: number;
  threshold: number;
  sampleSize: number;
  confidence: number;
  explanation: string;
  evidenceRefs: CampaignEvidenceReference[];
  generatedAt: string;
}

export interface AnomalyDetectionOptions {
  minimumSampleSize?: number;
  percentageThreshold?: number;
  standardDeviationThreshold?: number;
  now?: () => string;
}

/** Transparent V1 rolling baseline detector. It declines to diagnose tiny samples. */
export function detectPerformanceAnomalies(
  history: readonly CrossChannelPerformanceAggregate[],
  options: AnomalyDetectionOptions = {},
): PerformanceAnomaly[] {
  const ordered = [...history].filter((item) => item.reasons.length === 0).sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  const min = options.minimumSampleSize ?? 3;
  if (ordered.length < min + 1) return [];
  const latest = ordered.at(-1)!;
  const baseline = ordered.slice(0, -1);
  const now = options.now ?? (() => new Date().toISOString());
  const threshold = options.percentageThreshold ?? 0.3;
  const sdThreshold = options.standardDeviationThreshold ?? 2;
  const anomalies: PerformanceAnomaly[] = [];
  const inspect = (metric: PerformanceAnomaly['metric'], typeUp: PerformanceAnomalyType, typeDown?: PerformanceAnomalyType) => {
    const current = latest.metrics[metric] as MetricValue;
    const values = baseline.map((item) => item.metrics[metric] as MetricValue).filter(isNumber);
    if (!isNumber(current) || values.length < min) return;
    const mean = average(values);
    if (mean === 0) return;
    const deviation = (current - mean) / mean;
    const sd = standardDeviation(values, mean);
    const standardScore = sd === 0 ? 0 : Math.abs(current - mean) / sd;
    if (Math.abs(deviation) < threshold && standardScore < sdThreshold) return;
    const type = deviation >= 0 || !typeDown ? typeUp : typeDown;
    anomalies.push({
      id: deterministicId('performance-anomaly', [latest.unifiedCampaignId, metric, latest.generatedAt, type]),
      tenantId: latest.observations[0]?.tenantId ?? 'UNKNOWN',
      unifiedCampaignId: latest.unifiedCampaignId,
      type,
      metric,
      observedValue: current,
      baselineValue: mean,
      deviation,
      threshold,
      sampleSize: values.length,
      confidence: Math.min(latest.confidence, Math.min(0.9, values.length / 10)),
      explanation: `${metric} differs from a rolling ${values.length}-window baseline by ${(deviation * 100).toFixed(1)}%.`,
      evidenceRefs: latest.observations.flatMap((item) => item.provenance).sort(compareEvidence),
      generatedAt: now(),
    });
  };
  inspect('spendMinor', 'SPEND_SPIKE', 'SPEND_DROP');
  inspect('cpcMinor', 'CPC_SPIKE');
  inspect('cpaMinor', 'CPA_SPIKE');
  inspect('roas', 'ROAS_DROP');
  inspect('conversions', 'CONVERSION_COLLAPSE');
  inspect('impressions', 'TRAFFIC_ANOMALY', 'TRAFFIC_ANOMALY');
  return anomalies.sort((left, right) => left.type.localeCompare(right.type));
}

export type OptimizationActionType = 'PAUSE_CAMPAIGN' | 'ENABLE_CAMPAIGN' | 'UPDATE_CAMPAIGN_BUDGET' | 'UPDATE_TARGET_CPA' | 'UPDATE_TARGET_ROAS' | 'OBSERVE_ONLY' | 'REQUEST_MORE_EVIDENCE';

export interface OptimizationOpportunity {
  id: string;
  diagnosticId: string;
  tenantId: string;
  unifiedCampaignId: string;
  channelId?: string;
  provider?: string;
  actionType: OptimizationActionType;
  eligible: boolean;
  reasonCodes: string[];
  evidenceRefs: CampaignEvidenceReference[];
}

export interface OptimizationRecommendation {
  recommendationId: string;
  tenantId: string;
  unifiedCampaignId: string;
  affectedChannelId?: string;
  provider?: string;
  actionType: OptimizationActionType;
  currentState: Record<string, unknown>;
  proposedState: Record<string, unknown>;
  rationale: string;
  diagnosticRefs: string[];
  evidenceRefs: CampaignEvidenceReference[];
  confidence: number;
  expectedImpact: { summary: string; metric: string; direction: 'UP' | 'DOWN' | 'UNKNOWN'; range?: { low: number; high: number } };
  riskClass: 'LOW' | 'MEDIUM' | 'HIGH';
  reversibility: 'REVERSIBLE' | 'GOVERNED_ROLLBACK_REQUIRED' | 'UNKNOWN';
  providerCapability: { supported: boolean; actionType?: string; reason?: string };
  requiresApproval: true;
  createdAt: string;
  expiresAt: string;
  recommendationVersion: 'V1';
}

export function identifyOptimizationOpportunities(
  campaign: UnifiedCampaign,
  diagnostics: readonly PerformanceDiagnostic[],
  providers: CampaignProviderCapabilityRegistry,
): OptimizationOpportunity[] {
  const opportunities: OptimizationOpportunity[] = [];
  for (const diagnostic of diagnostics) {
    const actionType = diagnostic.type === 'SPEND_WITHOUT_CONVERSIONS' ? 'PAUSE_CAMPAIGN'
      : diagnostic.type === 'INSUFFICIENT_EVIDENCE' || diagnostic.type === 'STALE_TELEMETRY' || diagnostic.type === 'VERIFICATION_MISMATCH'
        ? 'REQUEST_MORE_EVIDENCE'
        : 'OBSERVE_ONLY';
    const channel = diagnostic.channelId ? campaign.channels.find((item) => item.id === diagnostic.channelId) : undefined;
    const actionSupported = actionType === 'OBSERVE_ONLY' || actionType === 'REQUEST_MORE_EVIDENCE'
      ? true
      : Boolean(channel && providers.capabilities(channel.provider).actionTypes.includes(actionType));
    opportunities.push({
      id: deterministicId('optimization-opportunity', [campaign.id, diagnostic.id, actionType]),
      diagnosticId: diagnostic.id,
      tenantId: campaign.tenantId,
      unifiedCampaignId: campaign.id,
      ...(channel ? { channelId: channel.id, provider: channel.provider } : {}),
      actionType,
      eligible: actionSupported && diagnostic.confidence > 0 && diagnostic.type !== 'VERIFICATION_MISMATCH',
      reasonCodes: actionSupported ? diagnostic.reasonCodes : [...diagnostic.reasonCodes, 'PROVIDER_CAPABILITY_UNSUPPORTED'],
      evidenceRefs: copy(diagnostic.evidenceRefs),
    });
  }
  return opportunities.sort((left, right) => left.id.localeCompare(right.id));
}

/** Deterministic only: no provider transport, policy evaluation, approval, or execution happens here. */
export function generateOptimizationRecommendations(
  campaign: UnifiedCampaign,
  diagnostics: readonly PerformanceDiagnostic[],
  providers: CampaignProviderCapabilityRegistry,
  now: () => string = () => new Date().toISOString(),
): OptimizationRecommendation[] {
  const timestamp = now();
  return identifyOptimizationOpportunities(campaign, diagnostics, providers)
    .filter((opportunity) => opportunity.eligible)
    .map((opportunity) => {
      const diagnostic = diagnostics.find((item) => item.id === opportunity.diagnosticId)!;
      const consequential = !['OBSERVE_ONLY', 'REQUEST_MORE_EVIDENCE'].includes(opportunity.actionType);
      return {
        recommendationId: deterministicId('optimization-recommendation', [campaign.id, diagnostic.id, opportunity.actionType]),
        tenantId: campaign.tenantId,
        unifiedCampaignId: campaign.id,
        ...(opportunity.channelId ? { affectedChannelId: opportunity.channelId, provider: opportunity.provider } : {}),
        actionType: opportunity.actionType,
        currentState: { diagnosticType: diagnostic.type, observedValue: diagnostic.observedValue },
        proposedState: consequential ? { desiredAction: opportunity.actionType } : { nextStep: opportunity.actionType },
        rationale: diagnostic.explanation,
        diagnosticRefs: [diagnostic.id],
        evidenceRefs: copy(opportunity.evidenceRefs),
        confidence: diagnostic.confidence,
        expectedImpact: {
          summary: consequential ? 'Potential exposure reduction; outcome remains uncertain until independent verification and measurement.' : 'No external change is proposed.',
          metric: diagnostic.type,
          direction: consequential ? 'DOWN' : 'UNKNOWN',
        },
        riskClass: consequential ? 'HIGH' : 'LOW',
        reversibility: consequential ? 'GOVERNED_ROLLBACK_REQUIRED' : 'REVERSIBLE',
        providerCapability: consequential
          ? { supported: true, actionType: opportunity.actionType }
          : { supported: true, reason: 'READ_ONLY_RECOMMENDATION' },
        requiresApproval: true,
        createdAt: timestamp,
        expiresAt: new Date(Date.parse(timestamp) + 24 * 60 * 60 * 1000).toISOString(),
        recommendationVersion: 'V1',
      } satisfies OptimizationRecommendation;
    })
    .sort((left, right) => left.recommendationId.localeCompare(right.recommendationId));
}

export interface CrossChannelBudgetAllocation {
  channelId: string;
  amountMinor: number;
  currency: string;
}

export type ProposedBudgetAllocation =
  | { kind: 'PERCENTAGE'; percentageBasisPoints: number }
  | { kind: 'FIXED'; amountMinor: number };

export interface CrossChannelBudgetRecommendation {
  id: string;
  tenantId: string;
  unifiedCampaignId: string;
  currency: string;
  currentAllocation: CrossChannelBudgetAllocation[];
  proposedAllocation: CrossChannelBudgetAllocation[];
  totalBudgetMinor: number;
  totalBudgetInvariant: true;
  rationale: string;
  evidenceRefs: CampaignEvidenceReference[];
  requiresApproval: true;
}

/** Largest-remainder allocation keeps the existing total exact in minor units. */
export function createCrossChannelBudgetRecommendation(
  campaign: UnifiedCampaign,
  current: readonly CrossChannelBudgetAllocation[],
  proposed: Readonly<Record<string, number | ProposedBudgetAllocation>>,
  evidenceRefs: readonly CampaignEvidenceReference[],
): CrossChannelBudgetRecommendation {
  const channelIds = campaign.channels.map((channel) => channel.id).sort();
  if (new Set(channelIds).size !== channelIds.length || channelIds.length === 0) throw new PerformanceOptimizationError('BUDGET_CHANNELS_INVALID');
  if (current.length !== channelIds.length || current.some((item) => !channelIds.includes(item.channelId) || item.currency !== campaign.budget.currency)) throw new PerformanceOptimizationError('BUDGET_CURRENT_ALLOCATION_INVALID');
  const normalized = channelIds.map((channelId) => ({ channelId, value: proposed[channelId] }));
  if (normalized.some((item) => item.value === undefined)) throw new PerformanceOptimizationError('BUDGET_ALLOCATION_REQUIRED');
  const fixed = normalized.every((item) => typeof item.value === 'object' && item.value.kind === 'FIXED');
  const percentage = normalized.every((item) => typeof item.value === 'number' || (typeof item.value === 'object' && item.value.kind === 'PERCENTAGE'));
  if (!fixed && !percentage) throw new PerformanceOptimizationError('BUDGET_ALLOCATION_KIND_MIXED');
  let remaining = 0;
  let proposedAllocation: CrossChannelBudgetAllocation[];
  if (fixed) {
    proposedAllocation = normalized.map((item) => ({
      channelId: item.channelId,
      amountMinor: (item.value as Extract<ProposedBudgetAllocation, { kind: 'FIXED' }>).amountMinor,
      currency: campaign.budget.currency,
    }));
    if (proposedAllocation.some((item) => !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0)) throw new PerformanceOptimizationError('BUDGET_FIXED_ALLOCATION_INVALID');
  } else {
    const percentages: Array<{ channelId: string; basisPoints: number }> = normalized.map((item) => ({
      channelId: item.channelId,
      basisPoints: typeof item.value === 'number' ? item.value : (item.value as Extract<ProposedBudgetAllocation, { kind: 'PERCENTAGE' }>).percentageBasisPoints,
    }));
    if (percentages.some((item) => !Number.isSafeInteger(item.basisPoints) || item.basisPoints <= 0) || percentages.reduce((sum, item) => sum + item.basisPoints, 0) !== 10_000) throw new PerformanceOptimizationError('BUDGET_PERCENTAGE_INVALID');
    const provisional = percentages.map((item) => ({ ...item, floor: Math.floor((campaign.budget.amountMinor * item.basisPoints) / 10_000), remainder: (campaign.budget.amountMinor * item.basisPoints) % 10_000 }));
    remaining = campaign.budget.amountMinor - provisional.reduce((sum, item) => sum + item.floor, 0);
    for (const item of [...provisional].sort((left, right) => right.remainder - left.remainder || left.channelId.localeCompare(right.channelId))) {
      if (remaining <= 0) break;
      item.floor += 1;
      remaining -= 1;
    }
    proposedAllocation = provisional.sort((left, right) => left.channelId.localeCompare(right.channelId)).map((item) => ({ channelId: item.channelId, amountMinor: item.floor, currency: campaign.budget.currency }));
  }
  if (remaining !== 0 || proposedAllocation.reduce((sum, item) => sum + item.amountMinor, 0) !== campaign.budget.amountMinor) throw new PerformanceOptimizationError('BUDGET_TOTAL_INVARIANT_FAILED');
  return {
    id: deterministicId('cross-channel-budget', [campaign.id, JSON.stringify(proposedAllocation)]),
    tenantId: campaign.tenantId,
    unifiedCampaignId: campaign.id,
    currency: campaign.budget.currency,
    currentAllocation: [...current].sort((left, right) => left.channelId.localeCompare(right.channelId)).map(copy),
    proposedAllocation,
    totalBudgetMinor: campaign.budget.amountMinor,
    totalBudgetInvariant: true,
    rationale: 'Deterministic largest-remainder redistribution preserves the existing unified budget exactly.',
    evidenceRefs: [...evidenceRefs].sort(compareEvidence).map(copy),
    requiresApproval: true,
  };
}

export interface OptimizationSimulation {
  id: string;
  recommendationId: string;
  tenantId: string;
  unifiedCampaignId: string;
  budgetDeltaMinor: number;
  spendExposureMinor: number;
  expectedPerformanceRange: { low: number; high: number; metric: string };
  downsideScenario: string;
  upsideScenario: string;
  confidence: number;
  assumptions: string[];
  limitations: string[];
  evidenceRefs: CampaignEvidenceReference[];
  createdAt: string;
  simulationVersion: 'V1';
}

export function simulateOptimizationImpact(
  recommendation: OptimizationRecommendation,
  aggregate: CrossChannelPerformanceAggregate,
  now: () => string = () => new Date().toISOString(),
): OptimizationSimulation {
  const spend = isNumber(aggregate.metrics.spendMinor) ? aggregate.metrics.spendMinor : 0;
  const budgetDelta = typeof recommendation.proposedState.budgetDeltaMinor === 'number' && Number.isSafeInteger(recommendation.proposedState.budgetDeltaMinor)
    ? recommendation.proposedState.budgetDeltaMinor
    : 0;
  const confidence = aggregate.reasons.length === 0 ? Math.min(recommendation.confidence, aggregate.confidence, 0.7) : 0;
  return {
    id: deterministicId('optimization-simulation', [recommendation.recommendationId, aggregate.generatedAt]),
    recommendationId: recommendation.recommendationId,
    tenantId: recommendation.tenantId,
    unifiedCampaignId: recommendation.unifiedCampaignId,
    budgetDeltaMinor: budgetDelta,
    spendExposureMinor: Math.max(0, spend + Math.max(0, budgetDelta)),
    expectedPerformanceRange: { low: -0.2, high: 0.1, metric: recommendation.expectedImpact.metric },
    downsideScenario: 'Performance can degrade despite a governed change; rollback remains a separate governed proposal.',
    upsideScenario: 'Observed metric may improve within the stated range; no causal impact is claimed.',
    confidence,
    assumptions: ['Only verified, fresh, semantically comparable observations were considered.', 'No currency conversion is assumed.'],
    limitations: aggregate.reasons.length ? aggregate.reasons : ['Simulation is a conservative rule-based estimate, not a provider forecast.'],
    evidenceRefs: copy(recommendation.evidenceRefs),
    createdAt: now(),
    simulationVersion: 'V1',
  };
}

/** Bridges to an existing proposal only. The caller must use the existing action service for policy, approval, execution and verification. */
export function toGovernedOptimizationProposal(
  campaign: UnifiedCampaign,
  recommendation: OptimizationRecommendation,
  simulation: OptimizationSimulation,
  actor: string,
  now: () => string = () => new Date().toISOString(),
): ExternalMarketingActionProposal {
  if (recommendation.tenantId !== campaign.tenantId || simulation.recommendationId !== recommendation.recommendationId) throw new PerformanceOptimizationError('OPTIMIZATION_BRIDGE_SCOPE_INVALID');
  if (!recommendation.providerCapability.supported || !recommendation.affectedChannelId || !recommendation.provider || ['OBSERVE_ONLY', 'REQUEST_MORE_EVIDENCE'].includes(recommendation.actionType)) throw new PerformanceOptimizationError('OPTIMIZATION_ACTION_NOT_GOVERNABLE');
  if (Date.parse(recommendation.expiresAt) <= Date.parse(now())) throw new PerformanceOptimizationError('OPTIMIZATION_RECOMMENDATION_EXPIRED');
  const channel = requireChannel(campaign.channels, recommendation.affectedChannelId, recommendation.provider);
  return {
    actionId: deterministicId('optimization-external-action', [recommendation.recommendationId, simulation.id]),
    tenantId: campaign.tenantId,
    organizationId: campaign.organizationId,
    actor,
    agentIdentity: 'cross-channel-performance-intelligence',
    workflowRunId: campaign.workflow?.workflowId ?? `unified-campaign:${campaign.id}`,
    recommendationId: recommendation.recommendationId,
    provider: channel.provider,
    accountId: channel.accountId,
    campaignId: channel.campaignId,
    actionType: recommendation.actionType,
    requestedPayload: { proposedState: recommendation.proposedState, simulationId: simulation.id },
    reason: recommendation.rationale,
    expectedOutcome: recommendation.expectedImpact.summary,
    estimatedImpact: { recommendationId: recommendation.recommendationId, simulationId: simulation.id, expectedRange: simulation.expectedPerformanceRange },
    estimatedCost: simulation.spendExposureMinor,
    currency: campaign.budget.currency,
    riskLevel: recommendation.riskClass === 'HIGH' ? 'HIGH' : 'MEDIUM',
    policyContext: { unifiedCampaignId: campaign.id, optimizationRecommendationId: recommendation.recommendationId, simulationId: simulation.id },
    approvalRequirement: 'REQUIRED',
    idempotencyKey: deterministicId('optimization-action-key', [campaign.id, recommendation.recommendationId, simulation.id]),
    requestedAt: now(),
    metadata: { unifiedCampaignId: campaign.id, optimizationRecommendationId: recommendation.recommendationId, simulationId: simulation.id, requiresIndependentVerification: true },
    evidence: recommendation.evidenceRefs.map((reference) => ({ id: reference.id, source: reference.source, summary: reference.summary, ...(reference.observedAt ? { observedAt: reference.observedAt } : {}) })),
    confidence: recommendation.confidence,
    rollback: { strategy: 'derive governed rollback from durable provider before-state', before: {} },
  };
}

export type OptimizationOutcomeClassification = 'IMPROVED' | 'DEGRADED' | 'NEUTRAL' | 'INCONCLUSIVE' | 'UNKNOWN';
export interface OptimizationOutcomeMeasurement {
  id: string;
  tenantId: string;
  unifiedCampaignId: string;
  recommendationId: string;
  externalActionId: string;
  before: CrossChannelPerformanceAggregate;
  after: CrossChannelPerformanceAggregate;
  classification: OptimizationOutcomeClassification;
  confidence: number;
  evidenceQuality: 'HIGH' | 'LIMITED' | 'UNKNOWN';
  evidenceRefs: CampaignEvidenceReference[];
  measuredAt: string;
}

export function measureOptimizationOutcome(
  recommendation: OptimizationRecommendation,
  externalActionId: string,
  before: CrossChannelPerformanceAggregate,
  after: CrossChannelPerformanceAggregate,
  now: () => string = () => new Date().toISOString(),
): OptimizationOutcomeMeasurement {
  const canCompare = before.reasons.length === 0 && after.reasons.length === 0 && before.currency === after.currency;
  const beforeRoas = before.metrics.roas;
  const afterRoas = after.metrics.roas;
  const classification: OptimizationOutcomeClassification = !canCompare || !isNumber(beforeRoas) || !isNumber(afterRoas)
    ? 'UNKNOWN'
    : afterRoas > beforeRoas * 1.05 ? 'IMPROVED'
      : afterRoas < beforeRoas * 0.95 ? 'DEGRADED'
        : 'NEUTRAL';
  const evidenceRefs = [...before.observations, ...after.observations].flatMap((item) => item.provenance).sort(compareEvidence);
  return {
    id: deterministicId('optimization-outcome', [recommendation.recommendationId, externalActionId, after.generatedAt]),
    tenantId: recommendation.tenantId,
    unifiedCampaignId: recommendation.unifiedCampaignId,
    recommendationId: recommendation.recommendationId,
    externalActionId,
    before: copy(before),
    after: copy(after),
    classification,
    confidence: classification === 'UNKNOWN' ? 0 : Math.min(before.confidence, after.confidence),
    evidenceQuality: evidenceRefs.length ? canCompare ? 'HIGH' : 'LIMITED' : 'UNKNOWN',
    evidenceRefs,
    measuredAt: now(),
  };
}

export interface OptimizationLearningRecord {
  id: string;
  tenantId: string;
  unifiedCampaignId: string;
  recommendation: OptimizationRecommendation;
  approved: boolean | 'UNKNOWN';
  executed: boolean | 'UNKNOWN';
  outcome?: OptimizationOutcomeMeasurement;
  observedPerformanceChange: string;
  confidence: number;
  evidenceRefs: CampaignEvidenceReference[];
  ruleVersion: 'V1';
  createdAt: string;
}

export function createOptimizationLearningRecord(
  recommendation: OptimizationRecommendation,
  approved: boolean | 'UNKNOWN',
  executed: boolean | 'UNKNOWN',
  outcome: OptimizationOutcomeMeasurement | undefined,
  now: () => string = () => new Date().toISOString(),
): OptimizationLearningRecord {
  return {
    id: deterministicId('optimization-learning', [recommendation.recommendationId, String(approved), String(executed), outcome?.id ?? 'none']),
    tenantId: recommendation.tenantId,
    unifiedCampaignId: recommendation.unifiedCampaignId,
    recommendation: copy(recommendation),
    approved,
    executed,
    ...(outcome ? { outcome: copy(outcome) } : {}),
    observedPerformanceChange: outcome ? outcome.classification : 'UNKNOWN',
    confidence: outcome?.confidence ?? 0,
    evidenceRefs: outcome?.evidenceRefs ?? copy(recommendation.evidenceRefs),
    ruleVersion: 'V1',
    createdAt: now(),
  };
}

export interface PerformanceOptimizationStore {
  saveObservation(context: TenantContext, observation: CanonicalPerformanceObservation): Promise<CanonicalPerformanceObservation>;
  listObservations(context: TenantContext, campaignId: string): Promise<CanonicalPerformanceObservation[]>;
  saveAggregate(context: TenantContext, aggregate: CrossChannelPerformanceAggregate): Promise<CrossChannelPerformanceAggregate>;
  listAggregates(context: TenantContext, campaignId: string): Promise<CrossChannelPerformanceAggregate[]>;
  saveDiagnostic(context: TenantContext, diagnostic: PerformanceDiagnostic): Promise<PerformanceDiagnostic>;
  listDiagnostics(context: TenantContext, campaignId: string): Promise<PerformanceDiagnostic[]>;
  saveAnomaly(context: TenantContext, anomaly: PerformanceAnomaly): Promise<PerformanceAnomaly>;
  listAnomalies(context: TenantContext, campaignId: string): Promise<PerformanceAnomaly[]>;
  saveRecommendation(context: TenantContext, recommendation: OptimizationRecommendation): Promise<OptimizationRecommendation>;
  getRecommendation(context: TenantContext, recommendationId: string): Promise<OptimizationRecommendation | undefined>;
  listRecommendations(context: TenantContext, campaignId: string): Promise<OptimizationRecommendation[]>;
  saveSimulation(context: TenantContext, simulation: OptimizationSimulation): Promise<OptimizationSimulation>;
  getSimulation(context: TenantContext, recommendationId: string): Promise<OptimizationSimulation | undefined>;
  saveOutcome(context: TenantContext, outcome: OptimizationOutcomeMeasurement): Promise<OptimizationOutcomeMeasurement>;
  listOutcomes(context: TenantContext, campaignId: string): Promise<OptimizationOutcomeMeasurement[]>;
  saveLearning(context: TenantContext, learning: OptimizationLearningRecord): Promise<OptimizationLearningRecord>;
  listLearning(context: TenantContext, campaignId: string): Promise<OptimizationLearningRecord[]>;
}

/** In-memory contract implementation used only by unit tests. */
export class InMemoryPerformanceOptimizationStore implements PerformanceOptimizationStore {
  private readonly observations = new Map<string, CanonicalPerformanceObservation>();
  private readonly aggregates = new Map<string, CrossChannelPerformanceAggregate>();
  private readonly diagnostics = new Map<string, PerformanceDiagnostic>();
  private readonly anomalies = new Map<string, PerformanceAnomaly>();
  private readonly recommendations = new Map<string, OptimizationRecommendation>();
  private readonly simulations = new Map<string, OptimizationSimulation>();
  private readonly outcomes = new Map<string, OptimizationOutcomeMeasurement>();
  private readonly learning = new Map<string, OptimizationLearningRecord>();

  async saveObservation(context: TenantContext, value: CanonicalPerformanceObservation) { assertStoreTenant(context, value.tenantId); const key = tenantKey(value.tenantId, value.idempotencyKey); const existing = this.observations.get(key); if (existing) return copy(existing); this.observations.set(key, copy(value)); return copy(value); }
  async listObservations(context: TenantContext, campaignId: string) { return filterTenant(context, this.observations.values(), campaignId, (item) => item.unifiedCampaignId); }
  async saveAggregate(context: TenantContext, value: CrossChannelPerformanceAggregate) { assertStoreTenant(context, value.observations[0]?.tenantId ?? context.tenantId); this.aggregates.set(tenantKey(context.tenantId, value.unifiedCampaignId), copy(value)); return copy(value); }
  async listAggregates(context: TenantContext, campaignId: string) { const value = this.aggregates.get(tenantKey(context.tenantId, campaignId)); return value ? [copy(value)] : []; }
  async saveDiagnostic(context: TenantContext, value: PerformanceDiagnostic) { assertStoreTenant(context, value.tenantId); this.diagnostics.set(tenantKey(value.tenantId, value.id), copy(value)); return copy(value); }
  async listDiagnostics(context: TenantContext, campaignId: string) { return filterTenant(context, this.diagnostics.values(), campaignId, (item) => item.unifiedCampaignId); }
  async saveAnomaly(context: TenantContext, value: PerformanceAnomaly) { assertStoreTenant(context, value.tenantId); this.anomalies.set(tenantKey(value.tenantId, value.id), copy(value)); return copy(value); }
  async listAnomalies(context: TenantContext, campaignId: string) { return filterTenant(context, this.anomalies.values(), campaignId, (item) => item.unifiedCampaignId); }
  async saveRecommendation(context: TenantContext, value: OptimizationRecommendation) { assertStoreTenant(context, value.tenantId); this.recommendations.set(tenantKey(value.tenantId, value.recommendationId), copy(value)); return copy(value); }
  async getRecommendation(context: TenantContext, recommendationId: string) { return copyOptional(this.recommendations.get(tenantKey(context.tenantId, recommendationId))); }
  async listRecommendations(context: TenantContext, campaignId: string) { return filterTenant(context, this.recommendations.values(), campaignId, (item) => item.unifiedCampaignId); }
  async saveSimulation(context: TenantContext, value: OptimizationSimulation) { assertStoreTenant(context, value.tenantId); this.simulations.set(tenantKey(value.tenantId, value.recommendationId), copy(value)); return copy(value); }
  async getSimulation(context: TenantContext, recommendationId: string) { return copyOptional(this.simulations.get(tenantKey(context.tenantId, recommendationId))); }
  async saveOutcome(context: TenantContext, value: OptimizationOutcomeMeasurement) { assertStoreTenant(context, value.tenantId); this.outcomes.set(tenantKey(value.tenantId, value.id), copy(value)); return copy(value); }
  async listOutcomes(context: TenantContext, campaignId: string) { return filterTenant(context, this.outcomes.values(), campaignId, (item) => item.unifiedCampaignId); }
  async saveLearning(context: TenantContext, value: OptimizationLearningRecord) { assertStoreTenant(context, value.tenantId); this.learning.set(tenantKey(value.tenantId, value.id), copy(value)); return copy(value); }
  async listLearning(context: TenantContext, campaignId: string) { return filterTenant(context, this.learning.values(), campaignId, (item) => item.unifiedCampaignId); }
}

/** Design-only growth capability contracts. They intentionally have no vendor dependency. */
export type FutureGrowthCapability = 'CRM' | 'LEAD_MANAGEMENT' | 'CUSTOMER_CONVERSATIONS' | 'AI_RECEPTIONIST' | 'REPUTATION_REVIEWS' | 'LOCAL_PRESENCE' | 'MULTI_LOCATION_GROWTH';
export interface FutureGrowthCapabilityProvider {
  readonly capability: FutureGrowthCapability;
  readonly providerId: string;
  supports(operation: string): boolean;
}
export interface FutureGrowthCapabilityRegistry {
  provider(capability: FutureGrowthCapability): FutureGrowthCapabilityProvider | undefined;
}

const canonicalMetricNames: readonly CanonicalMetricName[] = ['impressions', 'reach', 'frequency', 'clicks', 'engagements', 'videoViews', 'spendMinor', 'conversions', 'conversionValueMinor', 'qualifiedConversions'];

function validateObservationInput(input: ProviderPerformanceObservationInput, mapping: ProviderPerformanceMetricMapping): void {
  if (!input.tenantId || !input.unifiedCampaignId || !input.channelId || !input.provider || !input.providerCampaignId || !input.snapshotId || !input.source || mapping.provider !== input.provider) throw new PerformanceOptimizationError('PERFORMANCE_OBSERVATION_IDENTITY_INVALID');
  if (!Number.isFinite(Date.parse(input.periodStart)) || !Number.isFinite(Date.parse(input.periodEnd)) || Date.parse(input.periodEnd) < Date.parse(input.periodStart) || !Number.isFinite(Date.parse(input.collectedAt))) throw new PerformanceOptimizationError('PERFORMANCE_OBSERVATION_TIME_INVALID');
  if (!input.evidenceRefs.length) throw new PerformanceOptimizationError('PERFORMANCE_EVIDENCE_REQUIRED');
  if (!mapping.version || !mapping.conversionSemantics) throw new PerformanceOptimizationError('PERFORMANCE_MAPPING_INVALID');
  if (mapping.currency !== undefined && !/^[A-Z]{3}$/.test(mapping.currency)) throw new PerformanceOptimizationError('PERFORMANCE_CURRENCY_INVALID');
  if (mapping.currencyMinorUnitScale !== undefined && (!Number.isSafeInteger(mapping.currencyMinorUnitScale) || mapping.currencyMinorUnitScale < 0 || mapping.currencyMinorUnitScale > 6)) throw new PerformanceOptimizationError('PERFORMANCE_CURRENCY_SCALE_INVALID');
}

function normalizeMetric(value: unknown, name: CanonicalMetricName): MetricValue {
  if (value === undefined || value === null) return 'UNKNOWN';
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new PerformanceOptimizationError('PERFORMANCE_METRIC_MALFORMED');
  if (name !== 'frequency' && !Number.isSafeInteger(value)) throw new PerformanceOptimizationError('PERFORMANCE_METRIC_MALFORMED');
  return value;
}

function confidenceFor(input: ProviderPerformanceObservationInput, metrics: CanonicalPerformanceMetrics): number {
  const available = canonicalMetricNames.filter((name) => isNumber(metrics[name])).length / canonicalMetricNames.length;
  return input.verificationState === 'VERIFIED' ? Math.min(1, available) : 0;
}

function freshnessFromPeriod(periodEnd: string, now: string): FreshnessState {
  const end = Date.parse(periodEnd);
  const current = Date.parse(now);
  return Number.isFinite(end) && Number.isFinite(current) ? current - end <= 24 * 60 * 60 * 1000 ? 'FRESH' : 'STALE' : 'UNKNOWN';
}

function unknownCanonicalMetrics(): CanonicalPerformanceMetrics {
  return { impressions: 'UNKNOWN', reach: 'UNKNOWN', frequency: 'UNKNOWN', clicks: 'UNKNOWN', engagements: 'UNKNOWN', videoViews: 'UNKNOWN', spendMinor: 'UNKNOWN', conversions: 'UNKNOWN', conversionValueMinor: 'UNKNOWN', qualifiedConversions: 'UNKNOWN' };
}

function unknownDerivedMetrics(): DerivedPerformanceMetrics { return { ctr: 'UNKNOWN', cpcMinor: 'UNKNOWN', cpmMinor: 'UNKNOWN', cpaMinor: 'UNKNOWN', roas: 'UNKNOWN', conversionRate: 'UNKNOWN' }; }

function assignDerivedMetrics(metrics: CanonicalPerformanceMetrics & DerivedPerformanceMetrics): void {
  if (isPositive(metrics.impressions) && isNumber(metrics.clicks)) metrics.ctr = metrics.clicks / metrics.impressions;
  if (isPositive(metrics.clicks) && isNumber(metrics.spendMinor)) metrics.cpcMinor = metrics.spendMinor / metrics.clicks;
  if (isPositive(metrics.impressions) && isNumber(metrics.spendMinor)) metrics.cpmMinor = (metrics.spendMinor * 1000) / metrics.impressions;
  if (isPositive(metrics.conversions) && isNumber(metrics.spendMinor)) metrics.cpaMinor = metrics.spendMinor / metrics.conversions;
  if (isPositive(metrics.spendMinor) && isNumber(metrics.conversionValueMinor)) metrics.roas = metrics.conversionValueMinor / metrics.spendMinor;
  if (isPositive(metrics.clicks) && isNumber(metrics.conversions)) metrics.conversionRate = metrics.conversions / metrics.clicks;
}

function addDeterioration(add: (type: PerformanceDiagnosticType, severity: PerformanceDiagnostic['severity'], observed: MetricValue, baseline: MetricValue, explanation: string, reasons: string[], channelId?: string) => void, type: PerformanceDiagnosticType, observed: MetricValue, baseline: MetricValue, risingIsBad: boolean, explanation: string): void {
  if (!isNumber(observed) || !isPositive(baseline)) return;
  if ((risingIsBad && observed > baseline * 1.15) || (!risingIsBad && observed < baseline * 0.85)) {
    add(type, 'WARNING', observed, baseline, explanation, ['PERFORMANCE_DETERIORATION']);
  }
}

function requireChannel(channels: readonly CampaignChannel[], channelId: string, provider: string): CampaignChannel {
  const channel = channels.find((item) => item.id === channelId && item.provider === provider);
  if (!channel) throw new PerformanceOptimizationError('OPTIMIZATION_CHANNEL_NOT_FOUND');
  return channel;
}

function average(values: readonly number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function standardDeviation(values: readonly number[], mean: number): number { return Math.sqrt(average(values.map((value) => (value - mean) ** 2))); }
function isNumber(value: MetricValue): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function isPositive(value: MetricValue): value is number { return isNumber(value) && value > 0; }
function deterministicId(prefix: string, parts: readonly string[]): string { return `${prefix}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)}`; }
function compareEvidence(left: CampaignEvidenceReference, right: CampaignEvidenceReference): number { return left.id.localeCompare(right.id); }
function compareObservation(left: CanonicalPerformanceObservation, right: CanonicalPerformanceObservation): number { return left.channelId.localeCompare(right.channelId) || left.periodStart.localeCompare(right.periodStart) || left.id.localeCompare(right.id); }
function copy<T>(value: T): T { return structuredClone(value); }
function copyOptional<T>(value: T | undefined): T | undefined { return value === undefined ? undefined : copy(value); }
function tenantKey(tenantId: string, value: string): string { return `${tenantId}\u0000${value}`; }
function assertStoreTenant(context: TenantContext, tenantId: string): void { if (!context.tenantId || context.tenantId !== tenantId) throw new PerformanceOptimizationError('TENANT_SCOPE_DENIED'); }
function filterTenant<T extends { tenantId: string }>(context: TenantContext, values: Iterable<T>, campaignId: string, campaign: (item: T) => string): T[] { return [...values].filter((item) => item.tenantId === context.tenantId && campaign(item) === campaignId).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))).map(copy); }
