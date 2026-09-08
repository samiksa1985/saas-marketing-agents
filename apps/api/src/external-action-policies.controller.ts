import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { authorize } from '@platform/auth';
import type { Permission, TenantContext } from '@platform/contracts';
import type { ExternalActionPolicyUpdate } from '@platform/marketing-os-persistence';

import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import { ExternalActionApplicationService } from './external-actions.application.js';

/**
 * Security-policy administration is intentionally separate from marketing
 * action routes. Marketing agents cannot enable a provider or remove a kill
 * switch merely by possessing workflow execution permissions.
 */
@UseGuards(ApiAuthGuard)
@Controller('marketing-os/external-action-policies')
export class ExternalActionPoliciesController {
  constructor(private readonly actions: ExternalActionApplicationService<any>) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    const context = getAuthContext(request);
    requirePermissions(context, ['security_policy:read']);
    return this.actions.listPolicies(context);
  }

  @Put(':provider')
  upsert(
    @Req() request: AuthenticatedRequest,
    @Param('provider') provider: string,
    @Body() policy: ExternalActionPolicyUpdate,
  ) {
    const context = getAuthContext(request);
    requirePermissions(context, ['security_policy:manage']);
    if (!provider?.trim()) throw new ForbiddenException('Provider is required');
    return this.actions.upsertPolicy(context, provider, policy);
  }
}

function requirePermissions(context: TenantContext, permissions: Permission[]): void {
  try {
    for (const permission of permissions) authorize(context, permission);
  } catch (error) {
    throw new ForbiddenException(error instanceof Error ? error.message : 'Permission denied');
  }
}
