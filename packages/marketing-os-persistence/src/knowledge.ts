import { sql } from 'drizzle-orm';
import type { KnowledgeHit, KnowledgeRetriever } from '@platform/context-engine';
import type { TenantContext } from '@platform/contracts';
import type { createDb } from '@platform/db';

type Db = ReturnType<typeof createDb>;

type QueryRow = Record<string, unknown>;

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .normalize('NFKC')
        .split(/[^a-zA-Z0-9\u0600-\u06ff]+/)
        .filter((term) => term.length > 2),
    ),
  ].slice(0, 30);
}

function asRows(value: unknown): QueryRow[] {
  return Array.isArray(value) ? (value as QueryRow[]) : [];
}

export type EmbeddingProvider = (text: string) => Promise<number[]>;

export class PersistentKnowledgeRetriever implements KnowledgeRetriever {
  constructor(
    private readonly db: Db,
    private readonly embed: EmbeddingProvider,
  ) {}

  async search(
    context: TenantContext,
    query: string,
    limit = 8,
  ): Promise<KnowledgeHit[]> {
    if (!context.tenantId) {
      throw new Error('TENANT_CONTEXT_REQUIRED');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 25);
    const embedding = await this.embed(query);
    const vector = vectorLiteral(embedding);
    const terms = queryTerms(query);

    const semanticResult = await this.db.execute(sql`
      SELECT
        c.id,
        c.tenant_id,
        c.document_id,
        c.text,
        c.source_ref,
        c.page_number,
        1 - (c.embedding_vector <=> ${vector}::vector) AS semantic_score
      FROM knowledge_document_chunks c
      INNER JOIN knowledge_documents d
        ON d.id = c.document_id
      WHERE c.tenant_id = ${context.tenantId}
        AND d.tenant_id = ${context.tenantId}
        AND d.status = 'ready'
        AND c.embedding_vector IS NOT NULL
      ORDER BY c.embedding_vector <=> ${vector}::vector
      LIMIT ${Math.min(safeLimit * 3, 75)}
    `);

    const lexicalResult = await this.db.execute(sql`
      SELECT
        c.id,
        ts_rank_cd(
          to_tsvector('simple', c.text),
          plainto_tsquery('simple', ${query})
        ) AS lexical_score
      FROM knowledge_document_chunks c
      INNER JOIN knowledge_documents d
        ON d.id = c.document_id
      WHERE c.tenant_id = ${context.tenantId}
        AND d.tenant_id = ${context.tenantId}
        AND d.status = 'ready'
        AND to_tsvector('simple', c.text)
          @@ plainto_tsquery('simple', ${query})
      ORDER BY lexical_score DESC
      LIMIT ${Math.min(safeLimit * 3, 75)}
    `);

    const semanticRows = asRows(semanticResult);
    const lexicalRows = asRows(lexicalResult);

    const lexicalById = new Map<string, number>(
      lexicalRows.map((row) => [
        String(row.id),
        Number(row.lexical_score ?? 0),
      ]),
    );

    const hits: KnowledgeHit[] = semanticRows.map((row) => {
      const text = String(row.text ?? '');

      const semanticScore = Math.max(
        0,
        Math.min(1, Number(row.semantic_score ?? 0)),
      );

      const lexicalScore = Math.max(
        0,
        Math.min(1, lexicalById.get(String(row.id)) ?? 0),
      );

      const overlap =
        terms.length === 0
          ? 0
          : terms.filter((term) => text.toLowerCase().includes(term)).length /
            terms.length;

      const score =
        semanticScore * 0.65 +
        Math.min(1, lexicalScore * 3) * 0.2 +
        overlap * 0.15;

      const sourceRef =
        row.source_ref === null || row.source_ref === undefined
          ? String(row.document_id)
          : String(row.source_ref);

      return {
        id: String(row.id),
        tenantId: context.tenantId,
        documentId: String(row.document_id),
        text,
        score: Math.max(0, Math.min(1, score)),
        sourceRef,
        evidenceIds: [String(row.document_id)],
      };
    });

    return hits
      .sort((a: KnowledgeHit, b: KnowledgeHit) => b.score - a.score)
      .slice(0, safeLimit);
  }
}

export interface CitationInput {
  tenantId: string;
  query: string;
  hits: KnowledgeHit[];
  agentRunId?: string;
  workflowRunId?: string;
}

export async function createKnowledgeCitations(
  db: Db,
  input: CitationInput,
): Promise<void> {
  const top = input.hits.slice(0, 12);

  for (const hit of top) {
    if (hit.tenantId !== input.tenantId) {
      throw new Error('TENANT_SCOPE_DENIED:citation');
    }

    await db.execute(sql`
      INSERT INTO knowledge_document_citations (
        id,
        tenant_id,
        document_id,
        chunk_id,
        agent_run_id,
        workflow_run_id,
        query,
        excerpt,
        relevance_score,
        source_ref,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${input.tenantId},
        ${hit.documentId},
        ${hit.id},
        ${input.agentRunId ?? null},
        ${input.workflowRunId ?? null},
        ${input.query},
        ${hit.text.slice(0, 700)},
        ${hit.score},
        ${hit.sourceRef ?? null},
        now(),
        now()
      )
    `);
  }
}

