import { Body, Controller, ForbiddenException, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { authorize } from '@platform/auth';
import type { Permission, TenantContext } from '@platform/contracts';
import type { LeadCaptureInput } from '@platform/marketing-os-core';

import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import { CUSTOMER_ACQUISITION_REVENUE_APPLICATION_SERVICE, CustomerAcquisitionRevenueApplicationService } from './customer-acquisition-revenue.application.js';

@UseGuards(ApiAuthGuard)
@Controller()
export class CustomerAcquisitionRevenueController {
  constructor(@Inject(CUSTOMER_ACQUISITION_REVENUE_APPLICATION_SERVICE) private readonly intelligence: CustomerAcquisitionRevenueApplicationService<any>) {}
  @Post('leads') capture(@Req() request: AuthenticatedRequest, @Body() body: LeadCaptureInput) { const context = getAuthContext(request); require(context, ['marketing:admin']); return this.intelligence.captureLead(context, body); }
  @Get('leads') leads(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.listLeads(context); }
  @Get('leads/:id') lead(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.getLead(context, id); }
  @Get('leads/:id/qualification') qualification(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.qualification(context, id); }
  @Get('leads/:id/identity') identity(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.identity(context, id); }
  @Get('leads/:id/engagement') engagement(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.engagement(context, id); }
  @Get('customer-identities/:id') customerIdentity(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.getIdentity(context, id); }
  @Get('opportunities') opportunities(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.listOpportunities(context); }
  @Get('opportunities/:id') opportunity(@Req() request: AuthenticatedRequest, @Param('id') id: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.getOpportunity(context, id); }
  @Get('revenue-events') revenueEvents(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.listRevenueEvents(context); }
  @Get('revenue-intelligence') revenueIntelligence(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read', 'audit:read']); return this.intelligence.revenueIntelligence(context); }
  @Get('funnel') funnel(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.listFunnel(context); }
  @Get('revenue-attribution') attribution(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read', 'audit:read']); return this.intelligence.listRevenueAttribution(context); }
  @Get('acquisition-diagnostics') diagnostics(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read', 'audit:read']); return this.intelligence.diagnostics(context); }
  @Get('lead-routing-recommendations') routing(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.intelligence.routingRecommendations(context); }
}
function require(context: TenantContext, permissions: Permission[]): void { try { for (const permission of permissions) authorize(context, permission); } catch (error) { throw new ForbiddenException(error instanceof Error ? error.message : 'Permission denied'); } }
