import { createHash } from 'node:crypto';

import type { Locale, TenantContext } from '@platform/contracts';

import type {
  ExternalActionEvidenceReference,
  ExternalMarketingActionProposal,
  ExternalMarketingProvider,
} from './external-marketing-action.js';
import { externalActionEntitlementKey } from './governed-external-action.js';

/** Growth-domain campaign intent. It coordinates existing provider campaigns; it never creates provider assets. */
export type CampaignObjective =
  | 'LEAD_GENERATION'
  | 'SALES'
  | 'AWARENESS'
  | 'TRAFFIC'
  | 'ENGAGEMENT'
  | 'RETENTION';

export type CampaignLifecycleState =
  | 'DRAFT'
  | 'PLANNED'
  | 'SIMULATED'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'ACTIVE'
  | 'PARTIALLY_ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'DEGRADED';

export const UNIFIED_CAMPAIGN_LIFECYCLE_STATES: readonly CampaignLifecycleState[] = [
  'DRAFT', 'PLANNED', 'SIMULATED', 'AWAITING_APPROVAL', 'APPROVED', 'EXECUTING',
  'ACTIVE', 'PARTIALLY_ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'DEGRADED',
];

const campaignTransitions: Readonly<Record<CampaignLifecycleState, readonly CampaignLifecycleState[]>> = {
  DRAFT: ['PLANNED', 'FAILED'],
  PLANNED: ['SIMULATED', 'DRAFT', 'FAILED'],
  SIMULATED: ['AWAITING_APPROVAL', 'PLANNED', 'FAILED'],
  AWAITING_APPROVAL: ['APPROVED', 'PAUSED', 'FAILED'],
  APPROVED: ['EXECUTING', 'PAUSED', 'FAILED'],
  EXECUTING: ['ACTIVE', 'PARTIALLY_ACTIVE', 'PAUSED', 'FAILED', 'DEGRADED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'DEGRADED'],
  PARTIALLY_ACTIVE: ['ACTIVE', 'PAUSED', 'COMPLETED', 'DEGRADED', 'FAILED'],
  PAUSED: ['APPROVED', 'COMPLETED'],
  COMPLETED: [],
  FAILED: ['PLANNED'],
  DEGRADED: ['ACTIVE', 'PARTIALLY_ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED'],
};

export type CampaignAllocationKind = 'PERCENTAGE' | 'FIXED';
export type ProviderBudgetUnit = 'MAJOR' | 'MINOR';

export interface CampaignBudget {
  /** Integer minor units; no implicit FX or currency conversion is allowed. */
  amountMinor: number;
  currency: string;
  /** Decimal places used by this campaign currency, supplied explicitly by the caller. */
  minorUnitScale: number;
}

export interface ChannelAllocation {
  kind: CampaignAllocationKind;
  percentageBasisPoints?: number;
  amountMinor?: number;
  reasoning: string;
  evidenceReferences?: CampaignEvidenceReference[];
}

export interface CampaignTarget {
  markets: string[];
  languages: string[];
  keywords?: string[];
}

export interface CampaignSchedule {
  startsAt: string;
  endsAt?: string;
}

export interface CampaignCreativeReference {
  id: string;
  source: string;
  summary: string;
}

export interface CampaignAudienceReference {
  id: string;
  source: string;
  summary: string;
}

/** A channel deliberately points to a pre-existing provider campaign. Asset creation is out of scope. */
export interface CampaignChannel {
  id: string;
  provider: ExternalMarketingProvider;
  accountId: string;
  campaignId: string;
  allocation: ChannelAllocation;
  actionType?: string;
}

export interface CampaignEvidenceReference {
  id: string;
  source: string;
  summary: string;
  observedAt?: string;
}

export interface UnifiedCampaignInput {
  idempotencyKey: string;
  organizationId: string;
  objective: CampaignObjective;
  goal: string;
  locale: Locale;
  target: CampaignTarget;
  budget: CampaignBudget;
  schedule: CampaignSchedule;
  channels: CampaignChannel[];
  creativeReferences?: CampaignCreativeReference[];
  audienceReferences?: CampaignAudienceReference[];
  evidenceReferences: CampaignEvidenceReference[];
  confidence: number;
}

export interface UnifiedCampaign extends UnifiedCampaignInput {
  id: string;
  tenantId: string;
  lifecycle: CampaignLifecycleState;
  executionPlan?: CampaignExecutionPlan;
  /** Latest independently governed channel outcomes; provider payloads are never stored here. */
  executionOutcomes?: CampaignExecutionOutcome[];
  workflow?: UnifiedCampaignWorkflowBinding;
  createdAt: string;
  updatedAt: string;
}

export interface UnifiedCampaignWorkflowBinding {
  workflowId: string;
  stages: readonly UnifiedCampaignWorkflowStage[];
}

export const UNIFIED_CAMPAIGN_WORKFLOW_STAGES = [
  'CREATE', 'VALIDATE', 'PLAN', 'SIMULATE', 'GOVERNANCE', 'CHANNEL_EXECUTION',
  'VERIFICATION', 'AGGREGATE_OUTCOME', 'OBSERVE_PERFORMANCE', 'RECOMMEND_OPTIMIZATION',
] as const;
export type UnifiedCampaignWorkflowStage = (typeof UNIFIED_CAMPAIGN_WORKFLOW_STAGES)[number];

export interface ProviderCampaignCapabilities {
  actionTypes: readonly string[];
  /** Provider adapter contract; planners never branch on provider names. */
  budgetUnit: ProviderBudgetUnit;
}

/** Implemented by the tool-gateway composition registry; it exposes no client or credentials. */
export interface CampaignProviderCapabilityRegistry {
  capabilities(provider: string): ProviderCampaignCapabilities;
}

export interface UnifiedCampaignEntitlementPort {
  authorize(tenantId: string, entitlementKey: string): Promise<{ allowed: boolean; reason?: string }>;
}

export interface ChannelAllocationResult {
  channelId: string;
  amountMinor: number;
  currency: string;
  reasoning: string;
  evidenceReferences: CampaignEvidenceReference[];
}

export interface CampaignExecutionStep {
  id: string;
  channelId: string;
  provider: ExternalMarketingProvider;
  allocation: ChannelAllocationResult;
  providerBudgetValue: number;
  providerBudgetUnit: ProviderBudgetUnit;
  proposal: ExternalMarketingActionProposal;
  externalActionId?: string;
}

export interface CampaignExecutionPlan {
  id: string;
  campaignId: string;
  tenantId: string;
  idempotencyKey: string;
  budget: CampaignBudget;
  allocations: ChannelAllocationResult[];
  steps: CampaignExecutionStep[];
  capabilityEvidence: CampaignEvidenceReference[];
  createdAt: string;
}

export type CampaignChannelOutcomeStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'PAUSED'
  | 'FAILED'
  | 'UNAVAILABLE'
  | 'MISMATCH'
  | 'UNKNOWN';

export interface CampaignExecutionOutcome {
  stepId: string;
  channelId: string;
  provider: ExternalMarketingProvider;
  status: CampaignChannelOutcomeStatus;
  externalActionId?: string;
  beforeStateEvidence: CampaignEvidenceReference[];
  verificationEvidence: CampaignEvidenceReference[];
  reasons: string[];
  observedAt: string;
  intentionallyPaused?: boolean;
}

export interface CampaignCompensationRequest {
  id: string;
  campaignId: string;
  channelId: string;
  provider: ExternalMarketingProvider;
  originalExternalActionId: string;
  beforeStateEvidence: CampaignEvidenceReference[];
  idempotencyKey: string;
  status: 'REQUIRES_GOVERNED_ROLLBACK';
}

export interface CampaignCompensationPlan {
  id: string;
  campaignId: string;
  requests: CampaignCompensationRequest[];
  requiresApproval: true;
}

export type CampaignMetricValue = number | 'UNKNOWN' | 'UNAVAILABLE';

export interface CampaignPerformanceMetrics {
  impressions: CampaignMetricValue;
  clicks: CampaignMetricValue;
  spend: CampaignMetricValue;
  conversions: CampaignMetricValue;
  conversionValue: CampaignMetricValue;
  ctr: CampaignMetricValue;
  cpc: CampaignMetricValue;
  cpm: CampaignMetricValue;
  cpa: CampaignMetricValue;
  roas: CampaignMetricValue;
}

export interface CampaignPerformanceSnapshot {
  id: string;
  tenantId: string;
  campaignId: string;
  channelId: string;
  provider: ExternalMarketingProvider;
  currency: string;
  metrics: CampaignPerformanceMetrics;
  capturedAt: string;
  freshnessExpiresAt: string;
  provenance: CampaignEvidenceReference[];
  verification: 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';
}

export interface CampaignPerformanceAggregate {
  campaignId: string;
  currency: string | 'UNKNOWN';
  metrics: CampaignPerformanceMetrics;
  channelSnapshots: CampaignPerformanceSnapshot[];
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  reasons: string[];
}

export type CampaignOptimizationRecommendationType =
  | 'SHIFT_BUDGET'
  | 'PAUSE_UNDERPERFORMING_CHANNEL'
  | 'INCREASE_HIGH_PERFORMING_CHANNEL'
  | 'REVIEW_TARGET_CPA'
  | 'REVIEW_TARGET_ROAS';

export interface CampaignOptimizationRecommendation {
  id: string;
  tenantId: string;
  campaignId: string;
  type: CampaignOptimizationRecommendationType;
  reason: string;
  evidenceReferences: CampaignEvidenceReference[];
  confidence: number;
  expectedImpact: string;
  affectedChannelIds: string[];
  proposedBudgetDeltaMinor?: number;
  currency?: string;
  requiresApproval: true;
  createdAt: string;
}

export interface UnifiedCampaignStore {
  create(context: TenantContext, campaign: UnifiedCampaign): Promise<UnifiedCampaign>;
  get(context: TenantContext, campaignId: string): Promise<UnifiedCampaign | undefined>;
  save(context: TenantContext, campaign: UnifiedCampaign): Promise<UnifiedCampaign>;
  findByIdempotencyKey(context: TenantContext, idempotencyKey: string): Promise<UnifiedCampaign | undefined>;
  savePerformanceSnapshot(context: TenantContext, snapshot: CampaignPerformanceSnapshot): Promise<CampaignPerformanceSnapshot>;
  listPerformanceSnapshots(context: TenantContext, campaignId: string): Promise<CampaignPerformanceSnapshot[]>;
  saveRecommendation(context: TenantContext, recommendation: CampaignOptimizationRecommendation): Promise<CampaignOptimizationRecommendation>;
  listRecommendations(context: TenantContext, campaignId: string): Promise<CampaignOptimizationRecommendation[]>;
}

/** Test/dev-only storage. Production composition injects the PostgreSQL store. */
export class InMemoryUnifiedCampaignStore implements UnifiedCampaignStore {
  private readonly campaigns = new Map<string, UnifiedCampaign>();
  private readonly idempotency = new Map<string, string>();
  private readonly snapshots = new Map<string, CampaignPerformanceSnapshot>();
  private readonly recommendations = new Map<string, CampaignOptimizationRecommendation>();

  async create(context: TenantContext, campaign: UnifiedCampaign): Promise<UnifiedCampaign> {
    assertTenant(context, campaign.tenantId);
    const key = tenantKey(context.tenantId, campaign.idempotencyKey);
    const existingId = this.idempotency.get(key);
    if (existingId) {
      const existing = this.campaigns.get(existingId)!;
      if (existing.id !== campaign.id) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_IDEMPOTENCY_MISMATCH');
      return copy(existing);
    }
    this.campaigns.set(campaign.id, copy(campaign));
    this.idempotency.set(key, campaign.id);
    return copy(campaign);
  }

  async get(context: TenantContext, campaignId: string): Promise<UnifiedCampaign | undefined> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return undefined;
    assertTenant(context, campaign.tenantId);
    return copy(campaign);
  }

  async save(context: TenantContext, campaign: UnifiedCampaign): Promise<UnifiedCampaign> {
    assertTenant(context, campaign.tenantId);
    if (!this.campaigns.has(campaign.id)) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_NOT_FOUND');
    this.campaigns.set(campaign.id, copy(campaign));
    return copy(campaign);
  }

  async findByIdempotencyKey(context: TenantContext, idempotencyKey: string): Promise<UnifiedCampaign | undefined> {
    const id = this.idempotency.get(tenantKey(context.tenantId, idempotencyKey));
    return id ? this.get(context, id) : undefined;
  }

  async savePerformanceSnapshot(context: TenantContext, snapshot: CampaignPerformanceSnapshot): Promise<CampaignPerformanceSnapshot> {
    assertTenant(context, snapshot.tenantId);
    this.snapshots.set(tenantKey(context.tenantId, snapshot.id), copy(snapshot));
    return copy(snapshot);
  }

  async listPerformanceSnapshots(context: TenantContext, campaignId: string): Promise<CampaignPerformanceSnapshot[]> {
    return [...this.snapshots.values()]
      .filter((snapshot) => snapshot.tenantId === context.tenantId && snapshot.campaignId === campaignId)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
      .map(copy);
  }

  async saveRecommendation(context: TenantContext, recommendation: CampaignOptimizationRecommendation): Promise<CampaignOptimizationRecommendation> {
    assertTenant(context, recommendation.tenantId);
    this.recommendations.set(tenantKey(context.tenantId, recommendation.id), copy(recommendation));
    return copy(recommendation);
  }

  async listRecommendations(context: TenantContext, campaignId: string): Promise<CampaignOptimizationRecommendation[]> {
    return [...this.recommendations.values()]
      .filter((recommendation) => recommendation.tenantId === context.tenantId && recommendation.campaignId === campaignId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(copy);
  }
}

export class UnifiedCampaignError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'UnifiedCampaignError';
  }
}

