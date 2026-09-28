import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AnalyticsStore,
  assertAnalyticsTenant,
} from './analytics.js';

test(
  'analytics tenant guard rejects cross tenant access',
  () => {
    assert.throws(
      () =>
        assertAnalyticsTenant(
          'tenant-a',
          'tenant-b',
        ),
      /Cross-tenant/,
    );
  },
);

test(
  'experiment persistence rejects cross tenant before database access',
  async () => {
    let called = false;

    const db = {
      insert: () => {
        called = true;
        return {
          values: async () =>
            undefined,
        };
      },
      select: () => {
        called = true;
      },
      update: () => {
        called = true;
      },
    };

    const store =
      new AnalyticsStore(db);

    await assert.rejects(
      store.saveExperiment(
        'tenant-a',
        {
          id: 'exp-1',
          tenantId:
            'tenant-b',
          name: 'Test',
          hypothesis:
            'Variant improves conversion',
          metric:
            'conversion_rate',
          variants: [],
          status:
            'planned',
        },
      ),
      /Cross-tenant/,
    );

    assert.equal(
      called,
      false,
    );
  },
);

test(
  'attribution persistence rejects cross tenant before database access',
  async () => {
    let called = false;

    const db = {
      insert: () => {
        called = true;
        return {
          values: async () =>
            undefined,
        };
      },
      select: () => {
        called = true;
      },
      update: () => {
        called = true;
      },
    };

    const store =
      new AnalyticsStore(db);

    await assert.rejects(
      store.saveAttribution(
        'tenant-a',
        {
          id: 'attr-1',
          tenantId:
            'tenant-b',
          sourceEntityId:
            '00000000-0000-0000-0000-000000000001',
          model: 'LINEAR',
          totalAmount: 100,
          allocations: [],
          evidenceIds: [],
          calculatedAt:
            new Date()
              .toISOString(),
        },
      ),
      /Cross-tenant/,
    );

    assert.equal(
      called,
      false,
    );
  },
);
