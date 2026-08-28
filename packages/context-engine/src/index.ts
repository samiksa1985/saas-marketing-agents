import type {
  ArtifactReference,
  Id,
  MarketingMemoryRecord,
  TenantContext,
} from '@platform/contracts';

export type ContextScope = MarketingMemoryRecord['scope'];

export interface ContextQuery {
  tenantId: string;
  scopes?: ContextScope[];
  scopeIds?: string[];
  keywords?: string[];
  limit?: number;
  minConfidence?: number;
}

export interface ContextSource {
  id: Id;
  tenantId: Id;
  type: 'company' | 'document' | 'memory' | 'artifact' | 'outcome' | 'crm' | 'marketing';
  title: string;
  summary: string;
  evidenceIds: Id[];
  sourceRef?: string;
  observedAt?: string;
  confidence?: number;
}

export interface KnowledgeHit {
  id: Id;
  tenantId: Id;
  documentId: Id;
  text: string;
  score: number;
  sourceRef?: string;
  evidenceIds: Id[];
}

export interface KnowledgeRetriever {
  search(context: TenantContext, query: string, limit?: number): Promise<KnowledgeHit[]>;
}

export interface MemoryRepository {
  put(context: TenantContext, record: MarketingMemoryRecord): Promise<void>;
  search(
    context: TenantContext,
    query: {
      scopes?: ContextScope[];
      scopeIds?: Id[];
      keywords?: string[];
      limit?: number;
      minConfidence?: number;
    },
  ): Promise<MarketingMemoryRecord[]>;
}

export class InMemoryMarketingMemoryRepository implements MemoryRepository {
  private readonly records = new Map<Id, MarketingMemoryRecord>();

  async put(context: TenantContext, record: MarketingMemoryRecord): Promise<void> {
    if (record.tenantId !== context.tenantId) {
      throw new Error('TENANT_SCOPE_DENIED:memory-write');
    }
    this.records.set(record.id, { ...record });
  }

  async search(context: TenantContext, query: {
    scopes?: ContextScope[];
    scopeIds?: Id[];
    keywords?: string[];
    limit?: number;
    minConfidence?: number;
  }): Promise<MarketingMemoryRecord[]> {
    const scopes = new Set(query.scopes ?? []);
    const scopeIds = new Set(query.scopeIds ?? []);
    const keywords = (query.keywords ?? []).map((x) => x.toLowerCase()).filter(Boolean);

    return [...this.records.values()]
      .filter((item) => item.tenantId === context.tenantId)
      .filter((item) => scopes.size === 0 || scopes.has(item.scope))
      .filter((item) => scopeIds.size === 0 || scopeIds.has(item.scopeId))
      .filter((item) => keywords.length === 0 || keywords.some((k) => item.statement.toLowerCase().includes(k)))
      .filter((item) => query.minConfidence === undefined || (item.confidence ?? 0) >= query.minConfidence)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, Math.min(query.limit ?? 20, 100))
      .map((item) => ({ ...item }));
  }
}

export class InMemoryKnowledgeRetriever implements KnowledgeRetriever {
  constructor(private readonly hits: KnowledgeHit[] = []) {}

  async search(context: TenantContext, query: string, limit = 8): Promise<KnowledgeHit[]> {
    const tokens = query.toLowerCase().split(/\s+/).filter((x) => x.length > 2);
    return this.hits
      .filter((hit) => hit.tenantId === context.tenantId)
      .map((hit) => {
        const overlap = tokens.length
          ? tokens.filter((token) => hit.text.toLowerCase().includes(token)).length / tokens.length
          : 0;
        return { hit, score: Math.max(hit.score, overlap) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(limit, 25))
      .map(({ hit, score }) => ({ ...hit, score }));
  }
}

export interface MarketingOperationalContext {
  companyProfile?: unknown;
  documents?: unknown[];
  crm?: unknown;
  marketing?: unknown;
  analytics?: unknown;
  finance?: unknown;
}

export interface MarketingContextSnapshot {
  tenantId: Id;
  generatedAt: string;
  memories: MarketingMemoryRecord[];
  knowledge: KnowledgeHit[];
  artifacts: ArtifactReference[];
  sources: ContextSource[];
  operational?: MarketingOperationalContext;
}

export interface BuildContextRequest {
  context: TenantContext;
  memoryQuery?: {
    scopes?: ContextScope[];
    scopeIds?: Id[];
    keywords?: string[];
    limit?: number;
    minConfidence?: number;
  };
  knowledgeQuery?: string;
  artifacts?: ArtifactReference[];
  operational?: MarketingOperationalContext;
}

export class MarketingContextBuilder {
  constructor(
    private readonly memory: MemoryRepository,
    private readonly knowledge: KnowledgeRetriever,
  ) {}

  async build(request: BuildContextRequest): Promise<MarketingContextSnapshot> {
    if (!request.context.tenantId) {
      throw new Error('TENANT_CONTEXT_REQUIRED');
    }

    const [memories, knowledge] = await Promise.all([
      this.memory.search(request.context, request.memoryQuery ?? {}),
      request.knowledgeQuery
        ? this.knowledge.search(request.context, request.knowledgeQuery, 8)
        : Promise.resolve([]),
    ]);

    const sources: ContextSource[] = [
      ...memories.map((memory) => ({
        id: memory.id,
        tenantId: request.context.tenantId,
        type: 'memory' as const,
        title: memory.scope,
        summary: memory.statement,
        evidenceIds: memory.evidenceIds,
        observedAt: memory.updatedAt,
        ...(memory.confidence === undefined ? {} : { confidence: memory.confidence }),
      })),
      ...knowledge.map((hit) => ({
        id: hit.id,
        tenantId: request.context.tenantId,
        type: 'document' as const,
        title: hit.documentId,
        summary: hit.text.slice(0, 300),
        evidenceIds: hit.evidenceIds,
        ...(hit.sourceRef === undefined ? {} : { sourceRef: hit.sourceRef }),
        confidence: hit.score,
      })),
    ];

    return {
      tenantId: request.context.tenantId,
      generatedAt: new Date().toISOString(),
      memories,
      knowledge,
      artifacts: request.artifacts ?? [],
      sources,
      ...(request.operational ? { operational: request.operational } : {}),
    };
  }
}

export function createMemoryRecord(args: {
  tenantId: Id;
  scope: ContextScope;
  scopeId: Id;
  statement: string;
  evidenceIds?: Id[];
  confidence?: number;
}): MarketingMemoryRecord {
  const now = new Date().toISOString();
  return {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: args.tenantId,
    scope: args.scope,
    scopeId: args.scopeId,
    statement: args.statement,
    evidenceIds: args.evidenceIds ?? [],
    ...(args.confidence === undefined ? {} : { confidence: args.confidence }),
    createdAt: now,
    updatedAt: now,
  };
}



