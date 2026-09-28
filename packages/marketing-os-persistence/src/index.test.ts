import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PersistentMarketingMemoryRepository,
  MarketingOSPlanStore,
  MarketingOutcomeStore,
  PersistentMarketingOSExecutionRecordRepository,
} from './index.js';

test('exports persistent marketing OS stores', () => {
  assert.equal(typeof PersistentMarketingMemoryRepository, 'function');
  assert.equal(typeof MarketingOSPlanStore, 'function');
  assert.equal(typeof PersistentMarketingOSExecutionRecordRepository, 'function');
  assert.equal(typeof MarketingOutcomeStore, 'function');
});

test('durable Marketing OS stores reject a mismatched tenant before database access', async () => {
  const noDatabase = {} as never;
  await assert.rejects(
    new MarketingOSPlanStore(noDatabase).save(
      { tenantId: 'tenant-b', roles: [], permissions: [], locale: 'en' },
      {
        plan: { tenantId: 'tenant-a', planId: 'plan-a' },
        context: { tenantId: 'tenant-a' },
        acquisition: { tenantId: 'tenant-a' },
        readiness: { blocked: false, reasons: [] },
      } as never,
    ),
    /TENANT_SCOPE_DENIED/,
  );
  await assert.rejects(
    new PersistentMarketingOSExecutionRecordRepository(noDatabase).save(
      { tenantId: 'tenant-b', roles: [], permissions: [], locale: 'en' },
      {
        tenantId: 'tenant-a',
        planId: 'plan-a',
        engagementId: 'engagement-a',
        locale: 'en',
        idempotencyKey: 'key-a',
        status: 'PREPARED',
        approved: true,
        reasons: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ),
    /TENANT_SCOPE_DENIED/,
  );
});
