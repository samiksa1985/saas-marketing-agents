import type { TenantContext } from '@platform/contracts';
import type {
  MarketingCommanderInput,
  MarketingCommanderPlan,
} from '@platform/marketing-commander';
import { buildMarketingCommanderPlan } from '@platform/marketing-commander';
import type {
  MarketingContextBuilder,
  MarketingContextSnapshot,
  ContextScope,
} from '@platform/context-engine';
import { AcquisitionGraph } from '@platform/acquisition-graph';

export interface MarketingOSRequest
  extends MarketingCommanderInput {
  requiredMemoryScopes?: ContextScope[];
  knowledgeQuery?: string;
}

export interface MarketingOSPlan {
  plan: MarketingCommanderPlan;
  context: MarketingContextSnapshot;
  acquisition: ReturnType<AcquisitionGraph['snapshot']>;
  readiness: {
    blocked: boolean;
    reasons: string[];
  };
}

/** Tenant-scoped authoritative storage for generated Marketing OS plans. */
export interface MarketingOSPlanRepository {
  save(context: TenantContext, plan: MarketingOSPlan): Promise<MarketingOSPlan>;
  get(context: TenantContext, planId: string): Promise<MarketingOSPlan | undefined>;
}

/** Explicit development/test plan storage. Production composes a database adapter. */
export class InMemoryMarketingOSPlanRepository implements MarketingOSPlanRepository {
  private readonly plans = new Map<string, MarketingOSPlan>();
  private readonly tenantByPlanId = new Map<string, string>();

  async save(context: TenantContext, plan: MarketingOSPlan): Promise<MarketingOSPlan> {
    assertPlanTenant(context, plan);
    this.plans.set(planKey(context.tenantId, plan.plan.planId), plan);
    this.tenantByPlanId.set(plan.plan.planId, context.tenantId);
    return plan;
  }

  async get(context: TenantContext, planId: string): Promise<MarketingOSPlan | undefined> {
    const owner = this.tenantByPlanId.get(planId);
    if (owner && owner !== context.tenantId) {
      throw new Error('Cross-tenant access denied');
    }
    return this.plans.get(planKey(context.tenantId, planId));
  }
}

export interface MarketingOSDependencies {
  contextBuilder: MarketingContextBuilder;
  registry: Parameters<
    typeof buildMarketingCommanderPlan
  >[1];
  acquisitionGraph: AcquisitionGraph;
}

export async function buildMarketingOSPlan(
  request: MarketingOSRequest,
  deps: MarketingOSDependencies,
): Promise<MarketingOSPlan> {
  const tenantContext: TenantContext = {
    tenantId: request.tenantId,
    ...(request.userId
      ? { userId: request.userId }
      : {}),
    roles: [],
    permissions: [],
    locale: (request.locale ?? 'en-US') as never,
  };

  const memoryKeywords = request.goal
    .split(/\s+/)
    .filter(
      (token: string) => token.length > 3,
    )
    .slice(0, 8);

  const memoryQuery =
    request.requiredMemoryScopes
      ? {
          scopes:
            request.requiredMemoryScopes,
          keywords: memoryKeywords,
          limit: 20,
        }
      : {
          keywords: memoryKeywords,
          limit: 20,
        };

  const context =
    await deps.contextBuilder.build({
      context: tenantContext,
      memoryQuery,
      knowledgeQuery:
        request.knowledgeQuery ??
        request.goal,
    });

  const contextSummary =
    request.contextSummary ??
    [
      ...context.memories.map(
        (memory) => memory.statement,
      ),
      ...context.knowledge.map(
        (hit) => hit.text,
      ),
    ]
      .filter(Boolean)
      .join(' ');

  const commanderInput: MarketingCommanderInput =
    {
      ...request,
      ...(contextSummary
        ? { contextSummary }
        : {}),
    };

  const plan =
    buildMarketingCommanderPlan(
      commanderInput,
      deps.registry,
    );

  const acquisition =
    deps.acquisitionGraph.snapshot(
      request.tenantId,
    );

  const reasons = [...plan.needsInput];

  if (
    !context.memories.length &&
    !context.knowledge.length
  ) {
    reasons.push(
      '[NEEDS INPUT: no company memory or knowledge evidence matched the goal]',
    );
  }

  return {
    plan,
    context,
    acquisition,
    readiness: {
      blocked: reasons.length > 0,
      reasons,
    },
  };
}

function assertPlanTenant(context: TenantContext, plan: MarketingOSPlan): void {
  if (!context.tenantId || plan.plan.tenantId !== context.tenantId) {
    throw new Error('Cross-tenant access denied');
  }
}

function planKey(tenantId: string, planId: string): string {
  return `${tenantId}\u0000${planId}`;
}
export * from './execution.js';
export * from './external-marketing-action.js';
export * from './governed-external-action.js';
export * from './unified-campaign.js';
