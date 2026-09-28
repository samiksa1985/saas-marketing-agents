export type FinancialStatus =
  | "ACTUAL"
  | "ESTIMATED"
  | "MODELED";

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
  model: "canonical-client-profitability-v1";
}

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
  model: "canonical-financial-scenario-v1";
}

export type CFORecommendationPriority =
  | "HIGH"
  | "MEDIUM"
  | "LOW";

export type CFORecommendationType =
  | "MARGIN"
  | "COST"
  | "PRICING"
  | "FORECAST"
  | "RETENTION"
  | "GROWTH";

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

import {
  DEFAULT_OPPORTUNITY_STAGE_PROBABILITIES,
  type FinancialForecastInput,
  type FinancialForecastResult,
  type FinancialForecastStageSummary,
} from '@platform/contracts';

export type {
  FinancialForecastInput,
  FinancialForecastResult,
  FinancialForecastStageSummary,
} from '@platform/contracts';

function normalizeMoney(
  amount: FinancialAmount,
): FinancialAmount {
  if (!Number.isFinite(amount.value)) {
    throw new Error("Financial amount must be finite");
  }

  if (!amount.currency.trim()) {
    throw new Error("Financial amount currency is required");
  }

  return {
    value: amount.value,
    currency: amount.currency,
    status: amount.status,
    evidenceIds: [...new Set(amount.evidenceIds)],
  };
}

function assertSameCurrency(
  amounts: FinancialAmount[],
): string {
  const currencies =
    [...new Set(amounts.map((item) => item.currency))];

  if (currencies.length !== 1) {
    throw new Error(
      "Financial values must use the same currency",
    );
  }

  return currencies[0]!;
}

function deriveStatus(
  amounts: FinancialAmount[],
): FinancialStatus {
  if (amounts.some((item) => item.status === "MODELED")) {
    return "MODELED";
  }

  if (amounts.some((item) => item.status === "ESTIMATED")) {
    return "ESTIMATED";
  }

  return "ACTUAL";
}

function collectEvidence(
  amounts: FinancialAmount[],
): string[] {
  return [
    ...new Set(
      amounts.flatMap((item) => item.evidenceIds),
    ),
  ];
}

function derivedAmount(
  value: number,
  currency: string,
  inputs: FinancialAmount[],
  forcedStatus?: FinancialStatus,
): FinancialAmount {
  return {
    value,
    currency,
    status: forcedStatus ?? deriveStatus(inputs),
    evidenceIds: collectEvidence(inputs),
  };
}

export function assessClientProfitability(
  input: ClientProfitabilityInput,
): ClientProfitabilityAssessment {
  if (!input.tenantId.trim()) {
    throw new Error("tenantId is required");
  }

  if (!input.customerId.trim()) {
    throw new Error("customerId is required");
  }

  const revenue = normalizeMoney(input.revenue);
  const aiCost = normalizeMoney(input.aiCost);
  const toolCost = normalizeMoney(input.toolCost);
  const deliveryCost = normalizeMoney(input.deliveryCost);
  const otherDirectCost =
    normalizeMoney(input.otherDirectCost);

  const directInputs = [
    aiCost,
    toolCost,
    deliveryCost,
    otherDirectCost,
  ];

  const currency = assertSameCurrency([
    revenue,
    ...directInputs,
  ]);

  const directCostValue =
    directInputs.reduce(
      (sum, item) => sum + item.value,
      0,
    );

  const directCost =
    derivedAmount(
      directCostValue,
      currency,
      directInputs,
    );

  const grossContribution =
    derivedAmount(
      revenue.value - directCost.value,
      currency,
      [revenue, directCost],
    );

  const grossMarginPct =
    derivedAmount(
      revenue.value === 0
        ? 0
        : (grossContribution.value / revenue.value) * 100,
      "%",
      [revenue, grossContribution],
    );

  const evidenceIds = collectEvidence([
    revenue,
    directCost,
  ]);

  const output: ClientProfitabilityAssessment = {
    tenantId: input.tenantId,
    customerId: input.customerId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    revenue,
    directCost,
    grossContribution,
    grossMarginPct,
    evidenceIds,
    model: "canonical-client-profitability-v1",
  };

  if (input.accountId !== undefined) {
    output.accountId = input.accountId;
  }

  if (input.operatingExpense !== undefined) {
    const operatingExpense =
      normalizeMoney(input.operatingExpense);

    assertSameCurrency([
      revenue,
      operatingExpense,
    ]);

    output.operatingExpense = operatingExpense;

    output.operatingContribution =
      derivedAmount(
        grossContribution.value -
          operatingExpense.value,
        currency,
        [
          grossContribution,
          operatingExpense,
        ],
      );
  }

  return output;
}

