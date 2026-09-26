import {
  desc,
  eq,
  and,
} from 'drizzle-orm';

import type {
  CustomerHealthAssessment,
  ExpansionOpportunityAssessment,
  RenewalRecommendation,
  TenantContext,
} from '@platform/contracts';

import type {
  createDb,
} from '@platform/db';

import {
  customerExpansionAssessments,
  customerHealthAssessments,
  customerRenewalRecommendations,
} from '@platform/db';

type Db =
  ReturnType<typeof createDb>;

function assertTenant(
  context: TenantContext,
  tenantId: string,
): void {
  if (
    !context.tenantId ||
    context.tenantId !== tenantId
  ) {
    throw new Error(
      'TENANT_SCOPE_DENIED',
    );
  }
}

export class PersistentCustomerSuccessStore {
  constructor(
    private readonly db: Db,
  ) {}

  async saveHealth(
    context: TenantContext,
    assessment: CustomerHealthAssessment,
  ): Promise<void> {
    assertTenant(
      context,
      assessment.tenantId,
    );

    await this.db
      .insert(customerHealthAssessments)
      .values({
        tenantId: assessment.tenantId,
        customerId: assessment.customerId,
        accountId: assessment.accountId ?? null,
        score: assessment.score,
        status: assessment.status,
        churnRisk: assessment.churnRisk,
        causes: assessment.causes,
        actions: assessment.actions,
        evidenceIds:
          assessment.evidenceIds,
        confidence:
          assessment.confidence,
        model: assessment.model,
        assessedAt:
          new Date(
            assessment.assessedAt,
          ),
      });
  }

  async getLatestHealth(
    context: TenantContext,
    tenantId: string,
    customerId: string,
  ) {
    assertTenant(context, tenantId);

    const rows =
      await this.db
        .select()
        .from(
          customerHealthAssessments,
        )
        .where(
          and(
            eq(
              customerHealthAssessments.tenantId,
              tenantId,
            ),
            eq(
              customerHealthAssessments.customerId,
              customerId,
            ),
          ),
        )
        .orderBy(
          desc(
            customerHealthAssessments.assessedAt,
          ),
        )
        .limit(1);

    return rows[0] ?? null;
  }

  async saveRenewal(
    context: TenantContext,
    recommendation: RenewalRecommendation,
  ): Promise<void> {
    assertTenant(
      context,
      recommendation.tenantId,
    );

    await this.db
      .insert(
        customerRenewalRecommendations,
      )
      .values({
        tenantId:
          recommendation.tenantId,
        customerId:
          recommendation.customerId,
        accountId:
          recommendation.accountId ?? null,
        healthAssessmentId:
          recommendation.healthAssessmentId,
        daysToRenewal:
          recommendation.daysToRenewal ?? null,
        recommendation:
          recommendation.recommendation,
        rationale:
          recommendation.rationale,
        actions:
          recommendation.actions,
        evidenceIds:
          recommendation.evidenceIds,
        confidence:
          recommendation.confidence,
        requiresApproval: true,
      });
  }

  async saveExpansion(
    context: TenantContext,
    assessment:
      ExpansionOpportunityAssessment,
  ): Promise<void> {
    assertTenant(
      context,
      assessment.tenantId,
    );

    await this.db
      .insert(
        customerExpansionAssessments,
      )
      .values({
        tenantId:
          assessment.tenantId,
        customerId:
          assessment.customerId,
        accountId:
          assessment.accountId ?? null,
        healthAssessmentId:
          assessment.healthAssessmentId,
        eligible:
          assessment.eligible,
        score:
          assessment.score,
        rationale:
          assessment.rationale,
        recommendedActions:
          assessment.recommendedActions,
        evidenceIds:
          assessment.evidenceIds,
        confidence:
          assessment.confidence,
        requiresApproval: true,
      });
  }
}
