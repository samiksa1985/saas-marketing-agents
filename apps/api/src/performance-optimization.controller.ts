import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { authorize } from '@platform/auth';
import type { Permission, TenantContext } from '@platform/contracts';
import type {
  ProviderPerformanceMetricMapping,
  ProviderPerformanceObservationInput,
} from '@platform/marketing-os-core';

import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import {
  PERFORMANCE_OPTIMIZATION_APPLICATION_SERVICE,
  PerformanceOptimizationApplicationService,
} from './performance-optimization.application.js';

@UseGuards(ApiAuthGuard)
@Controller('campaigns/unified')
export class PerformanceOptimizationController {
  constructor(
    @Inject(PERFORMANCE_OPTIMIZATION_APPLICATION_SERVICE)
    private readonly optimization: PerformanceOptimizationApplicationService<any>,
  ) {}

  /** Read-side ingestion accepts a declared mapping only; it never invokes a provider. */
  @Post(':campaignId/performance/observations')
  ingest(
    @Req() request: AuthenticatedRequest,
    @Param('campaignId') campaignId: string,
    @Body() body: { input: ProviderPerformanceObservationInput; mapping: ProviderPerformanceMetricMapping },
  ) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin']);
    return this.optimization.ingestObservation(context, campaignId, body.input, body.mapping);
  }

  @Get(':campaignId/performance/intelligence')
  performance(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read']);
    return this.optimization.performance(context, campaignId);
  }

  @Get(':campaignId/performance/diagnostics')
  diagnostics(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read']);
    return this.optimization.diagnostics(context, campaignId);
  }

  @Get(':campaignId/performance/anomalies')
  anomalies(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read']);
    return this.optimization.anomalies(context, campaignId);
  }

  @Get(':campaignId/performance/recommendations')
  recommendations(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read']);
    return this.optimization.recommendations(context, campaignId);
  }

  @Post(':campaignId/performance/recommendations/generate')
  generate(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin']);
    return this.optimization.generateRecommendations(context, campaignId);
  }

  @Get(':campaignId/performance/recommendations/:recommendationId/simulation')
  simulation(@Req() request: AuthenticatedRequest, @Param('recommendationId') recommendationId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read']);
    return this.optimization.getSimulation(context, recommendationId);
  }

  /** Creates only an existing governed external-action proposal; approval and execution stay on their existing routes. */
  @Post(':campaignId/performance/recommendations/:recommendationId/governed-proposal')
  propose(
    @Req() request: AuthenticatedRequest,
    @Param('campaignId') campaignId: string,
    @Param('recommendationId') recommendationId: string,
  ) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin', 'workflow:execute']);
    return this.optimization.proposeGovernedAction(context, campaignId, recommendationId);
  }

  @Get(':campaignId/performance/outcomes')
  outcomes(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read', 'audit:read']);
    return this.optimization.listOutcomes(context, campaignId);
  }

  @Get(':campaignId/performance/learning')
  learning(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read', 'audit:read']);
    return this.optimization.listLearning(context, campaignId);
  }
}

function requirePermissions(context: TenantContext, permissions: Permission[]): void {
  try {
    for (const permission of permissions) authorize(context, permission);
  } catch (error) {
    throw new ForbiddenException(error instanceof Error ? error.message : 'Permission denied');
  }
}