export function modelFinancialScenario(
  input: FinancialScenarioInput,
): FinancialScenarioResult {
  if (!input.tenantId.trim()) {
    throw new Error("tenantId is required");
  }

  const baselineRevenue =
    normalizeMoney(input.baselineRevenue);

  const baselineVariableCost =
    normalizeMoney(input.baselineVariableCost);

  const baselineFixedCost =
    normalizeMoney(input.baselineFixedCost);

  const currency = assertSameCurrency([
    baselineRevenue,
    baselineVariableCost,
    baselineFixedCost,
  ]);

  if (currency !== input.currency) {
    throw new Error(
      "Scenario currency does not match baseline values",
    );
  }

  const projectedRevenueValue =
    baselineRevenue.value *
    (1 + input.priceChangePct / 100) *
    (1 + input.volumeChangePct / 100);

  const projectedVariableCostValue =
    Math.max(
      0,
      baselineVariableCost.value *
        (1 + input.volumeChangePct / 100) *
        (1 + input.variableCostChangePct / 100),
    );

  const projectedFixedCostValue =
    Math.max(
      0,
      baselineFixedCost.value *
        (
          1 +
          (input.fixedCostChangePct ?? 0) / 100
        ),
    );

  const sourceAmounts = [
    baselineRevenue,
    baselineVariableCost,
    baselineFixedCost,
  ];

  const projectedRevenue =
    derivedAmount(
      projectedRevenueValue,
      currency,
      sourceAmounts,
      "MODELED",
    );

  const projectedVariableCost =
    derivedAmount(
      projectedVariableCostValue,
      currency,
      sourceAmounts,
      "MODELED",
    );

  const projectedFixedCost =
    derivedAmount(
      projectedFixedCostValue,
      currency,
      sourceAmounts,
      "MODELED",
    );

  const projectedContribution =
    derivedAmount(
      projectedRevenueValue -
        projectedVariableCostValue -
        projectedFixedCostValue,
      currency,
      sourceAmounts,
      "MODELED",
    );

  const projectedMarginPct =
    derivedAmount(
      projectedRevenueValue === 0
        ? 0
        : (
            projectedContribution.value /
            projectedRevenueValue
          ) * 100,
      "%",
      sourceAmounts,
      "MODELED",
    );

  const variableCostRatio =
    projectedRevenueValue <= 0
      ? 0
      : projectedVariableCostValue /
        projectedRevenueValue;

  const output: FinancialScenarioResult = {
    tenantId: input.tenantId,
    projectedRevenue,
    projectedVariableCost,
    projectedFixedCost,
    projectedContribution,
    projectedMarginPct,
    evidenceIds: collectEvidence(sourceAmounts),
    model: "canonical-financial-scenario-v1",
  };

  if (input.customerId !== undefined) {
    output.customerId = input.customerId;
  }

  if (
    projectedFixedCostValue > 0 &&
    variableCostRatio < 1
  ) {
    output.breakEvenRevenue =
      derivedAmount(
        projectedFixedCostValue /
          (1 - variableCostRatio),
        currency,
        sourceAmounts,
        "MODELED",
      );
  }

  return output;
}

