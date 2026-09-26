import { Controller, ForbiddenException, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { authorize } from '@platform/auth';
import type { Permission, TenantContext } from '@platform/contracts';

import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import { ExternalActionOperationsApplicationService } from './external-action-operations.application.js';

export const EXTERNAL_ACTION_OPERATIONS_APPLICATION_SERVICE =
  'PLATFORM_EXTERNAL_ACTION_OPERATIONS_APPLICATION_SERVICE';

/** Operator surface for tenant-scoped reliability state and safe outbox recovery. */
@UseGuards(ApiAuthGuard)
@Controller('marketing-os/external-action-operations')
export class ExternalActionOperationsController {
  constructor(
    @Inject(EXTERNAL_ACTION_OPERATIONS_APPLICATION_SERVICE)
    private readonly operations: ExternalActionOperationsApplicationService<any>,
  ) {}

  @Get('summary')
  summary(@Req() request: AuthenticatedRequest) {
    const context = getAuthContext(request);
    requirePermissions(context, ['system_health:read']);
    return this.operations.summary(context);
  }

  @Get('outbox')
  outbox(@Req() request: AuthenticatedRequest) {
    const context = getAuthContext(request);
    requirePermissions(context, ['system_health:read']);
    return this.operations.outbox(context);
  }

  @Get('provider-health/:provider')
  providerHealth(@Req() request: AuthenticatedRequest, @Param('provider') provider: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['system_health:read']);
    return this.operations.providerHealth(context, provider);
  }

  @Get('credential-health/:provider')
  credentialHealth(@Req() request: AuthenticatedRequest, @Param('provider') provider: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['system_health:read']);
    return this.operations.credentialHealth(context, provider);
  }

  @Post('outbox/:eventId/replay')
  replay(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['security_policy:manage', 'integration:admin']);
    return this.operations.replay(context, eventId);
  }

  @Post('outbox/recover-expired-leases')
  recoverExpiredLeases(@Req() request: AuthenticatedRequest) {
    const context = getAuthContext(request);
    requirePermissions(context, ['security_policy:manage', 'integration:admin']);
    return this.operations.recoverExpiredLeases(context);
  }
}

function requirePermissions(context: TenantContext, permissions: Permission[]): void {
  try {
    for (const permission of permissions) authorize(context, permission);
  } catch (error) {
    throw new ForbiddenException(error instanceof Error ? error.message : 'Permission denied');
  }
}
