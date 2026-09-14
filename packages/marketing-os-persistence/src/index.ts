import { and, desc, eq, ilike, or } from 'drizzle-orm';
import type { MarketingMemoryRecord, TenantContext } from '@platform/contracts';
import type { MemoryRepository, ContextQuery } from '@platform/context-engine';
import type {
  ExecutionRecord,
  MarketingOSExecutionRecordRepository,
  MarketingOSPlan,
  MarketingOSPlanRepository,
} from '@platform/marketing-os-core';
import type { createDb } from '@platform/db';
import {
  marketingMemoryRecords,
  marketingOsExecutionRecords,
  marketingOsPlanSnapshots,
  marketingOutcomeEvents,
} from '@platform/db';

/** Operations required by the stores; both the root Drizzle client and its
 * transaction object implement this surface. */
export type MarketingOSPersistenceDatabase = Pick<
  ReturnType<typeof createDb>,
  'execute' | 'insert' | 'select' | 'update'
>;
type Db = MarketingOSPersistenceDatabase;

function assertTenant(context: TenantContext, tenantId: string): void {
  if (!context.tenantId || context.tenantId !== tenantId) throw new Error('TENANT_SCOPE_DENIED');
}

export class PersistentMarketingMemoryRepository implements MemoryRepository {
  constructor(private readonly db: Db) {}

  async put(context: TenantContext, record: MarketingMemoryRecord): Promise<void> {
    assertTenant(context, record.tenantId);
    await this.db
      .insert(marketingMemoryRecords)
      .values({
        id: record.id,
        tenantId: record.tenantId,
        scope: record.scope,
        scopeId: record.scopeId,
        statement: record.statement,
        evidenceIds: record.evidenceIds,
        confidence: record.confidence ?? null,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      })
      .onConflictDoUpdate({
        target: marketingMemoryRecords.id,
        set: {
          statement: record.statement,
          evidenceIds: record.evidenceIds,
          confidence: record.confidence ?? null,
          updatedAt: new Date(record.updatedAt),
        },
      });
  }

  async search(context: TenantContext, query: ContextQuery): Promise<MarketingMemoryRecord[]> {
    assertTenant(context, query.tenantId);
    const predicates = [eq(marketingMemoryRecords.tenantId, context.tenantId)];
    if (query.scopes?.length)
      predicates.push(or(...query.scopes.map((scope) => eq(marketingMemoryRecords.scope, scope)))!);
    if (query.scopeIds?.length)
      predicates.push(
        or(...query.scopeIds.map((scopeId) => eq(marketingMemoryRecords.scopeId, scopeId)))!,
      );
    if (query.keywords?.length)
      predicates.push(
        or(
          ...query.keywords.map((keyword) =>
            ilike(marketingMemoryRecords.statement, `%${keyword}%`),
          ),
        )!,
      );
    const rows = await this.db
      .select()
      .from(marketingMemoryRecords)
      .where(and(...predicates))
      .orderBy(desc(marketingMemoryRecords.confidence), desc(marketingMemoryRecords.updatedAt))
      .limit(Math.min(query.limit ?? 20, 100));
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      scope: row.scope as MarketingMemoryRecord['scope'],
      scopeId: row.scopeId,
      statement: row.statement,
      evidenceIds: row.evidenceIds as string[],
      ...(row.confidence === null ? {} : { confidence: row.confidence }),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}

/** PostgreSQL implementation of the tenant-scoped Marketing OS plan port. */
export class MarketingOSPlanStore implements MarketingOSPlanRepository {
  constructor(private readonly db: Db) {}

  async save(context: TenantContext, plan: MarketingOSPlan): Promise<MarketingOSPlan> {
    assertTenant(context, plan.plan.tenantId);
    const now = new Date();
    await this.db
      .insert(marketingOsPlanSnapshots)
      .values({
        tenantId: context.tenantId,
        planId: plan.plan.planId,
        goal: plan.plan.goal,
        objective: plan.plan.objective,
        plan: plan.plan,
        context: plan.context,
        acquisition: plan.acquisition,
        readiness: plan.readiness,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [marketingOsPlanSnapshots.tenantId, marketingOsPlanSnapshots.planId],
        set: {
          goal: plan.plan.goal,
          objective: plan.plan.objective,
          plan: plan.plan,
          context: plan.context,
          acquisition: plan.acquisition,
          readiness: plan.readiness,
          updatedAt: now,
        },
      });
    return plan;
  }

