import { and, desc, eq } from 'drizzle-orm';
import type {
  LeadScoreAssessment,
  ProposalDraft,
  SalesForecast,
  TenantContext,
} from '@platform/contracts';
import type { createDb } from '@platform/db';
import {
  leadScoreSnapshots,
  proposalArtifacts,
  salesForecastSnapshots,
} from '@platform/db';

type Db = ReturnType<typeof createDb>;

function assertTenant(context: TenantContext, tenantId: string): void {
  if (!context.tenantId || context.tenantId !== tenantId) {
    throw new Error('TENANT_SCOPE_DENIED');
  }
}

export class PersistentSalesIntelligenceStore {
  constructor(private readonly db: Db) {}

  async saveLeadScore(
    context: TenantContext,
    input: LeadScoreAssessment & {
      id: string;
      tenantId: string;
      leadId: string;
    },
  ): Promise<void> {
    assertTenant(context, input.tenantId);

    const now = new Date();

    await this.db.insert(leadScoreSnapshots).values({
      id: input.id,
      tenantId: input.tenantId,
      leadId: input.leadId,
      score: input.score,
      temperature: input.temperature,
      fit: input.fit,
      intent: input.intent,
      engagement: input.engagement,
      timing: input.timing,
      factors: input.factors,
      recommendations: input.recommendations,
      model: input.model,
      createdAt: now,
      updatedAt: now,
    });
  }

  async getLatestLeadScore(
    context: TenantContext,
    leadId: string,
  ): Promise<LeadScoreAssessment | null> {
    if (!context.tenantId) {
      throw new Error('TENANT_CONTEXT_REQUIRED');
    }

    const rows = await this.db
      .select()
      .from(leadScoreSnapshots)
      .where(
        and(
          eq(leadScoreSnapshots.tenantId, context.tenantId),
          eq(leadScoreSnapshots.leadId, leadId),
        ),
      )
      .orderBy(desc(leadScoreSnapshots.createdAt))
      .limit(1);

    const row = rows[0];

    if (!row) return null;

    return {
      leadId: row.leadId,
      score: row.score,
      temperature: row.temperature,
      fit: row.fit,
      intent: row.intent,
      engagement: row.engagement,
      timing: row.timing,
      factors: row.factors as Record<string, number>,
      recommendations: row.recommendations as string[],
      model: row.model,
    };
  }

  async saveForecast(
    context: TenantContext,
    input: SalesForecast & {
      id: string;
      tenantId: string;
    },
  ): Promise<void> {
    assertTenant(context, input.tenantId);

    const now = new Date();

    await this.db.insert(salesForecastSnapshots).values({
      id: input.id,
      tenantId: input.tenantId,
      period: input.period,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      opportunityCount: input.opportunityCount,
      pipelineAmount: input.pipelineAmount,
      weightedAmount: input.weightedAmount,
      winProbability: input.winProbability,
      confidence: input.confidence,
      opportunityIds: input.opportunityIds,
      createdAt: now,
      updatedAt: now,
    });
  }

  async getLatestForecast(
    context: TenantContext,
    period: SalesForecast['period'],
  ): Promise<SalesForecast | null> {
    if (!context.tenantId) {
      throw new Error('TENANT_CONTEXT_REQUIRED');
    }

    const rows = await this.db
      .select()
      .from(salesForecastSnapshots)
      .where(
        and(
          eq(salesForecastSnapshots.tenantId, context.tenantId),
          eq(salesForecastSnapshots.period, period),
        ),
      )
      .orderBy(desc(salesForecastSnapshots.createdAt))
      .limit(1);

    const row = rows[0];

    if (!row) return null;

    return {
      period: row.period,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      opportunityCount: row.opportunityCount,
      pipelineAmount: row.pipelineAmount,
      weightedAmount: row.weightedAmount,
      winProbability: row.winProbability,
      confidence: row.confidence,
      opportunityIds: row.opportunityIds as string[],
    };
  }

  async saveProposalArtifact(
    context: TenantContext,
    proposal: ProposalDraft,
  ): Promise<void> {
    assertTenant(context, proposal.tenantId);

    const now = new Date();

    await this.db.insert(proposalArtifacts).values({
      id: proposal.id,
      tenantId: proposal.tenantId,
      opportunityId: proposal.opportunityId,
      title: proposal.title,
      amount: proposal.amount ?? null,
      currency: proposal.currency ?? null,
      status: proposal.status,
      content: proposal.content,
      requiresApproval: proposal.requiresApproval,
      createdAt: now,
      updatedAt: now,
    });
  }

  async getProposalArtifact(
    context: TenantContext,
    proposalId: string,
  ): Promise<ProposalDraft | null> {
    if (!context.tenantId) {
      throw new Error('TENANT_CONTEXT_REQUIRED');
    }

    const rows = await this.db
      .select()
      .from(proposalArtifacts)
      .where(
        and(
          eq(proposalArtifacts.tenantId, context.tenantId),
          eq(proposalArtifacts.id, proposalId),
        ),
      )
      .limit(1);

    const row = rows[0];

    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenantId,
      opportunityId: row.opportunityId,
      title: row.title,
      ...(row.amount === null ? {} : { amount: row.amount }),
      ...(row.currency === null ? {} : { currency: row.currency }),
      status: row.status,
      content: row.content as Record<string, unknown>,
      requiresApproval: true,
    };
  }
}
