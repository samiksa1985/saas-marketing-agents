import type { RuntimeConfig } from '@platform/config';
import type { TenantContext } from '@platform/contracts';
import {
  InMemoryKnowledgeRetriever,
  InMemoryMarketingMemoryRepository,
  MarketingContextBuilder,
} from '@platform/context-engine';
import type { TenantScopedTransaction } from '@platform/db';
import { createAcquisitionGraph } from '@platform/acquisition-graph';
import {
  buildMarketingOSPlan,
  InMemoryMarketingOSExecutionRecordRepository,
  InMemoryMarketingOSPlanRepository,
  MarketingOSExecutionService,
  type ExecutionRecord,
  type MarketingOSExecutionRecordRepository,
  type MarketingOSPlan,
  type MarketingOSPlanRepository,
  type MarketingOSRequest,
} from '@platform/marketing-os-core';
import {
  MarketingOSPlanStore,
  type MarketingOSPersistenceDatabase,
  PersistentKnowledgeRetriever,
  PersistentMarketingMemoryRepository,
  PersistentMarketingOSExecutionRecordRepository,
  type EmbeddingProvider,
} from '@platform/marketing-os-persistence';
import { loadCanonicalAgentRegistry } from '@platform/registry';
import type {
  ProposedArtifact,
  Task,
  Workflow,
  WorkflowAuditEvent,
  WorkflowRuntimeQuery,
  WorkflowRuntimeSelection,
} from '@platform/workflow-runtime';
import type { ApprovalRecord, ApprovalApiService } from './approval.controller.js';
import { ApiTenantDatabase } from './tenant-database.js';

type MarketingOSTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;

export interface MarketingOsExecuteInput {
  /** Preferred durable API input. */
  planId?: string;
  /** Accepted temporarily for API compatibility; never trusted as state. */
  plan?: MarketingOSPlan;
  engagementId: string;
  locale?: 'en' | 'ar';
  idempotencyKey: string;
}

export interface MarketingOsRunResult {
  planId: string;
  status: ExecutionRecord['status'];
  approved: boolean;
  approvalId: string | null;
  approval: ApprovalRecord | null;
  workflow: Workflow | null;
  tasks: Task[];
  artifacts: ProposedArtifact[];
  audits: WorkflowAuditEvent[];
  reasons: string[];
}

interface MarketingOSPlanner {
  plan(
    context: TenantContext,
    request: Omit<MarketingOSRequest, 'tenantId' | 'userId'>,
  ): Promise<MarketingOSPlan>;
}

class ApiTenantMarketingOSPlanRepository<TTransaction extends MarketingOSTransaction>
  implements MarketingOSPlanRepository
{
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  save(context: TenantContext, plan: MarketingOSPlan): Promise<MarketingOSPlan> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new MarketingOSPlanStore(transaction).save(context, plan),
    );
  }

  get(context: TenantContext, planId: string): Promise<MarketingOSPlan | undefined> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new MarketingOSPlanStore(transaction).get(context, planId),
    );
  }
}

class ApiTenantMarketingOSExecutionRecordRepository<TTransaction extends MarketingOSTransaction>
  implements MarketingOSExecutionRecordRepository
{
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  save(
    context: TenantContext,
    record: ExecutionRecord,
  ): Promise<ExecutionRecord> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentMarketingOSExecutionRecordRepository(transaction).save(context, record),
    );
  }

  get(context: TenantContext, planId: string): Promise<ExecutionRecord | undefined> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentMarketingOSExecutionRecordRepository(transaction).get(context, planId),
    );
  }

  findByIdempotencyKey(
    context: TenantContext,
    idempotencyKey: string,
  ): Promise<ExecutionRecord | undefined> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentMarketingOSExecutionRecordRepository(transaction).findByIdempotencyKey(
        context,
        idempotencyKey,
      ),
    );
  }
}

class DevelopmentMarketingOSPlanner implements MarketingOSPlanner {
  private readonly contextBuilder = new MarketingContextBuilder(
    new InMemoryMarketingMemoryRepository(),
    new InMemoryKnowledgeRetriever(),
  );
  private readonly registryPromise = loadCanonicalAgentRegistry();

  async plan(
    context: TenantContext,
    request: Omit<MarketingOSRequest, 'tenantId' | 'userId'>,
  ): Promise<MarketingOSPlan> {
    return buildPlan(context, request, this.contextBuilder, this.registryPromise);
  }
}

class PersistentMarketingOSPlanner<TTransaction extends MarketingOSTransaction>
  implements MarketingOSPlanner
{
  private readonly registryPromise = loadCanonicalAgentRegistry();

  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  plan(
    context: TenantContext,
    request: Omit<MarketingOSRequest, 'tenantId' | 'userId'>,
  ): Promise<MarketingOSPlan> {
    return this.tenantDatabase.execute(context, async (transaction) => {
      const contextBuilder = new MarketingContextBuilder(
        new PersistentMarketingMemoryRepository(transaction),
        new PersistentKnowledgeRetriever(transaction, unavailableEmbeddingProvider),
      );
      return buildPlan(context, request, contextBuilder, this.registryPromise);
    });
  }
}

