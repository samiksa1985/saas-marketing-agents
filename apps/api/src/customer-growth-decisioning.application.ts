import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import { decideGrowth, type ActivationInput, type GrowthDecisionContext } from '@platform/marketing-os-core';
import { PersistentGrowthDecisionStore, type MarketingOSPersistenceDatabase } from '@platform/marketing-os-persistence';
import { LifecycleActivationApplicationService } from './lifecycle-activation.application.js';
import { ApiTenantDatabase } from './tenant-database.js';

type Transaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;
type GrowthEvaluationInput = Omit<GrowthDecisionContext, 'tenantId'> & {
  activation?: Omit<ActivationInput, 'tenantId' | 'identityId' | 'nextBestActionId'>;
};
export const CUSTOMER_GROWTH_DECISION_APPLICATION_SERVICE = 'PLATFORM_CUSTOMER_GROWTH_DECISION_APPLICATION_SERVICE';

/** EPIC13 owns deterministic decision evidence only. Consequential activation is delegated to EPIC12. */
export class CustomerGrowthDecisionApplicationService<T extends Transaction> {
  constructor(private readonly database: ApiTenantDatabase<T>, private readonly activation: LifecycleActivationApplicationService<any>) {}
  private use<R>(context: TenantContext, operation: (store: PersistentGrowthDecisionStore) => Promise<R>) { return this.database.execute(context, (tx) => operation(new PersistentGrowthDecisionStore(tx))); }

  async evaluate(context: TenantContext, input: GrowthEvaluationInput) {
    const decisionContext: GrowthDecisionContext = { ...input, tenantId: context.tenantId };
    const decision = decideGrowth(decisionContext);
    const contextId = `growth-context:${decision.candidate.id}`;
    const contextKey = `growth-context:${decision.candidate.id}`;
    const recommendationId = `growth-recommendation:${decision.candidate.id}`;
    await this.use(context, async (store) => {
      await store.saveContext(context, contextId, contextKey, decisionContext);
      await store.saveCandidate(context, contextId, decision.candidate);
      await store.saveEvidence(context, decision.candidate.id, decision.eligibility.eligible, decision.eligibility, decision.conflict.conflict, decision.conflict, decision.score.total, decision.score.components);
      await store.saveRecommendation(context, recommendationId, contextId, decision.candidate.id, `growth-recommendation:${decision.candidate.id}`, decision, decision.candidate.state);
    });
    // This only creates the existing EPIC12 governed activation candidate/plan. It never executes it.
    const activation = decision.candidate.state === 'RECOMMENDED' && input.activation
      ? await this.activation.evaluate(context, { ...input.activation, identityId: decisionContext.identityId, nextBestActionId: recommendationId })
      : undefined;
    return { ...decision, contextId, contextKey, recommendationId, activation };
  }

  async overview(context: TenantContext, key: string) {
    return this.use(context, async (store) => {
      const decisionContext = await store.getContext(context, key);
      if (!decisionContext) return undefined;
      const decision = decideGrowth(decisionContext);
      const contextId = `growth-context:${decision.candidate.id}`;
      const recommendationId = `growth-recommendation:${decision.candidate.id}`;
      const [candidates, evidence, recommendations, outcomes] = await Promise.all([
        store.listCandidates(context, contextId),
        store.evidence(context, decision.candidate.id),
        store.listRecommendations(context, contextId),
        store.listOutcomesAndLearning(context, recommendationId),
      ]);
      return { context: decisionContext, candidates, evidence, recommendations, ...outcomes, state: 'RECOMMENDATION_ONLY' as const };
    });
  }
}
