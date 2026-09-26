import { and, eq } from 'drizzle-orm';
import type {
  CreateDurableApprovalInput,
  DecideDurableApprovalInput,
  DurableApprovalRecord,
  DurableApprovalRepository,
} from '@platform/approvals';
import type { TenantContext } from '@platform/contracts';
import { auditEvents, marketingOsApprovalRecords } from '@platform/db';
import type { MarketingOSPersistenceDatabase } from './index.js';

function assertTenant(context: TenantContext): void {
  if (!context.tenantId) throw new Error('TENANT_CONTEXT_REQUIRED');
}

/** PostgreSQL backing for the existing canonical ApprovalApiService. */
export class PersistentDurableApprovalRepository implements DurableApprovalRepository {
  constructor(private readonly db: MarketingOSPersistenceDatabase) {}

  async create(
    context: TenantContext,
    input: CreateDurableApprovalInput,
  ): Promise<DurableApprovalRecord> {
    assertTenant(context);
    const now = new Date();
    const inserted = await this.db
      .insert(marketingOsApprovalRecords)
      .values({
        id: input.id,
        tenantId: context.tenantId,
        artifactId: input.artifactId,
        planId: input.planId ?? null,
        workflowId: input.workflowId ?? null,
        executionBindingId: input.executionBindingId ?? null,
        requestedByUserId: context.userId ?? null,
        requestedAt: now,
        status: 'PENDING',
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        conditions: input.conditions ?? [],
        reason: input.reason ?? null,
        policyReference: input.policyReference ?? null,
        riskLevel: input.riskLevel ?? null,
        actionSummary: input.actionSummary ?? null,
        creationIdempotencyKey: input.idempotencyKey,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: marketingOsApprovalRecords.id });
    const record = await this.getByCreationIdempotencyKey(context, input.idempotencyKey);
    if (!record) throw new Error('APPROVAL_CREATE_FAILED');
    if (record.artifactId !== input.artifactId || record.planId !== input.planId) {
      throw new Error('APPROVAL_IDEMPOTENCY_MISMATCH');
    }
    if (inserted.length > 0) {
      await this.appendAudit(context, record, 'MARKETING_OS_APPROVAL_CREATED');
    }
    return record;
  }

  async get(context: TenantContext, approvalId: string): Promise<DurableApprovalRecord | undefined> {
    assertTenant(context);
    const [row] = await this.db
      .select()
      .from(marketingOsApprovalRecords)
      .where(
        and(
          eq(marketingOsApprovalRecords.tenantId, context.tenantId),
          eq(marketingOsApprovalRecords.id, approvalId),
        ),
      )
      .limit(1);
    return row ? fromRow(row) : undefined;
  }

  async decide(
    context: TenantContext,
    approvalId: string,
    input: DecideDurableApprovalInput,
  ): Promise<DurableApprovalRecord> {
    const record = await this.get(context, approvalId);
    if (!record) throw new Error('APPROVAL_NOT_FOUND');
    if (record.decision) {
      if (input.idempotencyKey && record.decisionIdempotencyKey === input.idempotencyKey) {
        return record;
      }
      throw new Error('APPROVAL_ALREADY_DECIDED');
    }
    const now = new Date();
    const status =
      input.decision === 'approved' || input.decision === 'approved_with_conditions'
        ? 'APPROVED'
        : input.decision === 'rejected'
          ? 'REJECTED'
          : 'EXPIRED';
    const updated = await this.db
      .update(marketingOsApprovalRecords)
      .set({
        decision: input.decision,
        status,
        conditions: input.conditions ?? [],
        approverUserId: context.userId ?? null,
        decidedAt: now,
        decisionIdempotencyKey: input.idempotencyKey ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(marketingOsApprovalRecords.tenantId, context.tenantId),
          eq(marketingOsApprovalRecords.id, approvalId),
          eq(marketingOsApprovalRecords.status, 'PENDING'),
        ),
      )
      .returning();
    if (updated[0]) {
      const decided = fromRow(updated[0]);
      await this.appendAudit(context, decided, 'MARKETING_OS_APPROVAL_DECIDED');
      return decided;
    }
    const current = await this.get(context, approvalId);
    if (current && current.decisionIdempotencyKey === input.idempotencyKey) return current;
    throw new Error('APPROVAL_ALREADY_DECIDED');
  }

  async list(context: TenantContext): Promise<DurableApprovalRecord[]> {
    assertTenant(context);
    const rows = await this.db
      .select()
      .from(marketingOsApprovalRecords)
      .where(eq(marketingOsApprovalRecords.tenantId, context.tenantId));
    return rows.map(fromRow);
  }

  private async getByCreationIdempotencyKey(
    context: TenantContext,
    idempotencyKey: string,
  ): Promise<DurableApprovalRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(marketingOsApprovalRecords)
      .where(
        and(
          eq(marketingOsApprovalRecords.tenantId, context.tenantId),
          eq(marketingOsApprovalRecords.creationIdempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row ? fromRow(row) : undefined;
  }

  private async appendAudit(
    context: TenantContext,
    record: DurableApprovalRecord,
    type: string,
  ): Promise<void> {
    await this.db.insert(auditEvents).values({
      tenantId: context.tenantId,
      type,
      actorType: context.userId ? 'user' : 'system',
      correlationId: record.id,
      payload: {
        approvalId: record.id,
        planId: record.planId ?? null,
        workflowId: record.workflowId ?? null,
        status: record.status,
        decision: record.decision ?? null,
      },
      occurredAt: new Date(),
    });
  }
}

function fromRow(row: typeof marketingOsApprovalRecords.$inferSelect): DurableApprovalRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    artifactId: row.artifactId,
    status: row.status as DurableApprovalRecord['status'],
    ...(row.planId ? { planId: row.planId } : {}),
    ...(row.workflowId ? { workflowId: row.workflowId } : {}),
    ...(row.executionBindingId ? { executionBindingId: row.executionBindingId } : {}),
    ...(row.requestedByUserId ? { requestedByUserId: row.requestedByUserId } : {}),
    ...(row.approverUserId ? { approverUserId: row.approverUserId } : {}),
    ...(row.decision ? { decision: row.decision as NonNullable<DurableApprovalRecord['decision']> } : {}),
    ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
    ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.policyReference ? { policyReference: row.policyReference } : {}),
    ...(row.riskLevel ? { riskLevel: row.riskLevel } : {}),
    ...(row.actionSummary ? { actionSummary: row.actionSummary } : {}),
    ...(row.decisionIdempotencyKey ? { decisionIdempotencyKey: row.decisionIdempotencyKey } : {}),
    conditions: row.conditions as string[],
    requestedAt: row.requestedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    creationIdempotencyKey: row.creationIdempotencyKey,
  };
}
