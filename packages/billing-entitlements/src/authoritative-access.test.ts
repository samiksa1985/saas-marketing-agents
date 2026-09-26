import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AuthoritativeEntitlementAccess,
  type AuthoritativeBillingRepository,
  type AuthoritativeUsageReservation,
} from './index.js';

const now = '2026-09-05T12:00:00.000Z';

function subscription(tenantId = 'tenant-a') {
  return {
    id: `sub-${tenantId}`,
    tenantId,
    planId: 'plan-pro',
    status: 'ACTIVE' as const,
    billingCycle: 'MONTHLY' as const,
    startedAt: '2026-01-01T00:00:00.000Z',
    currentPeriodStart: '2026-09-01T00:00:00.000Z',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
  };
}

function repository(overrides: Partial<AuthoritativeBillingRepository> = {}) {
  return {
    getActiveSubscription: async () => subscription(),
    getPlanEntitlement: async (_planId: string, key: string) => ({
      id: 'pe-1',
      planId: 'plan-pro',
      key,
      value: 10,
    }),
    getOrganizationEntitlementOverride: async () => null,
    getUsageCounter: async () => null,
    ...overrides,
  } satisfies AuthoritativeBillingRepository;
}

test('authoritative access resolves the active plan limit', async () => {
  const access = new AuthoritativeEntitlementAccess(
    repository(),
    { consume: async () => undefined },
    { now: () => now },
  );

  const decision = await access.authorize('tenant-a', 'ai.requests.monthly');

  assert.equal(decision.allowed, true);
  assert.equal(decision.source, 'PLAN');
  assert.deepEqual(decision.usage, { used: 0, limit: 10, remaining: 10 });
});

test('organization override takes precedence over the plan limit', async () => {
  const access = new AuthoritativeEntitlementAccess(
    repository({
      getOrganizationEntitlementOverride: async () => ({
        id: 'oe-1',
        tenantId: 'tenant-a',
        key: 'ai.requests.monthly',
        value: 3,
      }),
    }),
    { consume: async () => undefined },
    { now: () => now },
  );

  const decision = await access.authorize('tenant-a', 'ai.requests.monthly');

  assert.equal(decision.source, 'ORGANIZATION_OVERRIDE');
  assert.equal(decision.usage?.limit, 3);
});

test('missing subscription defaults to deny', async () => {
  const access = new AuthoritativeEntitlementAccess(
    repository({ getActiveSubscription: async () => null }),
    { consume: async () => undefined },
    { now: () => now },
  );

  const decision = await access.authorize('tenant-a', 'ai.requests.monthly');

  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /No active subscription/);
});

test('authoritative usage limit denies execution when exhausted', async () => {
  const access = new AuthoritativeEntitlementAccess(
    repository({
      getUsageCounter: async () => ({
        id: 'usage-1',
        tenantId: 'tenant-a',
        key: 'ai.requests.monthly',
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-10-01T00:00:00.000Z',
        used: 10,
        limit: 999999,
      }),
    }),
    { consume: async () => undefined },
    { now: () => now },
  );

  const decision = await access.authorize('tenant-a', 'ai.requests.monthly');

  assert.equal(decision.allowed, false);
  assert.equal(decision.usage?.limit, 10);
});

test('usage consumption passes only the authoritative limit to the atomic reservation', async () => {
  const requests: Parameters<AuthoritativeUsageReservation['consume']>[0][] = [];
  const access = new AuthoritativeEntitlementAccess(
    repository({
      getPlanEntitlement: async (_planId, key) => ({
        id: 'pe-1',
        planId: 'plan-pro',
        key,
        value: 5,
      }),
    }),
    { consume: async (request) => void requests.push(request) },
    { now: () => now },
  );

  await access.consume('tenant-a', 'ai.requests.monthly', 1, 'run-1');

  assert.deepEqual(requests, [{
    tenantId: 'tenant-a',
    key: 'ai.requests.monthly',
    amount: 1,
    limit: 5,
    periodStart: '2026-09-01T00:00:00.000Z',
    periodEnd: '2026-10-01T00:00:00.000Z',
    idempotencyKey: 'run-1',
    source: 'agent-runtime',
  }]);
});

test('cross-tenant subscription data fails closed', async () => {
  const access = new AuthoritativeEntitlementAccess(
    repository({ getActiveSubscription: async () => subscription('tenant-b') }),
    { consume: async () => undefined },
    { now: () => now },
  );

  await assert.rejects(
    () => access.authorize('tenant-a', 'ai.requests.monthly'),
    /Cross-tenant subscription/,
  );
});
