import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assessAccountAgainstICP,
  buildCompanyIntelligenceProfile,
} from './index.js';

test('builds evidence-backed company intelligence profile', () => {
  const profile = buildCompanyIntelligenceProfile({
    id: 'company-1',
    context: {
      tenantId: 'tenant-1',
      companyName: 'Acme',
      website: 'https://example.test',
      industry: 'Technology',
      markets: ['Saudi Arabia'],
      products: ['Platform'],
      services: ['Consulting'],
      goals: [],
      locale: 'en',
      updatedAt: '2026-08-30T00:00:00.000Z',
    },
    employeeBand: '100-500',
    revenueBand: '50M-100M',
    businessModel: 'B2B',
    painPoints: ['Need better sales automation'],
    buyingSignals: ['Looking for automation'],
    evidence: [
      {
        id: 'evidence-1',
        source: 'approved-document',
        sourceType: 'document',
        confidence: 0.9,
      },
    ],
  });

  assert.equal(profile.tenantId, 'tenant-1');
  assert.deepEqual(profile.evidenceIds, ['evidence-1']);
  assert.ok(profile.confidence > 0);
});

test('scores strong ICP account as tier 1', () => {
  const assessment = assessAccountAgainstICP(
    {
      id: 'account-1',
      tenantId: 'tenant-1',
      name: 'Acme',
      industry: 'Technology',
      geography: 'Saudi Arabia',
      employeeBand: '100-500',
      status: 'active',
    },
    {
      id: 'icp-1',
      tenantId: 'tenant-1',
      name: 'Saudi Technology',
      industries: ['Technology'],
      companySizes: ['100-500'],
      geographies: ['Saudi Arabia'],
      buyingTriggers: ['automation'],
      painPoints: ['sales automation'],
      desiredOutcomes: ['growth'],
      exclusions: [],
      evidenceIds: ['icp-evidence'],
      status: 'active',
    },
    [
      {
        id: 'signal-1',
        tenantId: 'tenant-1',
        accountId: 'account-1',
        type: 'intent',
        source: 'research',
        summary: 'Company is evaluating automation platforms',
        observedAt: '2026-08-30T00:00:00.000Z',
        evidenceIds: ['signal-evidence'],
      },
    ],
    {
      id: 'company-1',
      tenantId: 'tenant-1',
      companyName: 'Acme',
      industry: 'Technology',
      geographies: ['Saudi Arabia'],
      employeeBand: '100-500',
      products: [],
      services: [],
      technologies: [],
      competitors: [],
      customers: [],
      painPoints: ['sales automation'],
      strategicPriorities: [],
      buyingSignals: ['automation initiative'],
      risks: [],
      opportunities: [],
      evidenceIds: ['company-evidence'],
      confidence: 90,
      updatedAt: '2026-08-30T00:00:00.000Z',
    },
  );

  assert.equal(assessment.tier, 'tier_1');
  assert.equal(assessment.score, 80);
  assert.ok(assessment.evidenceIds.includes('signal-evidence'));
});

test('rejects excluded account', () => {
  const assessment = assessAccountAgainstICP(
    {
      id: 'account-1',
      tenantId: 'tenant-1',
      name: 'Acme',
      industry: 'Government',
      geography: 'Saudi Arabia',
      status: 'active',
    },
    {
      id: 'icp-1',
      tenantId: 'tenant-1',
      name: 'Commercial',
      industries: ['Government'],
      companySizes: [],
      geographies: ['Saudi Arabia'],
      buyingTriggers: [],
      painPoints: [],
      desiredOutcomes: [],
      exclusions: ['government'],
      evidenceIds: [],
      status: 'active',
    },
  );

  assert.equal(assessment.tier, 'rejected');
  assert.ok(assessment.exclusions.includes('government'));
});

test('rejects cross-tenant ICP assessment', () => {
  assert.throws(
    () =>
      assessAccountAgainstICP(
        {
          id: 'account-1',
          tenantId: 'tenant-a',
          name: 'Acme',
          status: 'active',
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
});

test('rejects cross-tenant signal evidence', () => {
  assert.throws(
    () =>
      assessAccountAgainstICP(
        {
          id: 'account-1',
          tenantId: 'tenant-a',
          name: 'Acme',
          status: 'active',
        },
        {
          id: 'icp-1',
          tenantId: 'tenant-a',
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
        [
          {
            id: 'signal-1',
            tenantId: 'tenant-b',
            type: 'intent',
            source: 'test',
            summary: 'test',
            observedAt: '2026-08-30T00:00:00.000Z',
            evidenceIds: [],
          },
        ],
      ),
    /TENANT_SCOPE_DENIED/,
  );
});
