import { AuthoritativeEntitlementAccess } from '@platform/billing-entitlements';
import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import {
  aggregateCampaignLifecycle,
  aggregateCampaignPerformance,
  createUnifiedCampaign,
  deriveCampaignCompensationPlan,
  recommendCampaignOptimization,
  transitionUnifiedCampaign,
  UnifiedCampaignPlanner,
  type CampaignExecutionOutcome,
  type CampaignExecutionPlan,
  type CampaignOptimizationRecommendation,
  type CampaignPerformanceAggregate,
  type CampaignPerformanceSnapshot,
  type UnifiedCampaign,
  type UnifiedCampaignInput,
  type UnifiedCampaignStore,
} from '@platform/marketing-os-core';
import {
  AtomicBillingUsageStore,
  PersistentBillingAuthorityRepository,
  PersistentUnifiedCampaignStore,
  type MarketingOSPersistenceDatabase,
} from '@platform/marketing-os-persistence';
import type { ExternalActionProviderRegistry } from '@platform/tool-gateway';
import type { WorkflowRuntimeSelection } from '@platform/workflow-runtime';

import { ExternalActionApplicationService } from './external-actions.application.js';
import { ApiTenantDatabase } from './tenant-database.js';

type UnifiedCampaignTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;

export const UNIFIED_CAMPAIGN_APPLICATION_SERVICE =
  'PLATFORM_UNIFIED_CAMPAIGN_APPLICATION_SERVICE';

class ApiTenantUnifiedCampaignStore<TTransaction extends UnifiedCampaignTransaction>
  implements UnifiedCampaignStore
{
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  create(context: TenantContext, campaign: UnifiedCampaign): Promise<UnifiedCampaign> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentUnifiedCampaignStore(transaction).create(context, campaign),
    );
  }

  get(context: TenantContext, campaignId: string): Promise<UnifiedCampaign | undefined> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentUnifiedCampaignStore(transaction).get(context, campaignId),
    );
  }

  save(context: TenantContext, campaign: UnifiedCampaign): Promise<UnifiedCampaign> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentUnifiedCampaignStore(transaction).save(context, campaign),
    );
  }

  findByIdempotencyKey(context: TenantContext, idempotencyKey: string): Promise<UnifiedCampaign | undefined> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentUnifiedCampaignStore(transaction).findByIdempotencyKey(context, idempotencyKey),
    );
  }

  savePerformanceSnapshot(context: TenantContext, snapshot: CampaignPerformanceSnapshot): Promise<CampaignPerformanceSnapshot> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentUnifiedCampaignStore(transaction).savePerformanceSnapshot(context, snapshot),
    );
  }

  listPerformanceSnapshots(context: TenantContext, campaignId: string): Promise<CampaignPerformanceSnapshot[]> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentUnifiedCampaignStore(transaction).listPerformanceSnapshots(context, campaignId),
    );
  }

  saveRecommendation(
    context: TenantContext,
    recommendation: CampaignOptimizationRecommendation,
  ): Promise<CampaignOptimizationRecommendation> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentUnifiedCampaignStore(transaction).saveRecommendation(context, recommendation),
    );
  }

  listRecommendations(context: TenantContext, campaignId: string): Promise<CampaignOptimizationRecommendation[]> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentUnifiedCampaignStore(transaction).listRecommendations(context, campaignId),
    );
  }
}

class ApiTenantUnifiedCampaignEntitlements<TTransaction extends UnifiedCampaignTransaction> {
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  authorize(tenantId: string, entitlementKey: string) {
    return this.tenantDatabase.execute({ tenantId }, (transaction) =>
      new AuthoritativeEntitlementAccess(
        new PersistentBillingAuthorityRepository(transaction),
        new AtomicBillingUsageStore(transaction),
        { source: 'unified-campaign-orchestrator' },
      ).authorize(tenantId, entitlementKey),
    );
  }
}

/**
 * API orchestration façade. It creates only durable campaign intent and
 * governed-action proposals. Provider simulation, approval, execution and
 * verification are intentionally delegated to the existing action API.
 */
