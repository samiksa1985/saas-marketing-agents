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
import type { UnifiedCampaignInput } from '@platform/marketing-os-core';

import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import {
  UNIFIED_CAMPAIGN_APPLICATION_SERVICE,
  UnifiedCampaignApplicationService,
} from './unified-campaigns.application.js';

@UseGuards(ApiAuthGuard)
@Controller('campaigns/unified')
export class UnifiedCampaignsController {
  constructor(
    @Inject(UNIFIED_CAMPAIGN_APPLICATION_SERVICE)
    private readonly campaigns: UnifiedCampaignApplicationService<any>,
  ) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: UnifiedCampaignInput) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin', 'workflow:execute']);
    return this.campaigns.create(context, body);
  }

  @Get(':campaignId')
  get(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read']);
    return this.campaigns.get(context, campaignId);
  }

  @Post(':campaignId/plan')
  plan(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin', 'workflow:execute']);
    return this.campaigns.plan(context, campaignId);
  }

  @Post(':campaignId/simulate')
  simulate(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin']);
    return this.campaigns.simulate(context, campaignId);
  }

  @Post(':campaignId/submit')
  submit(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin', 'workflow:execute']);
    return this.campaigns.submit(context, campaignId);
  }

  @Get(':campaignId/execution')
  execution(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read', 'audit:read']);
    return this.campaigns.execution(context, campaignId);
  }

  @Get(':campaignId/performance')
  performance(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read']);
    return this.campaigns.performance(context, campaignId);
  }

  @Get(':campaignId/recommendations')
  recommendations(@Req() request: AuthenticatedRequest, @Param('campaignId') campaignId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read']);
    return this.campaigns.recommendations(context, campaignId);
  }
}

function requirePermissions(context: TenantContext, permissions: Permission[]): void {
  try {
    for (const permission of permissions) authorize(context, permission);
  } catch (error) {
    throw new ForbiddenException(error instanceof Error ? error.message : 'Permission denied');
  }
}
