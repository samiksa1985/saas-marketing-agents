import type { Id, Locale } from './index.js';

export type MarketingEntityStatus = 'draft' | 'active' | 'paused' | 'archived' | 'completed';

export type MarketingChannel =
  | 'email'
  | 'social'
  | 'search'
  | 'paid_media'
  | 'website'
  | 'events'
  | 'partner'
  | 'sales'
  | 'other';

export type SignalType =
  | 'intent'
  | 'engagement'
  | 'news'
  | 'funding'
  | 'hiring'
  | 'technology'
  | 'relationship'
  | 'web'
  | 'other';

export type LeadStatus =
  'new' | 'working' | 'qualified' | 'disqualified' | 'nurturing' | 'converted' | 'closed';

export type OpportunityStage =
  'prospecting' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

/**
 * Canonical deterministic weighting for open sales opportunities. Consumers may
 * provide a validated opportunity-specific probability, otherwise they use this
 * shared stage rule. Closed-won revenue belongs in actual financial evidence;
 * closed-lost opportunities contribute no forecast value.
 */
export const DEFAULT_OPPORTUNITY_STAGE_PROBABILITIES: Readonly<
  Record<OpportunityStage, number>
> = {
  prospecting: 0.2,
  qualified: 0.35,
  proposal: 0.6,
  negotiation: 0.8,
  won: 1,
  lost: 0,
};

export type OutcomeType =
  | 'engagement'
  | 'lead'
  | 'qualified_lead'
  | 'meeting'
  | 'opportunity'
  | 'customer'
  | 'revenue'
  | 'profit';

export interface MarketingGoal {
  id: Id;
  tenantId: Id;
  name: string;
  description: string;
  metric: string;
  targetValue?: number;
  targetUnit?: string;
  timeframe?: string;
  status: 'draft' | 'active' | 'achieved' | 'cancelled';
}

export interface CompanyContext {
  tenantId: Id;
  companyName: string;
  website?: string;
  industry?: string;
  markets: string[];
  products: string[];
  services: string[];
  brandVoice?: string;
  positioning?: string;
  goals: Id[];
  locale: Locale;
  updatedAt: string;
}

/**
 * Canonical company-intelligence assessment contracts. These do not replace
 * the advanced ICP profile and account execution contracts below.
 */
export interface CompanyEvidence {
  id: Id;
  source: string;
  sourceType: 'company' | 'document' | 'crm' | 'research' | 'web' | 'user' | 'system';
  observedAt?: string;
  confidence?: number;
}

export interface CompanyIntelligenceProfile {
  id: Id;
  tenantId: Id;
  companyName: string;
  website?: string;
  industry?: string;
  subIndustry?: string;
  headquarters?: string;
  geographies: string[];
  employeeBand?: string;
  revenueBand?: string;
  businessModel?: string;
  products: string[];
  services: string[];
  technologies: string[];
  competitors: string[];
  customers: string[];
  painPoints: string[];
  strategicPriorities: string[];
  buyingSignals: string[];
  risks: string[];
  opportunities: string[];
  evidenceIds: Id[];
  confidence: number;
  updatedAt: string;
}

export interface ICPAssessment {
  accountId: Id;
  tenantId: Id;
  score: number;
  tier: 'tier_1' | 'tier_2' | 'tier_3' | 'rejected';
  matchedIndustries: string[];
  matchedGeographies: string[];
  matchedTriggers: string[];
  matchedPainPoints: string[];
  exclusions: string[];
  evidenceIds: Id[];
  reasons: string[];
  model: string;
}

export interface ICPProfile {
  id: Id;
  tenantId: Id;
  name: string;
  industries: string[];
  companySizes: string[];
  geographies: string[];
  buyingTriggers: string[];
  painPoints: string[];
  desiredOutcomes: string[];
  exclusions: string[];
  confidence?: number;
  evidenceIds: Id[];
  status: MarketingEntityStatus;
}

export interface PersonaProfile {
  id: Id;
  tenantId: Id;
  icpId: Id;
  name: string;
  titlePatterns: string[];
  responsibilities: string[];
  pains: string[];
  buyingCriteria: string[];
  objections: string[];
}

