import test from "node:test";
import assert from "node:assert/strict";

import {
  assessClientProfitability,
  buildFinancialForecast,
  modelFinancialScenario,
  generateCFORecommendations,
  assertFinancialTenant,
  type FinancialAmount,
} from "./index.js";

const actual = (
  value: number,
  evidenceId: string,
): FinancialAmount => ({
  value,
  currency: "SAR",
  status: "ACTUAL",
  evidenceIds: [evidenceId],
});

test(
  "calculates client profitability from direct costs only",
  () => {
    const result = assessClientProfitability({
      tenantId: "tenant-a",
      customerId: "customer-1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      revenue: actual(100000, "rev-1"),
      aiCost: actual(5000, "ai-1"),
      toolCost: actual(5000, "tool-1"),
      deliveryCost: actual(20000, "delivery-1"),
      otherDirectCost: actual(10000, "other-1"),
      operatingExpense: actual(30000, "opex-1"),
    });

    assert.equal(
      result.directCost.value,
      40000,
    );

    assert.equal(
      result.grossContribution.value,
      60000,
    );

    assert.equal(
      result.grossMarginPct.value,
      60,
    );

    assert.equal(
      result.operatingContribution?.value,
      30000,
    );
  },
);

test(
  "derived status preserves estimated financial provenance",
  () => {
    const result = assessClientProfitability({
      tenantId: "tenant-a",
      customerId: "customer-1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      revenue: actual(100000, "rev-1"),
      aiCost: {
        value: 5000,
        currency: "SAR",
        status: "ESTIMATED",
        evidenceIds: ["ai-estimate"],
      },
      toolCost: actual(5000, "tool-1"),
      deliveryCost: actual(20000, "delivery-1"),
      otherDirectCost: actual(10000, "other-1"),
    });

    assert.equal(
      result.directCost.status,
      "ESTIMATED",
    );

    assert.equal(
      result.grossContribution.status,
      "ESTIMATED",
    );
  },
);

test(
  "financial scenario values are always modeled",
  () => {
    const result = modelFinancialScenario({
      tenantId: "tenant-a",
      customerId: "customer-1",
      currency: "SAR",
      baselineRevenue: actual(
        100000,
        "baseline-revenue",
      ),
      baselineVariableCost: actual(
        40000,
        "baseline-variable",
      ),
      baselineFixedCost: actual(
        20000,
        "baseline-fixed",
      ),
      priceChangePct: 10,
      volumeChangePct: 10,
      variableCostChangePct: 0,
    });

    assert.equal(
      result.projectedRevenue.status,
      "MODELED",
    );

    assert.equal(
      result.projectedContribution.status,
      "MODELED",
    );

    assert.ok(
      result.breakEvenRevenue !== undefined,
    );
  },
);

test(
  "builds a deterministic period forecast from recorded pipeline and actual evidence",
  () => {
    const input = {
      tenantId: "tenant-a",
      customerId: "customer-1",
      period: "MONTH" as const,
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-08-31T23:59:59.999Z",
      currency: "SAR",
      actualRevenue: [{
        occurredAt: "2026-08-05T10:00:00.000Z",
        amount: actual(10000, "invoice-aug-1"),
      }],
      opportunities: [
        {
          id: "opp-proposal",
          tenantId: "tenant-a",
          name: "Proposal opportunity",
          stage: "proposal" as const,
          expectedCloseAt: "2026-08-20T00:00:00.000Z",
          amount: {
            value: 50000,
            currency: "SAR",
            status: "ESTIMATED" as const,
            evidenceIds: ["crm-opp-proposal"],
          },
        },
        {
          id: "opp-negotiation",
          tenantId: "tenant-a",
          name: "Negotiation opportunity",
          stage: "negotiation" as const,
          expectedCloseAt: "2026-08-28T00:00:00.000Z",
          probability: 0.9,
          amount: {
            value: 20000,
            currency: "SAR",
            status: "ESTIMATED" as const,
            evidenceIds: ["crm-opp-negotiation"],
          },
        },
        {
          id: "opp-outside-period",
          tenantId: "tenant-a",
          name: "September opportunity",
          stage: "proposal" as const,
          expectedCloseAt: "2026-09-01T00:00:00.000Z",
          amount: {
            value: 99999,
            currency: "SAR",
            status: "ESTIMATED" as const,
            evidenceIds: ["crm-september"],
          },
        },
      ],
    };

    const first = buildFinancialForecast(input);
    const second = buildFinancialForecast(input);

    assert.deepEqual(first, second);
    assert.equal(first.actualRevenue.value, 10000);
    assert.equal(first.actualRevenue.status, "ACTUAL");
    assert.equal(first.pipelineAmount.value, 70000);
    assert.equal(first.weightedPipelineAmount.value, 48000);
    assert.equal(first.weightedPipelineAmount.status, "ESTIMATED");
    assert.equal(first.forecastRevenue.value, 58000);
    assert.equal(first.forecastRevenue.status, "ESTIMATED");
    assert.equal(first.opportunityCount, 2);
    assert.deepEqual(first.evidenceIds, [
      "invoice-aug-1",
      "crm-opp-proposal",
      "crm-opp-negotiation",
    ]);
    assert.equal(first.stageSummaries[0]?.probability, 0.6);
    assert.equal(first.stageSummaries[1]?.probability, 0.9);
  },
);

test(
  "financial forecast fails closed for cross-tenant pipeline or non-actual revenue",
  () => {
    const base = {
      tenantId: "tenant-a",
      period: "MONTH" as const,
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-08-31T23:59:59.999Z",
      currency: "SAR",
      opportunities: [{
        id: "opp-b",
        tenantId: "tenant-b",
        name: "Cross tenant",
        stage: "qualified" as const,
        expectedCloseAt: "2026-08-10T00:00:00.000Z",
        amount: actual(1000, "crm-b"),
      }],
    };

    assert.throws(
      () => buildFinancialForecast(base),
      /Cross-tenant/,
    );

    assert.throws(
      () =>
        buildFinancialForecast({
          ...base,
          opportunities: [],
          actualRevenue: [{
            occurredAt: "2026-08-10T00:00:00.000Z",
            amount: {
              ...actual(1000, "estimate"),
              status: "ESTIMATED",
            },
          }],
        }),
      /ACTUAL provenance/,
    );
  },
);

test(
  "negative margin creates high-priority recommendation",
  () => {
    const profitability =
      assessClientProfitability({
        tenantId: "tenant-a",
        customerId: "customer-loss",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        revenue: actual(30000, "rev-loss"),
        aiCost: actual(10000, "ai-loss"),
        toolCost: actual(10000, "tool-loss"),
        deliveryCost: actual(
          15000,
          "delivery-loss",
        ),
        otherDirectCost: actual(
          5000,
          "other-loss",
        ),
      });

    const recommendations =
      generateCFORecommendations(
        profitability,
      );

    assert.equal(
      recommendations[0]?.priority,
      "HIGH",
    );

    assert.equal(
      recommendations[0]?.requiresApproval,
      true,
    );
  },
);

test(
  "financial access is tenant isolated",
  () => {
    assert.throws(
      () =>
        assertFinancialTenant(
          "tenant-a",
          "tenant-b",
        ),
      /Cross-tenant/,
    );
  },
);
