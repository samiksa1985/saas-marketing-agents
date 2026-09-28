import { and, asc, eq } from 'drizzle-orm';
import {
  growthActionCandidates,
  growthCandidateEligibilityAssessments,
  growthDecisionConflictAssessments,
  growthDecisionContexts,
  growthDecisionLearningRecords,
  growthDecisionOutcomes,
  growthDecisionRecommendations,
  growthDecisionScores,
} from '@platform/db';
import type { TenantContext } from '@platform/contracts';
import type { GrowthActionCandidate, GrowthDecisionContext } from '@platform/marketing-os-core';
import type { MarketingOSPersistenceDatabase } from './index.js';

const copy = <T>(value: T): T => structuredClone(value);
function tenant(context: TenantContext): asserts context is TenantContext & { tenantId: string } {
  if (!context.tenantId) throw new Error('TENANT_SCOPE_DENIED');
}

/** Durable EPIC13 decision evidence. This adapter has no transport or execution authority. */
export class PersistentGrowthDecisionStore {
  constructor(private readonly db: MarketingOSPersistenceDatabase) {}

  async saveContext(context: TenantContext, id: string, key: string, value: GrowthDecisionContext): Promise<GrowthDecisionContext> {
    tenant(context);
    if (value.tenantId !== context.tenantId) throw new Error('TENANT_SCOPE_DENIED');
    await this.db.insert(growthDecisionContexts).values({ id, tenantId: context.tenantId, identityId: value.identityId, idempotencyKey: key, context: value, createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing();
    const saved = await this.getContext(context, key);
    if (!saved) throw new Error('GROWTH_CONTEXT_SAVE_FAILED');
    return saved;
  }

  async getContext(context: TenantContext, key: string): Promise<GrowthDecisionContext | undefined> {
    tenant(context);
    const [row] = await this.db.select().from(growthDecisionContexts).where(and(eq(growthDecisionContexts.tenantId, context.tenantId), eq(growthDecisionContexts.idempotencyKey, key))).limit(1);
    return row ? copy(row.context as GrowthDecisionContext) : undefined;
  }

  async listCandidates(context: TenantContext, contextId: string): Promise<GrowthActionCandidate[]> {
    tenant(context);
    const rows = await this.db.select().from(growthActionCandidates).where(and(eq(growthActionCandidates.tenantId, context.tenantId), eq(growthActionCandidates.contextId, contextId))).orderBy(asc(growthActionCandidates.createdAt));
    return rows.map((row) => copy(row.candidate as GrowthActionCandidate));
  }

  async saveCandidate(context: TenantContext, contextId: string, candidate: GrowthActionCandidate): Promise<void> {
    tenant(context);
    await this.db.insert(growthActionCandidates).values({ id: candidate.id, tenantId: context.tenantId, contextId, objective: candidate.objective, actionType: candidate.actionType, state: candidate.state, idempotencyKey: `candidate:${candidate.id}`, candidate, createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing();
  }

  async saveEvidence(context: TenantContext, candidateId: string, eligible: boolean, eligibility: unknown, conflict: boolean, conflicts: unknown, score: number, components: unknown): Promise<void> {
    tenant(context);
    const now = new Date();
    await this.db.insert(growthCandidateEligibilityAssessments).values({ id: `eligibility:${candidateId}`, tenantId: context.tenantId, candidateId, eligible, assessment: eligibility, assessedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await this.db.insert(growthDecisionConflictAssessments).values({ id: `conflict:${candidateId}`, tenantId: context.tenantId, candidateId, conflict, assessment: conflicts, assessedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await this.db.insert(growthDecisionScores).values({ id: `score:${candidateId}`, tenantId: context.tenantId, candidateId, score, components, scoredAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing();
  }

  async evidence(context: TenantContext, candidateId: string): Promise<{ eligibility: unknown[]; conflicts: unknown[]; scores: unknown[] }> {
    tenant(context);
    const [eligibility, conflicts, scores] = await Promise.all([
      this.db.select().from(growthCandidateEligibilityAssessments).where(and(eq(growthCandidateEligibilityAssessments.tenantId, context.tenantId), eq(growthCandidateEligibilityAssessments.candidateId, candidateId))),
      this.db.select().from(growthDecisionConflictAssessments).where(and(eq(growthDecisionConflictAssessments.tenantId, context.tenantId), eq(growthDecisionConflictAssessments.candidateId, candidateId))),
      this.db.select().from(growthDecisionScores).where(and(eq(growthDecisionScores.tenantId, context.tenantId), eq(growthDecisionScores.candidateId, candidateId))),
    ]);
    return { eligibility: eligibility.map((row) => copy(row.assessment)), conflicts: conflicts.map((row) => copy(row.assessment)), scores: scores.map((row) => copy(row.components)) };
  }

  async saveRecommendation(context: TenantContext, id: string, contextId: string, candidateId: string, key: string, recommendation: unknown, state: string): Promise<void> {
    tenant(context);
    await this.db.insert(growthDecisionRecommendations).values({ id, tenantId: context.tenantId, contextId, candidateId, state, idempotencyKey: key, recommendation, createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing();
  }

  async listRecommendations(context: TenantContext, contextId: string): Promise<unknown[]> {
    tenant(context);
    const rows = await this.db.select().from(growthDecisionRecommendations).where(and(eq(growthDecisionRecommendations.tenantId, context.tenantId), eq(growthDecisionRecommendations.contextId, contextId))).orderBy(asc(growthDecisionRecommendations.createdAt));
    return rows.map((row) => copy(row.recommendation));
  }

  /** Learning is materialized only from independent, authoritative VERIFIED evidence; it never claims causality. */
  async saveVerifiedLearning(context: TenantContext, outcome: { id: string; recommendationId: string; key: string; verified: boolean; record: unknown; learning: unknown }): Promise<void> {
    tenant(context);
    if (!outcome.verified) throw new Error('VERIFIED_OUTCOME_REQUIRED');
    const now = new Date();
    await this.db.insert(growthDecisionOutcomes).values({ id: outcome.id, tenantId: context.tenantId, recommendationId: outcome.recommendationId, outcome: 'UNKNOWN', idempotencyKey: outcome.key, outcomeRecord: outcome.record, observedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await this.db.insert(growthDecisionLearningRecords).values({ id: `learning:${outcome.id}`, tenantId: context.tenantId, outcomeId: outcome.id, learning: { payload: outcome.learning, causalClaim: 'NONE' }, recordedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing();
  }

  async listOutcomesAndLearning(context: TenantContext, recommendationId: string): Promise<{ outcomes: unknown[]; learning: unknown[] }> {
    tenant(context);
    const outcomes = await this.db.select().from(growthDecisionOutcomes).where(and(eq(growthDecisionOutcomes.tenantId, context.tenantId), eq(growthDecisionOutcomes.recommendationId, recommendationId))).orderBy(asc(growthDecisionOutcomes.observedAt));
    const learning = outcomes.length === 0 ? [] : await this.db.select().from(growthDecisionLearningRecords).where(eq(growthDecisionLearningRecords.tenantId, context.tenantId)).orderBy(asc(growthDecisionLearningRecords.recordedAt));
    const outcomeIds = new Set(outcomes.map((row) => row.id));
    return { outcomes: outcomes.map((row) => copy(row.outcomeRecord)), learning: learning.filter((row) => outcomeIds.has(row.outcomeId)).map((row) => copy(row.learning)) };
  }
}
