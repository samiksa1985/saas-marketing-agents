import test from "node:test";
import assert from "node:assert/strict";

import {
  PersistentCFOStore,
} from "./cfo.js";

const failDb = {
  insert: async () => {
    throw new Error(
      "DB SHOULD NOT BE CALLED",
    );
  },
  select: async () => {
    throw new Error(
      "DB SHOULD NOT BE CALLED",
    );
  },
};

test(
  "profitability persistence rejects cross tenant before database access",
  async () => {
    const store =
      new PersistentCFOStore(
        failDb,
      );

    await assert.rejects(
      () =>
        store.saveProfitability(
          "tenant-a",
          {
            tenantId:
              "tenant-b",
            customerId:
              "customer-1",
            periodStart:
              "2026-08-01",
            periodEnd:
              "2026-08-31",
            revenue: {
              value: 100,
              currency: "SAR",
              status: "ACTUAL",
              evidenceIds: [],
            },
            directCost: {
              value: 50,
              currency: "SAR",
              status: "ACTUAL",
              evidenceIds: [],
            },
            grossContribution: {
              value: 50,
              currency: "SAR",
              status: "ACTUAL",
              evidenceIds: [],
            },
            grossMarginPct: {
              value: 50,
              currency: "%",
              status: "ACTUAL",
              evidenceIds: [],
            },
            evidenceIds: [],
            model:
              "canonical-client-profitability-v1",
          },
        ),
      /Cross-tenant/,
    );
  },
);

test(
  "scenario persistence rejects cross tenant before database access",
  async () => {
    const store =
      new PersistentCFOStore(
        failDb,
      );

    await assert.rejects(
      () =>
        store.saveScenario(
          "tenant-a",
          {
            tenantId:
              "tenant-b",
            projectedRevenue: {
              value: 100,
              currency: "SAR",
              status: "MODELED",
              evidenceIds: [],
            },
            projectedVariableCost: {
              value: 30,
              currency: "SAR",
              status: "MODELED",
              evidenceIds: [],
            },
            projectedFixedCost: {
              value: 20,
              currency: "SAR",
              status: "MODELED",
              evidenceIds: [],
            },
            projectedContribution: {
              value: 50,
              currency: "SAR",
              status: "MODELED",
              evidenceIds: [],
            },
            projectedMarginPct: {
              value: 50,
              currency: "%",
              status: "MODELED",
              evidenceIds: [],
            },
            evidenceIds: [],
            model:
              "canonical-financial-scenario-v1",
          },
        ),
      /Cross-tenant/,
    );
  },
);

test(
  "forecast persistence rejects cross tenant before database access",
  async () => {
    const store = new PersistentCFOStore(failDb);

    await assert.rejects(
      () =>
        store.saveForecast("tenant-a", {
          tenantId: "tenant-b",
          period: "MONTH",
          periodStart: "2026-08-01T00:00:00.000Z",
          periodEnd: "2026-08-31T23:59:59.999Z",
          actualRevenue: {
            value: 0,
            currency: "SAR",
            status: "ACTUAL",
            evidenceIds: [],
          },
          pipelineAmount: {
            value: 100,
            currency: "SAR",
            status: "ESTIMATED",
            evidenceIds: ["crm-1"],
          },
          weightedPipelineAmount: {
            value: 60,
            currency: "SAR",
            status: "ESTIMATED",
            evidenceIds: ["crm-1"],
          },
          forecastRevenue: {
            value: 60,
            currency: "SAR",
            status: "ESTIMATED",
            evidenceIds: ["crm-1"],
          },
          opportunityCount: 1,
          stageSummaries: [],
          confidence: 50,
          evidenceIds: ["crm-1"],
          model: "canonical-financial-forecast-v1",
        }),
      /Cross-tenant/,
    );
  },
);
