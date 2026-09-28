import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantContext } from '@platform/contracts';

import {
  PersistentCompanyIntelligenceStore,
} from './company-intelligence.js';

function createRejectingDb() {
  let touched = false;

  const fail = () => {
    touched = true;
    throw new Error('DB_SHOULD_NOT_BE_TOUCHED');
  };

  return {
    get touched() {
      return touched;
    },
    insert: fail,
    select: fail,
  };
}

test('company profile write rejects cross-tenant access before DB call', async () => {
  const db = createRejectingDb();
  const store = new PersistentCompanyIntelligenceStore(db as never);

  const context: TenantContext = {
    tenantId: 'tenant-a',
        roles: [],
        permissions: [],
        locale: 'en',
  };

  await assert.rejects(
    store.saveCompanyProfile(context, {
      id: 'company-1',
      tenantId: 'tenant-b',
      companyName: 'Acme',
      geographies: [],
      products: [],
      services: [],
      technologies: [],
      competitors: [],
      customers: [],
      painPoints: [],
      strategicPriorities: [],
      buyingSignals: [],
      risks: [],
      opportunities: [],
      evidenceIds: [],
      confidence: 80,
      updatedAt: '2026-08-30T00:00:00.000Z',
    }),
    /TENANT_SCOPE_DENIED/,
  );

  assert.equal(db.touched, false);
});

test('ICP profile write rejects cross-tenant access before DB call', async () => {
  const db = createRejectingDb();
  const store = new PersistentCompanyIntelligenceStore(db as never);

  await assert.rejects(
    store.saveICPProfile(
      {
        tenantId: 'tenant-a',
        roles: [],
        permissions: [],
        locale: 'en',
      },
      {
        id: 'icp-1',
        tenantId: 'tenant-b',
        name: 'ICP',
        industries: [],
        companySizes: [],
        geographies: [],
        buyingTriggers: [],
        painPoints: [],
        desiredOutcomes: [],
        exclusions: [],
        evidenceIds: [],
        status: 'active',
      },
    ),
    /TENANT_SCOPE_DENIED/,
  );

  assert.equal(db.touched, false);
});

test('account write rejects cross-tenant access before DB call', async () => {
  const db = createRejectingDb();
  const store = new PersistentCompanyIntelligenceStore(db as never);

  await assert.rejects(
    store.saveAccount(
      {
        tenantId: 'tenant-a',
        roles: [],
        permissions: [],
        locale: 'en',
      },
      {
        id: 'account-1',
        tenantId: 'tenant-b',
        name: 'Acme',
        status: 'active',
      },
    ),
    /TENANT_SCOPE_DENIED/,
  );

  assert.equal(db.touched, false);
});

test('ICP assessment write rejects cross-tenant access before DB call', async () => {
  const db = createRejectingDb();
  const store = new PersistentCompanyIntelligenceStore(db as never);

  await assert.rejects(
    store.saveICPAssessment(
      {
        tenantId: 'tenant-a',
        roles: [],
        permissions: [],
        locale: 'en',
      },
      {
        id: 'assessment-1',
        tenantId: 'tenant-b',
        accountId: 'account-1',
        icpId: 'icp-1',
        score: 80,
        tier: 'tier_1',
        matchedIndustries: [],
        matchedGeographies: [],
        matchedTriggers: [],
        matchedPainPoints: [],
        exclusions: [],
        evidenceIds: [],
        reasons: [],
        model: 'canonical-company-icp-v1',
      },
    ),
    /TENANT_SCOPE_DENIED/,
  );

  assert.equal(db.touched, false);
});

test('read requires tenant context before DB call', async () => {
  const db = createRejectingDb();
  const store = new PersistentCompanyIntelligenceStore(db as never);

  await assert.rejects(
    store.getCompanyProfile(
      {
        tenantId: '',
        roles: [],
        permissions: [],
        locale: 'en',
      },
      'company-1',
    ),
    /TENANT_CONTEXT_REQUIRED/,
  );

  assert.equal(db.touched, false);
});
