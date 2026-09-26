import { sql } from 'drizzle-orm';
import type { KnowledgeHit, KnowledgeRetriever } from '@platform/context-engine';
import type { TenantContext } from '@platform/contracts';
import { KNOWLEDGE_EMBEDDING_DIMENSIONS, type createDb } from '@platform/db';

type Db = Pick<ReturnType<typeof createDb>, 'execute'>;
type QueryRow = Record<string, unknown>;

export type EmbeddingProviderMode = 'external' | 'local';

export interface EmbeddingResult {
  vector: number[];
  provider: string;
  model: string;
  version: string;
}

/**
 * Provider-neutral embedding boundary. Implementations may call an external
 * service or a locally hosted model, but must identify their model/version.
 * It deliberately has no in-memory production implementation.
 */
export interface EmbeddingProvider {
  readonly mode: EmbeddingProviderMode;
  readonly provider: string;
  readonly model: string;
  readonly version: string;
  embed(text: string): Promise<EmbeddingResult>;
}

export interface KnowledgeSearchOptions {
  limit?: number;
  /** JSONB containment filter; all supplied values must match chunk metadata. */
  metadata?: Record<string, unknown>;
}

export interface KnowledgeDocumentInput {
  id: string;
  tenantId: string;
  name: string;
  mimeType: string;
  storagePath: string;
  sourceType?: 'file' | 'url' | 'inline';
  status?: 'uploaded' | 'processing' | 'ready' | 'failed' | 'archived';
  sizeBytes?: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
  sourceUrl?: string;
  pageCount?: number;
  wordCount?: number;
  errorMessage?: string;
  processedAt?: string;
}

