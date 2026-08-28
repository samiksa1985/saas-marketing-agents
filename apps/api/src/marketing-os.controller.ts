import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { loadCanonicalAgentRegistry } from '@platform/registry';
import { InMemoryKnowledgeRetriever, InMemoryMarketingMemoryRepository, MarketingContextBuilder } from '@platform/context-engine';
import { createAcquisitionGraph } from '@platform/acquisition-graph';
import { buildMarketingOSPlan, MarketingOSExecutionService, type MarketingOSRequest, type ExecutionRecord } from '@platform/marketing-os-core';
import { InMemoryWorkflowRuntime } from '@platform/workflow-runtime';
import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import { ApprovalApiService, type ApprovalRecord } from './approval.controller.js';

interface ExecuteBody {
  plan: Awaited<ReturnType<typeof buildMarketingOSPlan>>;
  engagementId: string;
  locale?: 'en' | 'ar';
  idempotencyKey: string;
}

interface ExecuteResponse {
  status: ExecutionRecord['status'];
  planId: string;
  workflowId: string | null;
  approvalId: string | null;
  approved: boolean;
  reasons: string[];
}

interface RunResponse {
  planId: string;
  status: ExecutionRecord['status'];
  approved: boolean;
  approvalId: string | null;
  approval: ApprovalRecord | null;
  workflow: ExecutionRecord['workflow'] | null;
  tasks: ReturnType<InMemoryWorkflowRuntime['getTasks']>;
  artifacts: ReturnType<InMemoryWorkflowRuntime['getArtifacts']>;
  audits: ReturnType<InMemoryWorkflowRuntime['getAudits']>;
  reasons: string[];
}

@UseGuards(ApiAuthGuard)
@Controller('marketing-os')
export class MarketingOsController {
  private readonly memory = new InMemoryMarketingMemoryRepository();
  private readonly knowledge = new InMemoryKnowledgeRetriever();
  private readonly contextBuilder = new MarketingContextBuilder(this.memory, this.knowledge);
  private readonly runtime = new InMemoryWorkflowRuntime();
  private readonly registryPromise = loadCanonicalAgentRegistry();
  private readonly graphs = new Map<string, ReturnType<typeof createAcquisitionGraph>>();

  constructor(private readonly approvals: ApprovalApiService) {}

  private createExecutionService(): MarketingOSExecutionService {
    return new MarketingOSExecutionService(this.runtime, {
      create: (context, input) => this.approvals.create(context, {
        artifactId: input.artifactId,
        idempotencyKey: input.idempotencyKey,
      }),
      get: (approvalId, context) => this.approvals.get(approvalId, context),
    });
  }

  @Post('plan')
  async plan(
    @Req() request: AuthenticatedRequest,
    @Body() body: Omit<MarketingOSRequest, 'tenantId' | 'userId'>,
  ) {
    const auth = getAuthContext(request);
    const registry = await this.registryPromise;
    const graph = this.graphs.get(auth.tenantId) ?? createAcquisitionGraph(auth.tenantId);
    this.graphs.set(auth.tenantId, graph);

    const requestInput: MarketingOSRequest = {
      ...body,
      tenantId: auth.tenantId,
      ...(auth.userId ? { userId: auth.userId } : {}),
    };

    return buildMarketingOSPlan(requestInput, {
      contextBuilder: this.contextBuilder,
      registry: {
        domainLeaders: registry.domainLeaders,
        specialists: registry.specialists.map((agent) => ({
          id: agent.agentId,
          name: agent.name,
        })),
      },
      acquisitionGraph: graph,
    });
  }

  @Post('execute')
  async execute(
    @Req() request: AuthenticatedRequest,
    @Body() body: ExecuteBody,
  ): Promise<ExecuteResponse> {
    const auth = getAuthContext(request);
    if (body.plan.plan.tenantId !== auth.tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    const result = await this.createExecutionService().prepare({
      plan: body.plan,
      engagementId: body.engagementId,
      locale: body.locale ?? 'en',
      idempotencyKey: body.idempotencyKey,
      context: auth,
    });

    return {
      status: result.status,
      planId: result.plan.plan.planId,
      workflowId: result.workflow?.id ?? null,
      approvalId: result.approvalId ?? null,
      approved: result.approved,
      reasons: result.reasons,
    };
  }

  @Post('start/:planId')
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('planId') planId: string,
  ): Promise<ExecuteResponse> {
    const auth = getAuthContext(request);
    const result = await this.createExecutionService().start(planId, auth, {
      actor: auth.userId ?? 'api-user',
      reason: 'Marketing OS approved execution',
      timestamp: new Date().toISOString(),
      idempotencyKey: `start:${planId}`,
    });

    return {
      status: result.status,
      planId,
      workflowId: result.workflow?.id ?? null,
      approvalId: result.approvalId ?? null,
      approved: result.approved,
      reasons: result.reasons,
    };
  }

  @Get('runs/:planId')
  async run(
    @Req() request: AuthenticatedRequest,
    @Param('planId') planId: string,
  ): Promise<RunResponse> {
    const auth = getAuthContext(request);
    const service = this.createExecutionService();
    const result = service.get(planId, auth);
    const approval: ApprovalRecord | null = result.approvalId
      ? this.approvals.get(result.approvalId, auth)
      : null;

    return {
      planId,
      status: result.status,
      approved: result.approved,
      approvalId: result.approvalId ?? null,
      approval,
      workflow: result.workflow ?? null,
      tasks: result.workflow ? this.runtime.getTasks(result.workflow.id, auth) : [],
      artifacts: result.workflow ? this.runtime.getArtifacts(result.workflow.id, auth) : [],
      audits: this.runtime.getAudits(auth),
      reasons: result.reasons,
    };
  }
}
