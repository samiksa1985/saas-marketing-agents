import { and, asc, eq } from 'drizzle-orm';

import type { TenantContext } from '@platform/contracts';
import {
  campaignOptimizationLearning,
  campaignOptimizationOutcomes,
  campaignOptimizationRecommendations,
  campaignOptimizationSimulations,
  campaignPerformanceAggregates,
  campaignPerformanceAnomalies,
  campaignPerformanceDiagnostics,
  campaignPerformanceObservations,
} from '@platform/db';
import type {
  CanonicalPerformanceObservation,
  CrossChannelPerformanceAggregate,
  OptimizationLearningRecord,
  OptimizationOutcomeMeasurement,
  OptimizationRecommendation,
  OptimizationSimulation,
  PerformanceAnomaly,
  PerformanceDiagnostic,
  PerformanceOptimizationStore,
} from '@platform/marketing-os-core';

import type { MarketingOSPersistenceDatabase } from './index.js';

function assertTenant(context: TenantContext, tenantId?: string): void {
  if (!context.tenantId || (tenantId && tenantId !== context.tenantId)) throw new Error('TENANT_SCOPE_DENIED');
}

/** Tenant-scoped store for read-only performance evidence and optimization decisions. */
export class PersistentPerformanceOptimizationStore implements PerformanceOptimizationStore {
  constructor(private readonly db: MarketingOSPersistenceDatabase) {}

  async saveObservation(context: TenantContext, observation: CanonicalPerformanceObservation): Promise<CanonicalPerformanceObservation> {
    assertTenant(context, observation.tenantId);
    await this.db.insert(campaignPerformanceObservations).values({
      id: observation.id,
      tenantId: observation.tenantId,
      unifiedCampaignId: observation.unifiedCampaignId,
      channelId: observation.channelId,
      provider: observation.provider,
      providerCampaignId: observation.providerCampaignId,
      snapshotId: observation.snapshotId,
      idempotencyKey: observation.idempotencyKey,
      observation,
      periodStart: new Date(observation.periodStart),
      periodEnd: new Date(observation.periodEnd),
      collectedAt: new Date(observation.collectedAt),
      verificationState: observation.verificationState,
      freshnessState: observation.freshnessState,
      normalizationVersion: observation.normalizationVersion,
      createdAt: new Date(observation.collectedAt),
      updatedAt: new Date(observation.collectedAt),
    }).onConflictDoNothing();
    const [row] = await this.db.select().from(campaignPerformanceObservations).where(and(
      eq(campaignPerformanceObservations.tenantId, context.tenantId),
      eq(campaignPerformanceObservations.idempotencyKey, observation.idempotencyKey),
    )).limit(1);
    if (!row) throw new Error('PERFORMANCE_OBSERVATION_SAVE_FAILED');
    const persisted = row.observation as CanonicalPerformanceObservation;
    if (persisted.id !== observation.id) throw new Error('PERFORMANCE_OBSERVATION_IDEMPOTENCY_MISMATCH');
    return copy(persisted);
  }

  async listObservations(context: TenantContext, campaignId: string): Promise<CanonicalPerformanceObservation[]> {
    assertTenant(context);
    const rows = await this.db.select().from(campaignPerformanceObservations).where(and(
      eq(campaignPerformanceObservations.tenantId, context.tenantId),
      eq(campaignPerformanceObservations.unifiedCampaignId, campaignId),
    )).orderBy(asc(campaignPerformanceObservations.periodEnd));
    return rows.map((row) => copy(row.observation as CanonicalPerformanceObservation));
  }

  async saveAggregate(context: TenantContext, aggregate: CrossChannelPerformanceAggregate): Promise<CrossChannelPerformanceAggregate> {
    assertAggregateTenant(context, aggregate);
    const id = aggregateId(aggregate);
    await this.db.insert(campaignPerformanceAggregates).values({
      id,
      tenantId: context.tenantId,
      unifiedCampaignId: aggregate.unifiedCampaignId,
      aggregate,
      generatedAt: new Date(aggregate.generatedAt),
      createdAt: new Date(aggregate.generatedAt),
      updatedAt: new Date(aggregate.generatedAt),
    }).onConflictDoUpdate({ target: campaignPerformanceAggregates.id, set: { aggregate, generatedAt: new Date(aggregate.generatedAt), updatedAt: new Date(aggregate.generatedAt) } });
    return copy(aggregate);
  }

  async listAggregates(context: TenantContext, campaignId: string): Promise<CrossChannelPerformanceAggregate[]> {
    assertTenant(context);
    const rows = await this.db.select().from(campaignPerformanceAggregates).where(and(
      eq(campaignPerformanceAggregates.tenantId, context.tenantId),
      eq(campaignPerformanceAggregates.unifiedCampaignId, campaignId),
    )).orderBy(asc(campaignPerformanceAggregates.generatedAt));
    return rows.map((row) => copy(row.aggregate as CrossChannelPerformanceAggregate));
  }

