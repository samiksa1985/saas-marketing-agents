export type MetricStatus =
  | 'ACTUAL'
  | 'ESTIMATED'
  | 'MODELED';

export type AttributionModel =
  | 'FIRST_TOUCH'
  | 'LAST_TOUCH'
  | 'LINEAR'
  | 'TIME_DECAY'
  | 'POSITION_BASED';

export type OutcomeEventType =
  | 'activity'
  | 'engagement'
  | 'lead'
  | 'qualified_lead'
  | 'meeting'
  | 'opportunity'
  | 'customer'
  | 'revenue'
  | 'profit';

export interface OutcomeEvent {
  id: string;
  tenantId: string;
  type: OutcomeEventType;
  value: number;
  metric: string;
  occurredAt: string;
  sourceEntityId: string;
  attributes: Record<string, unknown>;
}

export interface FunnelSnapshot {
  activities: number;
  engagements: number;
  leads: number;
  qualifiedLeads: number;
  meetings: number;
  opportunities: number;
  customers: number;
  revenue: number;
  profit: number;
}

export interface MetricResult {
  key: string;
  value: number;
  status: MetricStatus;
  currency?: string;
  dimensions?: Record<string, string>;
  evidenceEventIds: string[];
}

export interface GrowthInsight {
  title: string;
  diagnosis: string;
  recommendation: string;
  confidence: number;
  evidenceEventIds: string[];
}

export interface AttributionTouch {
  eventId: string;
  tenantId: string;
  occurredAt: string;
}

export interface AttributionResult {
  model: AttributionModel;
  eventId: string;
  attributedAmount: number;
  weight: number;
}

export interface GrowthRecommendation {
  title: string;
  finding: string;
  evidence: string[];
  recommendation: string;
  expectedImpact: string;
  risk: string;
  priority:
    | 'LOW'
    | 'MEDIUM'
    | 'HIGH'
    | 'CRITICAL';
}

export interface GrowthInput {
  tenantId: string;
  leads: number;
  qualifiedLeads: number;
  opportunities: number;
  wonDeals: number;
  revenue: number;
  spend: number;
  previousRevenue?: number;
  previousLeads?: number;
  evidenceEventIds?: string[];
}

export interface GrowthThresholds {
  minimumRoas: number;
  minimumLeadToOpportunityRate: number;
  minimumWinRate: number;
}

export const DEFAULT_GROWTH_THRESHOLDS:
  GrowthThresholds = {
    minimumRoas: 2,
    minimumLeadToOpportunityRate: 0.1,
    minimumWinRate: 0.2,
  };

function assertTenantId(
  tenantId: string,
): void {
  if (!tenantId.trim()) {
    throw new Error(
      'tenantId is required',
    );
  }
}

function assertSameTenant(
  items: Array<{
    tenantId: string;
  }>,
): string | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const tenantId =
    items[0]!.tenantId;

  assertTenantId(tenantId);

  for (const item of items) {
    if (
      item.tenantId !== tenantId
    ) {
      throw new Error(
        'Cross-tenant measurement access denied',
      );
    }
  }

  return tenantId;
}

function metric(
  key: string,
  value: number,
  status: MetricStatus,
  evidenceEventIds: string[] = [],
  currency?: string,
  dimensions?: Record<
    string,
    string
  >,
): MetricResult {
  return {
    key,
    value:
      Number.isFinite(value)
        ? value
        : 0,
    status,
    evidenceEventIds: [
      ...new Set(
        evidenceEventIds,
      ),
    ],
    ...(currency
      ? { currency }
      : {}),
    ...(dimensions
      ? { dimensions }
      : {}),
  };
}

export function buildFunnelSnapshot(
  events: OutcomeEvent[],
): FunnelSnapshot {
  assertSameTenant(events);

  const sum = (
    type: OutcomeEvent['type'],
  ) =>
    events
      .filter(
        (event) =>
          event.type === type,
      )
      .reduce(
        (total, event) =>
          total + event.value,
        0,
      );

  return {
    activities:
      sum('activity'),
    engagements:
      sum('engagement'),
    leads:
      sum('lead'),
    qualifiedLeads:
      sum('qualified_lead'),
    meetings:
      sum('meeting'),
    opportunities:
      sum('opportunity'),
    customers:
      sum('customer'),
    revenue:
      sum('revenue'),
    profit:
      sum('profit'),
  };
}