export interface Account {
  id: Id;
  tenantId: Id;
  name: string;
  website?: string;
  industry?: string;
  geography?: string;
  employeeBand?: string;
  icpFit?: number;
  status: MarketingEntityStatus;
}

export interface Contact {
  id: Id;
  tenantId: Id;
  accountId: Id;
  name: string;
  title?: string;
  email?: string;
  roleType?: string;
  buyingInfluence?: string;
}

export interface Signal {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  contactId?: Id;
  type: SignalType;
  source: string;
  summary: string;
  observedAt: string;
  expiresAt?: string;
  confidence?: number;
  evidenceIds: Id[];
}

export interface Campaign {
  id: Id;
  tenantId: Id;
  name: string;
  objective: string;
  channels: MarketingChannel[];
  goalIds: Id[];
  workflowId?: Id;
  status: MarketingEntityStatus;
}

export interface Interaction {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  contactId?: Id;
  campaignId?: Id;
  channel: MarketingChannel;
  type: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface Lead {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  contactId?: Id;
  source?: string;
  score?: number;
  status: LeadStatus;
}

export interface Opportunity {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  name: string;
  stage: OpportunityStage;
  amount?: number;
  currency?: string;
  expectedCloseAt?: string;
}

export interface Customer {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  lifecycleStage: 'new' | 'active' | 'at_risk' | 'renewal' | 'churned' | 'expansion';
}

export interface LeadScoreAssessment {
  leadId?: Id;
  score: number;
  temperature: 'HOT' | 'WARM' | 'COLD';
  fit: number;
  intent: number;
  engagement: number;
  timing: number;
  factors: Record<string, number>;
  recommendations: string[];
  model: string;
}

export interface SalesForecast {
  period: 'WEEK' | 'MONTH' | 'QUARTER';
  periodStart: string;
  periodEnd: string;
  opportunityCount: number;
  pipelineAmount: number;
  weightedAmount: number;
  winProbability: number;
  confidence: number;
  opportunityIds: Id[];
}

export interface ProposalDraft {
  id: Id;
  tenantId: Id;
  opportunityId: Id;
  title: string;
  amount?: number;
  currency?: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  content: Record<string, unknown>;
  requiresApproval: true;
}
export interface Outcome {
  id: Id;
  tenantId: Id;
  type: OutcomeType;
  sourceEntityId: Id;
  metric: string;
  value: number;
  unit?: string;
  occurredAt: string;
  attribution?: Record<string, number>;
}

export interface MarketingMemoryRecord {
  id: Id;
  tenantId: Id;
  scope: 'company' | 'customer' | 'account' | 'campaign' | 'interaction' | 'organization' | 'agent';
  scopeId: Id;
  statement: string;
  evidenceIds: Id[];
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Experiment {
  id: Id;
  tenantId: Id;
  name: string;
  hypothesis: string;
  metric: string;
  variants: string[];
  status: 'planned' | 'running' | 'won' | 'lost' | 'inconclusive';
}

export interface Recommendation {
  id: Id;
  tenantId: Id;
  title: string;
  rationale: string;
  action: string;
  confidence?: number;
  evidenceIds: Id[];
  requiresApproval: boolean;
}

export type MarketEvidenceType =
  'market' | 'competitor' | 'customer' | 'trend' | 'demand' | 'positioning';

export interface MarketEvidence {
  id: Id;
  tenantId: Id;
  type: MarketEvidenceType;
  claim: string;
  sourceRef: string;
  sourceDate?: string;
  confidence: number;
}

export interface CompetitorProfile {
  id: Id;
  tenantId: Id;
  name: string;
  website?: string;
  category?: string;
  positioning?: string;
  products: string[];
  strengths: string[];
  weaknesses: string[];
  differentiators: string[];
  targetSegments: string[];
  channels: string[];
  evidenceIds: Id[];
  confidence: number;
}

export interface MarketTrend {
  id: Id;
  tenantId: Id;
  name: string;
  description: string;
  direction: 'rising' | 'stable' | 'declining' | 'uncertain';
  relevance: number;
  evidenceIds: Id[];
  confidence: number;
}

export interface MarketOpportunity {
  id: Id;
  tenantId: Id;
  title: string;
  description: string;
  type: 'demand' | 'segment' | 'positioning' | 'channel' | 'product' | 'competitive';
  impact: 'low' | 'medium' | 'high';
  evidenceIds: Id[];
  confidence: number;
}

export interface MarketThreat {
  id: Id;
  tenantId: Id;
  title: string;
  description: string;
  type: 'competitive' | 'market' | 'customer' | 'channel' | 'pricing' | 'technology';
  severity: 'low' | 'medium' | 'high';
  evidenceIds: Id[];
  confidence: number;
}

export interface MarketIntelligenceSnapshot {
  id: Id;
  tenantId: Id;
  researchQuestion: string;
  marketSummary: string;
  competitors: CompetitorProfile[];
  customerSignals: string[];
  trends: MarketTrend[];
  opportunities: MarketOpportunity[];
  threats: MarketThreat[];
  evidence: MarketEvidence[];
  confidence: number;
  createdAt: string;
}

export type StrategyStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SUPERSEDED' | 'ARCHIVED';

export type StrategyPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface StrategyObjective {
  id: Id;
  name: string;
  description: string;
  metric?: string;
  targetValue?: number;
  targetUnit?: string;
  timeframe?: string;
  priority: StrategyPriority;
}

export interface StrategyChannel {
  name: string;
  objective: string;
  kpi: string;
  priority: StrategyPriority;
}

export interface StrategyCampaignRecommendation {
  name: string;
  objective: string;
  priority: StrategyPriority;
  rationale: string;
  evidenceIds: Id[];
}

export interface StrategyKPI {
  name: string;
  metric: string;
  targetValue?: number;
  targetUnit?: string;
  timeframe?: string;
}

export interface StrategyRoadmapItem {
  id: Id;
  horizon: '30' | '60' | '90';
  title: string;
  objective: string;
  owner: string;
  priority: StrategyPriority;
  dependencies: Id[];
  evidenceIds: Id[];
}

export interface MarketingStrategy {
  id: Id;
  tenantId: Id;
  version: number;
  title: string;
  executiveSummary: string;
  objectiveIds: Id[];
  objectives: StrategyObjective[];
  icpIds: Id[];
  positioning: string;
  messaging: string[];
  channels: StrategyChannel[];
  offers: string[];
  campaigns: StrategyCampaignRecommendation[];
  contentPillars: string[];
  kpis: StrategyKPI[];
  roadmap: StrategyRoadmapItem[];
  priorities: string[];
  assumptions: string[];
  evidenceIds: Id[];
  confidence: number;
  status: StrategyStatus;
  requiresApproval: true;
  createdAt: string;
  updatedAt: string;
}

export type CustomerHealthStatus = 'HEALTHY' | 'WATCH' | 'AT_RISK' | 'CRITICAL';

export type ChurnRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CustomerSuccessSignal {
  id: Id;
  type:
    | 'engagement'
    | 'delivery'
    | 'outcome'
    | 'satisfaction'
    | 'usage'
    | 'support'
    | 'billing'
    | 'renewal'
    | 'expansion';
  value?: number;
  summary?: string;
  evidenceIds: Id[];
  observedAt?: string;
}

export interface CustomerHealthAssessment {
  id: Id;
  tenantId: Id;
  customerId: Id;
  accountId?: Id;
  score: number;
  status: CustomerHealthStatus;
  churnRisk: ChurnRiskLevel;
  causes: string[];
  actions: string[];
  evidenceIds: Id[];
  confidence: number;
  model: string;
  assessedAt: string;
}

export interface CustomerSuccessAssessmentInput {
  tenantId: Id;
  customerId: Id;
  accountId?: Id;
  engagementScore: number;
  deliveryScore: number;
  outcomeScore: number;
  satisfactionScore: number;
  unresolvedIssues: number;
  daysToRenewal?: number;
  usageScore?: number;
  paymentRisk?: boolean;
  evidenceIds?: Id[];
  assessedAt?: string;
}

export interface RenewalRecommendation {
  id: Id;
  tenantId: Id;
  customerId: Id;
  accountId?: Id;
  healthAssessmentId: Id;
  daysToRenewal?: number;
  recommendation: 'RENEW' | 'RENEW_WITH_RECOVERY_PLAN' | 'EXECUTIVE_REVIEW' | 'DO_NOT_AUTO_RENEW';
  rationale: string[];
  actions: string[];
  evidenceIds: Id[];
  confidence: number;
  requiresApproval: true;
  createdAt: string;
}

export interface ExpansionOpportunityAssessment {
  id: Id;
  tenantId: Id;
  customerId: Id;
  accountId?: Id;
  healthAssessmentId: Id;
  eligible: boolean;
  score: number;
  rationale: string[];
  recommendedActions: string[];
  evidenceIds: Id[];
  confidence: number;
  requiresApproval: true;
  createdAt: string;
}

export type FinancialStatus = 'ACTUAL' | 'ESTIMATED' | 'MODELED';

export interface FinancialAmount {
  value: number;
  currency: string;
  status: FinancialStatus;
  evidenceIds: string[];
}

export interface ClientProfitabilityInput {
  tenantId: string;
  customerId: string;
  accountId?: string;
  periodStart: string;
  periodEnd: string;
  revenue: FinancialAmount;
  aiCost: FinancialAmount;
  toolCost: FinancialAmount;
  deliveryCost: FinancialAmount;
  otherDirectCost: FinancialAmount;
  operatingExpense?: FinancialAmount;
}

/** Scenario inputs describe modeled "what if" changes, not pipeline forecasts. */
export interface FinancialScenarioInput {
  tenantId: string;
  customerId?: string;
  currency: string;
  baselineRevenue: FinancialAmount;
  baselineVariableCost: FinancialAmount;
  baselineFixedCost: FinancialAmount;
  priceChangePct: number;
  volumeChangePct: number;
  variableCostChangePct: number;
  fixedCostChangePct?: number;
}

/** A canonical opportunity with financial provenance for CFO forecasting. */
export type FinancialForecastOpportunity = Omit<
  Opportunity,
  'amount' | 'currency' | 'expectedCloseAt'
> & {
  amount: FinancialAmount;
  expectedCloseAt: string;
  /** Optional CRM probability, bounded to [0, 1] and otherwise stage-derived. */
  probability?: number;
};

export interface FinancialActualRevenue {
  occurredAt: string;
  amount: FinancialAmount;
}

export interface FinancialForecastInput {
  tenantId: string;
  customerId?: string;
  period: SalesForecast['period'];
  periodStart: string;
  periodEnd: string;
  currency: string;
  opportunities: FinancialForecastOpportunity[];
  actualRevenue?: FinancialActualRevenue[];
}

export interface FinancialForecastStageSummary {
  stage: OpportunityStage;
  probability: number;
  opportunityCount: number;
  pipelineAmount: FinancialAmount;
  weightedAmount: FinancialAmount;
  evidenceIds: string[];
}

/**
 * Deterministic period forecast. Forecast values are estimated from recorded
 * opportunities and actual evidence; scenario calculations are intentionally
 * represented by FinancialScenarioResult instead.
 */
export interface FinancialForecastResult {
  tenantId: string;
  customerId?: string;
  period: SalesForecast['period'];
  periodStart: string;
  periodEnd: string;
  actualRevenue: FinancialAmount;
  pipelineAmount: FinancialAmount;
  weightedPipelineAmount: FinancialAmount;
  forecastRevenue: FinancialAmount;
  opportunityCount: number;
  stageSummaries: FinancialForecastStageSummary[];
  confidence: number;
  evidenceIds: string[];
  model: 'canonical-financial-forecast-v1';
}

export interface ClientProfitabilityAssessment {
  tenantId: string;
  customerId: string;
  accountId?: string;
  periodStart: string;
  periodEnd: string;
  revenue: FinancialAmount;
  directCost: FinancialAmount;
  grossContribution: FinancialAmount;
  grossMarginPct: FinancialAmount;
  operatingExpense?: FinancialAmount;
  operatingContribution?: FinancialAmount;
  evidenceIds: string[];
  model: 'canonical-client-profitability-v1';
}

export interface FinancialScenarioResult {
  tenantId: string;
  customerId?: string;
  projectedRevenue: FinancialAmount;
  projectedVariableCost: FinancialAmount;
  projectedFixedCost: FinancialAmount;
  projectedContribution: FinancialAmount;
  projectedMarginPct: FinancialAmount;
  breakEvenRevenue?: FinancialAmount;
  evidenceIds: string[];
  model: 'canonical-financial-scenario-v1';
}

export type CFORecommendationPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type CFORecommendationType =
  'MARGIN' | 'COST' | 'PRICING' | 'FORECAST' | 'RETENTION' | 'GROWTH';

export interface CFORecommendation {
  id: string;
  tenantId: string;
  customerId?: string;
  type: CFORecommendationType;
  priority: CFORecommendationPriority;
  title: string;
  rationale: string;
  action: string;
  confidence: number;
  evidenceIds: string[];
  requiresApproval: true;
}

export type AnalyticsMetricStatus = 'ACTUAL' | 'ESTIMATED' | 'MODELED';

export type AnalyticsAttributionModel =
  'FIRST_TOUCH' | 'LAST_TOUCH' | 'LINEAR' | 'TIME_DECAY' | 'POSITION_BASED';

export interface ExperimentVariantRecord {
  id: Id;
  tenantId: Id;
  experimentId: Id;
  name: string;
  payload: Record<string, unknown>;
  sampleSize?: number;
  metricValue?: number;
  createdAt?: string;
}

export interface ExperimentEvaluation {
  experimentId: Id;
  tenantId: Id;
  metric: string;
  status: 'won' | 'lost' | 'inconclusive';
  winningVariantId?: Id;
  confidence: number;
  rationale: string;
  evidenceIds: Id[];
  evaluatedAt: string;
}

export interface AttributionSnapshot {
  id: Id;
  tenantId: Id;
  sourceEntityId: Id;
  revenueOutcomeId?: Id;
  model: AnalyticsAttributionModel;
  totalAmount: number;
  currency?: string;
  allocations: Array<{
    eventId: Id;
    weight: number;
    attributedAmount: number;
  }>;
  evidenceIds: Id[];
  calculatedAt: string;
}

export type BillingSubscriptionStatus =
  'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';

export type BillingInvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';

export type BillingPaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';

export type EntitlementValue = boolean | number | string;

export interface BillingPlan {
  id: Id;
  code: string;
  name: string;
  description?: string;
  currency: string;
  priceMonthlyMinor?: number;
  priceYearlyMinor?: number;
  active: boolean;
}

export interface PlanEntitlement {
  id: Id;
  planId: Id;
  key: string;
  value: EntitlementValue;
}

export interface OrganizationEntitlementOverride {
  id: Id;
  tenantId: Id;
  key: string;
  value: EntitlementValue;
  reason?: string;
  expiresAt?: string;
}

export interface BillingSubscription {
  id: Id;
  tenantId: Id;
  planId: Id;
  status: BillingSubscriptionStatus;
  billingCycle: 'MONTHLY' | 'YEARLY' | 'CUSTOM';
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt?: string;
  cancelledAt?: string;
  provider?: string;
  providerSubscriptionId?: string;
}

export interface UsageCounter {
  id: Id;
  tenantId: Id;
  key: string;
  periodStart: string;
  periodEnd: string;
  used: number;
  limit?: number;
}

export interface EntitlementDecision {
  tenantId: Id;
  key: string;
  allowed: boolean;
  source: 'ORGANIZATION_OVERRIDE' | 'PLAN' | 'DEFAULT_DENY';
  entitlementValue?: EntitlementValue;
  usage?: {
    used: number;
    limit?: number;
    remaining?: number;
  };
  reason: string;
}

export interface BillingInvoice {
  id: Id;
  tenantId: Id;
  subscriptionId?: Id;
  externalInvoiceId?: string;
  currency: string;
  amountDueMinor: number;
  amountPaidMinor: number;
  status: BillingInvoiceStatus;
  issuedAt: string;
  dueAt?: string;
  paidAt?: string;
}

export interface BillingPayment {
  id: Id;
  tenantId: Id;
  invoiceId?: Id;
  externalPaymentId?: string;
  provider?: string;
  currency: string;
  amountMinor: number;
  status: BillingPaymentStatus;
  occurredAt: string;
}