export function createUnifiedCampaign(
  context: TenantContext,
  input: UnifiedCampaignInput,
  now: () => string = () => new Date().toISOString(),
): UnifiedCampaign {
  assertTenant(context, context.tenantId);
  validateUnifiedCampaignInput(input);
  const timestamp = now();
  return {
    ...copy(input),
    id: deterministicId('unified-campaign', [context.tenantId, input.idempotencyKey]),
    tenantId: context.tenantId,
    lifecycle: 'DRAFT',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function canTransitionUnifiedCampaign(from: CampaignLifecycleState, to: CampaignLifecycleState): boolean {
  return campaignTransitions[from].includes(to);
}

export function transitionUnifiedCampaign(
  campaign: UnifiedCampaign,
  next: CampaignLifecycleState,
  now: () => string = () => new Date().toISOString(),
): UnifiedCampaign {
  if (!canTransitionUnifiedCampaign(campaign.lifecycle, next)) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_INVALID_TRANSITION');
  }
  return { ...copy(campaign), lifecycle: next, updatedAt: now() };
}

/** Deterministic, provider-neutral planner. It cannot call transports or dispatch an action. */
export class UnifiedCampaignPlanner {
  constructor(
    private readonly providers: CampaignProviderCapabilityRegistry,
    private readonly entitlements: UnifiedCampaignEntitlementPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async plan(context: TenantContext, campaign: UnifiedCampaign): Promise<CampaignExecutionPlan> {
    assertTenant(context, campaign.tenantId);
    validateUnifiedCampaignInput(campaign);
    const allocations = allocateCampaignBudget(campaign.budget, campaign.channels);
    const orderedChannels = [...campaign.channels].sort((left, right) => left.id.localeCompare(right.id));
    const byChannel = new Map(allocations.map((allocation) => [allocation.channelId, allocation]));
    const steps: CampaignExecutionStep[] = [];
    const capabilityEvidence: CampaignEvidenceReference[] = [];

    for (const channel of orderedChannels) {
      const entitlement = await this.entitlements.authorize(context.tenantId, externalActionEntitlementKey(channel.provider));
      if (!entitlement.allowed) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_ENTITLEMENT_DENIED');
      const capabilities = this.providers.capabilities(channel.provider);
      const actionType = channel.actionType ?? 'UPDATE_CAMPAIGN_BUDGET';
      if (!capabilities.actionTypes.includes(actionType)) {
        throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_PROVIDER_CAPABILITY_UNSUPPORTED');
      }
      const allocation = byChannel.get(channel.id)!;
      const providerBudgetValue = normalizeProviderBudget(allocation.amountMinor, campaign.budget.minorUnitScale, capabilities.budgetUnit);
      const capability = {
        id: deterministicId('evidence', [campaign.id, channel.id, 'capability', actionType]),
        source: 'provider-capability-registry',
        summary: `${channel.provider} declares ${actionType} and ${capabilities.budgetUnit} budget semantics.`,
        observedAt: this.now(),
      } satisfies CampaignEvidenceReference;
      capabilityEvidence.push(capability);
      const actionId = deterministicId('external-action', [campaign.id, channel.id, actionType]);
      const proposal: ExternalMarketingActionProposal = {
        actionId,
        tenantId: campaign.tenantId,
        organizationId: campaign.organizationId,
        actor: context.userId ?? 'unified-campaign-operator',
        agentIdentity: 'unified-campaign-orchestrator',
        workflowRunId: campaign.workflow?.workflowId ?? `unified-campaign:${campaign.id}`,
        recommendationId: deterministicId('unified-campaign-recommendation', [campaign.id, channel.id]),
        provider: channel.provider,
        accountId: channel.accountId,
        campaignId: channel.campaignId,
        actionType,
        requestedPayload: {
          dailyBudget: providerBudgetValue,
          providerBudgetUnit: capabilities.budgetUnit,
          unifiedAllocationMinor: allocation.amountMinor,
          currencyMinorUnitScale: campaign.budget.minorUnitScale,
        },
        reason: allocation.reasoning,
        expectedOutcome: `Apply the approved ${campaign.budget.currency} allocation to the existing provider campaign.`,
        estimatedImpact: {
          unifiedCampaignId: campaign.id,
          channelId: channel.id,
          allocationMinor: allocation.amountMinor,
          allocationCurrency: allocation.currency,
        },
        estimatedCost: providerBudgetValue,
        currency: campaign.budget.currency,
        riskLevel: 'HIGH',
        policyContext: { unifiedCampaignId: campaign.id, channelId: channel.id },
        approvalRequirement: 'REQUIRED',
        idempotencyKey: deterministicId('unified-campaign-action', [campaign.id, channel.id, actionType]),
        requestedAt: this.now(),
        metadata: { unifiedCampaignId: campaign.id, channelId: channel.id, providerBudgetUnit: capabilities.budgetUnit },
        evidence: [...toExternalEvidence(campaign.evidenceReferences), toExternalEvidence([capability])[0]!],
        confidence: campaign.confidence,
        rollback: { strategy: 'derive governed rollback from durable provider before-state', before: {} },
      };
      steps.push({
        id: deterministicId('unified-campaign-step', [campaign.id, channel.id, actionType]),
        channelId: channel.id,
        provider: channel.provider,
        allocation,
        providerBudgetValue,
        providerBudgetUnit: capabilities.budgetUnit,
        proposal,
      });
    }

    return {
      id: deterministicId('unified-campaign-plan', [campaign.id, campaign.idempotencyKey]),
      campaignId: campaign.id,
      tenantId: campaign.tenantId,
      idempotencyKey: deterministicId('unified-campaign-plan-key', [campaign.id, campaign.idempotencyKey]),
      budget: copy(campaign.budget),
      allocations,
      steps,
      capabilityEvidence,
      createdAt: this.now(),
    };
  }
}

export function allocateCampaignBudget(
  budget: CampaignBudget,
  channels: readonly CampaignChannel[],
): ChannelAllocationResult[] {
  validateBudget(budget);
  if (channels.length === 0) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_CHANNEL_REQUIRED');
  const ids = new Set<string>();
  let fixedTotal = 0;
  let percentageTotal = 0;
  const percentage: Array<{ channel: CampaignChannel; basisPoints: number }> = [];
  const results = new Map<string, number>();

  for (const channel of channels) {
    if (!channel.id.trim() || ids.has(channel.id)) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_CHANNEL_ID_INVALID');
    ids.add(channel.id);
    validateChannel(channel);
    const allocation = channel.allocation;
    if (allocation.kind === 'FIXED') {
      const amount = allocation.amountMinor!;
      fixedTotal += amount;
      results.set(channel.id, amount);
    } else {
      const basisPoints = allocation.percentageBasisPoints!;
      percentageTotal += basisPoints;
      percentage.push({ channel, basisPoints });
    }
  }
  if (fixedTotal > budget.amountMinor || percentageTotal > 10_000) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_ALLOCATION_EXCEEDS_TOTAL');
  }
  const rawPercentageTotal = percentage.reduce((sum, entry) => sum + Math.floor((budget.amountMinor * entry.basisPoints) / 10_000), 0);
  const expectedTotal = fixedTotal + rawPercentageTotal;
  const exactPercentageRemainder = percentage.reduce(
    (sum, entry) => sum + ((budget.amountMinor * entry.basisPoints) % 10_000),
    0,
  );
  const roundingUnits = Math.floor(exactPercentageRemainder / 10_000);
  if (expectedTotal + roundingUnits !== budget.amountMinor) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_ALLOCATION_MUST_EQUAL_TOTAL');
  }
  const byRemainder = [...percentage].sort((left, right) => {
    const rightRemainder = (budget.amountMinor * right.basisPoints) % 10_000;
    const leftRemainder = (budget.amountMinor * left.basisPoints) % 10_000;
    return rightRemainder - leftRemainder || left.channel.id.localeCompare(right.channel.id);
  });
  for (const entry of percentage) {
    results.set(entry.channel.id, Math.floor((budget.amountMinor * entry.basisPoints) / 10_000));
  }
  for (let index = 0; index < roundingUnits; index += 1) {
    const channelId = byRemainder[index]?.channel.id;
    if (!channelId) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_ROUNDING_FAILED');
    results.set(channelId, results.get(channelId)! + 1);
  }
  const allocated = [...results.values()].reduce((sum, value) => sum + value, 0);
  if (allocated !== budget.amountMinor || [...results.values()].some((value) => value <= 0)) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_ALLOCATION_INVALID');
  }
  return [...channels]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((channel) => ({
      channelId: channel.id,
      amountMinor: results.get(channel.id)!,
      currency: budget.currency,
      reasoning: channel.allocation.reasoning,
      evidenceReferences: copy(channel.allocation.evidenceReferences ?? []),
    }));
}