export class MarketingOsApplicationService {
  constructor(
    private readonly planner: MarketingOSPlanner,
    private readonly plans: MarketingOSPlanRepository,
    private readonly executions: MarketingOSExecutionService,
    private readonly query: WorkflowRuntimeQuery,
    private readonly approvals: ApprovalApiService,
  ) {}

  async plan(
    context: TenantContext,
    request: Omit<MarketingOSRequest, 'tenantId' | 'userId'>,
  ): Promise<MarketingOSPlan> {
    const plan = await this.planner.plan(context, request);
    return this.plans.save(context, plan);
  }

  async prepare(
    context: TenantContext,
    input: MarketingOsExecuteInput,
  ): Promise<ExecutionRecord> {
    const planId = input.planId ?? input.plan?.plan.planId;
    if (!planId) throw new Error('planId is required');
    if (input.plan && input.plan.plan.tenantId !== context.tenantId) {
      throw new Error('Cross-tenant access denied');
    }

    const plan = await this.plans.get(context, planId);
    if (!plan) throw new Error('Marketing OS plan not found or access denied.');
    return this.executions.prepare({
      plan,
      engagementId: input.engagementId,
      locale: input.locale ?? 'en',
      idempotencyKey: input.idempotencyKey,
      context,
    });
  }

  start(
    context: TenantContext,
    planId: string,
  ): Promise<ExecutionRecord> {
    return this.executions.start(planId, context, {
      actor: context.userId ?? 'api-user',
      reason: 'Marketing OS approved execution',
      timestamp: new Date().toISOString(),
      idempotencyKey: `start:${planId}`,
    });
  }

  async run(context: TenantContext, planId: string): Promise<MarketingOsRunResult> {
    const record = await this.executions.get(planId, context);
    const approval = record.approvalId
      ? await this.approvals.get(record.approvalId, context)
      : null;
    const audits = await this.query.getAudits(context);

    if (!record.workflowId) {
      return {
        planId,
        status: record.status,
        approved: record.approved,
        approvalId: record.approvalId ?? null,
        approval,
        workflow: null,
        tasks: [],
        artifacts: [],
        audits,
        reasons: [...record.reasons],
      };
    }

    const [workflow, tasks, artifacts] = await Promise.all([
      this.query.getWorkflow(record.workflowId, context),
      this.query.getTasks(record.workflowId, context),
      this.query.getArtifacts(record.workflowId, context),
    ]);
    return {
      planId,
      status: record.status,
      approved: record.approved,
      approvalId: record.approvalId ?? null,
      approval,
      workflow,
      tasks,
      artifacts,
      audits,
      reasons: [...record.reasons],
    };
  }
}

export function createMarketingOsApplicationService<TTransaction extends MarketingOSTransaction>(input: {
  config: RuntimeConfig;
  tenantDatabase: ApiTenantDatabase<TTransaction>;
  workflow: WorkflowRuntimeSelection;
  approvals: ApprovalApiService;
}): MarketingOsApplicationService {
  const persistent = input.config.nodeEnv === 'production' || input.workflow.durable;
  if (input.config.nodeEnv === 'production' && !input.workflow.durable) {
    throw new Error('Production Marketing OS requires a durable workflow provider.');
  }

  const planner = persistent
    ? new PersistentMarketingOSPlanner(input.tenantDatabase)
    : new DevelopmentMarketingOSPlanner();
  const plans = persistent
    ? new ApiTenantMarketingOSPlanRepository(input.tenantDatabase)
    : new InMemoryMarketingOSPlanRepository();
  const records = persistent
    ? new ApiTenantMarketingOSExecutionRecordRepository(input.tenantDatabase)
    : new InMemoryMarketingOSExecutionRecordRepository();
  const executions = new MarketingOSExecutionService({
    runtime: input.workflow.runtime,
    query: input.workflow.query,
    records,
    approvals: {
      create: (context, approval) => input.approvals.create(context, approval),
      get: (approvalId, context) => input.approvals.get(approvalId, context),
    },
  });

  return new MarketingOsApplicationService(
    planner,
    plans,
    executions,
    input.workflow.query,
    input.approvals,
  );
}

async function buildPlan(
  context: TenantContext,
  request: Omit<MarketingOSRequest, 'tenantId' | 'userId'>,
  contextBuilder: MarketingContextBuilder,
  registryPromise: ReturnType<typeof loadCanonicalAgentRegistry>,
): Promise<MarketingOSPlan> {
  const registry = await registryPromise;
  return buildMarketingOSPlan(
    {
      ...request,
      tenantId: context.tenantId,
      ...(context.userId ? { userId: context.userId } : {}),
    },
    {
      contextBuilder,
      registry: {
        domainLeaders: registry.domainLeaders,
        specialists: registry.specialists.map((agent) => ({
          id: agent.agentId,
          name: agent.name,
        })),
      },
      acquisitionGraph: createAcquisitionGraph(context.tenantId),
    },
  );
}

const unavailableEmbeddingProvider: EmbeddingProvider = {
  mode: 'external',
  provider: 'unconfigured',
  model: 'unconfigured',
  version: 'unconfigured',
  async embed(_text: string) {
    throw new Error(
      'Persistent Marketing OS knowledge retrieval requires a configured embedding provider.',
    );
  },
};
