import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attributeRevenue,
  buildFunnelSnapshot,
  cac,
  conversionRate,
  generateGrowthInsights,
  generateGrowthRecommendations,
  ltv,
  roas,
  weightedPipeline,
  evaluateExperiment,
} from './index.js';

test(
  'measurement converts events into a revenue-oriented funnel',
  () => {
    const events = [
      {
        id: 'a',
        tenantId: 't',
        type: 'activity',
        value: 100,
        metric: 'count',
        occurredAt: '',
        sourceEntityId: 'x',
        attributes: {},
      },
      {
        id: 'l',
        tenantId: 't',
        type: 'lead',
        value: 10,
        metric: 'count',
        occurredAt: '',
        sourceEntityId: 'x',
        attributes: {},
      },
      {
        id: 'q',
        tenantId: 't',
        type: 'qualified_lead',
        value: 3,
        metric: 'count',
        occurredAt: '',
        sourceEntityId: 'x',
        attributes: {},
      },
      {
        id: 'r',
        tenantId: 't',
        type: 'revenue',
        value: 50000,
        metric: 'sar',
        occurredAt: '',
        sourceEntityId: 'x',
        attributes: {},
      },
    ] as const;

    const funnel =
      buildFunnelSnapshot(
        [...events],
      );

    assert.equal(
      funnel.activities,
      100,
    );
    assert.equal(
      funnel.leads,
      10,
    );
    assert.equal(
      funnel.qualifiedLeads,
      3,
    );
    assert.equal(
      funnel.revenue,
      50000,
    );
  },
);

test(
  'growth insights identify funnel bottlenecks',
  () => {
    const events = [
      {
        id: 'l1',
        tenantId: 't',
        type: 'lead',
        value: 5,
        metric: 'count',
        occurredAt: '',
        sourceEntityId: 'x',
        attributes: {},
      },
    ] as const;

    const insights =
      generateGrowthInsights(
        [...events],
      );

    assert.equal(
      insights[0]?.title,
      'Qualification bottleneck',
    );

    assert.ok(
      insights[0]
        ?.evidenceEventIds
        .includes('l1'),
    );
  },
);

test(
  'canonical metrics preserve provenance status',
  () => {
    assert.equal(
      conversionRate(
        5,
        10,
      ).value,
      50,
    );

    assert.equal(
      cac(
        1000,
        10,
      ).value,
      100,
    );

    assert.equal(
      roas(
        5000,
        1000,
      ).value,
      5,
    );

    assert.equal(
      ltv(
        1000,
        0.5,
        12,
      ).status,
      'MODELED',
    );

    assert.equal(
      weightedPipeline([
        {
          amount: 1000,
          probability: 0.5,
        },
      ]).status,
      'ESTIMATED',
    );
  },
);

test(
  'linear attribution allocates all revenue',
  () => {
    const result =
      attributeRevenue(
        [
          {
            eventId: 'a',
            tenantId: 't',
            occurredAt:
              '2026-01-01T00:00:00Z',
          },
          {
            eventId: 'b',
            tenantId: 't',
            occurredAt:
              '2026-01-02T00:00:00Z',
          },
        ],
        100,
        'LINEAR',
      );

    assert.equal(
      result.length,
      2,
    );

    assert.equal(
      result.reduce(
        (sum, item) =>
          sum +
          item.attributedAmount,
        0,
      ),
      100,
    );
  },
);

test(
  'position based attribution handles two touches safely',
  () => {
    const result =
      attributeRevenue(
        [
          {
            eventId: 'a',
            tenantId: 't',
            occurredAt:
              '2026-01-01T00:00:00Z',
          },
          {
            eventId: 'b',
            tenantId: 't',
            occurredAt:
              '2026-01-02T00:00:00Z',
          },
        ],
        100,
        'POSITION_BASED',
      );

    assert.equal(
      result[0]?.weight,
      0.5,
    );

    assert.equal(
      result[1]?.weight,
      0.5,
    );
  },
);

