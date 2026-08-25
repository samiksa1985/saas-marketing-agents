import { and, desc, eq, ilike, or } from 'drizzle-orm';
import type { MarketingMemoryRecord, TenantContext } from '@platform/contracts';
import type { MemoryRepository, ContextQuery } from '@platform/context-engine';
import type { createDb } from '@platform/db';
import { marketingMemoryRecords, marketingOsPlanSnapshots, marketingOutcomeEvents } from '@platform/db';

type Db = ReturnType<typeof createDb>;

function assertTenant(context: TenantContext, tenantId: string): void {
  if (!context.tenantId || context.tenantId !== tenantId) throw new Error('TENANT_SCOPE_DENIED');
}

export class PersistentMarketingMemoryRepository implements MemoryRepository {
  constructor(private readonly db: Db) {}

  async put(context: TenantContext, record: MarketingMemoryRecord): Promise<void> {
    assertTenant(context, record.tenantId);
    await this.db.insert(marketingMemoryRecords).values({
      id: record.id, tenantId: record.tenantId, scope: record.scope, scopeId: record.scopeId,
      statement: record.statement, evidenceIds: record.evidenceIds,
      confidence: record.confidence ?? null, createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt),
    }).onConflictDoUpdate({
      target: marketingMemoryRecords.id,
      set: { statement: record.statement, evidenceIds: record.evidenceIds, confidence: record.confidence ?? null, updatedAt: new Date(record.updatedAt) },
    });
  }

  async search(context: TenantContext, query: ContextQuery): Promise<MarketingMemoryRecord[]> {
    assertTenant(context, query.tenantId);
    const predicates = [eq(marketingMemoryRecords.tenantId, context.tenantId)];
    if (query.scopes?.length) predicates.push(or(...query.scopes.map((scope)=>eq(marketingMemoryRecords.scope,scope)))!);
    if (query.scopeIds?.length) predicates.push(or(...query.scopeIds.map((scopeId)=>eq(marketingMemoryRecords.scopeId,scopeId)))!);
    if (query.keywords?.length) predicates.push(or(...query.keywords.map((keyword)=>ilike(marketingMemoryRecords.statement, `%${keyword}%`)))!);
    const rows = await this.db.select().from(marketingMemoryRecords)
      .where(and(...predicates))
      .orderBy(desc(marketingMemoryRecords.confidence), desc(marketingMemoryRecords.updatedAt))
      .limit(Math.min(query.limit ?? 20, 100));
    return rows.map((row)=>({
      id: row.id, tenantId: row.tenantId,
      scope: row.scope as MarketingMemoryRecord['scope'],
      scopeId: row.scopeId, statement: row.statement,
      evidenceIds: row.evidenceIds as string[],
      ...(row.confidence===null?{}:{confidence:row.confidence}),
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    }));
  }
}

export class MarketingOSPlanStore {
  constructor(private readonly db: Db) {}
  async save(plan: {planId:string;tenantId:string;goal:string;objective:string;plan:unknown;context:unknown;readiness:unknown}) {
    const now=new Date();
    await this.db.insert(marketingOsPlanSnapshots).values({
      id:plan.planId,tenantId:plan.tenantId,goal:plan.goal,objective:plan.objective,
      plan:plan.plan,context:plan.context,readiness:plan.readiness,createdAt:now,updatedAt:now,
    }).onConflictDoUpdate({
      target: marketingOsPlanSnapshots.id,
      set:{plan:plan.plan,context:plan.context,readiness:plan.readiness,updatedAt:now},
    });
    return {...plan,createdAt:now.toISOString()};
  }
}

export class MarketingOutcomeStore {
  constructor(private readonly db: Db) {}
  async append(event:{id:string;tenantId:string;type:string;metric:string;value:number;sourceEntityId:string;occurredAt:string;attributes:Record<string,unknown>}) {
    await this.db.insert(marketingOutcomeEvents).values({
      id:event.id,tenantId:event.tenantId,type:event.type,metric:event.metric,value:event.value,
      sourceEntityId:event.sourceEntityId,occurredAt:new Date(event.occurredAt),attributes:event.attributes,
    }).onConflictDoNothing();
  }
}
