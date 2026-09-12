import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { authorize } from '@platform/auth';
import type { ApprovalDecision, Permission, TenantContext } from '@platform/contracts';
import type { ExternalMarketingActionProposal } from '@platform/marketing-os-core';

import { ApprovalApiService } from './approval.controller.js';
import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import {
  EXTERNAL_ACTION_APPLICATION_SERVICE,
  ExternalActionApplicationService,
} from './external-actions.application.js';

@UseGuards(ApiAuthGuard)
@Controller('marketing-os/external-actions')
export class ExternalActionsController {
  constructor(
    @Inject(EXTERNAL_ACTION_APPLICATION_SERVICE)
    private readonly actions: ExternalActionApplicationService<any>,
    private readonly approvals: ApprovalApiService,
  ) {}

  @Post('propose')
  propose(@Req() request: AuthenticatedRequest, @Body() proposal: ExternalMarketingActionProposal) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin', 'workflow:execute']);
    return this.actions.propose(context, proposal);
  }

  @Post(':actionId/simulate')
  simulate(@Req() request: AuthenticatedRequest, @Param('actionId') actionId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin']);
    return this.actions.simulate(context, actionId);
  }

  @Post(':actionId/request-approval')
  requestApproval(@Req() request: AuthenticatedRequest, @Param('actionId') actionId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin', 'workflow:execute']);
    return this.actions.requestApproval(context, actionId);
  }

  @Post(':actionId/approve')
  async approve(
    @Req() request: AuthenticatedRequest,
    @Param('actionId') actionId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Body() body?: { conditions?: string[] },
  ) {
    return this.decide(request, actionId, 'approved', idempotencyKey, body?.conditions);
  }

  @Post(':actionId/reject')
  async reject(
    @Req() request: AuthenticatedRequest,
    @Param('actionId') actionId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.decide(request, actionId, 'rejected', idempotencyKey);
  }

  @Post(':actionId/execute')
  execute(@Req() request: AuthenticatedRequest, @Param('actionId') actionId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin', 'workflow:execute', 'integration:admin']);
    return this.actions.execute(context, actionId);
  }

  @Post(':actionId/rollback/propose')
  proposeRollback(@Req() request: AuthenticatedRequest, @Param('actionId') actionId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['marketing:admin', 'workflow:execute']);
    return this.actions.proposeRollback(context, actionId);
  }

  @Get(':actionId')
  get(@Req() request: AuthenticatedRequest, @Param('actionId') actionId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['artifact:read']);
    return this.actions.get(context, actionId);
  }

  @Get(':actionId/evidence')
  async evidence(@Req() request: AuthenticatedRequest, @Param('actionId') actionId: string) {
    const context = getAuthContext(request);
    requirePermissions(context, ['audit:read']);
    return (await this.actions.get(context, actionId)).evidence;
  }

  private async decide(
    request: AuthenticatedRequest,
    actionId: string,
    decision: ApprovalDecision,
    idempotencyKey?: string,
    conditions?: string[],
  ) {
    const context = getAuthContext(request);
    requirePermissions(context, ['approval:decide']);
    const action = await this.actions.get(context, actionId);
    if (
      action.policyDecision?.requiredApprovalRole &&
      !context.roles.includes(action.policyDecision.requiredApprovalRole as (typeof context.roles)[number])
    ) {
      throw new ForbiddenException('External action approval requires the policy approver role');
    }
    if (!action.approvalId) throw new ForbiddenException('External action has no durable approval request');
    await this.approvals.decide(action.approvalId, context, {
      decision,
      ...(conditions?.length ? { conditions } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    return this.actions.get(context, actionId);
  }
}

function requirePermissions(context: TenantContext, permissions: Permission[]): void {
  try {
    for (const permission of permissions) authorize(context, permission);
  } catch (error) {
    throw new ForbiddenException(error instanceof Error ? error.message : 'Permission denied');
  }
}