export function aggregateCampaignLifecycle(
  plan: CampaignExecutionPlan,
  outcomes: readonly CampaignExecutionOutcome[],
): CampaignLifecycleState {
  if (plan.steps.length === 0) return 'FAILED';
  const byStep = new Map(outcomes.map((outcome) => [outcome.stepId, outcome]));
  const resolved = plan.steps.map((step) => byStep.get(step.id));
  if (resolved.every((outcome) => outcome?.status === 'PAUSED' && outcome.intentionallyPaused)) return 'PAUSED';
  const verified = resolved.filter((outcome) => outcome?.status === 'VERIFIED').length;
  const failures = resolved.filter((outcome) => ['FAILED', 'UNAVAILABLE', 'MISMATCH', 'UNKNOWN'].includes(outcome?.status ?? 'PENDING')).length;
  const pending = resolved.filter((outcome) => !outcome || outcome.status === 'PENDING').length;
  if (verified === resolved.length) return 'ACTIVE';
  if (verified > 0 && failures > 0) return 'DEGRADED';
  if (verified > 0 && pending > 0) return 'PARTIALLY_ACTIVE';
  if (verified === 0 && failures === resolved.length) return 'FAILED';
  return 'EXECUTING';
}

/** Produces only references to the existing governed rollback endpoint; it cannot call a provider. */
export function deriveCampaignCompensationPlan(
  campaignId: string,
  outcomes: readonly CampaignExecutionOutcome[],
): CampaignCompensationPlan {
  const requests = outcomes
    .filter((outcome) => outcome.status === 'VERIFIED' && Boolean(outcome.externalActionId))
    .sort((left, right) => left.stepId.localeCompare(right.stepId))
    .map((outcome) => ({
      id: deterministicId('campaign-compensation', [campaignId, outcome.stepId]),
      campaignId,
      channelId: outcome.channelId,
      provider: outcome.provider,
      originalExternalActionId: outcome.externalActionId!,
      beforeStateEvidence: copy(outcome.beforeStateEvidence),
      idempotencyKey: deterministicId('campaign-compensation-key', [campaignId, outcome.externalActionId!]),
      status: 'REQUIRES_GOVERNED_ROLLBACK' as const,
    }));
  return {
    id: deterministicId('campaign-compensation-plan', [campaignId, ...requests.map((request) => request.id)]),
    campaignId,
    requests,
    requiresApproval: true,
  };
}

