import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  assertEntitled,
  consumeUsage,
  resolveEntitlement,
} from './index.js';

test(
  'organization entitlement overrides plan entitlement',
  () => {
    const decision =
      resolveEntitlement({
        tenantId: 'tenant-a',
        key: 'ai.requests.monthly',
        planEntitlements: [
          {
            id: 'pe-1',
            planId: 'plan-1',
            key: 'ai.requests.monthly',
            value: 100,
          },
        ],
        organizationOverrides: [
          {
            id: 'oe-1',
            tenantId: 'tenant-a',
            key: 'ai.requests.monthly',
            value: 500,
          },
        ],
      });

    assert.equal(
      decision.allowed,
      true,
    );

    assert.equal(
      decision.source,
      'ORGANIZATION_OVERRIDE',
    );

    assert.equal(
      decision.entitlementValue,
      500,
    );
  },
);

test(
  'missing entitlement defaults to deny',
  () => {
    const decision =
      resolveEntitlement({
        tenantId: 'tenant-a',
        key: 'unknown.feature',
        planEntitlements: [],
      });

    assert.equal(
      decision.allowed,
      false,
    );

    assert.equal(
      decision.source,
      'DEFAULT_DENY',
    );
  },
);

test(
  'usage exhaustion blocks execution',
  () => {
    const decision =
      resolveEntitlement({
        tenantId: 'tenant-a',
        key: 'ai.requests.monthly',
        planEntitlements: [
          {
            id: 'pe-1',
            planId: 'plan-1',
            key: 'ai.requests.monthly',
            value: 100,
          },
        ],
        usage: {
          id: 'usage-1',
          tenantId: 'tenant-a',
          key: 'ai.requests.monthly',
          periodStart:
            '2026-09-01T00:00:00.000Z',
          periodEnd:
            '2026-10-01T00:00:00.000Z',
          used: 100,
          limit: 100,
        },
      });

    assert.equal(
      decision.allowed,
      false,
    );
  },
);

test(
  'usage consumption cannot cross tenant boundary',
  () => {
    assert.throws(
      () =>
        consumeUsage({
          tenantId: 'tenant-a',
          key: 'ai.requests.monthly',
          usage: {
            id: 'usage-1',
            tenantId: 'tenant-b',
            key: 'ai.requests.monthly',
            periodStart:
              '2026-09-01T00:00:00.000Z',
            periodEnd:
              '2026-10-01T00:00:00.000Z',
            used: 1,
            limit: 100,
          },
        }),
      /Cross-tenant/,
    );
  },
);

test(
  'assert entitled rejects denied decision',
  () => {
    assert.throws(
      () =>
        assertEntitled({
          tenantId: 'tenant-a',
          key: 'feature.x',
          allowed: false,
          source: 'DEFAULT_DENY',
          reason: 'Denied',
        }),
      /Entitlement denied/,
    );
  },
);
