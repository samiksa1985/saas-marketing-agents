import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  loadCanonicalAgentRegistry,
} from '@platform/registry';

import {
  InMemoryKnowledgeRetriever,
  InMemoryMarketingMemoryRepository,
  MarketingContextBuilder,
} from '@platform/context-engine';

import {
  createAcquisitionGraph,
} from '@platform/acquisition-graph';

import {
  buildMarketingOSPlan,
  type MarketingOSRequest,
} from '@platform/marketing-os-core';

import {
  ApiAuthGuard,
  getAuthContext,
  type AuthenticatedRequest,
} from './auth.guard.js';

@Controller('marketing-os')
@UseGuards(ApiAuthGuard)
export class MarketingOsController {
  private readonly memory = new InMemoryMarketingMemoryRepository();
  private readonly knowledge = new InMemoryKnowledgeRetriever();
  private readonly contextBuilder = new MarketingContextBuilder(
    this.memory,
    this.knowledge,
  );

  private registryPromise = loadCanonicalAgentRegistry();

  private readonly graphs = new Map<
    string,
    ReturnType<typeof createAcquisitionGraph>
  >();

  @Post('plan')
  async plan(
    @Req() request: AuthenticatedRequest,
    @Body() body: Omit<MarketingOSRequest, 'tenantId' | 'userId'> & {
      tenantId?: string;
      userId?: string;
    },
  ) {
    const auth = getAuthContext(request);
    const registry = await this.registryPromise;

    if (body.tenantId && body.tenantId !== auth.tenantId) {
      return {
        statusCode: 403,
        message: 'Tenant mismatch',
      };
    }

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
}