export function aggregateCampaignPerformance(
  campaignId: string,
  snapshots: readonly CampaignPerformanceSnapshot[],
  now: () => string = () => new Date().toISOString(),
): CampaignPerformanceAggregate {
  if (snapshots.length === 0) {
    return {
      campaignId,
      currency: 'UNKNOWN',
      metrics: unknownMetrics(),
      channelSnapshots: [],
      freshness: 'UNKNOWN',
      reasons: ['PERFORMANCE_SNAPSHOTS_UNAVAILABLE'],
    };
  }
  const ordered = [...snapshots].sort((left, right) => left.channelId.localeCompare(right.channelId) || left.capturedAt.localeCompare(right.capturedAt));
  const currencies = new Set(ordered.map((snapshot) => snapshot.currency));
  const stale = ordered.some((snapshot) => Date.parse(snapshot.freshnessExpiresAt) <= Date.parse(now()));
  const currency = currencies.size === 1 ? ordered[0]!.currency : 'UNKNOWN';
  const metrics = unknownMetrics();
  for (const metric of ['impressions', 'clicks', 'conversions'] as const) {
    const values = ordered.map((snapshot) => snapshot.metrics[metric]);
    if (values.every(isNumber)) metrics[metric] = values.reduce((sum, value) => sum + value, 0);
  }
  if (currency !== 'UNKNOWN') {
    for (const metric of ['spend', 'conversionValue'] as const) {
      const values = ordered.map((snapshot) => snapshot.metrics[metric]);
      if (values.every(isNumber)) metrics[metric] = values.reduce((sum, value) => sum + value, 0);
    }
    const impressions = metrics.impressions;
    const clicks = metrics.clicks;
    const spend = metrics.spend;
    const conversions = metrics.conversions;
    const conversionValue = metrics.conversionValue;
    if (isNumber(impressions) && isNumber(clicks) && impressions > 0) metrics.ctr = clicks / impressions;
    if (isNumber(spend) && isNumber(clicks) && clicks > 0) metrics.cpc = spend / clicks;
    if (isNumber(spend) && isNumber(impressions) && impressions > 0) metrics.cpm = (spend * 1000) / impressions;
    if (isNumber(spend) && isNumber(conversions) && conversions > 0) metrics.cpa = spend / conversions;
    if (isNumber(conversionValue) && isNumber(spend) && spend > 0) metrics.roas = conversionValue / spend;
  }
  return {
    campaignId,
    currency,
    metrics,
    channelSnapshots: ordered.map(copy),
    freshness: stale ? 'STALE' : 'FRESH',
    reasons: [
      ...(currency === 'UNKNOWN' ? ['MULTI_CURRENCY_AGGREGATION_UNAVAILABLE'] : []),
      ...(stale ? ['STALE_PERFORMANCE_SNAPSHOT'] : []),
    ],
  };
}

