import test from 'node:test';
import * as assert from 'node:assert/strict';

import type {
  CompetitorProfile,
  MarketEvidence,
  MarketOpportunity,
  MarketThreat,
  TenantContext,
} from '@platform/contracts';

import {
  buildMarketIntelligenceSnapshot,
  collectMarketEvidenceIds,
  prioritizeMarketOpportunities,
  prioritizeMarketThreats,
  rankCompetitors,
} from './index.js';

const context = {
  tenantId: 'tenant-1',
} as TenantContext;

const evidence: MarketEvidence[] = [
  {
    id: 'evidence-1',
    tenantId: 'tenant-1',
    type: 'competitor',
    claim: 'Competitor is expanding its enterprise offer.',
    sourceRef: 'source-1',
    confidence: 90,
  },
];

const competitor: CompetitorProfile = {
  id: 'competitor-1',
  tenantId: 'tenant-1',
  name: 'Competitor One',
  products: ['Product A'],
  strengths: ['Enterprise presence'],
  weaknesses: ['Complex onboarding'],
  differentiators: ['Large ecosystem'],
  targetSegments: ['Enterprise'],
  channels: ['Direct'],
  evidenceIds: ['evidence-1'],
  confidence: 85,
};

test('builds evidence-backed market intelligence snapshot', () => {
  const result = buildMarketIntelligenceSnapshot(context, {
    id: 'snapshot-1',
    tenantId: 'tenant-1',
    researchQuestion: 'Where can we win?',
    marketSummary: 'Demand is growing.',
    competitors: [competitor],
    customerSignals: ['Customers want faster deployment.'],
    evidence,
  });

  assert.equal(result.tenantId, 'tenant-1');
  assert.equal(result.competitors.length, 1);
  assert.ok(result.confidence > 0);
});

test('rejects cross-tenant market evidence', () => {
  assert.throws(
    () =>
      buildMarketIntelligenceSnapshot(context, {
        id: 'snapshot-2',
        tenantId: 'tenant-1',
        researchQuestion: 'Research',
        marketSummary: 'Summary',
        evidence: [
          {
            ...evidence[0]!,
            tenantId: 'tenant-2',
          },
        ],
      }),
    /TENANT_SCOPE_DENIED/,
  );
});

test('ranks competitors using evidence depth then confidence', () => {
  const weak: CompetitorProfile = {
    ...competitor,
    id: 'competitor-2',
    evidenceIds: [],
    confidence: 100,
  };

  const ranked = rankCompetitors(
    context,
    'tenant-1',
    [weak, competitor],
  );

  assert.equal(ranked[0]?.id, 'competitor-1');
});

test('prioritizes high impact market opportunities', () => {
  const opportunities: MarketOpportunity[] = [
    {
      id: 'opp-low',
      tenantId: 'tenant-1',
      title: 'Low',
      description: 'Low',
      type: 'channel',
      impact: 'low',
      evidenceIds: [],
      confidence: 100,
    },
    {
      id: 'opp-high',
      tenantId: 'tenant-1',
      title: 'High',
      description: 'High',
      type: 'demand',
      impact: 'high',
      evidenceIds: ['evidence-1'],
      confidence: 70,
    },
  ];

  assert.equal(
    prioritizeMarketOpportunities(
      context,
      'tenant-1',
      opportunities,
    )[0]?.id,
    'opp-high',
  );
});

test('prioritizes high severity market threats', () => {
  const threats: MarketThreat[] = [
    {
      id: 'threat-low',
      tenantId: 'tenant-1',
      title: 'Low',
      description: 'Low',
      type: 'market',
      severity: 'low',
      evidenceIds: [],
      confidence: 100,
    },
    {
      id: 'threat-high',
      tenantId: 'tenant-1',
      title: 'High',
      description: 'High',
      type: 'competitive',
      severity: 'high',
      evidenceIds: ['evidence-1'],
      confidence: 75,
    },
  ];

  assert.equal(
    prioritizeMarketThreats(
      context,
      'tenant-1',
      threats,
    )[0]?.id,
    'threat-high',
  );
});

test('collects unique provenance evidence ids', () => {
  const result = buildMarketIntelligenceSnapshot(context, {
    id: 'snapshot-3',
    tenantId: 'tenant-1',
    researchQuestion: 'Research',
    marketSummary: 'Summary',
    competitors: [competitor],
    evidence,
  });

  assert.deepEqual(
    collectMarketEvidenceIds(result),
    ['evidence-1'],
  );
});
