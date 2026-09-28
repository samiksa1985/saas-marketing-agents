import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ExecutionRecord, MarketingOSRequest } from '@platform/marketing-os-core';
import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';
import {
  MarketingOsApplicationService,
  type MarketingOsExecuteInput,
  type MarketingOsRunResult,
} from './marketing-os.application.js';

interface ExecuteResponse {
  status: ExecutionRecord['status'];
  planId: string;
  workflowId: string | null;
  approvalId: string | null;
  approved: boolean;
  reasons: string[];
}

@UseGuards(ApiAuthGuard)
@Controller('marketing-os')
export class MarketingOsController {
  constructor(private readonly marketingOs: MarketingOsApplicationService) {}

  @Post('plan')
  plan(
    @Req() request: AuthenticatedRequest,
    @Body() body: Omit<MarketingOSRequest, 'tenantId' | 'userId'>,
  ) {
    return this.marketingOs.plan(getAuthContext(request), body);
  }

  @Post('execute')
  async execute(
    @Req() request: AuthenticatedRequest,
    @Body() body: MarketingOsExecuteInput,
  ): Promise<ExecuteResponse> {
    const auth = getAuthContext(request);
    if (body.plan && body.plan.plan.tenantId !== auth.tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return toExecuteResponse(await this.marketingOs.prepare(auth, body));
  }

  @Post('start/:planId')
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('planId') planId: string,
  ): Promise<ExecuteResponse> {
    return toExecuteResponse(await this.marketingOs.start(getAuthContext(request), planId));
  }

  @Get('runs/:planId')
  run(
    @Req() request: AuthenticatedRequest,
    @Param('planId') planId: string,
  ): Promise<MarketingOsRunResult> {
    return this.marketingOs.run(getAuthContext(request), planId);
  }
}

function toExecuteResponse(result: ExecutionRecord): ExecuteResponse {
  return {
    status: result.status,
    planId: result.planId,
    workflowId: result.workflowId ?? null,
    approvalId: result.approvalId ?? null,
    approved: result.approved,
    reasons: [...result.reasons],
  };
}
