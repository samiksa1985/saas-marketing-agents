import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  InMemoryDurableApprovalRepository,
  type DurableApprovalRecord,
  type DurableApprovalRepository,
} from '@platform/approvals';
import { authorize } from '@platform/auth';
import type { ApprovalDecision, TenantContext } from '@platform/contracts';
import { ApiAuthGuard, getAuthContext, type AuthenticatedRequest } from './auth.guard.js';

export interface CreateApprovalBody {
  artifactId: string;
  expiresAt?: string;
  conditions?: string[];
  idempotencyKey?: string;
  planId?: string;
  workflowId?: string;
  executionBindingId?: string;
  reason?: string;
  policyReference?: string;
  riskLevel?: string;
  actionSummary?: string;
}

export interface DecideApprovalBody {
  decision: ApprovalDecision;
  conditions?: string[];
  idempotencyKey?: string;
}

export type ApprovalRecord = DurableApprovalRecord;
export const DURABLE_APPROVAL_REPOSITORY = Symbol('DURABLE_APPROVAL_REPOSITORY');

function buildApprovalId(tenantId: string, artifactId: string, idempotencyKey: string): string {
  return `approval-${createHash('sha256')
    .update(`${tenantId}:${artifactId}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 32)}`;
}

@Injectable()
export class ApprovalApiService {
  private readonly repository: DurableApprovalRepository;

  constructor(
    @Optional()
    @Inject(DURABLE_APPROVAL_REPOSITORY)
    repository?: DurableApprovalRepository,
  ) {
    // Explicitly dev/test only. Production composition always injects PostgreSQL.
    this.repository = repository ?? new InMemoryDurableApprovalRepository();
  }

  create(context: TenantContext, input: CreateApprovalBody): Promise<ApprovalRecord> {
    const idempotencyKey = input.idempotencyKey ?? `approval-${Date.now()}`;
    return this.repository.create(context, {
      id: buildApprovalId(context.tenantId, input.artifactId, idempotencyKey),
      artifactId: input.artifactId,
      idempotencyKey,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      ...(input.conditions ? { conditions: [...input.conditions] } : {}),
      ...(input.planId ? { planId: input.planId } : {}),
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      ...(input.executionBindingId ? { executionBindingId: input.executionBindingId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.policyReference ? { policyReference: input.policyReference } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      ...(input.actionSummary ? { actionSummary: input.actionSummary } : {}),
    });
  }

  async get(approvalId: string, context: TenantContext): Promise<ApprovalRecord> {
    try {
      const record = await this.repository.get(context, approvalId);
      if (!record) throw new NotFoundException('Approval not found');
      return record;
    } catch (error) {
      if (error instanceof Error && error.message === 'CROSS_TENANT_APPROVAL_ACCESS') {
        throw new ForbiddenException('Cross-tenant access denied');
      }
      throw error;
    }
  }

  async decide(
    approvalId: string,
    context: TenantContext,
    input: DecideApprovalBody,
  ): Promise<ApprovalRecord> {
    const record = await this.get(approvalId, context);
    if (record.expiresAt && new Date(record.expiresAt) <= new Date()) {
      throw new ConflictException('Approval has expired');
    }
    if (record.decision) {
      if (input.idempotencyKey && record.decisionIdempotencyKey === input.idempotencyKey) {
        return record;
      }
      throw new ConflictException('Approval already has a decision');
    }
    if (input.decision === 'approved_with_conditions' && !input.conditions?.length) {
      throw new BadRequestException('conditions are required for approved_with_conditions');
    }
    if (input.decision !== 'approved_with_conditions' && input.conditions?.length) {
      throw new BadRequestException('conditions are only valid for approved_with_conditions');
    }
    try {
      return await this.repository.decide(context, approvalId, input);
    } catch (error) {
      if (error instanceof Error && error.message === 'APPROVAL_ALREADY_DECIDED') {
        throw new ConflictException('Approval already has a decision');
      }
      throw error;
    }
  }

  list(context: TenantContext): Promise<ApprovalRecord[]> {
    return this.repository.list(context);
  }
}

@Controller()
@UseGuards(ApiAuthGuard)
export class ApprovalController {
  constructor(private readonly approvals: ApprovalApiService) {}

  @Post('/approvals')
  async create(
    @Body() body: CreateApprovalBody,
    @Req() request: unknown,
    @Headers('idempotency-key') headerIdempotencyKey?: string,
  ): Promise<ApprovalRecord> {
    const context = getAuthContext(request as AuthenticatedRequest);
    this.authorize(context, 'workflow:execute');
    if (!body?.artifactId) throw new BadRequestException('artifactId is required');
    const idempotencyKey = body.idempotencyKey ?? headerIdempotencyKey;
    return this.approvals.create(context, {
      artifactId: body.artifactId,
      ...(body.conditions ? { conditions: [...body.conditions] } : {}),
      ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      ...(body.planId ? { planId: body.planId } : {}),
      ...(body.workflowId ? { workflowId: body.workflowId } : {}),
      ...(body.executionBindingId ? { executionBindingId: body.executionBindingId } : {}),
      ...(body.reason ? { reason: body.reason } : {}),
      ...(body.policyReference ? { policyReference: body.policyReference } : {}),
      ...(body.riskLevel ? { riskLevel: body.riskLevel } : {}),
      ...(body.actionSummary ? { actionSummary: body.actionSummary } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  }

  @Get('/approvals')
  async list(@Req() request: unknown): Promise<ApprovalRecord[]> {
    const context = getAuthContext(request as AuthenticatedRequest);
    this.authorizeAny(context, ['artifact:read', 'approval:decide']);
    return this.approvals.list(context);
  }

  @Get('/approvals/:approvalId')
  async get(@Param('approvalId') approvalId: string, @Req() request: unknown): Promise<ApprovalRecord> {
    const context = getAuthContext(request as AuthenticatedRequest);
    this.authorizeAny(context, ['artifact:read', 'approval:decide']);
    return this.approvals.get(approvalId, context);
  }

  @Post('/approvals/:approvalId/decision')
  async decide(
    @Param('approvalId') approvalId: string,
    @Body() body: DecideApprovalBody,
    @Req() request: unknown,
    @Headers('idempotency-key') headerIdempotencyKey?: string,
  ): Promise<ApprovalRecord> {
    const context = getAuthContext(request as AuthenticatedRequest);
    this.authorize(context, 'approval:decide');
    const valid: ApprovalDecision[] = ['approved', 'approved_with_conditions', 'rejected', 'expired'];
    if (!body?.decision) throw new BadRequestException('decision is required');
    if (!valid.includes(body.decision)) throw new BadRequestException('Invalid approval decision');
    const idempotencyKey = body.idempotencyKey ?? headerIdempotencyKey;
    return this.approvals.decide(approvalId, context, {
      decision: body.decision,
      ...(body.conditions ? { conditions: [...body.conditions] } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  }

  private authorize(context: TenantContext, permission: 'workflow:execute' | 'approval:decide'): void {
    try {
      authorize(context, permission);
    } catch (error) {
      throw new ForbiddenException(error instanceof Error ? error.message : `Missing permission: ${permission}`);
    }
  }

  private authorizeAny(
    context: TenantContext,
    permissions: Array<'artifact:read' | 'approval:decide'>,
  ): void {
    for (const permission of permissions) {
      try {
        authorize(context, permission);
        return;
      } catch {
        // Try the next permitted read capability.
      }
    }
    throw new ForbiddenException('Missing approval read permission');
  }
}