export function conversionRate(
  conversions: number,
  denominator: number,
  evidenceEventIds: string[] = [],
): MetricResult {
  return metric(
    'conversion_rate',
    denominator > 0
      ? (conversions /
          denominator) *
        100
      : 0,
    'ACTUAL',
    evidenceEventIds,
  );
}

export function cac(
  spend: number,
  newCustomers: number,
  currency = 'SAR',
  evidenceEventIds: string[] = [],
): MetricResult {
  return metric(
    'cac',
    newCustomers > 0
      ? spend / newCustomers
      : 0,
    'ACTUAL',
    evidenceEventIds,
    currency,
  );
}

export function roas(
  revenue: number,
  spend: number,
  evidenceEventIds: string[] = [],
): MetricResult {
  return metric(
    'roas',
    spend > 0
      ? revenue / spend
      : 0,
    'ACTUAL',
    evidenceEventIds,
  );
}

export function ltv(
  averageRevenuePerCustomer:
    number,
  grossMarginRate: number,
  expectedLifetime: number,
  currency = 'SAR',
  evidenceEventIds: string[] = [],
): MetricResult {
  return metric(
    'ltv',
    averageRevenuePerCustomer *
      grossMarginRate *
      expectedLifetime,
    'MODELED',
    evidenceEventIds,
    currency,
  );
}

export function weightedPipeline(
  opportunities: Array<{
    amount: number;
    probability: number;
    evidenceEventId?: string;
  }>,
  currency = 'SAR',
): MetricResult {
  return metric(
    'weighted_pipeline',
    opportunities.reduce(
      (sum, opportunity) =>
        sum +
        opportunity.amount *
          Math.min(
            1,
            Math.max(
              0,
              opportunity.probability,
            ),
          ),
      0,
    ),
    'ESTIMATED',
    opportunities
      .map(
        (opportunity) =>
          opportunity.evidenceEventId,
      )
      .filter(
        (
          id,
        ): id is string =>
          Boolean(id),
      ),
    currency,
  );
}

export function attributeRevenue(
  touches: AttributionTouch[],
  revenue: number,
  model: AttributionModel,
): AttributionResult[] {
  assertSameTenant(touches);

  if (
    touches.length === 0 ||
    revenue <= 0
  ) {
    return [];
  }

  const ordered = [
    ...touches,
  ].sort(
    (a, b) =>
      new Date(
        a.occurredAt,
      ).getTime() -
      new Date(
        b.occurredAt,
      ).getTime(),
  );

  let weights: number[];

  switch (model) {
    case 'FIRST_TOUCH':
      weights = ordered.map(
        (_, index) =>
          index === 0 ? 1 : 0,
      );
      break;

    case 'LAST_TOUCH':
      weights = ordered.map(
        (_, index) =>
          index ===
          ordered.length - 1
            ? 1
            : 0,
      );
      break;

    case 'LINEAR':
      weights = ordered.map(
        () => 1 / ordered.length,
      );
      break;

    case 'POSITION_BASED':
      if (
        ordered.length === 1
      ) {
        weights = [1];
      } else if (
        ordered.length === 2
      ) {
        weights = [0.5, 0.5];
      } else {
        const middleWeight =
          0.2 /
          (ordered.length - 2);

        weights = ordered.map(
          (_, index) =>
            index === 0 ||
            index ===
              ordered.length - 1
              ? 0.4
              : middleWeight,
        );
      }
      break;

    case 'TIME_DECAY':
      {
        const raw =
          ordered.map(
            (_, index) =>
              Math.pow(
                2,
                index,
              ),
          );

        const total =
          raw.reduce(
            (sum, value) =>
              sum + value,
            0,
          );

        weights =
          raw.map(
            (value) =>
              value / total,
          );
      }
      break;
  }

  const totalWeight =
    weights.reduce(
      (sum, value) =>
        sum + value,
      0,
    );

  return ordered.map(
    (touch, index) => {
      const weight =
        totalWeight > 0
          ? weights[index]! /
            totalWeight
          : 0;

      return {
        model,
        eventId:
          touch.eventId,
        attributedAmount:
          revenue * weight,
        weight,
      };
    },
  );
}

