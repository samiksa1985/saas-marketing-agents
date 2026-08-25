import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { loadCanonicalAgentRegistry } from '@platform/registry';
import {
  InMemoryKnowledgeRetriever,
  InMemoryMarketingMemoryRepository,
  MarketingContextBuilder,
} from '@platform/context-engine';
import { createAcquisitionGraph } from '@platform/acquisition-graph';
import {
  buildMarketingOSPlan,
  type MarketingOSRequest,
} from '@platform/marketing-os-core';
import { MarketingOSExecutionService } from '@platform/marketing-os-core';
import { InMemoryWorkflowRuntime } from '@platform/workflow-runtime';
import type { Locale } from '@platform/contracts';
import {
  ApiAuthGuard,
  getAuthContext,
  type AuthenticatedRequest,
} from './auth.guard.js';

interface ExecuteBody {
  plan: ReturnType<typeof buildMarketingOSPlan> extends Promise<infer T> ? T : never;
  engagementId: string;
  locale?: Locale;
  idempotencyKey: string;
}

@UseGuards(ApiAuthGuard)
@Controller('marketing-os')
export class MarketingOsController {
  private readonly memory = new InMemoryMarketingMemoryRepository();
  private readonly knowledge = new InMemoryKnowledgeRetriever();
  private readonly contextBuilder = new MarketingContextBuilder(
    this.memory,
    this.knowledge,
  );
  private readonly runtime = new InMemoryWorkflowRuntime();
  private readonly execution = new MarketingOSExecutionService(
    this.runtime,
  );
  private readonly registryPromise = loadCanonicalAgentRegistry();
  private readonly graphs = new Map<
    string,
    ReturnType<typeof createAcquisitionGraph>
  >();

  @Post('plan')
  async plan(
    @Req() request: AuthenticatedRequest,
    @Body()
    body: Omit<MarketingOSRequest, 'tenantId' | 'userId'>,
  ) {
    const auth = getAuthContext(request);
    const registry = await this.registryPromise;

    const graph =
      this.graphs.get(auth.tenantId) ??
      createAcquisitionGraph(auth.tenantId);

    this.graphs.set(auth.tenantId, graph);

    const requestInput: MarketingOSRequest = {
      ...body,
      tenantId: auth.tenantId,
      ...(auth.userId ? { userId: auth.userId } : {}),
    };

    const commanderRegistry = {
      domainLeaders: registry.domainLeaders,
      specialists: registry.specialists.map((agent) => ({
        id: agent.agentId,
        name: agent.name,
      })),
    };

    return buildMarketingOSPlan(requestInput, {
      contextBuilder: this.contextBuilder,
      registry: commanderRegistry,
      acquisitionGraph: graph,
    });
  }

  @Post('execute')
  async execute(
    @Req() request: AuthenticatedRequest,
    @Body() body: ExecuteBody,
  ) {
    const auth = getAuthContext(request);

    if (body.plan.plan.tenantId !== auth.tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    const result = await this.execution.prepare({
      plan: body.plan,
      engagementId: body.engagementId,
      locale: body.locale ?? 'en',
      idempotencyKey: body.idempotencyKey,
    });

    return {
      status: result.status,
      planId: result.plan.plan.planId,
      workflowId: result.workflow?.id ?? null,
      approved: result.approved,
      reasons: result.reasons,
    };
  }

  @Post('approve/:planId')
  async approve(
    @Req() request: AuthenticatedRequest,
    @Param('planId') planId: string,
  ) {
    const auth = getAuthContext(request);
    // The existing approval API remains canonical; this endpoint only records
    // the execution gate for the vertical-slice harness.
    const result = this.execution.approve(planId, auth);
    return {
      status: result.status,
      planId,
      approved: result.approved,
    };
  }

  @Post('start/:planId')
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('planId') planId: string,
  ) {
    const auth = getAuthContext(request);
    const result = await this.execution.start(
      planId,
      auth,
      {
        actor: auth.userId ?? 'api-user',
        reason: 'Marketing OS approved execution',
        timestamp: new Date().toISOString(),
        idempotencyKey: `start:${planId}`,
      },
    );

    return {
      status: result.status,
      planId,
      workflowId: result.workflow?.id ?? null,
      workflowStatus: result.workflow?.status ?? null,
      reasons: result.reasons,
    };
  }

  @Get('runs/:planId')
  async run(
    @Req() request: AuthenticatedRequest,
    @Param('planId') planId: string,
  ) {
    const auth = getAuthContext(request);
    const result = this.execution.get(planId, auth);

    return {
      planId,
      status: result.status,
      approved: result.approved,
      workflow: result.workflow ?? null,
      tasks: result.workflow
        ? this.runtime.getTasks(result.workflow.id, auth)
        : [],
      artifacts: result.workflow
        ? this.runtime.getArtifacts(result.workflow.id, auth)
        : [],
      audits: this.runtime.getAudits(auth),
      reasons: result.reasons,
    };
  }
}

