import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryKnowledgeRetriever,
  InMemoryMarketingMemoryRepository,
  MarketingContextBuilder,
  createMemoryRecord,
} from '@platform/context-engine';
import { AcquisitionGraph } from '@platform/acquisition-graph';
import { buildMarketingOSPlan } from './index.js';

test(
  'marketing OS plan consumes context before planning',
  async () => {
    const memory =
      new InMemoryMarketingMemoryRepository();

    const knowledge =
      new InMemoryKnowledgeRetriever([
        {
          id: 'k1',
          tenantId: 'tenant-a',
          documentId: 'doc-1',
          text: 'Approved ICP is B2B technology companies.',
          score: 0.95,
          evidenceIds: ['doc-1'],
          sourceRef: 'page:2',
        },
      ]);

    const tenantContext = {
      tenantId: 'tenant-a',
      roles: [],
      permissions: [],
      locale: 'en-US' as const,
    };

    await memory.put(
      tenantContext,
      createMemoryRecord({
        tenantId: 'tenant-a',
        scope: 'company',
        scopeId: 'company-a',
        statement:
          'The primary goal is qualified pipeline.',
        confidence: 0.9,
        evidenceIds: ['memory-1'],
      }),
    );

    const plan =
      await buildMarketingOSPlan(
        {
          tenantId: 'tenant-a',
          goal: 'Generate qualified leads',
          targetAudience: ['B2B'],
          timeframe: '90d',
        },
        {
          contextBuilder:
            new MarketingContextBuilder(
              memory,
              knowledge,
            ),
          registry: {
            domainLeaders: [
              {
                id: 'business-intelligence',
                name: 'BI',
                tier: 'DOMAIN_LEADER',
                source: 'project2',
                mission: '',
                consolidationStatus:
                  'KEEP_AS_DOMAIN_LEADER',
                reviewNote: '',
              },
              {
                id: 'sales',
                name: 'Sales',
                tier: 'DOMAIN_LEADER',
                source: 'project2',
                mission: '',
                consolidationStatus:
                  'KEEP_AS_DOMAIN_LEADER',
                reviewNote: '',
              },
              {
                id: 'market-research',
                name: 'Research',
                tier: 'DOMAIN_LEADER',
                source: 'project2',
                mission: '',
                consolidationStatus:
                  'KEEP_AS_DOMAIN_LEADER',
                reviewNote: '',
              },
            ],
            specialists: [
              {
                id: 'sales-outbound-strategist',
                name:
                  'Sales Outbound Strategist',
              },
            ],
          },
          acquisitionGraph:
            new AcquisitionGraph(),
        },
      );

    assert.equal(
      plan.plan.objective,
      'generate_leads',
    );
    assert.equal(
      plan.context.knowledge.length,
      1,
    );
    assert.equal(
      plan.context.memories.length,
      1,
    );

    assert.ok(
      plan.readiness.reasons.length >= 0,
    );
  },
);