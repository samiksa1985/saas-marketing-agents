import { and, asc, eq } from 'drizzle-orm';

import type { TenantContext } from '@platform/contracts';
import {
  unifiedCampaignExecutionSteps,
  unifiedCampaignPerformanceSnapshots,
  unifiedCampaignRecommendations,
  unifiedCampaigns,
} from '@platform/db';
import type {
  CampaignOptimizationRecommendation,
  CampaignPerformanceSnapshot,
  CampaignExecutionStep,
  CampaignExecutionOutcome,
  UnifiedCampaign,
  UnifiedCampaignStore,
} from '@platform/marketing-os-core';

import type { MarketingOSPersistenceDatabase } from './index.js';

function assertTenant(context: TenantContext, tenantId?: string): void {
  if (!context.tenantId || (tenantId && tenantId !== context.tenantId)) {
    throw new Error('TENANT_SCOPE_DENIED');
  }
}

/**
 * PostgreSQL store for provider-neutral campaign intent. It persists only
 * campaign state and references to existing governed actions; privileged
 * provider execution remains owned by the external-action control plane.
 */
export class PersistentUnifiedCampaignStore implements UnifiedCampaignStore {
  constructor(private readonly db: MarketingOSPersistenceDatabase) {}

  async create(context: TenantContext, campaign: UnifiedCampaign): Promise<UnifiedCampaign> {
    assertTenant(context, campaign.tenantId);
    await this.db.insert(unifiedCampaigns).values(campaignValues(campaign)).onConflictDoNothing();
    const persisted = await this.findByIdempotencyKey(context, campaign.idempotencyKey);
    if (!persisted) throw new Error('UNIFIED_CAMPAIGN_CREATE_FAILED');
    if (persisted.id !== campaign.id) throw new Error('UNIFIED_CAMPAIGN_IDEMPOTENCY_MISMATCH');
    return persisted;
  }

  async get(context: TenantContext, campaignId: string): Promise<UnifiedCampaign | undefined> {
    assertTenant(context);
    const [row] = await this.db
      .select()
      .from(unifiedCampaigns)
      .where(and(eq(unifiedCampaigns.tenantId, context.tenantId), eq(unifiedCampaigns.id, campaignId)))
      .limit(1);
    return row ? toCampaign(row) : undefined;
  }

  async save(context: TenantContext, campaign: UnifiedCampaign): Promise<UnifiedCampaign> {
    assertTenant(context, campaign.tenantId);
    const [row] = await this.db
      .update(unifiedCampaigns)
      .set({
        objective: campaign.objective,
        goal: campaign.goal,
        locale: campaign.locale,
        currency: campaign.budget.currency,
        totalBudgetMinor: campaign.budget.amountMinor,
        minorUnitScale: campaign.budget.minorUnitScale,
        lifecycle: campaign.lifecycle,
        definition: campaign,
        executionPlan: campaign.executionPlan ?? null,
        workflowId: campaign.workflow?.workflowId ?? null,
        evidenceReferences: campaign.evidenceReferences,
        updatedAt: new Date(campaign.updatedAt),
      })
      .where(and(eq(unifiedCampaigns.tenantId, context.tenantId), eq(unifiedCampaigns.id, campaign.id)))
      .returning();
    if (!row) throw new Error('UNIFIED_CAMPAIGN_NOT_FOUND');
    if (campaign.executionPlan) await this.saveSteps(context, campaign, campaign.executionPlan.steps);
    return toCampaign(row);
  }

  async findByIdempotencyKey(
    context: TenantContext,
    idempotencyKey: string,
  ): Promise<UnifiedCampaign | undefined> {
    assertTenant(context);
    const [row] = await this.db
      .select()
      .from(unifiedCampaigns)
      .where(and(
        eq(unifiedCampaigns.tenantId, context.tenantId),
        eq(unifiedCampaigns.idempotencyKey, idempotencyKey),
      ))
      .limit(1);
    return row ? toCampaign(row) : undefined;
  }

