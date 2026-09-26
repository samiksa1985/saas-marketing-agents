import test from 'node:test';
import * as assert from 'node:assert/strict';

import type { TenantContext } from '@platform/contracts';

import { PersistentMarketIntelligenceStore } from './market-intelligence.js';

const context = {
  tenantId: 'tenant-a',
} as TenantContext;

test('market persistence rejects cross-tenant getById', async () => {
  const store = new PersistentMarketIntelligenceStore(
    {} as never,
  );

  await assert.rejects(
    store.getById(
      context,
      'tenant-b',
      'snapshot-1',
    ),
    /TENANT_SCOPE_DENIED/,
  );
});

test('market persistence rejects cross-tenant getLatest', async () => {
  const store = new PersistentMarketIntelligenceStore(
    {} as never,
  );

  await assert.rejects(
    store.getLatest(
      context,
      'tenant-b',
    ),
    /TENANT_SCOPE_DENIED/,
  );
});

test('market persistence rejects cross-tenant save before database access', async () => {
  const store = new PersistentMarketIntelligenceStore(
    {} as never,
  );

  await assert.rejects(
    store.save(
      context,
      {
        id: 'snapshot-1',
        tenantId: 'tenant-b',
        researchQuestion: 'Question',
        marketSummary: 'Summary',
        competitors: [],
        customerSignals: [],
        trends: [],
        opportunities: [],
        threats: [],
        evidence: [],
        confidence: 0,
        createdAt: new Date().toISOString(),
      },
    ),
    /TENANT_SCOPE_DENIED/,
  );
});