export interface KnowledgeChunkInput {
  id: string;
  tenantId: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  pageNumber?: number;
  slideNumber?: number;
  sheetName?: string;
  sourceRef?: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

export interface PersistentKnowledgeDocumentRepository {
  upsertDocument(context: TenantContext, input: KnowledgeDocumentInput): Promise<void>;
  upsertChunk(context: TenantContext, input: KnowledgeChunkInput): Promise<void>;
  deleteDocument(context: TenantContext, documentId: string): Promise<void>;
}

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

function assertTenant(context: TenantContext, tenantId?: string): void {
  if (!context.tenantId || (tenantId && context.tenantId !== tenantId)) {
    throw new Error('TENANT_CONTEXT_REQUIRED');
  }
}

function assertEmbedding(result: EmbeddingResult, provider: EmbeddingProvider): void {
  if (
    result.provider !== provider.provider ||
    result.model !== provider.model ||
    result.version !== provider.version
  ) {
    throw new Error('EMBEDDING_PROVENANCE_MISMATCH');
  }
  if (
    result.vector.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS ||
    result.vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('EMBEDDING_VECTOR_INVALID');
  }
}

/** A durable PostgreSQL writer with explicit model provenance for every vector. */
export class PostgresKnowledgeDocumentRepository implements PersistentKnowledgeDocumentRepository {
  constructor(
    private readonly db: Db,
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async upsertDocument(context: TenantContext, input: KnowledgeDocumentInput): Promise<void> {
    assertTenant(context, input.tenantId);
    await this.db.execute(sql`
      INSERT INTO knowledge_documents (
        id, tenant_id, name, mime_type, storage_path, source_type, status,
        size_bytes, checksum, metadata, source_url, page_count, word_count,
        error_message, processed_at, created_at, updated_at
      ) VALUES (
        ${input.id}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.mimeType},
        ${input.storagePath}, ${input.sourceType ?? 'file'}::document_source_type,
        ${input.status ?? 'uploaded'}::document_status, ${input.sizeBytes ?? null},
        ${input.checksum ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb,
        ${input.sourceUrl ?? null}, ${input.pageCount ?? null}, ${input.wordCount ?? null},
        ${input.errorMessage ?? null}, ${input.processedAt ?? null}::timestamptz, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, mime_type = EXCLUDED.mime_type, storage_path = EXCLUDED.storage_path,
        source_type = EXCLUDED.source_type, status = EXCLUDED.status, size_bytes = EXCLUDED.size_bytes,
        checksum = EXCLUDED.checksum, metadata = EXCLUDED.metadata, source_url = EXCLUDED.source_url,
        page_count = EXCLUDED.page_count, word_count = EXCLUDED.word_count,
        error_message = EXCLUDED.error_message, processed_at = EXCLUDED.processed_at, updated_at = now()
      WHERE knowledge_documents.tenant_id = ${context.tenantId}::uuid
    `);
  }

  async upsertChunk(context: TenantContext, input: KnowledgeChunkInput): Promise<void> {
    assertTenant(context, input.tenantId);
    const document = asRows(await this.db.execute(sql`
      SELECT id FROM knowledge_documents
      WHERE id = ${input.documentId}::uuid AND tenant_id = ${context.tenantId}::uuid
      LIMIT 1
    `));
    if (!document[0]) throw new Error('KNOWLEDGE_DOCUMENT_NOT_FOUND_OR_ACCESS_DENIED');
    const embedding = await this.embeddingProvider.embed(input.text);
    assertEmbedding(embedding, this.embeddingProvider);
    const vector = vectorLiteral(embedding.vector);
    await this.db.execute(sql`
      INSERT INTO knowledge_document_chunks (
        id, tenant_id, document_id, chunk_index, text, embedding, embedding_vector,
        embedding_provider, embedding_model, embedding_version, embedded_at,
        page_number, slide_number, sheet_name, source_ref, token_count, metadata,
        created_at, updated_at
      ) VALUES (
        ${input.id}::uuid, ${context.tenantId}::uuid, ${input.documentId}::uuid,
        ${input.chunkIndex}, ${input.text}, ${JSON.stringify(embedding.vector)}::jsonb,
        ${vector}::vector, ${embedding.provider}, ${embedding.model}, ${embedding.version}, now(),
        ${input.pageNumber ?? null}, ${input.slideNumber ?? null}, ${input.sheetName ?? null},
        ${input.sourceRef ?? null}, ${input.tokenCount ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        text = EXCLUDED.text, embedding = EXCLUDED.embedding,
        embedding_vector = EXCLUDED.embedding_vector, embedding_provider = EXCLUDED.embedding_provider,
        embedding_model = EXCLUDED.embedding_model, embedding_version = EXCLUDED.embedding_version,
        embedded_at = EXCLUDED.embedded_at, page_number = EXCLUDED.page_number,
        slide_number = EXCLUDED.slide_number, sheet_name = EXCLUDED.sheet_name,
        source_ref = EXCLUDED.source_ref, token_count = EXCLUDED.token_count,
        metadata = EXCLUDED.metadata, updated_at = now()
      WHERE knowledge_document_chunks.tenant_id = ${context.tenantId}::uuid
    `);
  }

  async deleteDocument(context: TenantContext, documentId: string): Promise<void> {
    assertTenant(context);
    await this.db.execute(sql`
      DELETE FROM knowledge_documents
      WHERE id = ${documentId}::uuid AND tenant_id = ${context.tenantId}::uuid
    `);
  }
}

export class PersistentKnowledgeRetriever implements KnowledgeRetriever {
  constructor(
    private readonly db: Db,
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  search(context: TenantContext, query: string, limit = 8): Promise<KnowledgeHit[]> {
    return this.searchWithOptions(context, query, { limit });
  }

  async searchWithOptions(
    context: TenantContext,
    query: string,
    options: KnowledgeSearchOptions = {},
  ): Promise<KnowledgeHit[]> {
    assertTenant(context);
    const safeLimit = Math.min(Math.max(options.limit ?? 8, 1), 25);
    const embedding = await this.embeddingProvider.embed(query);
    assertEmbedding(embedding, this.embeddingProvider);
    const vector = vectorLiteral(embedding.vector);
    const terms = queryTerms(query);
    const metadata = JSON.stringify(options.metadata ?? {});

    const semanticResult = await this.db.execute(sql`
      SELECT c.id, c.tenant_id, c.document_id, c.text, c.source_ref, c.page_number,
        1 - (c.embedding_vector <=> ${vector}::vector) AS semantic_score
      FROM knowledge_document_chunks c
      INNER JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.tenant_id = ${context.tenantId}::uuid
        AND d.tenant_id = ${context.tenantId}::uuid
        AND d.status = 'ready'
        AND c.embedding_vector IS NOT NULL
        AND (${metadata}::jsonb = '{}'::jsonb OR c.metadata @> ${metadata}::jsonb)
      ORDER BY c.embedding_vector <=> ${vector}::vector
      LIMIT ${Math.min(safeLimit * 3, 75)}
    `);

    const lexicalResult = await this.db.execute(sql`
      SELECT c.id,
        ts_rank_cd(to_tsvector('simple', c.text), plainto_tsquery('simple', ${query})) AS lexical_score
      FROM knowledge_document_chunks c
      INNER JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.tenant_id = ${context.tenantId}::uuid
        AND d.tenant_id = ${context.tenantId}::uuid
        AND d.status = 'ready'
        AND (${metadata}::jsonb = '{}'::jsonb OR c.metadata @> ${metadata}::jsonb)
        AND to_tsvector('simple', c.text) @@ plainto_tsquery('simple', ${query})
      ORDER BY lexical_score DESC
      LIMIT ${Math.min(safeLimit * 3, 75)}
    `);

    // This second boundary ensures a broken adapter/mock cannot turn a
    // cross-tenant row into evidence after the database has applied RLS.
    const semanticRows = asRows(semanticResult).filter(
      (row) => String(row.tenant_id) === context.tenantId,
    );
    const semanticIds = new Set(semanticRows.map((row) => String(row.id)));
    const lexicalById = new Map<string, number>(
      asRows(lexicalResult)
        .filter((row) => semanticIds.has(String(row.id)))
        .map((row) => [String(row.id), Number(row.lexical_score ?? 0)]),
    );

    const hits: KnowledgeHit[] = semanticRows.map((row) => {
      const text = String(row.text ?? '');
      const semanticScore = Math.max(0, Math.min(1, Number(row.semantic_score ?? 0)));
      const lexicalScore = Math.max(0, Math.min(1, lexicalById.get(String(row.id)) ?? 0));
      const overlap = terms.length === 0
        ? 0
        : terms.filter((term) => text.toLowerCase().includes(term)).length / terms.length;
      const sourceRef = row.source_ref == null ? String(row.document_id) : String(row.source_ref);
      return {
        id: String(row.id), tenantId: context.tenantId, documentId: String(row.document_id), text,
        score: Math.max(0, Math.min(1, semanticScore * 0.65 + Math.min(1, lexicalScore * 3) * 0.2 + overlap * 0.15)),
        sourceRef, evidenceIds: [String(row.document_id)],
      };
    });

    return hits.sort((a, b) => b.score - a.score).slice(0, safeLimit);
  }
}

export interface CitationInput {
  tenantId: string;
  query: string;
  hits: KnowledgeHit[];
  agentRunId?: string;
  workflowRunId?: string;
}

export async function createKnowledgeCitations(db: Db, input: CitationInput): Promise<void> {
  for (const hit of input.hits.slice(0, 12)) {
    if (hit.tenantId !== input.tenantId) throw new Error('TENANT_SCOPE_DENIED:citation');
    await db.execute(sql`
      INSERT INTO knowledge_document_citations (
        id, tenant_id, document_id, chunk_id, agent_run_id, workflow_run_id,
        query, excerpt, relevance_score, source_ref, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${input.tenantId}::uuid, ${hit.documentId}::uuid, ${hit.id}::uuid,
        ${input.agentRunId ?? null}::uuid, ${input.workflowRunId ?? null}::uuid,
        ${input.query}, ${hit.text.slice(0, 700)}, ${hit.score}, ${hit.sourceRef ?? null}, now(), now()
      )
    `);
  }
}
