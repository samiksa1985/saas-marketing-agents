import test from 'node:test';
import assert from 'node:assert/strict';
import type { TenantContext } from '@platform/contracts';
import {
  InMemoryKnowledgeRetriever,
  InMemoryMarketingMemoryRepository,
  MarketingContextBuilder,
  createMemoryRecord,
} from './index.js';

const tenantA: TenantContext = {
  tenantId: 'tenant-a',
  roles: ['tenant_admin'],
  permissions: ['tenant:read'],
  locale: 'en-US',
};
const tenantB: TenantContext = {
  tenantId: 'tenant-b',
  roles: ['tenant_admin'],
  permissions: ['tenant:read'],
  locale: 'en-US',
};

test('memory never crosses tenant boundaries', async () => {
  const memory = new InMemoryMarketingMemoryRepository();
  await memory.put(
    tenantA,
    createMemoryRecord({
      tenantId: 'tenant-a',
      scope: 'company',
      scopeId: 'company-a',
      statement: 'ICP is B2B technology companies',
      confidence: 0.9,
    }),
  );

  const own = await memory.search(tenantA, { keywords: ['ICP'] });
  const other = await memory.search(tenantB, { keywords: ['ICP'] });

  assert.equal(own.length, 1);
  assert.equal(other.length, 0);
});

test('context builder merges memory and knowledge with provenance', async () => {
  const memory = new InMemoryMarketingMemoryRepository();
  await memory.put(
    tenantA,
    createMemoryRecord({
      tenantId: 'tenant-a',
      scope: 'company',
      scopeId: 'company-a',
      statement: 'Primary objective is qualified pipeline',
      evidenceIds: ['artifact-1'],
      confidence: 0.95,
    }),
  );

  const knowledge = new InMemoryKnowledgeRetriever([
    {
      id: 'chunk-1',
      tenantId: 'tenant-a',
      documentId: 'doc-1',
      text: 'The approved offer is a managed marketing service.',
      score: 0.8,
      sourceRef: 'page:3',
      evidenceIds: ['doc-1'],
    },
  ]);

  const builder = new MarketingContextBuilder(memory, knowledge);
  const snapshot = await builder.build({
    context: tenantA,
    memoryQuery: { scopes: ['company'] },
    knowledgeQuery: 'approved offer',
  });

  assert.equal(snapshot.memories.length, 1);
  assert.equal(snapshot.knowledge.length, 1);
  assert.ok(snapshot.sources.some((source) => source.evidenceIds.includes('artifact-1')));
  assert.ok(snapshot.sources.some((source) => source.sourceRef === 'page:3'));
});