test(
  'attribution sorts touches chronologically',
  () => {
    const result =
      attributeRevenue(
        [
          {
            eventId: 'late',
            tenantId: 't',
            occurredAt:
              '2026-01-03T00:00:00Z',
          },
          {
            eventId: 'early',
            tenantId: 't',
            occurredAt:
              '2026-01-01T00:00:00Z',
          },
        ],
        100,
        'FIRST_TOUCH',
      );

    assert.equal(
      result[0]?.eventId,
      'early',
    );

    assert.equal(
      result[0]?.weight,
      1,
    );
  },
);

test(
  'measurement rejects cross tenant events',
  () => {
    assert.throws(
      () =>
        buildFunnelSnapshot([
          {
            id: '1',
            tenantId: 'a',
            type: 'lead',
            value: 1,
            metric: 'count',
            occurredAt: '',
            sourceEntityId: 'x',
            attributes: {},
          },
          {
            id: '2',
            tenantId: 'b',
            type: 'lead',
            value: 1,
            metric: 'count',
            occurredAt: '',
            sourceEntityId: 'x',
            attributes: {},
          },
        ]),
      /Cross-tenant/,
    );
  },
);

test(
  'attribution rejects cross tenant touches',
  () => {
    assert.throws(
      () =>
        attributeRevenue(
          [
            {
              eventId: '1',
              tenantId: 'a',
              occurredAt:
                '2026-01-01T00:00:00Z',
            },
            {
              eventId: '2',
              tenantId: 'b',
              occurredAt:
                '2026-01-02T00:00:00Z',
            },
          ],
          100,
          'LINEAR',
        ),
      /Cross-tenant/,
    );
  },
);

test(
  'growth thresholds are configurable',
  () => {
    const recommendations =
      generateGrowthRecommendations(
        {
          tenantId: 't',
          leads: 100,
          qualifiedLeads: 50,
          opportunities: 30,
          wonDeals: 10,
          revenue: 1500,
          spend: 1000,
        },
        {
          minimumRoas: 1,
          minimumLeadToOpportunityRate:
            0.2,
          minimumWinRate:
            0.2,
        },
      );

    assert.equal(
      recommendations.length,
      0,
    );
  },
);

test(
  'revenue decline creates critical growth recommendation',
  () => {
    const recommendations =
      generateGrowthRecommendations({
        tenantId: 't',
        leads: 100,
        qualifiedLeads: 50,
        opportunities: 30,
        wonDeals: 10,
        revenue: 900,
        spend: 100,
        previousRevenue: 1000,
      });

    assert.ok(
      recommendations.some(
        (item) =>
          item.priority ===
          'CRITICAL',
      ),
    );
  },
);


test(
  'experiment evaluation selects the strongest eligible variant',
  () => {
    const result =
      evaluateExperiment({
        tenantId: 't',
        experimentId: 'exp-1',
        metric: 'conversion_rate',
        variants: [
          {
            variantId: 'a',
            sampleSize: 100,
            metricValue: 10,
            evidenceEventIds: ['e1'],
          },
          {
            variantId: 'b',
            sampleSize: 100,
            metricValue: 12,
            evidenceEventIds: ['e2'],
          },
        ],
      });

    assert.equal(
      result.status,
      'won',
    );

    assert.equal(
      result.winningVariantId,
      'b',
    );

    assert.deepEqual(
      result.evidenceIds.sort(),
      ['e1', 'e2'],
    );
  },
);

test(
  'experiment evaluation remains inconclusive with insufficient samples',
  () => {
    const result =
      evaluateExperiment({
        tenantId: 't',
        experimentId: 'exp-2',
        metric: 'conversion_rate',
        variants: [
          {
            variantId: 'a',
            sampleSize: 5,
            metricValue: 10,
          },
          {
            variantId: 'b',
            sampleSize: 5,
            metricValue: 20,
          },
        ],
      });

    assert.equal(
      result.status,
      'inconclusive',
    );
  },
);