  async saveDiagnostic(context: TenantContext, diagnostic: PerformanceDiagnostic): Promise<PerformanceDiagnostic> {
    assertTenant(context, diagnostic.tenantId);
    await this.db.insert(campaignPerformanceDiagnostics).values({
      id: diagnostic.id, tenantId: diagnostic.tenantId, unifiedCampaignId: diagnostic.unifiedCampaignId,
      channelId: diagnostic.channelId ?? null, type: diagnostic.type, diagnostic,
      generatedAt: new Date(diagnostic.generatedAt), createdAt: new Date(diagnostic.generatedAt), updatedAt: new Date(diagnostic.generatedAt),
    }).onConflictDoUpdate({ target: campaignPerformanceDiagnostics.id, set: { diagnostic, generatedAt: new Date(diagnostic.generatedAt), updatedAt: new Date(diagnostic.generatedAt) } });
    return copy(diagnostic);
  }

  async listDiagnostics(context: TenantContext, campaignId: string): Promise<PerformanceDiagnostic[]> {
    assertTenant(context);
    const rows = await this.db.select().from(campaignPerformanceDiagnostics).where(and(eq(campaignPerformanceDiagnostics.tenantId, context.tenantId), eq(campaignPerformanceDiagnostics.unifiedCampaignId, campaignId))).orderBy(asc(campaignPerformanceDiagnostics.generatedAt));
    return rows.map((row) => copy(row.diagnostic as PerformanceDiagnostic));
  }

  async saveAnomaly(context: TenantContext, anomaly: PerformanceAnomaly): Promise<PerformanceAnomaly> {
    assertTenant(context, anomaly.tenantId);
    await this.db.insert(campaignPerformanceAnomalies).values({
      id: anomaly.id, tenantId: anomaly.tenantId, unifiedCampaignId: anomaly.unifiedCampaignId, type: anomaly.type, anomaly,
      generatedAt: new Date(anomaly.generatedAt), createdAt: new Date(anomaly.generatedAt), updatedAt: new Date(anomaly.generatedAt),
    }).onConflictDoUpdate({ target: campaignPerformanceAnomalies.id, set: { anomaly, generatedAt: new Date(anomaly.generatedAt), updatedAt: new Date(anomaly.generatedAt) } });
    return copy(anomaly);
  }

  async listAnomalies(context: TenantContext, campaignId: string): Promise<PerformanceAnomaly[]> {
    assertTenant(context);
    const rows = await this.db.select().from(campaignPerformanceAnomalies).where(and(eq(campaignPerformanceAnomalies.tenantId, context.tenantId), eq(campaignPerformanceAnomalies.unifiedCampaignId, campaignId))).orderBy(asc(campaignPerformanceAnomalies.generatedAt));
    return rows.map((row) => copy(row.anomaly as PerformanceAnomaly));
  }

  async saveRecommendation(context: TenantContext, recommendation: OptimizationRecommendation): Promise<OptimizationRecommendation> {
    assertTenant(context, recommendation.tenantId);
    await this.db.insert(campaignOptimizationRecommendations).values({
      id: recommendation.recommendationId, tenantId: recommendation.tenantId, unifiedCampaignId: recommendation.unifiedCampaignId,
      channelId: recommendation.affectedChannelId ?? null, provider: recommendation.provider ?? null, actionType: recommendation.actionType,
      recommendation, requiresApproval: recommendation.requiresApproval, expiresAt: new Date(recommendation.expiresAt),
      createdAt: new Date(recommendation.createdAt), updatedAt: new Date(recommendation.createdAt),
    }).onConflictDoUpdate({ target: campaignOptimizationRecommendations.id, set: { recommendation, requiresApproval: recommendation.requiresApproval, expiresAt: new Date(recommendation.expiresAt), updatedAt: new Date(recommendation.createdAt) } });
    return copy(recommendation);
  }

  async getRecommendation(context: TenantContext, recommendationId: string): Promise<OptimizationRecommendation | undefined> {
    assertTenant(context);
    const [row] = await this.db.select().from(campaignOptimizationRecommendations).where(and(eq(campaignOptimizationRecommendations.tenantId, context.tenantId), eq(campaignOptimizationRecommendations.id, recommendationId))).limit(1);
    return row ? copy(row.recommendation as OptimizationRecommendation) : undefined;
  }

  async listRecommendations(context: TenantContext, campaignId: string): Promise<OptimizationRecommendation[]> {
    assertTenant(context);
    const rows = await this.db.select().from(campaignOptimizationRecommendations).where(and(eq(campaignOptimizationRecommendations.tenantId, context.tenantId), eq(campaignOptimizationRecommendations.unifiedCampaignId, campaignId))).orderBy(asc(campaignOptimizationRecommendations.createdAt));
    return rows.map((row) => copy(row.recommendation as OptimizationRecommendation));
  }

