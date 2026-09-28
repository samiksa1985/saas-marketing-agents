import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import {
  aggregateCrossChannelPerformance,
  type CampaignProviderCapabilityRegistry,
  createOptimizationLearningRecord,
  detectPerformanceAnomalies,
  diagnosePerformance,
  generateOptimizationRecommendations,
  measureOptimizationOutcome,
  normalizePerformanceObservationSafely,
  simulateOptimizationImpact,
  toGovernedOptimizationProposal,
  type CanonicalPerformanceObservation,
  type CrossChannelPerformanceAggregate,
  type OptimizationLearningRecord,
  type OptimizationOutcomeMeasurement,
  type OptimizationRecommendation,
  type OptimizationSimulation,
  type PerformanceAnomaly,
  type PerformanceDiagnostic,
  type PerformanceOptimizationStore,
  type ProviderPerformanceMetricMapping,
  type ProviderPerformanceObservationInput,
} from '@platform/marketing-os-core';
import {
  PersistentPerformanceOptimizationStore,
  type MarketingOSPersistenceDatabase,
} from '@platform/marketing-os-persistence';

import { ExternalActionApplicationService } from './external-actions.application.js';
import { UnifiedCampaignApplicationService } from './unified-campaigns.application.js';
import { ApiTenantDatabase } from './tenant-database.js';

type PerformanceOptimizationTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;

export const PERFORMANCE_OPTIMIZATION_APPLICATION_SERVICE =
  'PLATFORM_PERFORMANCE_OPTIMIZATION_APPLICATION_SERVICE';

class ApiTenantPerformanceOptimizationStore<TTransaction extends PerformanceOptimizationTransaction>
  implements PerformanceOptimizationStore
{
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  private use<T>(context: TenantContext, operation: (store: PersistentPerformanceOptimizationStore) => Promise<T>): Promise<T> {
    return this.tenantDatabase.execute(context, (transaction) => operation(new PersistentPerformanceOptimizationStore(transaction)));
  }

  saveObservation(context: TenantContext, value: CanonicalPerformanceObservation) { return this.use(context, (store) => store.saveObservation(context, value)); }
  listObservations(context: TenantContext, campaignId: string) { return this.use(context, (store) => store.listObservations(context, campaignId)); }
  saveAggregate(context: TenantContext, value: CrossChannelPerformanceAggregate) { return this.use(context, (store) => store.saveAggregate(context, value)); }
  listAggregates(context: TenantContext, campaignId: string) { return this.use(context, (store) => store.listAggregates(context, campaignId)); }
  saveDiagnostic(context: TenantContext, value: PerformanceDiagnostic) { return this.use(context, (store) => store.saveDiagnostic(context, value)); }
  listDiagnostics(context: TenantContext, campaignId: string) { return this.use(context, (store) => store.listDiagnostics(context, campaignId)); }
  saveAnomaly(context: TenantContext, value: PerformanceAnomaly) { return this.use(context, (store) => store.saveAnomaly(context, value)); }
  listAnomalies(context: TenantContext, campaignId: string) { return this.use(context, (store) => store.listAnomalies(context, campaignId)); }
  saveRecommendation(context: TenantContext, value: OptimizationRecommendation) { return this.use(context, (store) => store.saveRecommendation(context, value)); }
  getRecommendation(context: TenantContext, recommendationId: string) { return this.use(context, (store) => store.getRecommendation(context, recommendationId)); }
  listRecommendations(context: TenantContext, campaignId: string) { return this.use(context, (store) => store.listRecommendations(context, campaignId)); }
  saveSimulation(context: TenantContext, value: OptimizationSimulation) { return this.use(context, (store) => store.saveSimulation(context, value)); }
  getSimulation(context: TenantContext, recommendationId: string) { return this.use(context, (store) => store.getSimulation(context, recommendationId)); }
  saveOutcome(context: TenantContext, value: OptimizationOutcomeMeasurement) { return this.use(context, (store) => store.saveOutcome(context, value)); }
  listOutcomes(context: TenantContext, campaignId: string) { return this.use(context, (store) => store.listOutcomes(context, campaignId)); }
  saveLearning(context: TenantContext, value: OptimizationLearningRecord) { return this.use(context, (store) => store.saveLearning(context, value)); }
  listLearning(context: TenantContext, campaignId: string) { return this.use(context, (store) => store.listLearning(context, campaignId)); }
}

/**
 * Provider-neutral intelligence façade. It only persists read-side evidence
 * and creates an existing governed action proposal; it never gets a gateway,
 * transport, provider SDK, approval authority, or execute capability.
 */
export class PerformanceOptimizationApplicationService<TTransaction extends PerformanceOptimizationTransaction> {
  private readonly store: PerformanceOptimizationStore;

  constructor(
    tenantDatabase: ApiTenantDatabase<TTransaction>,
    private readonly campaigns: Pick<UnifiedCampaignApplicationService<any>, 'get'>,
    private readonly actions: Pick<ExternalActionApplicationService<any>, 'propose' | 'get'>,
    private readonly providers: CampaignProviderCapabilityRegistry,
  ) {
    this.store = new ApiTenantPerformanceOptimizationStore(tenantDatabase);
  }