/** V1 is deterministic, evidence-carrying, and intentionally cannot execute an action. */
export function recommendCampaignOptimization(
  campaign: UnifiedCampaign,
  aggregate: CampaignPerformanceAggregate,
  now: () => string = () => new Date().toISOString(),
): CampaignOptimizationRecommendation[] {
  if (aggregate.freshness !== 'FRESH' || aggregate.currency === 'UNKNOWN') return [];
  const candidates = aggregate.channelSnapshots
    .filter((snapshot) => isNumber(snapshot.metrics.roas) && snapshot.verification === 'VERIFIED')
    .sort((left, right) => (right.metrics.roas as number) - (left.metrics.roas as number) || left.channelId.localeCompare(right.channelId));
  if (candidates.length < 2) return [];
  const best = candidates[0]!;
  const worst = candidates[candidates.length - 1]!;
  if ((best.metrics.roas as number) <= (worst.metrics.roas as number)) return [];
  const delta = Math.max(1, Math.floor(campaign.budget.amountMinor / 10));
  const evidence = [...best.provenance, ...worst.provenance].sort((left, right) => left.id.localeCompare(right.id));
  const timestamp = now();
  return [{
    id: deterministicId('campaign-optimization', [campaign.id, best.channelId, worst.channelId, 'SHIFT_BUDGET']),
    tenantId: campaign.tenantId,
    campaignId: campaign.id,
    type: 'SHIFT_BUDGET',
    reason: 'Verified fresh ROAS is higher for the destination channel than the source channel.',
    evidenceReferences: evidence,
    confidence: Math.min(campaign.confidence, 0.8),
    expectedImpact: 'A human-reviewed allocation adjustment may improve return; no performance outcome is guaranteed.',
    affectedChannelIds: [worst.channelId, best.channelId],
    proposedBudgetDeltaMinor: delta,
    currency: campaign.budget.currency,
    requiresApproval: true,
    createdAt: timestamp,
  }];
}