export class UnifiedCampaignApplicationService<TTransaction extends UnifiedCampaignTransaction> {
  private readonly store: UnifiedCampaignStore;
  private readonly planner: UnifiedCampaignPlanner;

  constructor(
    tenantDatabase: ApiTenantDatabase<TTransaction>,
    private readonly actions: Pick<ExternalActionApplicationService<any>, 'propose' | 'get'>,
    providers: ExternalActionProviderRegistry,
    private readonly workflow: WorkflowRuntimeSelection,
  ) {
    this.store = new ApiTenantUnifiedCampaignStore(tenantDatabase);
    this.planner = new UnifiedCampaignPlanner(
      providers,
      new ApiTenantUnifiedCampaignEntitlements(tenantDatabase),
    );
  }

  async create(context: TenantContext, input: UnifiedCampaignInput): Promise<UnifiedCampaign> {
    if (input.idempotencyKey.trim().length === 0) throw new Error('UNIFIED_CAMPAIGN_IDEMPOTENCY_KEY_REQUIRED');
    const existing = await this.store.findByIdempotencyKey(context, input.idempotencyKey);
    if (existing) return existing;
    const campaign = createUnifiedCampaign(context, input);
    return this.store.create(context, campaign);
  }

  async get(context: TenantContext, campaignId: string): Promise<UnifiedCampaign> {
    const campaign = await this.store.get(context, campaignId);
    if (!campaign) throw new Error('UNIFIED_CAMPAIGN_NOT_FOUND');
    return campaign;
  }

  async plan(context: TenantContext, campaignId: string): Promise<UnifiedCampaign> {
    const campaign = await this.get(context, campaignId);
    if (campaign.lifecycle === 'PLANNED' && campaign.executionPlan) return campaign;
    const plan = await this.planner.plan(context, campaign);
    const planned = transitionUnifiedCampaign({ ...campaign, executionPlan: plan }, 'PLANNED');
    return this.store.save(context, planned);
  }

  /** A deterministic plan check only; it deliberately does not reach a provider. */
  async simulate(context: TenantContext, campaignId: string): Promise<UnifiedCampaign> {
    const campaign = await this.get(context, campaignId);
    if (!campaign.executionPlan) throw new Error('UNIFIED_CAMPAIGN_PLAN_REQUIRED');
    if (campaign.lifecycle === 'SIMULATED') return campaign;
    return this.store.save(context, transitionUnifiedCampaign(campaign, 'SIMULATED'));
  }

  /**
   * Creates a workflow binding and one governed proposal per channel. It does
   * not simulate, approve, dispatch, or verify a provider mutation.
   */
  async submit(context: TenantContext, campaignId: string): Promise<UnifiedCampaign> {
    let campaign = await this.get(context, campaignId);
    if (!campaign.executionPlan) throw new Error('UNIFIED_CAMPAIGN_PLAN_REQUIRED');
    if (campaign.lifecycle === 'AWAITING_APPROVAL') return campaign;
    if (campaign.lifecycle !== 'SIMULATED') throw new Error('UNIFIED_CAMPAIGN_SIMULATION_REQUIRED');

    const workflow = await this.workflow.runtime.createWorkflow({
      tenantId: context.tenantId,
      engagementId: campaign.id,
      locale: campaign.locale,
      selectedWorkstreamIds: [],
      idempotencyKey: `unified-campaign:${campaign.id}`,
    });
    const plan = bindWorkflow(campaign.executionPlan, workflow.id);
    campaign = await this.store.save(context, {
      ...campaign,
      executionPlan: plan,
      workflow: {
        workflowId: workflow.id,
        stages: [
          'CREATE', 'VALIDATE', 'PLAN', 'SIMULATE', 'GOVERNANCE', 'CHANNEL_EXECUTION',
          'VERIFICATION', 'AGGREGATE_OUTCOME', 'OBSERVE_PERFORMANCE', 'RECOMMEND_OPTIMIZATION',
        ],
      },
      updatedAt: new Date().toISOString(),
    });

    const steps = [];
    for (const step of plan.steps) {
      const action = await this.actions.propose(context, step.proposal);
      steps.push({ ...step, externalActionId: action.id });
    }
    const submitted = transitionUnifiedCampaign({
      ...campaign,
      executionPlan: { ...plan, steps },
    }, 'AWAITING_APPROVAL');
    return this.store.save(context, submitted);
  }