  async saveSimulation(context: TenantContext, simulation: OptimizationSimulation): Promise<OptimizationSimulation> {
    assertTenant(context, simulation.tenantId);
    await this.db.insert(campaignOptimizationSimulations).values({
      id: simulation.id, tenantId: simulation.tenantId, unifiedCampaignId: simulation.unifiedCampaignId,
      recommendationId: simulation.recommendationId, simulation,
      createdAt: new Date(simulation.createdAt), updatedAt: new Date(simulation.createdAt),
    }).onConflictDoUpdate({ target: [campaignOptimizationSimulations.tenantId, campaignOptimizationSimulations.recommendationId], set: { simulation, updatedAt: new Date(simulation.createdAt) } });
    return copy(simulation);
  }

  async getSimulation(context: TenantContext, recommendationId: string): Promise<OptimizationSimulation | undefined> {
    assertTenant(context);
    const [row] = await this.db.select().from(campaignOptimizationSimulations).where(and(eq(campaignOptimizationSimulations.tenantId, context.tenantId), eq(campaignOptimizationSimulations.recommendationId, recommendationId))).limit(1);
    return row ? copy(row.simulation as OptimizationSimulation) : undefined;
  }

  async saveOutcome(context: TenantContext, outcome: OptimizationOutcomeMeasurement): Promise<OptimizationOutcomeMeasurement> {
    assertTenant(context, outcome.tenantId);
    await this.db.insert(campaignOptimizationOutcomes).values({
      id: outcome.id, tenantId: outcome.tenantId, unifiedCampaignId: outcome.unifiedCampaignId,
      recommendationId: outcome.recommendationId, externalActionId: outcome.externalActionId, outcome,
      measuredAt: new Date(outcome.measuredAt), createdAt: new Date(outcome.measuredAt), updatedAt: new Date(outcome.measuredAt),
    }).onConflictDoUpdate({ target: [campaignOptimizationOutcomes.tenantId, campaignOptimizationOutcomes.externalActionId], set: { outcome, measuredAt: new Date(outcome.measuredAt), updatedAt: new Date(outcome.measuredAt) } });
    return copy(outcome);
  }

  async listOutcomes(context: TenantContext, campaignId: string): Promise<OptimizationOutcomeMeasurement[]> {
    assertTenant(context);
    const rows = await this.db.select().from(campaignOptimizationOutcomes).where(and(eq(campaignOptimizationOutcomes.tenantId, context.tenantId), eq(campaignOptimizationOutcomes.unifiedCampaignId, campaignId))).orderBy(asc(campaignOptimizationOutcomes.measuredAt));
    return rows.map((row) => copy(row.outcome as OptimizationOutcomeMeasurement));
  }

  async saveLearning(context: TenantContext, learning: OptimizationLearningRecord): Promise<OptimizationLearningRecord> {
    assertTenant(context, learning.tenantId);
    await this.db.insert(campaignOptimizationLearning).values({
      id: learning.id, tenantId: learning.tenantId, unifiedCampaignId: learning.unifiedCampaignId,
      recommendationId: learning.recommendation.recommendationId, learning, ruleVersion: learning.ruleVersion,
      createdAt: new Date(learning.createdAt), updatedAt: new Date(learning.createdAt),
    }).onConflictDoUpdate({ target: campaignOptimizationLearning.id, set: { learning, ruleVersion: learning.ruleVersion, updatedAt: new Date(learning.createdAt) } });
    return copy(learning);
  }

  async listLearning(context: TenantContext, campaignId: string): Promise<OptimizationLearningRecord[]> {
    assertTenant(context);
    const rows = await this.db.select().from(campaignOptimizationLearning).where(and(eq(campaignOptimizationLearning.tenantId, context.tenantId), eq(campaignOptimizationLearning.unifiedCampaignId, campaignId))).orderBy(asc(campaignOptimizationLearning.createdAt));
    return rows.map((row) => copy(row.learning as OptimizationLearningRecord));
  }
}

function assertAggregateTenant(context: TenantContext, aggregate: CrossChannelPerformanceAggregate): void {
  const tenantId = aggregate.observations[0]?.tenantId;
  if (!tenantId) throw new Error('PERFORMANCE_AGGREGATE_TENANT_REQUIRED');
  assertTenant(context, tenantId);
}

function aggregateId(aggregate: CrossChannelPerformanceAggregate): string {
  return `performance-aggregate:${aggregate.unifiedCampaignId}:${aggregate.generatedAt}`;
}

function copy<T>(value: T): T { return structuredClone(value); }
