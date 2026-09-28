import { Body, Controller, ForbiddenException, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { authorize } from '@platform/auth';
import type { Permission, TenantContext } from '@platform/contracts';
import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import { CUSTOMER_GROWTH_DECISION_APPLICATION_SERVICE, CustomerGrowthDecisionApplicationService } from './customer-growth-decisioning.application.js';

@UseGuards(ApiAuthGuard)
@Controller('growth-decisions')
export class CustomerGrowthDecisionController {
  constructor(@Inject(CUSTOMER_GROWTH_DECISION_APPLICATION_SERVICE) private readonly decisions: CustomerGrowthDecisionApplicationService<any>) {}

  @Post('evaluate')
  evaluate(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    const context = getAuthContext(request); require(context, ['marketing:admin']);
    return this.decisions.evaluate(context, body as never);
  }

  @Get('contexts/:key')
  overview(@Req() request: AuthenticatedRequest, @Param('key') key: string) {
    const context = getAuthContext(request); require(context, ['artifact:read']);
    return this.decisions.overview(context, key);
  }
}

function require(context: TenantContext, permissions: Permission[]): void {
  try { for (const permission of permissions) authorize(context, permission); }
  catch (error) { throw new ForbiddenException(error instanceof Error ? error.message : 'Permission denied'); }
}