  async execution(context: TenantContext, campaignId: string): Promise<{
    campaign: UnifiedCampaign;
    outcomes: CampaignExecutionOutcome[];
    lifecycle: UnifiedCampaign['lifecycle'];
    compensation: ReturnType<typeof deriveCampaignCompensationPlan>;
  }> {
    const campaign = await this.get(context, campaignId);
    if (!campaign.executionPlan) throw new Error('UNIFIED_CAMPAIGN_PLAN_REQUIRED');
    const outcomes = await Promise.all(campaign.executionPlan.steps.map(async (step) => {
      if (!step.externalActionId) return pendingOutcome(step);
      return actionOutcome(step, await this.actions.get(context, step.externalActionId));
    }));
    const lifecycle = aggregateCampaignLifecycle(campaign.executionPlan, outcomes);
    const persisted = await this.store.save(context, {
      ...campaign,
      executionOutcomes: outcomes,
      updatedAt: new Date().toISOString(),
    });
    return {
      campaign: persisted,
      outcomes,
      lifecycle,
      compensation: deriveCampaignCompensationPlan(campaign.id, outcomes),
    };
  }

  async performance(context: TenantContext, campaignId: string): Promise<CampaignPerformanceAggregate> {
    await this.get(context, campaignId);
    return aggregateCampaignPerformance(campaignId, await this.store.listPerformanceSnapshots(context, campaignId));
  }

  async recommendations(context: TenantContext, campaignId: string): Promise<CampaignOptimizationRecommendation[]> {
    const campaign = await this.get(context, campaignId);
    const aggregate = await this.performance(context, campaignId);
    const generated = recommendCampaignOptimization(campaign, aggregate);
    for (const recommendation of generated) await this.store.saveRecommendation(context, recommendation);
    return this.store.listRecommendations(context, campaignId);
  }
}

function bindWorkflow(plan: CampaignExecutionPlan, workflowId: string): CampaignExecutionPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => ({
      ...step,
      proposal: { ...step.proposal, workflowRunId: workflowId },
    })),
  };
}

function pendingOutcome(step: CampaignExecutionPlan['steps'][number]): CampaignExecutionOutcome {
  return {
    stepId: step.id,
    channelId: step.channelId,
    provider: step.provider,
    status: 'PENDING',
    beforeStateEvidence: [],
    verificationEvidence: [],
    reasons: ['GOVERNED_ACTION_NOT_YET_SUBMITTED'],
    observedAt: new Date().toISOString(),
  };
}

function actionOutcome(
  step: CampaignExecutionPlan['steps'][number],
  action: Awaited<ReturnType<ExternalActionApplicationService<any>['get']>>,
): CampaignExecutionOutcome {
  const status = action.status === 'VERIFIED'
    ? 'VERIFIED'
    : action.status === 'ROLLBACK_REQUIRED'
      ? 'MISMATCH'
      : action.status === 'FAILED'
        ? action.failureCode === 'PROVIDER_UNAVAILABLE' ? 'UNAVAILABLE' : 'FAILED'
        : action.status === 'REJECTED' || action.status === 'CANCELLED'
          ? 'FAILED'
          : 'PENDING';
  const evidence = action.evidence.map((item) => ({
    id: item.id,
    source: item.type,
    summary: 'Governed external-action evidence.',
    observedAt: item.occurredAt,
  }));
  return {
    stepId: step.id,
    channelId: step.channelId,
    provider: step.provider,
    status,
    externalActionId: action.id,
    beforeStateEvidence: evidence.filter((item) => item.source === 'BEFORE_STATE_CAPTURED'),
    verificationEvidence: evidence.filter((item) => item.source === 'PROVIDER_VERIFIED'),
    reasons: action.failureCode ? [action.failureCode] : [],
    observedAt: action.updatedAt,
    intentionallyPaused: action.status === 'ROLLED_BACK',
  };
}