export function validateUnifiedCampaignInput(input: UnifiedCampaignInput): void {
  if (!input.idempotencyKey?.trim() || !input.organizationId?.trim() || !input.goal?.trim()) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_IDENTITY_REQUIRED');
  }
  if (!['LEAD_GENERATION', 'SALES', 'AWARENESS', 'TRAFFIC', 'ENGAGEMENT', 'RETENTION'].includes(input.objective)) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_OBJECTIVE_INVALID');
  }
  validateBudget(input.budget);
  if (!input.target.markets.length || !input.target.languages.length) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_TARGET_REQUIRED');
  }
  const start = Date.parse(input.schedule.startsAt);
  const end = input.schedule.endsAt ? Date.parse(input.schedule.endsAt) : undefined;
  if (!Number.isFinite(start) || (end !== undefined && (!Number.isFinite(end) || end <= start))) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_SCHEDULE_INVALID');
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_CONFIDENCE_INVALID');
  }
  if (!input.evidenceReferences.length) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_EVIDENCE_REQUIRED');
  if (!input.channels.length) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_CHANNEL_REQUIRED');
}

function validateBudget(budget: CampaignBudget): void {
  if (!Number.isSafeInteger(budget.amountMinor) || budget.amountMinor <= 0 || !/^[A-Z]{3}$/.test(budget.currency)) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_BUDGET_INVALID');
  }
  // Allocation is calculated in basis points. Refuse an amount that would
  // lose integer precision before we ever construct a governed proposal.
  if (budget.amountMinor > Math.floor(Number.MAX_SAFE_INTEGER / 10_000)) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_BUDGET_RANGE_UNSUPPORTED');
  }
  if (!Number.isSafeInteger(budget.minorUnitScale) || budget.minorUnitScale < 0 || budget.minorUnitScale > 6) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_CURRENCY_SCALE_INVALID');
  }
}