export function generateGrowthInsights(
  events: OutcomeEvent[],
): GrowthInsight[] {
  assertSameTenant(events);

  const funnel =
    buildFunnelSnapshot(events);

  const insights:
    GrowthInsight[] = [];

  if (
    funnel.leads > 0 &&
    funnel.qualifiedLeads === 0
  ) {
    insights.push({
      title:
        'Qualification bottleneck',
      diagnosis:
        'Leads are entering the funnel without recorded qualification outcomes.',
      recommendation:
        'Review ICP fit, lead scoring, qualification workflow and sales response SLA.',
      confidence: 0.78,
      evidenceEventIds:
        events
          .filter(
            (event) =>
              event.type ===
              'lead',
          )
          .map(
            (event) =>
              event.id,
          )
          .slice(0, 20),
    });
  }

  if (
    funnel.qualifiedLeads >
      0 &&
    funnel.opportunities ===
      0
  ) {
    insights.push({
      title:
        'Pipeline conversion bottleneck',
      diagnosis:
        'Qualified leads are not producing recorded opportunities.',
      recommendation:
        'Review handoff acceptance, discovery quality, offer fit and follow-up timing.',
      confidence: 0.82,
      evidenceEventIds:
        events
          .filter(
            (event) =>
              event.type ===
                'qualified_lead' ||
              event.type ===
                'meeting',
          )
          .map(
            (event) =>
              event.id,
          )
          .slice(0, 20),
    });
  }

  if (
    funnel.opportunities >
      0 &&
    funnel.customers === 0
  ) {
    insights.push({
      title:
        'Late-stage conversion bottleneck',
      diagnosis:
        'Opportunities exist without recorded customer conversion.',
      recommendation:
        'Review proposal quality, objections, pricing, competition and close-plan discipline.',
      confidence: 0.75,
      evidenceEventIds:
        events
          .filter(
            (event) =>
              event.type ===
              'opportunity',
          )
          .map(
            (event) =>
              event.id,
          )
          .slice(0, 20),
    });
  }

  return insights;
}

export function generateGrowthRecommendations(
  input: GrowthInput,
  thresholds:
    GrowthThresholds =
      DEFAULT_GROWTH_THRESHOLDS,
): GrowthRecommendation[] {
  assertTenantId(
    input.tenantId,
  );

  const output:
    GrowthRecommendation[] = [];

  const leadToOpportunity =
    input.leads > 0
      ? input.opportunities /
        input.leads
      : 0;

  const winRate =
    input.opportunities > 0
      ? input.wonDeals /
        input.opportunities
      : 0;

  const currentRoas =
    input.spend > 0
      ? input.revenue /
        input.spend
      : 0;

  if (
    input.spend > 0 &&
    input.revenue > 0 &&
    currentRoas <
      thresholds.minimumRoas
  ) {
    output.push({
      title:
        'Review paid acquisition efficiency',
      finding:
        `ROAS is below the configured ${thresholds.minimumRoas.toFixed(2)}x review threshold.`,
      evidence: [
        `Revenue=${input.revenue}`,
        `Spend=${input.spend}`,
        ...(input
          .evidenceEventIds ??
        []),
      ],
      recommendation:
        'Review campaign, creative and audience performance before increasing spend.',
      expectedImpact:
        'Potential reduction in inefficient acquisition spend.',
      risk:
        'Reducing spend too quickly may reduce pipeline volume.',
      priority: 'HIGH',
    });
  }

  if (
    input.leads > 0 &&
    leadToOpportunity <
      thresholds.minimumLeadToOpportunityRate
  ) {
    output.push({
      title:
        'Improve lead qualification',
      finding:
        `Lead-to-opportunity conversion is below ${(thresholds.minimumLeadToOpportunityRate * 100).toFixed(1)}%.`,
      evidence: [
        `Leads=${input.leads}`,
        `Opportunities=${input.opportunities}`,
        ...(input
          .evidenceEventIds ??
        []),
      ],
      recommendation:
        'Review ICP, lead scoring and sales follow-up before increasing top-of-funnel volume.',
      expectedImpact:
        'Higher pipeline efficiency without requiring proportional lead growth.',
      risk:
        'Stricter qualification can reduce reported lead volume.',
      priority: 'HIGH',
    });
  }

  if (
    input.opportunities > 0 &&
    winRate <
      thresholds.minimumWinRate
  ) {
    output.push({
      title:
        'Strengthen opportunity conversion',
      finding:
        `Opportunity win rate is below ${(thresholds.minimumWinRate * 100).toFixed(1)}%.`,
      evidence: [
        `Opportunities=${input.opportunities}`,
        `Won=${input.wonDeals}`,
        ...(input
          .evidenceEventIds ??
        []),
      ],
      recommendation:
        'Analyze objections, decision-maker access, proposal quality and next-best actions.',
      expectedImpact:
        'Higher revenue from the existing pipeline.',
      risk:
        'Process changes may temporarily increase sales-cycle time.',
      priority:
        'MEDIUM',
    });
  }

  if (
    input.previousRevenue !==
      undefined &&
    input.revenue <
      input.previousRevenue
  ) {
    output.push({
      title:
        'Investigate revenue decline',
      finding:
        'Current revenue is below the comparison period.',
      evidence: [
        `Current=${input.revenue}`,
        `Previous=${input.previousRevenue}`,
        ...(input
          .evidenceEventIds ??
        []),
      ],
      recommendation:
        'Trace the decline from channel → lead → opportunity → won revenue before changing campaigns.',
      expectedImpact:
        'Faster identification of the actual growth constraint.',
      risk:
        'Period comparisons can be misleading when periods have different seasonality.',
      priority:
        'CRITICAL',
    });
  }

  return output;
}

