import { Body, Controller, ForbiddenException, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { authorize } from '@platform/auth';
import type { Permission, TenantContext } from '@platform/contracts';
import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import { CUSTOMER_JOURNEY_APPLICATION_SERVICE, CustomerJourneyApplicationService } from './customer-journey.application.js';

@UseGuards(ApiAuthGuard)
@Controller()
export class CustomerJourneyController {
  constructor(@Inject(CUSTOMER_JOURNEY_APPLICATION_SERVICE) private readonly journey: CustomerJourneyApplicationService<any>) {}
  @Get('customer-journey/:identityId') overview(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.overview(context, identityId); }
  @Get('customer-journey/:identityId/timeline') timeline(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.timeline(context, identityId); }
  @Get('customer-journey/:identityId/lifecycle') lifecycle(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.lifecycle(context, identityId); }
  @Get('customer-journey/:identityId/stage') stage(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.stage(context, identityId); }
  @Get('customer-journey/:identityId/blockers') blockers(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read', 'audit:read']); return this.journey.blockers(context, identityId); }
  @Get('customer-journey/:identityId/next-best-actions') recommendations(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.recommendations(context, identityId); }
  @Post('customer-journey/:identityId/next-best-actions/evaluate') evaluate(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['marketing:admin']); return this.journey.evaluate(context, identityId); }
  @Get('customer-journey/:identityId/plan') plan(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.plan(context, identityId); }
  @Get('customer-journey/:identityId/health') health(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.health(context, identityId); }
  @Get('customer-journey/:identityId/retention') retention(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.retention(context, identityId); }
  @Get('customer-journey/:identityId/renewal') renewal(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.renewal(context, identityId); }
  @Get('customer-journey/:identityId/expansion') expansion(@Req() request: AuthenticatedRequest, @Param('identityId') identityId: string) { const context = getAuthContext(request); require(context, ['artifact:read']); return this.journey.expansion(context, identityId); }
  @Get('customer-journey/analytics') analytics(@Req() request: AuthenticatedRequest) { const context = getAuthContext(request); require(context, ['artifact:read', 'audit:read']); return this.journey.analytics(context); }
}
function require(context: TenantContext, permissions: Permission[]): void { try { for (const permission of permissions) authorize(context, permission); } catch (error) { throw new ForbiddenException(error instanceof Error ? error.message : 'Permission denied'); } }