  async ingestObservation(
    context: TenantContext,
    campaignId: string,
    input: ProviderPerformanceObservationInput,
    mapping: ProviderPerformanceMetricMapping,
  ): Promise<CanonicalPerformanceObservation> {
    await this.campaigns.get(context, campaignId);
    if (input.tenantId !== context.tenantId || input.unifiedCampaignId !== campaignId) throw new Error('TENANT_SCOPE_DENIED');
    const normalized = normalizePerformanceObservationSafely(input, mapping);
    if ('status' in normalized) throw new Error(normalized.code);
    return this.store.saveObservation(context, normalized);
  }

  async performance(context: TenantContext, campaignId: string): Promise<CrossChannelPerformanceAggregate> {
    await this.campaigns.get(context, campaignId);
    const aggregate = aggregateCrossChannelPerformance(campaignId, await this.store.listObservations(context, campaignId));
    return this.store.saveAggregate(context, aggregate);
  }

  async diagnostics(context: TenantContext, campaignId: string): Promise<PerformanceDiagnostic[]> {
    const campaign = await this.campaigns.get(context, campaignId);
    const previous = (await this.store.listAggregates(context, campaignId)).at(-1);
    const aggregate = await this.performance(context, campaignId);
    const diagnostics = diagnosePerformance(aggregate, {
      budgetMinor: campaign.budget.amountMinor,
      ...(previous ? { prior: previous } : {}),
    });
    for (const diagnostic of diagnostics) await this.store.saveDiagnostic(context, diagnostic);
    return this.store.listDiagnostics(context, campaignId);
  }

  async anomalies(context: TenantContext, campaignId: string): Promise<PerformanceAnomaly[]> {
    await this.campaigns.get(context, campaignId);
    const current = await this.performance(context, campaignId);
    const history = [...await this.store.listAggregates(context, campaignId), current];
    const anomalies = detectPerformanceAnomalies(history);
    for (const anomaly of anomalies) await this.store.saveAnomaly(context, anomaly);
    return this.store.listAnomalies(context, campaignId);
  }

  async recommendations(context: TenantContext, campaignId: string): Promise<OptimizationRecommendation[]> {
    await this.campaigns.get(context, campaignId);
    return this.store.listRecommendations(context, campaignId);
  }

  async generateRecommendations(context: TenantContext, campaignId: string): Promise<OptimizationRecommendation[]> {
    const campaign = await this.campaigns.get(context, campaignId);
    const diagnostics = await this.diagnostics(context, campaignId);
    const aggregate = await this.performance(context, campaignId);
    const recommendations = generateOptimizationRecommendations(campaign, diagnostics, this.providers);
    for (const recommendation of recommendations) {
      await this.store.saveRecommendation(context, recommendation);
      await this.store.saveSimulation(context, simulateOptimizationImpact(recommendation, aggregate));
      await this.store.saveLearning(context, createOptimizationLearningRecord(recommendation, 'UNKNOWN', 'UNKNOWN', undefined));
    }
    return this.store.listRecommendations(context, campaignId);
  }

  getSimulation(context: TenantContext, recommendationId: string): Promise<OptimizationSimulation | undefined> {
    return this.store.getSimulation(context, recommendationId);
  }

  /** The resulting proposal still must pass existing policy, budget, durable approval, health, execution and verification gates. */
  async proposeGovernedAction(context: TenantContext, campaignId: string, recommendationId: string) {
    const campaign = await this.campaigns.get(context, campaignId);
    const recommendation = await this.store.getRecommendation(context, recommendationId);
    const simulation = await this.store.getSimulation(context, recommendationId);
    if (!recommendation || recommendation.unifiedCampaignId !== campaign.id || !simulation) throw new Error('OPTIMIZATION_RECOMMENDATION_NOT_READY');
    if (simulation.confidence <= 0) throw new Error('OPTIMIZATION_EVIDENCE_UNSAFE');
    return this.actions.propose(context, toGovernedOptimizationProposal(campaign, recommendation, simulation, context.userId ?? 'optimization-operator'));
  }

  listOutcomes(context: TenantContext, campaignId: string): Promise<OptimizationOutcomeMeasurement[]> {
    return this.store.listOutcomes(context, campaignId);
  }

  listLearning(context: TenantContext, campaignId: string): Promise<OptimizationLearningRecord[]> {
    return this.store.listLearning(context, campaignId);
  }

  /** Internal workflow hook; it refuses measurement until the existing control plane independently verified the action. */
  async recordVerifiedOutcome(
    context: TenantContext,
    campaignId: string,
    recommendationId: string,
    externalActionId: string,
    before: CrossChannelPerformanceAggregate,
    after: CrossChannelPerformanceAggregate,
  ): Promise<OptimizationOutcomeMeasurement> {
    const recommendation = await this.store.getRecommendation(context, recommendationId);
    const action = await this.actions.get(context, externalActionId);
    if (!recommendation || recommendation.unifiedCampaignId !== campaignId || action.status !== 'VERIFIED') throw new Error('OPTIMIZATION_OUTCOME_VERIFICATION_REQUIRED');
    const outcome = measureOptimizationOutcome(recommendation, externalActionId, before, after);
    await this.store.saveOutcome(context, outcome);
    await this.store.saveLearning(context, createOptimizationLearningRecord(recommendation, true, true, outcome));
    return outcome;
  }
}