function validateChannel(channel: CampaignChannel): void {
  if (!channel.provider?.trim() || !channel.accountId?.trim() || !channel.campaignId?.trim()) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_CHANNEL_TARGET_REQUIRED');
  }
  const allocation = channel.allocation;
  if (!allocation.reasoning?.trim()) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_ALLOCATION_REASON_REQUIRED');
  const hasPercentage = allocation.percentageBasisPoints !== undefined;
  const hasFixed = allocation.amountMinor !== undefined;
  if ((allocation.kind === 'PERCENTAGE' && (!hasPercentage || hasFixed)) || (allocation.kind === 'FIXED' && (!hasFixed || hasPercentage))) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_ALLOCATION_CONFLICT');
  }
  if (allocation.kind === 'PERCENTAGE' && (!Number.isSafeInteger(allocation.percentageBasisPoints) || allocation.percentageBasisPoints! <= 0 || allocation.percentageBasisPoints! > 10_000)) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_PERCENTAGE_INVALID');
  }
  if (allocation.kind === 'FIXED' && (!Number.isSafeInteger(allocation.amountMinor) || allocation.amountMinor! <= 0)) {
    throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_FIXED_ALLOCATION_INVALID');
  }
}

function normalizeProviderBudget(amountMinor: number, scale: number, unit: ProviderBudgetUnit): number {
  if (unit === 'MINOR') return amountMinor;
  const value = amountMinor / (10 ** scale);
  if (!Number.isFinite(value) || value <= 0) throw new UnifiedCampaignError('UNIFIED_CAMPAIGN_PROVIDER_BUDGET_INVALID');
  return value;
}

function toExternalEvidence(references: readonly CampaignEvidenceReference[]): ExternalActionEvidenceReference[] {
  return references.map((reference) => ({
    id: reference.id,
    source: reference.source,
    summary: reference.summary,
    ...(reference.observedAt ? { observedAt: reference.observedAt } : {}),
  }));
}

function unknownMetrics(): CampaignPerformanceMetrics {
  return {
    impressions: 'UNKNOWN', clicks: 'UNKNOWN', spend: 'UNKNOWN', conversions: 'UNKNOWN', conversionValue: 'UNKNOWN',
    ctr: 'UNKNOWN', cpc: 'UNKNOWN', cpm: 'UNKNOWN', cpa: 'UNKNOWN', roas: 'UNKNOWN',
  };
}

function isNumber(value: CampaignMetricValue): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function assertTenant(context: TenantContext, tenantId: string): void {
  if (!context.tenantId || context.tenantId !== tenantId) throw new UnifiedCampaignError('TENANT_SCOPE_DENIED');
}

function deterministicId(prefix: string, parts: readonly string[]): string {
  return `${prefix}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)}`;
}

function tenantKey(tenantId: string, value: string): string {
  return `${tenantId}\u0000${value}`;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
