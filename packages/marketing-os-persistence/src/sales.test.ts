import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { PersistentSalesIntelligenceStore } from './sales.js';

function fakeDb() {
  return {
    insert() {
      return {
        values() {
          return Promise.resolve();
        },
      };
    },
  };
}

test('rejects cross-tenant lead score persistence', async () => {
  const store = new PersistentSalesIntelligenceStore(fakeDb() as never);

  await assert.rejects(
    store.saveLeadScore(
      { tenantId: 'tenant-A', roles: [], permissions: [], locale: 'en' },
      {
        id: 'score-1',
        tenantId: 'tenant-B',
        leadId: 'lead-1',
        score: 80,
        temperature: 'HOT',
        fit: 80,
        intent: 80,
        engagement: 80,
        timing: 80,
        factors: {},
        recommendations: [],
        model: 'canonical-sales-score-v1',
      },
    ),
    /TENANT_SCOPE_DENIED/,
  );
});

test('rejects cross-tenant forecast persistence', async () => {
  const store = new PersistentSalesIntelligenceStore(fakeDb() as never);

  await assert.rejects(
    store.saveForecast(
      { tenantId: 'tenant-A', roles: [], permissions: [], locale: 'en' },
      {
        id: 'forecast-1',
        tenantId: 'tenant-B',
        period: 'MONTH',
        periodStart: '2026-08-01T00:00:00.000Z',
        periodEnd: '2026-08-31T23:59:59.999Z',
        opportunityCount: 1,
        pipelineAmount: 100000,
        weightedAmount: 60000,
        winProbability: 60,
        confidence: 80,
        opportunityIds: ['opp-1'],
      },
    ),
    /TENANT_SCOPE_DENIED/,
  );
});

test('rejects cross-tenant proposal persistence', async () => {
  const store = new PersistentSalesIntelligenceStore(fakeDb() as never);

  await assert.rejects(
    store.saveProposalArtifact(
      { tenantId: 'tenant-A', roles: [], permissions: [], locale: 'en' },
      {
        id: 'proposal-1',
        tenantId: 'tenant-B',
        opportunityId: 'opp-1',
        title: 'Proposal',
        status: 'DRAFT',
        content: {},
        requiresApproval: true,
      },
    ),
    /TENANT_SCOPE_DENIED/,
  );
});
