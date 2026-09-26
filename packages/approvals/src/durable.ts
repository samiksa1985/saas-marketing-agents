import type { Approval, ApprovalDecision, TenantContext } from '@platform/contracts';

export type DurableApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

/** Canonical approval record shared by API, persistence, and workflow composition. */
export interface DurableApprovalRecord extends Approval {
  status: DurableApprovalStatus;
  planId?: string;
  workflowId?: string;
  executionBindingId?: string;
  requestedByUserId?: string;
  requestedAt: string;
  decidedAt?: string;
  reason?: string;
  policyReference?: string;
  riskLevel?: string;
  actionSummary?: string;
  createdAt: string;
  updatedAt: string;
  creationIdempotencyKey: string;
  decisionIdempotencyKey?: string;
}

export interface CreateDurableApprovalInput {
  id: string;
  artifactId: string;
  idempotencyKey: string;
  expiresAt?: string;
  conditions?: string[];
  planId?: string;
  workflowId?: string;
  executionBindingId?: string;
  reason?: string;
  policyReference?: string;
  riskLevel?: string;
  actionSummary?: string;
}

export interface DecideDurableApprovalInput {
  decision: ApprovalDecision;
  conditions?: string[];
  idempotencyKey?: string;
}

/** Tenant-scoped canonical approval persistence boundary. */
export interface DurableApprovalRepository {
  create(
    context: TenantContext,
    input: CreateDurableApprovalInput,
  ): Promise<DurableApprovalRecord>;
  get(context: TenantContext, approvalId: string): Promise<DurableApprovalRecord | undefined>;
  decide(
    context: TenantContext,
    approvalId: string,
    input: DecideDurableApprovalInput,
  ): Promise<DurableApprovalRecord>;
  list(context: TenantContext): Promise<DurableApprovalRecord[]>;
}

/** Explicit dev/test repository. Production composes the PostgreSQL adapter. */
export class InMemoryDurableApprovalRepository implements DurableApprovalRepository {
  private readonly approvals = new Map<string, DurableApprovalRecord>();
  private readonly idempotency = new Map<string, string>();

  async create(
    context: TenantContext,
    input: CreateDurableApprovalInput,
  ): Promise<DurableApprovalRecord> {
    assertTenant(context);
    const existingId = this.idempotency.get(key(context.tenantId, input.idempotencyKey));
    if (existingId) {
      const existing = this.approvals.get(existingId);
      if (existing) return copy(existing);
    }
    const now = new Date().toISOString();
    const record: DurableApprovalRecord = {
      id: input.id,
      tenantId: context.tenantId,
      artifactId: input.artifactId,
      status: 'PENDING',
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      ...(input.conditions ? { conditions: [...input.conditions] } : {}),
      ...(input.planId ? { planId: input.planId } : {}),
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      ...(input.executionBindingId ? { executionBindingId: input.executionBindingId } : {}),
      ...(context.userId ? { requestedByUserId: context.userId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.policyReference ? { policyReference: input.policyReference } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      ...(input.actionSummary ? { actionSummary: input.actionSummary } : {}),
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
      creationIdempotencyKey: input.idempotencyKey,
    };
    this.approvals.set(record.id, record);
    this.idempotency.set(key(context.tenantId, input.idempotencyKey), record.id);
    return copy(record);
  }

  async get(context: TenantContext, approvalId: string): Promise<DurableApprovalRecord | undefined> {
    assertTenant(context);
    const record = this.approvals.get(approvalId);
    if (!record) return undefined;
    if (record.tenantId !== context.tenantId) throw new Error('CROSS_TENANT_APPROVAL_ACCESS');
    return copy(record);
  }

  async decide(
    context: TenantContext,
    approvalId: string,
    input: DecideDurableApprovalInput,
  ): Promise<DurableApprovalRecord> {
    const record = await this.get(context, approvalId);
    if (!record) throw new Error('APPROVAL_NOT_FOUND');
    if (record.decision) {
      if (input.idempotencyKey && record.decisionIdempotencyKey === input.idempotencyKey) {
        return record;
      }
      throw new Error('APPROVAL_ALREADY_DECIDED');
    }
    const now = new Date().toISOString();
    const decided: DurableApprovalRecord = {
      ...record,
      decision: input.decision,
      status: statusFor(input.decision),
      ...(input.conditions ? { conditions: [...input.conditions] } : {}),
      ...(context.userId ? { approverUserId: context.userId } : {}),
      ...(input.idempotencyKey ? { decisionIdempotencyKey: input.idempotencyKey } : {}),
      decidedAt: now,
      updatedAt: now,
    };
    this.approvals.set(approvalId, decided);
    return copy(decided);
  }

  async list(context: TenantContext): Promise<DurableApprovalRecord[]> {
    assertTenant(context);
    return [...this.approvals.values()]
      .filter((record) => record.tenantId === context.tenantId)
      .map(copy);
  }
}

export function statusFor(decision: ApprovalDecision): DurableApprovalStatus {
  if (decision === 'approved' || decision === 'approved_with_conditions') return 'APPROVED';
  if (decision === 'rejected') return 'REJECTED';
  return 'EXPIRED';
}

function assertTenant(context: TenantContext): void {
  if (!context.tenantId) throw new Error('TENANT_CONTEXT_REQUIRED');
}

function key(tenantId: string, idempotencyKey: string): string {
  return `${tenantId}\u0000${idempotencyKey}`;
}

function copy(record: DurableApprovalRecord): DurableApprovalRecord {
  return { ...record, ...(record.conditions ? { conditions: [...record.conditions] } : {}) };
}
