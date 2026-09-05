import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BillingStore,
  assertBillingTenant,
} from './billing.js';

test(
  'billing tenant guard rejects cross tenant access',
  () => {
    assert.throws(
      () =>
        assertBillingTenant(
          'tenant-a',
          'tenant-b',
        ),
      /Cross-tenant/,
    );
  },
);

test(
  'subscription persistence rejects cross tenant before database access',
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
      new BillingStore(db);

    await assert.rejects(
      store.saveSubscription(
        'tenant-a',
        {
          id: 'subscription-1',
          tenantId:
            'tenant-b',
          planId: 'plan-1',
          status: 'ACTIVE',
          billingCycle:
            'MONTHLY',
          startedAt:
            '2026-09-01T00:00:00.000Z',
          currentPeriodStart:
            '2026-09-01T00:00:00.000Z',
          currentPeriodEnd:
            '2026-10-01T00:00:00.000Z',
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
  'usage persistence rejects cross tenant before database access',
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
      new BillingStore(db);

    await assert.rejects(
      store.saveUsage(
        'tenant-a',
        {
          id: 'usage-1',
          tenantId:
            'tenant-b',
          key:
            'ai.requests.monthly',
          periodStart:
            '2026-09-01T00:00:00.000Z',
          periodEnd:
            '2026-10-01T00:00:00.000Z',
          used: 1,
          limit: 100,
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