  async get(context: TenantContext, planId: string): Promise<MarketingOSPlan | undefined> {
    const [row] = await this.db
      .select()
      .from(marketingOsPlanSnapshots)
      .where(
        and(
          eq(marketingOsPlanSnapshots.tenantId, context.tenantId),
          eq(marketingOsPlanSnapshots.planId, planId),
        ),
      )
      .limit(1);
    if (!row) return undefined;

    const plan = {
      plan: row.plan,
      context: row.context,
      acquisition: row.acquisition,
      readiness: row.readiness,
    } as MarketingOSPlan;
    assertTenant(context, plan.plan.tenantId);
    if (plan.plan.planId !== planId) throw new Error('MARKETING_OS_PLAN_ID_MISMATCH');
    return plan;
  }
}

/** PostgreSQL implementation of the durable execution-binding port. */
export class PersistentMarketingOSExecutionRecordRepository
  implements MarketingOSExecutionRecordRepository
{
  constructor(private readonly db: Db) {}

  async save(context: TenantContext, record: ExecutionRecord): Promise<ExecutionRecord> {
    assertTenant(context, record.tenantId);
    const now = new Date(record.updatedAt);
    await this.db
      .insert(marketingOsExecutionRecords)
      .values({
        tenantId: record.tenantId,
        planId: record.planId,
        engagementId: record.engagementId,
        locale: record.locale,
        idempotencyKey: record.idempotencyKey,
        workflowId: record.workflowId ?? null,
        approvalId: record.approvalId ?? null,
        status: record.status,
        approved: record.approved,
        reasons: record.reasons,
        createdAt: new Date(record.createdAt),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [marketingOsExecutionRecords.tenantId, marketingOsExecutionRecords.planId],
        set: {
          engagementId: record.engagementId,
          locale: record.locale,
          idempotencyKey: record.idempotencyKey,
          workflowId: record.workflowId ?? null,
          approvalId: record.approvalId ?? null,
          status: record.status,
          approved: record.approved,
          reasons: record.reasons,
          updatedAt: now,
        },
      });
    return copyExecutionRecord(record);
  }

  async get(context: TenantContext, planId: string): Promise<ExecutionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(marketingOsExecutionRecords)
      .where(
        and(
          eq(marketingOsExecutionRecords.tenantId, context.tenantId),
          eq(marketingOsExecutionRecords.planId, planId),
        ),
      )
      .limit(1);
    return row ? toExecutionRecord(row) : undefined;
  }

  async findByIdempotencyKey(
    context: TenantContext,
    idempotencyKey: string,
  ): Promise<ExecutionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(marketingOsExecutionRecords)
      .where(
        and(
          eq(marketingOsExecutionRecords.tenantId, context.tenantId),
          eq(marketingOsExecutionRecords.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row ? toExecutionRecord(row) : undefined;
  }
}

function toExecutionRecord(row: typeof marketingOsExecutionRecords.$inferSelect): ExecutionRecord {
  return {
    tenantId: row.tenantId,
    planId: row.planId,
    engagementId: row.engagementId,
    locale: row.locale as ExecutionRecord['locale'],
    idempotencyKey: row.idempotencyKey,
    ...(row.workflowId ? { workflowId: row.workflowId } : {}),
    ...(row.approvalId ? { approvalId: row.approvalId } : {}),
    status: row.status as ExecutionRecord['status'],
    approved: row.approved,
    reasons: row.reasons as string[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function copyExecutionRecord(record: ExecutionRecord): ExecutionRecord {
  return { ...record, reasons: [...record.reasons] };
}

export class MarketingOutcomeStore {
  constructor(private readonly db: Db) {}
  async append(event: {
    id: string;
    tenantId: string;
    type: string;
    metric: string;
    value: number;
    sourceEntityId: string;
    occurredAt: string;
    attributes: Record<string, unknown>;
  }) {
    await this.db
      .insert(marketingOutcomeEvents)
      .values({
        id: event.id,
        tenantId: event.tenantId,
        type: event.type,
        metric: event.metric,
        value: event.value,
        sourceEntityId: event.sourceEntityId,
        occurredAt: new Date(event.occurredAt),
        attributes: event.attributes,
      })
      .onConflictDoNothing();
  }
}
export * from './knowledge.js';
export * from './approvals.js';

export * from './external-actions.js';
export * from './external-action-reliability.js';
export * from './external-action-policies.js';
export * from './unified-campaigns.js';
export * from './performance-optimization.js';

export * from './sales.js';

export * from './company-intelligence.js';

export * from './market-intelligence.js';

export * from './strategy.js';

export * from './customer-success.js';
export * from './cfo.js';

export * from './analytics.js';

export * from './billing.js';

export * from './billing-authority.js';

export * from './billing-usage.js';

export * from './automation.js';

export * from './marketing-execution.js';

export * from './governance.js';
