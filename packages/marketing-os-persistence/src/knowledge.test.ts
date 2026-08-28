import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PersistentKnowledgeRetriever } from './knowledge.js';

type QueryRow = Record<string, unknown>;

function createMockDb(
  semanticRows: QueryRow[],
  lexicalRows: QueryRow[],
) {
  let calls = 0;

  return {
    get calls() {
      return calls;
    },

    async execute() {
      calls += 1;

      if (calls === 1) {
        return semanticRows;
      }

      return lexicalRows;
    },
  } as never;
}

test('persistent RAG preserves tenant isolation and hybrid ranking', async () => {
  const db = createMockDb(
    [
      {
        id: 'chunk-b',
        tenant_id: 'tenant-a',
        document_id: 'doc-a-2',
        text: 'Arabic B2B campaign strategy',
        source_ref: 'doc-a-2#p3',
        page_number: 3,
        semantic_score: 0.95,
      },
      {
        id: 'chunk-cross',
        tenant_id: 'tenant-b',
        document_id: 'doc-b-1',
        text: 'Cross tenant content',
        source_ref: 'doc-b-1#p1',
        page_number: 1,
        semantic_score: 0.99,
      },
    ],
    [
      {
        id: 'chunk-b',
        lexical_score: 0.4,
      },
      {
        id: 'chunk-cross',
        lexical_score: 0.9,
      },
    ],
  );

  const retriever = new PersistentKnowledgeRetriever(
    db,
    async () => new Array(1536).fill(0.01),
  );

  const result = await retriever.search(
    {
      tenantId: 'tenant-a',
      userId: 'user-a',
      locale: 'ar-SA',
      permissions: [],
    } as never,
    'B2B campaign strategy',
    8,
  );

  assert.equal(result.length, 2);

  const first = result[0];
  const second = result[1];

  assert.ok(first);
  assert.ok(second);

  assert.equal(first.tenantId, 'tenant-a');
  assert.equal(second.tenantId, 'tenant-a');

  assert.equal(first.documentId, 'doc-a-2');
  assert.equal(first.sourceRef, 'doc-a-2#p3');

  assert.ok(first.score >= 0);
  assert.ok(first.score <= 1);
});

test('persistent RAG returns evidence ids for citation provenance', async () => {
  const db = createMockDb(
    [
      {
        id: 'chunk-1',
        tenant_id: 'tenant-a',
        document_id: 'doc-1',
        text: 'Approved ICP for Saudi B2B',
        source_ref: null,
        page_number: null,
        semantic_score: 0.9,
      },
    ],
    [],
  );

  const retriever = new PersistentKnowledgeRetriever(
    db,
    async () => new Array(1536).fill(0.01),
  );

  const result = await retriever.search(
    {
      tenantId: 'tenant-a',
      userId: 'user-a',
      locale: 'ar-SA',
      permissions: [],
    } as never,
    'Saudi B2B ICP',
    5,
  );

  assert.equal(result.length, 1);

  const first = result[0];
  assert.ok(first);

  assert.deepEqual(first.evidenceIds, ['doc-1']);
  assert.equal(first.sourceRef, 'doc-1');
});

test('persistent RAG rejects missing tenant context', async () => {
  const db = createMockDb([], []);

  const retriever = new PersistentKnowledgeRetriever(
    db,
    async () => new Array(1536).fill(0.01),
  );

  await assert.rejects(
    () =>
      retriever.search(
        {
          tenantId: '',
          userId: 'user-a',
          locale: 'ar-SA',
          permissions: [],
        } as never,
        'test',
      ),
    /TENANT_CONTEXT_REQUIRED/,
  );
});