  async savePerformanceSnapshot(
    context: TenantContext,
    snapshot: CampaignPerformanceSnapshot,
  ): Promise<CampaignPerformanceSnapshot> {
    assertTenant(context, snapshot.tenantId);
    await this.db
      .insert(unifiedCampaignPerformanceSnapshots)
      .values({
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        unifiedCampaignId: snapshot.campaignId,
        channelId: snapshot.channelId,
        provider: snapshot.provider,
        currency: snapshot.currency,
        metrics: snapshot.metrics,
        provenance: snapshot.provenance,
        verification: snapshot.verification,
        capturedAt: new Date(snapshot.capturedAt),
        freshnessExpiresAt: new Date(snapshot.freshnessExpiresAt),
        createdAt: new Date(snapshot.capturedAt),
        updatedAt: new Date(snapshot.capturedAt),
      })
      .onConflictDoUpdate({
        target: unifiedCampaignPerformanceSnapshots.id,
        set: {
          metrics: snapshot.metrics,
          provenance: snapshot.provenance,
          verification: snapshot.verification,
          capturedAt: new Date(snapshot.capturedAt),
          freshnessExpiresAt: new Date(snapshot.freshnessExpiresAt),
          updatedAt: new Date(snapshot.capturedAt),
        },
      });
    return copy(snapshot);
  }

  async listPerformanceSnapshots(
    context: TenantContext,
    campaignId: string,
  ): Promise<CampaignPerformanceSnapshot[]> {
    assertTenant(context);
    const rows = await this.db
      .select()
      .from(unifiedCampaignPerformanceSnapshots)
      .where(and(
        eq(unifiedCampaignPerformanceSnapshots.tenantId, context.tenantId),
        eq(unifiedCampaignPerformanceSnapshots.unifiedCampaignId, campaignId),
      ))
      .orderBy(asc(unifiedCampaignPerformanceSnapshots.capturedAt));
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      campaignId: row.unifiedCampaignId,
      channelId: row.channelId,
      provider: row.provider as CampaignPerformanceSnapshot['provider'],
      currency: row.currency,
      metrics: row.metrics as CampaignPerformanceSnapshot['metrics'],
      provenance: row.provenance as CampaignPerformanceSnapshot['provenance'],
      verification: row.verification as CampaignPerformanceSnapshot['verification'],
      capturedAt: row.capturedAt.toISOString(),
      freshnessExpiresAt: row.freshnessExpiresAt.toISOString(),
    }));
  }

  async saveRecommendation(
    context: TenantContext,
    recommendation: CampaignOptimizationRecommendation,
  ): Promise<CampaignOptimizationRecommendation> {
    assertTenant(context, recommendation.tenantId);
    await this.db
      .insert(unifiedCampaignRecommendations)
      .values({
        id: recommendation.id,
        tenantId: recommendation.tenantId,
        unifiedCampaignId: recommendation.campaignId,
        type: recommendation.type,
        recommendation,
        requiresApproval: recommendation.requiresApproval,
        createdAt: new Date(recommendation.createdAt),
        updatedAt: new Date(recommendation.createdAt),
      })
      .onConflictDoUpdate({
        target: unifiedCampaignRecommendations.id,
        set: {
          recommendation,
          requiresApproval: recommendation.requiresApproval,
          updatedAt: new Date(recommendation.createdAt),
        },
      });
    return copy(recommendation);
  }

  async listRecommendations(
    context: TenantContext,
    campaignId: string,
  ): Promise<CampaignOptimizationRecommendation[]> {
    assertTenant(context);
    const rows = await this.db
      .select()
      .from(unifiedCampaignRecommendations)
      .where(and(
        eq(unifiedCampaignRecommendations.tenantId, context.tenantId),
        eq(unifiedCampaignRecommendations.unifiedCampaignId, campaignId),
      ))
      .orderBy(asc(unifiedCampaignRecommendations.createdAt));
    return rows.map((row) => copy(row.recommendation as CampaignOptimizationRecommendation));
  }

  private async saveSteps(
    context: TenantContext,
    campaign: UnifiedCampaign,
    steps: readonly CampaignExecutionStep[],
  ): Promise<void> {
    for (const step of steps) {
      const channel = campaign.channels.find((candidate) => candidate.id === step.channelId);
      if (!channel) throw new Error('UNIFIED_CAMPAIGN_STEP_CHANNEL_NOT_FOUND');
      await this.db
        .insert(unifiedCampaignExecutionSteps)
        .values({
          id: step.id,
          tenantId: context.tenantId,
          unifiedCampaignId: campaign.id,
          channelId: step.channelId,
          provider: step.provider,
          accountId: channel.accountId,
          campaignResourceId: channel.campaignId,
          externalActionId: step.externalActionId ?? null,
          idempotencyKey: step.proposal.idempotencyKey,
          allocation: step.allocation,
          proposal: step.proposal,
          ...(outcomeFor(campaign, step) ? { outcome: outcomeFor(campaign, step) } : {}),
          status: persistentStepStatus(step, outcomeFor(campaign, step)),
          createdAt: new Date(campaign.createdAt),
          updatedAt: new Date(campaign.updatedAt),
        })
        .onConflictDoUpdate({
          target: [
            unifiedCampaignExecutionSteps.tenantId,
            unifiedCampaignExecutionSteps.unifiedCampaignId,
            unifiedCampaignExecutionSteps.channelId,
          ],
          set: {
            externalActionId: step.externalActionId ?? null,
            allocation: step.allocation,
            proposal: step.proposal,
            ...(outcomeFor(campaign, step) ? { outcome: outcomeFor(campaign, step) } : {}),
            status: persistentStepStatus(step, outcomeFor(campaign, step)),
            updatedAt: new Date(campaign.updatedAt),
          },
        });
    }
  }
}

