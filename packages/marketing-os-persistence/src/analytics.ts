import {
  marketingAttributionSnapshots,
  marketingExperiments,
  marketingExperimentVariants,
} from '@platform/db';

import type {
  AttributionSnapshot,
  Experiment,
  ExperimentEvaluation,
  ExperimentVariantRecord,
} from '@platform/contracts';

export interface AnalyticsPersistenceDatabase {
  insert: (...args: any[]) => any;
  select: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction?: (...args: any[]) => any;
}

function assertTenant(
  requestedTenantId: string,
  resourceTenantId: string,
): void {
  if (!requestedTenantId) {
    throw new Error(
      'Tenant context is required',
    );
  }

  if (
    requestedTenantId !==
    resourceTenantId
  ) {
    throw new Error(
      'Cross-tenant analytics access denied',
    );
  }
}

export class AnalyticsStore {
  constructor(
    private readonly db:
      AnalyticsPersistenceDatabase,
  ) {}

  async saveExperiment(
    tenantId: string,
    experiment: Experiment,
  ): Promise<void> {
    assertTenant(
      tenantId,
      experiment.tenantId,
    );

    await this.db
      .insert(marketingExperiments)
      .values({
        id: experiment.id,
        tenantId:
          experiment.tenantId,
        name: experiment.name,
        hypothesis:
          experiment.hypothesis,
        metric:
          experiment.metric,
        status:
          experiment.status,
      });
  }

  async saveVariant(
    tenantId: string,
    variant:
      ExperimentVariantRecord,
  ): Promise<void> {
    assertTenant(
      tenantId,
      variant.tenantId,
    );

    await this.db
      .insert(
        marketingExperimentVariants,
      )
      .values({
        id: variant.id,
        tenantId:
          variant.tenantId,
        experimentId:
          variant.experimentId,
        name: variant.name,
        payload:
          variant.payload,
        sampleSize:
          variant.sampleSize ??
          null,
        metricValue:
          variant.metricValue ??
          null,
      });
  }

  async saveAttribution(
    tenantId: string,
    snapshot:
      AttributionSnapshot,
  ): Promise<void> {
    assertTenant(
      tenantId,
      snapshot.tenantId,
    );

    await this.db
      .insert(
        marketingAttributionSnapshots,
      )
      .values({
        id: snapshot.id,
        tenantId:
          snapshot.tenantId,
        sourceEntityId:
          snapshot.sourceEntityId,
        revenueOutcomeId:
          snapshot.revenueOutcomeId ??
          null,
        model:
          snapshot.model,
        totalAmount:
          snapshot.totalAmount,
        currency:
          snapshot.currency ??
          null,
        allocations:
          snapshot.allocations,
        evidenceIds:
          snapshot.evidenceIds,
        calculatedAt:
          new Date(
            snapshot.calculatedAt,
          ),
      });
  }

  async saveExperimentEvaluation(
    tenantId: string,
    evaluation:
      ExperimentEvaluation,
  ): Promise<void> {
    assertTenant(
      tenantId,
      evaluation.tenantId,
    );

    await this.db
      .update(
        marketingExperiments,
      )
      .set({
        status:
          evaluation.status,
        winningVariantId:
          evaluation
            .winningVariantId ??
          null,
        evaluation,
        updatedAt:
          new Date(
            evaluation.evaluatedAt,
          ),
      });
  }
}

export function assertAnalyticsTenant(
  tenantId: string,
  resourceTenantId: string,
): void {
  assertTenant(
    tenantId,
    resourceTenantId,
  );
}
