import type {
  ClientProfitabilityAssessment,
  FinancialScenarioResult,
  FinancialForecastResult,
  CFORecommendation,
} from "@platform/contracts";

export interface CFOStoreDatabase {
  insert: (...args: any[]) => any;
  select: (...args: any[]) => any;
}

function assertTenant(
  requestedTenantId: string,
  resourceTenantId: string,
): void {
  if (!requestedTenantId.trim()) {
    throw new Error(
      "tenantId is required",
    );
  }

  if (
    requestedTenantId !==
    resourceTenantId
  ) {
    throw new Error(
      "Cross-tenant CFO access denied",
    );
  }
}

export class PersistentCFOStore {
  constructor(
    private readonly db:
      CFOStoreDatabase,
  ) {}

  async saveProfitability(
    tenantId: string,
    assessment:
      ClientProfitabilityAssessment,
  ): Promise<void> {
    assertTenant(
      tenantId,
      assessment.tenantId,
    );

    await this.db.insert(
      "client_profitability_assessments",
      {
        tenantId:
          assessment.tenantId,
        customerId:
          assessment.customerId,
        accountId:
          assessment.accountId ??
          null,
        periodStart:
          new Date(
            assessment.periodStart,
          ),
        periodEnd:
          new Date(
            assessment.periodEnd,
          ),
        revenue:
          assessment.revenue,
        directCost:
          assessment.directCost,
        grossContribution:
          assessment.grossContribution,
        grossMarginPct:
          assessment.grossMarginPct,
        operatingExpense:
          assessment.operatingExpense ??
          null,
        operatingContribution:
          assessment.operatingContribution ??
          null,
        evidenceIds:
          assessment.evidenceIds,
        model:
          assessment.model,
      },
    );
  }

  async saveScenario(
    tenantId: string,
    scenario:
      FinancialScenarioResult,
  ): Promise<void> {
    assertTenant(
      tenantId,
      scenario.tenantId,
    );

    await this.db.insert(
      "financial_scenario_snapshots",
      {
        tenantId:
          scenario.tenantId,
        customerId:
          scenario.customerId ??
          null,
        projectedRevenue:
          scenario.projectedRevenue,
        projectedVariableCost:
          scenario.projectedVariableCost,
        projectedFixedCost:
          scenario.projectedFixedCost,
        projectedContribution:
          scenario.projectedContribution,
        projectedMarginPct:
          scenario.projectedMarginPct,
        breakEvenRevenue:
          scenario.breakEvenRevenue ??
          null,
        evidenceIds:
          scenario.evidenceIds,
        model:
          scenario.model,
      },
    );
  }

  async saveForecast(
    tenantId: string,
    forecast: FinancialForecastResult,
  ): Promise<void> {
    assertTenant(tenantId, forecast.tenantId);

    await this.db.insert(
      'financial_forecast_snapshots',
      {
        tenantId: forecast.tenantId,
        customerId: forecast.customerId ?? null,
        period: forecast.period,
        periodStart: new Date(forecast.periodStart),
        periodEnd: new Date(forecast.periodEnd),
        actualRevenue: forecast.actualRevenue,
        pipelineAmount: forecast.pipelineAmount,
        weightedPipelineAmount: forecast.weightedPipelineAmount,
        forecastRevenue: forecast.forecastRevenue,
        opportunityCount: forecast.opportunityCount,
        stageSummaries: forecast.stageSummaries,
        confidence: forecast.confidence,
        evidenceIds: forecast.evidenceIds,
        model: forecast.model,
      },
    );
  }

  async saveRecommendation(
    tenantId: string,
    recommendation:
      CFORecommendation,
  ): Promise<void> {
    assertTenant(
      tenantId,
      recommendation.tenantId,
    );

    await this.db.insert(
      "cfo_recommendations",
      {
        id:
          recommendation.id,
        tenantId:
          recommendation.tenantId,
        customerId:
          recommendation.customerId ??
          null,
        type:
          recommendation.type,
        priority:
          recommendation.priority,
        title:
          recommendation.title,
        rationale:
          recommendation.rationale,
        action:
          recommendation.action,
        confidence:
          recommendation.confidence,
        evidenceIds:
          recommendation.evidenceIds,
        requiresApproval:
          recommendation.requiresApproval,
      },
    );
  }
}