export interface ExperimentVariantMeasurement {
  variantId: string;
  sampleSize: number;
  metricValue: number;
  evidenceEventIds?: string[];
}

export interface ExperimentEvaluationInput {
  tenantId: string;
  experimentId: string;
  metric: string;
  variants: ExperimentVariantMeasurement[];
  minimumSampleSize?: number;
  minimumRelativeLift?: number;
}

export interface ExperimentEvaluationResult {
  experimentId: string;
  tenantId: string;
  metric: string;
  status: 'won' | 'lost' | 'inconclusive';
  winningVariantId?: string;
  confidence: number;
  rationale: string;
  evidenceIds: string[];
  evaluatedAt: string;
}

export function evaluateExperiment(
  input: ExperimentEvaluationInput,
): ExperimentEvaluationResult {
  assertTenantId(input.tenantId);

  const minimumSampleSize =
    input.minimumSampleSize ?? 30;

  const minimumRelativeLift =
    input.minimumRelativeLift ?? 0.05;

  const evidenceIds = [
    ...new Set(
      input.variants.flatMap(
        (variant) =>
          variant.evidenceEventIds ?? [],
      ),
    ),
  ];

  if (input.variants.length < 2) {
    return {
      experimentId: input.experimentId,
      tenantId: input.tenantId,
      metric: input.metric,
      status: 'inconclusive',
      confidence: 0,
      rationale:
        'At least two variants are required for experiment evaluation.',
      evidenceIds,
      evaluatedAt: new Date().toISOString(),
    };
  }

  const eligible =
    input.variants.filter(
      (variant) =>
        variant.sampleSize >=
        minimumSampleSize,
    );

  if (eligible.length < 2) {
    return {
      experimentId: input.experimentId,
      tenantId: input.tenantId,
      metric: input.metric,
      status: 'inconclusive',
      confidence: 0.25,
      rationale:
        'Insufficient sample size across experiment variants.',
      evidenceIds,
      evaluatedAt: new Date().toISOString(),
    };
  }

  const ranked = [
    ...eligible,
  ].sort(
    (a, b) =>
      b.metricValue -
      a.metricValue,
  );

  const winner = ranked[0]!;
  const runnerUp = ranked[1]!;

  const denominator =
    Math.abs(runnerUp.metricValue);

  const relativeLift =
    denominator > 0
      ? (
          winner.metricValue -
          runnerUp.metricValue
        ) / denominator
      : winner.metricValue >
        runnerUp.metricValue
        ? 1
        : 0;

  if (
    relativeLift <
    minimumRelativeLift
  ) {
    return {
      experimentId: input.experimentId,
      tenantId: input.tenantId,
      metric: input.metric,
      status: 'inconclusive',
      confidence: 0.5,
      rationale:
        'Observed difference is below the configured minimum relative lift threshold.',
      evidenceIds,
      evaluatedAt: new Date().toISOString(),
    };
  }

  const confidence =
    Math.min(
      0.95,
      0.6 +
        Math.min(
          0.25,
          relativeLift,
        ) +
        Math.min(
          0.1,
          Math.min(
            winner.sampleSize,
            runnerUp.sampleSize,
          ) / 1000,
        ),
    );

  return {
    experimentId: input.experimentId,
    tenantId: input.tenantId,
    metric: input.metric,
    status: 'won',
    winningVariantId:
      winner.variantId,
    confidence,
    rationale:
      `Variant ${winner.variantId} exceeded the next-best eligible variant by ${(relativeLift * 100).toFixed(2)}%.`,
    evidenceIds,
    evaluatedAt:
      new Date().toISOString(),
  };
}