function dateInForecastPeriod(
  value: string,
  periodStart: number,
  periodEnd: number,
  label: string,
): boolean {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} must be a valid date`);
  }

  return timestamp >= periodStart && timestamp <= periodEnd;
}

function forecastDerivedAmount(
  value: number,
  currency: string,
  inputs: FinancialAmount[],
  status: FinancialStatus,
): FinancialAmount {
  return {
    value: Math.round(value * 100) / 100,
    currency,
    status,
    evidenceIds: collectEvidence(inputs),
  };
}

/**
 * Builds a deterministic, period-bound CFO forecast from recorded pipeline and
 * actual revenue evidence. It intentionally does not model price, volume, or
 * cost-change assumptions: those remain the responsibility of
 * modelFinancialScenario.
 */
export function buildFinancialForecast(
  input: FinancialForecastInput,
): FinancialForecastResult {
  if (!input.tenantId.trim()) {
    throw new Error('tenantId is required');
  }

  if (!input.currency.trim()) {
    throw new Error('Forecast currency is required');
  }

  const periodStart = Date.parse(input.periodStart);
  const periodEnd = Date.parse(input.periodEnd);

  if (
    !Number.isFinite(periodStart) ||
    !Number.isFinite(periodEnd) ||
    periodStart > periodEnd
  ) {
    throw new Error('Forecast period is invalid');
  }

  const actualRevenue = (input.actualRevenue ?? []).filter((entry) => {
    if (entry.amount.status !== 'ACTUAL') {
      throw new Error('Actual revenue must use ACTUAL provenance');
    }

    const amount = normalizeMoney(entry.amount);

    if (amount.currency !== input.currency) {
      throw new Error('Forecast values must use the forecast currency');
    }

    return dateInForecastPeriod(
      entry.occurredAt,
      periodStart,
      periodEnd,
      'Actual revenue date',
    );
  });

  const eligibleOpportunities = input.opportunities.filter((opportunity) => {
    if (opportunity.tenantId !== input.tenantId) {
      throw new Error('Cross-tenant opportunity access denied');
    }

    const amount = normalizeMoney(opportunity.amount);

    if (amount.currency !== input.currency) {
      throw new Error('Forecast values must use the forecast currency');
    }

    if (
      opportunity.probability !== undefined &&
      (!Number.isFinite(opportunity.probability) ||
        opportunity.probability < 0 ||
        opportunity.probability > 1)
    ) {
      throw new Error('Opportunity probability must be between 0 and 1');
    }

    if (opportunity.stage === 'won' || opportunity.stage === 'lost') {
      return false;
    }

    return dateInForecastPeriod(
      opportunity.expectedCloseAt,
      periodStart,
      periodEnd,
      'Opportunity expected close date',
    );
  });

  const actualAmounts = actualRevenue.map((entry) =>
    normalizeMoney(entry.amount),
  );
  const pipelineAmounts = eligibleOpportunities.map((opportunity) =>
    normalizeMoney(opportunity.amount),
  );
  const weightedSourceAmounts = pipelineAmounts;

  const actualRevenueValue = actualAmounts.reduce(
    (sum, amount) => sum + amount.value,
    0,
  );
  const pipelineAmountValue = pipelineAmounts.reduce(
    (sum, amount) => sum + amount.value,
    0,
  );
  const weightedPipelineValue = eligibleOpportunities.reduce(
    (sum, opportunity) => {
      const probability =
        opportunity.probability ??
        DEFAULT_OPPORTUNITY_STAGE_PROBABILITIES[opportunity.stage];

      return sum + opportunity.amount.value * probability;
    },
    0,
  );

  const forecastPipelineStatus: FinancialStatus =
    weightedSourceAmounts.some((amount) => amount.status === 'MODELED')
      ? 'MODELED'
      : 'ESTIMATED';
  const pipelineStatus: FinancialStatus =
    pipelineAmounts.length === 0
      ? 'ESTIMATED'
      : deriveStatus(pipelineAmounts);

  const byStage = new Map<
    FinancialForecastStageSummary['stage'],
    typeof eligibleOpportunities
  >();

  for (const opportunity of eligibleOpportunities) {
    const current = byStage.get(opportunity.stage) ?? [];
    current.push(opportunity);
    byStage.set(opportunity.stage, current);
  }

  const stageOrder: FinancialForecastStageSummary['stage'][] = [
    'prospecting',
    'qualified',
    'proposal',
    'negotiation',
  ];

  const stageSummaries = stageOrder.flatMap((stage) => {
    const opportunities = byStage.get(stage) ?? [];

    if (opportunities.length === 0) {
      return [];
    }

    const amounts = opportunities.map((opportunity) =>
      normalizeMoney(opportunity.amount),
    );
    const pipeline = amounts.reduce(
      (sum, amount) => sum + amount.value,
      0,
    );
    const weighted = opportunities.reduce(
      (sum, opportunity) =>
        sum +
        opportunity.amount.value *
          (opportunity.probability ??
            DEFAULT_OPPORTUNITY_STAGE_PROBABILITIES[stage]),
      0,
    );

    return [{
      stage,
      probability:
        pipeline === 0 ? 0 : Math.round((weighted / pipeline) * 10_000) / 10_000,
      opportunityCount: opportunities.length,
      pipelineAmount: forecastDerivedAmount(
        pipeline,
        input.currency,
        amounts,
        deriveStatus(amounts),
      ),
      weightedAmount: forecastDerivedAmount(
        weighted,
        input.currency,
        amounts,
        amounts.some((amount) => amount.status === 'MODELED')
          ? 'MODELED'
          : 'ESTIMATED',
      ),
      evidenceIds: collectEvidence(amounts),
    }];
  });

  const evidenceInputs = [...actualAmounts, ...pipelineAmounts];
  const evidenceCovered = evidenceInputs.filter(
    (amount) => amount.evidenceIds.length > 0,
  ).length;
  const confidence = Math.round(
    Math.min(
      100,
      (actualAmounts.length > 0 ? 20 : 0) +
        Math.min(30, eligibleOpportunities.length * 6) +
        (evidenceInputs.length === 0
          ? 0
          : (evidenceCovered / evidenceInputs.length) * 30) +
        (eligibleOpportunities.length > 0 ? 20 : 0),
    ),
  );

  const output: FinancialForecastResult = {
    tenantId: input.tenantId,
    period: input.period,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    actualRevenue: forecastDerivedAmount(
      actualRevenueValue,
      input.currency,
      actualAmounts,
      'ACTUAL',
    ),
    pipelineAmount: forecastDerivedAmount(
      pipelineAmountValue,
      input.currency,
      pipelineAmounts,
      pipelineStatus,
    ),
    weightedPipelineAmount: forecastDerivedAmount(
      weightedPipelineValue,
      input.currency,
      weightedSourceAmounts,
      forecastPipelineStatus,
    ),
    forecastRevenue: forecastDerivedAmount(
      actualRevenueValue + weightedPipelineValue,
      input.currency,
      [...actualAmounts, ...weightedSourceAmounts],
      forecastPipelineStatus === 'MODELED' ? 'MODELED' : 'ESTIMATED',
    ),
    opportunityCount: eligibleOpportunities.length,
    stageSummaries,
    confidence,
    evidenceIds: collectEvidence(evidenceInputs),
    model: 'canonical-financial-forecast-v1',
  };

  if (input.customerId !== undefined) {
    output.customerId = input.customerId;
  }

  return output;
}

export function generateCFORecommendations(
  profitability: ClientProfitabilityAssessment,
): CFORecommendation[] {
  const recommendations: CFORecommendation[] = [];

  const margin =
    profitability.grossMarginPct.value;

  if (margin < 0) {
    recommendations.push({
      id:
        `cfo:${profitability.customerId}:` +
        "negative-margin",
      tenantId: profitability.tenantId,
      customerId: profitability.customerId,
      type: "MARGIN",
      priority: "HIGH",
      title: "Negative client contribution",
      rationale:
        "Direct delivery costs exceed client revenue.",
      action:
        "Review pricing, AI/tool consumption, delivery effort, and other direct costs before renewal or expansion.",
      confidence: 0.95,
      evidenceIds: profitability.evidenceIds,
      requiresApproval: true,
    });
  } else if (margin < 20) {
    recommendations.push({
      id:
        `cfo:${profitability.customerId}:` +
        "low-margin",
      tenantId: profitability.tenantId,
      customerId: profitability.customerId,
      type: "MARGIN",
      priority: "HIGH",
      title: "Low client gross margin",
      rationale:
        "Client gross margin is below the operating threshold used by the intelligence engine.",
      action:
        "Evaluate pricing, package scope, delivery cost, and tool consumption.",
      confidence: 0.85,
      evidenceIds: profitability.evidenceIds,
      requiresApproval: true,
    });
  } else if (margin < 35) {
    recommendations.push({
      id:
        `cfo:${profitability.customerId}:` +
        "margin-watch",
      tenantId: profitability.tenantId,
      customerId: profitability.customerId,
      type: "MARGIN",
      priority: "MEDIUM",
      title: "Margin optimization opportunity",
      rationale:
        "Client contribution is positive but has limited margin headroom.",
      action:
        "Monitor delivery efficiency and identify cost or pricing improvements.",
      confidence: 0.75,
      evidenceIds: profitability.evidenceIds,
      requiresApproval: true,
    });
  }

  return recommendations;
}

export function assertFinancialTenant(
  tenantId: string,
  resourceTenantId: string,
): void {
  if (!tenantId.trim()) {
    throw new Error("tenantId is required");
  }

  if (tenantId !== resourceTenantId) {
    throw new Error(
      "Cross-tenant financial access denied",
    );
  }
}