function campaignValues(campaign: UnifiedCampaign) {
  return {
    id: campaign.id,
    tenantId: campaign.tenantId,
    idempotencyKey: campaign.idempotencyKey,
    organizationId: campaign.organizationId,
    objective: campaign.objective,
    goal: campaign.goal,
    locale: campaign.locale,
    currency: campaign.budget.currency,
    totalBudgetMinor: campaign.budget.amountMinor,
    minorUnitScale: campaign.budget.minorUnitScale,
    lifecycle: campaign.lifecycle,
    definition: campaign,
    executionPlan: campaign.executionPlan ?? null,
    workflowId: campaign.workflow?.workflowId ?? null,
    evidenceReferences: campaign.evidenceReferences,
    createdAt: new Date(campaign.createdAt),
    updatedAt: new Date(campaign.updatedAt),
  };
}

function toCampaign(row: typeof unifiedCampaigns.$inferSelect): UnifiedCampaign {
  const stored = row.definition as UnifiedCampaign;
  const { executionPlan: _storedPlan, workflow: _storedWorkflow, ...campaign } = copy(stored);
  return {
    ...campaign,
    id: row.id,
    tenantId: row.tenantId,
    idempotencyKey: row.idempotencyKey,
    organizationId: row.organizationId,
    objective: row.objective as UnifiedCampaign['objective'],
    goal: row.goal,
    locale: row.locale as UnifiedCampaign['locale'],
    budget: {
      ...stored.budget,
      amountMinor: row.totalBudgetMinor,
      currency: row.currency,
      minorUnitScale: row.minorUnitScale,
    },
    lifecycle: row.lifecycle as UnifiedCampaign['lifecycle'],
    ...(row.executionPlan ? { executionPlan: row.executionPlan as NonNullable<UnifiedCampaign['executionPlan']> } : {}),
    ...(row.workflowId ? {
      workflow: _storedWorkflow ?? {
        workflowId: row.workflowId,
        stages: [],
      },
    } : {}),
    evidenceReferences: row.evidenceReferences as UnifiedCampaign['evidenceReferences'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function outcomeFor(
  campaign: UnifiedCampaign,
  step: CampaignExecutionStep,
): CampaignExecutionOutcome | undefined {
  return campaign.executionOutcomes?.find((outcome) => outcome.stepId === step.id);
}

function persistentStepStatus(
  step: CampaignExecutionStep,
  outcome: CampaignExecutionOutcome | undefined,
): 'PLANNED' | 'SUBMITTED' | 'VERIFIED' | 'PAUSED' | 'FAILED' | 'UNAVAILABLE' | 'MISMATCH' | 'UNKNOWN' {
  if (!outcome || outcome.status === 'PENDING') return step.externalActionId ? 'SUBMITTED' : 'PLANNED';
  return outcome.status;
}
