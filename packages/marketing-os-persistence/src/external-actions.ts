import { and, asc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { TenantContext } from '@platform/contracts';
import {
  externalMarketingActionEvidence,
  externalMarketingActions,
  externalActionWorkflowOutbox,
} from '@platform/db';
import type {
  ExternalActionEvidence,
  ExternalActionStore,
  GovernedExternalAction,
} from '@platform/marketing-os-core';

import type { MarketingOSPersistenceDatabase } from './index.js';

function assertTenant(context: TenantContext, action?: GovernedExternalAction): void {
  if (!context.tenantId || (action && action.tenantId !== context.tenantId)) {
    throw new Error('TENANT_SCOPE_DENIED');
  }
}

/** PostgreSQL persistence for the provider-neutral governed-action port. */
export class PersistentExternalActionStore implements ExternalActionStore {
  constructor(private readonly db: MarketingOSPersistenceDatabase) {}

  async create(context: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction> {
    assertTenant(context, action);
    const now = new Date(action.updatedAt);
    await this.db
      .insert(externalMarketingActions)
      .values({
        id: action.id,
        tenantId: context.tenantId,
        organizationId: action.proposal.organizationId,
        actor: action.proposal.actor,
        agentIdentity: action.proposal.agentIdentity,
        workflowRunId: action.proposal.workflowRunId,
        recommendationId: action.proposal.recommendationId,
        provider: action.proposal.provider,
        accountId: action.proposal.accountId,
        campaignId: action.proposal.campaignId ?? null,
        actionType: action.proposal.actionType,
        targetLockKey: targetLockKey(action),
        proposal: action.proposal,
        status: action.status,
        approvalId: action.approvalId ?? null,
        simulation: action.simulation ?? null,
        budgetDecision: action.budgetDecision ?? null,
        policyDecision: action.policyDecision ?? null,
        policyVersion: action.policyDecision?.policyVersion ?? null,
        execution: action.execution ?? null,
        verification: action.verification ?? null,
        beforeState: action.proposal.rollback.before,
        failureCode: action.failureCode ?? null,
        failureMessage: action.failureMessage ?? null,
        idempotencyKey: action.idempotencyKey,
        expiresAt: action.proposal.expiresAt ? new Date(action.proposal.expiresAt) : null,
        version: action.version,
        requestedAt: new Date(action.requestedAt),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const persisted = await this.findByIdempotency(
      context,
      action.proposal.provider,
      action.id,
      action.idempotencyKey,
    );
    if (!persisted) throw new Error('EXTERNAL_ACTION_CREATE_FAILED');
    if (persisted.id !== action.id || persisted.idempotencyKey !== action.idempotencyKey) {
      throw new Error('EXTERNAL_ACTION_IDEMPOTENCY_MISMATCH');
    }
    if (persisted.evidence.length === 0 && action.evidence.length > 0) {
      await this.appendEvidence(context, action.id, action.evidence);
      return (await this.get(context, action.id))!;
    }
    return persisted;
  }

  async get(context: TenantContext, actionId: string): Promise<GovernedExternalAction | undefined> {
    assertTenant(context);
    const [row] = await this.db
      .select()
      .from(externalMarketingActions)
      .where(and(eq(externalMarketingActions.tenantId, context.tenantId), eq(externalMarketingActions.id, actionId)))
      .limit(1);
    return row ? this.toAction(context, row) : undefined;
  }

  async save(context: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction> {
    assertTenant(context, action);
    const now = new Date(action.updatedAt);
    const updated = await this.db
      .update(externalMarketingActions)
      .set({
        status: action.status,
        approvalId: action.approvalId ?? null,
        simulation: action.simulation ?? null,
        budgetDecision: action.budgetDecision ?? null,
        policyDecision: action.policyDecision ?? null,
        policyVersion: action.policyDecision?.policyVersion ?? null,
        execution: action.execution ?? null,
        verification: action.verification ?? null,
        failureCode: action.failureCode ?? null,
        failureMessage: action.failureMessage ?? null,
        version: action.version + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(externalMarketingActions.tenantId, context.tenantId),
          eq(externalMarketingActions.id, action.id),
          eq(externalMarketingActions.version, action.version),
        ),
      )
      .returning();
    if (!updated[0]) throw new Error('EXTERNAL_ACTION_OPTIMISTIC_CONFLICT');
    await this.appendEvidence(context, action.id, action.evidence);
    await this.enqueueTerminalOutcome(context, action);
    return this.toAction(context, updated[0]);
  }

  async findByIdempotency(
    context: TenantContext,
    provider: string,
    actionId: string,
    idempotencyKey: string,
  ): Promise<GovernedExternalAction | undefined> {
    assertTenant(context);
    const [row] = await this.db
      .select()
      .from(externalMarketingActions)
      .where(
        and(
          eq(externalMarketingActions.tenantId, context.tenantId),
          eq(externalMarketingActions.provider, provider),
          eq(externalMarketingActions.id, actionId),
          eq(externalMarketingActions.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row ? this.toAction(context, row) : undefined;
  }

  private async toAction(
    context: TenantContext,
    row: typeof externalMarketingActions.$inferSelect,
  ): Promise<GovernedExternalAction> {
    const evidence = await this.listEvidence(context, row.id);
    return {
      id: row.id,
      tenantId: row.tenantId,
      planId: row.recommendationId,
      workflowId: row.workflowRunId,
      type: row.actionType,
      idempotencyKey: row.idempotencyKey,
      status: row.status as GovernedExternalAction['status'],
      ...(row.approvalId ? { approvalId: row.approvalId } : {}),
      ...(row.failureCode ? { failureCode: row.failureCode } : {}),
      ...(row.failureMessage ? { failureMessage: row.failureMessage } : {}),
      requestedAt: row.requestedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      proposal: row.proposal as GovernedExternalAction['proposal'],
      ...(row.simulation ? { simulation: row.simulation as NonNullable<GovernedExternalAction['simulation']> } : {}),
      ...(row.budgetDecision ? { budgetDecision: row.budgetDecision as NonNullable<GovernedExternalAction['budgetDecision']> } : {}),
      ...(row.policyDecision ? { policyDecision: row.policyDecision as NonNullable<GovernedExternalAction['policyDecision']> } : {}),
      ...(row.execution ? { execution: row.execution as NonNullable<GovernedExternalAction['execution']> } : {}),
      ...(row.verification ? { verification: row.verification as NonNullable<GovernedExternalAction['verification']> } : {}),
      evidence,
      version: row.version,
    };
  }

  private async appendEvidence(
    context: TenantContext,
    actionId: string,
    evidence: ExternalActionEvidence[],
  ): Promise<void> {
    const existing = new Set((await this.listEvidence(context, actionId)).map((item) => item.id));
    const missing = evidence.filter((item) => !existing.has(item.id));
    if (!missing.length) return;
    await this.db.insert(externalMarketingActionEvidence).values(
      missing.map((item) => ({
        id: item.id,
        tenantId: context.tenantId,
        actionId,
        type: item.type,
        payload: item.payload,
        occurredAt: new Date(item.occurredAt),
        createdAt: new Date(item.occurredAt),
        updatedAt: new Date(item.occurredAt),
      })),
    );
  }

  private async listEvidence(context: TenantContext, actionId: string): Promise<ExternalActionEvidence[]> {
    const rows = await this.db
      .select()
      .from(externalMarketingActionEvidence)
      .where(
        and(
          eq(externalMarketingActionEvidence.tenantId, context.tenantId),
          eq(externalMarketingActionEvidence.actionId, actionId),
        ),
      )
      .orderBy(asc(externalMarketingActionEvidence.occurredAt));
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: row.payload as Record<string, unknown>,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  /**
   * Persist a workflow-continuation message in the same tenant-scoped
   * transaction as the lifecycle save. The unique idempotency key makes a
   * process restart or repeated save a safe replay rather than a duplicate.
   */
  private async enqueueTerminalOutcome(context: TenantContext, action: GovernedExternalAction): Promise<void> {
    if (!isWorkflowOutcomeState(action.status)) return;
    const occurredAt = new Date(action.updatedAt);
    const idempotencyKey = `external-action:${action.id}:${action.status}`;
    await this.db
      .insert(externalActionWorkflowOutbox)
      .values({
        id: `external-action-outbox:${action.id}:${action.status}`,
        tenantId: context.tenantId,
        workflowRunId: action.proposal.workflowRunId,
        externalActionId: action.id,
        eventType: `EXTERNAL_ACTION_${action.status}`,
        state: action.status,
        provider: action.proposal.provider,
        accountId: action.proposal.accountId,
        campaignId: action.proposal.campaignId ?? null,
        verificationStatus: action.verification?.status ?? null,
        correlationId: action.id,
        idempotencyKey,
        payload: {
          externalActionId: action.id,
          state: action.status,
          provider: action.proposal.provider,
          accountId: action.proposal.accountId,
          ...(action.proposal.campaignId ? { campaignId: action.proposal.campaignId } : {}),
          ...(action.verification ? { verificationStatus: action.verification.status } : {}),
        },
        deliveryStatus: 'PENDING',
        deliveryAttempts: 0,
        occurredAt,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      })
      .onConflictDoNothing();
  }
}

export interface ExternalActionWorkflowOutboxEvent {
  id: string;
  tenantId: string;
  workflowRunId: string;
  externalActionId: string;
  eventType: string;
  state: string;
  provider: string;
  accountId: string;
  campaignId?: string;
  verificationStatus?: string;
  correlationId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  deliveryStatus: 'PENDING' | 'DELIVERED' | 'FAILED';
  deliveryAttempts: number;
  occurredAt: string;
  deliveredAt?: string;
}

/**
 * A workflow worker reads and acknowledges this table after a restart. It is
 * intentionally a delivery port, not a second workflow engine.
 */
export class PersistentExternalActionOutcomeStore {
  constructor(private readonly db: MarketingOSPersistenceDatabase) {}

  async listPending(
    context: TenantContext,
    workflowRunId?: string,
  ): Promise<ExternalActionWorkflowOutboxEvent[]> {
    assertTenant(context);
    const predicates = [
      eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
      eq(externalActionWorkflowOutbox.deliveryStatus, 'PENDING'),
    ];
    if (workflowRunId) predicates.push(eq(externalActionWorkflowOutbox.workflowRunId, workflowRunId));
    const rows = await this.db
      .select()
      .from(externalActionWorkflowOutbox)
      .where(and(...predicates))
      .orderBy(asc(externalActionWorkflowOutbox.occurredAt));
    return rows.map(outboxEvent);
  }

  async markDelivered(context: TenantContext, eventId: string): Promise<ExternalActionWorkflowOutboxEvent> {
    assertTenant(context);
    const [row] = await this.db
      .update(externalActionWorkflowOutbox)
      .set({
        deliveryStatus: 'DELIVERED',
        deliveryAttempts: 1,
        deliveredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
          eq(externalActionWorkflowOutbox.id, eventId),
          eq(externalActionWorkflowOutbox.deliveryStatus, 'PENDING'),
        ),
      )
      .returning();
    if (row) return outboxEvent(row);
    const [existing] = await this.db
      .select()
      .from(externalActionWorkflowOutbox)
      .where(
        and(
          eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
          eq(externalActionWorkflowOutbox.id, eventId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error('EXTERNAL_ACTION_OUTBOX_NOT_FOUND');
    return outboxEvent(existing);
  }
}

function outboxEvent(row: typeof externalActionWorkflowOutbox.$inferSelect): ExternalActionWorkflowOutboxEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workflowRunId: row.workflowRunId,
    externalActionId: row.externalActionId,
    eventType: row.eventType,
    state: row.state,
    provider: row.provider,
    accountId: row.accountId,
    ...(row.campaignId ? { campaignId: row.campaignId } : {}),
    ...(row.verificationStatus ? { verificationStatus: row.verificationStatus } : {}),
    correlationId: row.correlationId,
    idempotencyKey: row.idempotencyKey,
    payload: row.payload as Record<string, unknown>,
    deliveryStatus: row.deliveryStatus as ExternalActionWorkflowOutboxEvent['deliveryStatus'],
    deliveryAttempts: row.deliveryAttempts,
    occurredAt: row.occurredAt.toISOString(),
    ...(row.deliveredAt ? { deliveredAt: row.deliveredAt.toISOString() } : {}),
  };
}

function isWorkflowOutcomeState(status: GovernedExternalAction['status']): boolean {
  return ['VERIFIED', 'FAILED', 'REJECTED', 'CANCELLED', 'ROLLBACK_REQUIRED', 'ROLLED_BACK'].includes(status);
}

function targetLockKey(action: GovernedExternalAction): string {
  return createHash('sha256')
    .update(JSON.stringify([
      action.tenantId,
      action.proposal.provider,
      action.proposal.accountId,
      action.proposal.campaignId ?? action.proposal.accountId,
    ]))
    .digest('hex');
}
