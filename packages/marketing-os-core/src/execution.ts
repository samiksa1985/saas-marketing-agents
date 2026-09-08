import type { ApprovalDecision, Locale, TenantContext } from '@platform/contracts';
import type {
  TransitionMetadata,
  Workflow,
  WorkflowRuntime,
  WorkflowRuntimeQuery,
} from '@platform/workflow-runtime';
import type { MarketingOSPlan } from './index.js';

export type MarketingOSExecutionStatus =
  | 'BLOCKED'
  | 'PREPARED'
  | 'APPROVAL_REQUIRED'
  | 'RUNNING';

export interface MarketingOSApprovalRecord {
  id: string;
  tenantId: string;
  artifactId: string;
  decision?: ApprovalDecision;
}

/** Canonical approval boundary; implementations own approval persistence. */
export interface MarketingOSApprovalGateway {
  create(
    context: TenantContext,
    input: {
      artifactId: string;
      idempotencyKey: string;
      planId?: string;
      workflowId?: string;
    },
  ): Promise<MarketingOSApprovalRecord>;
  get(approvalId: string, context: TenantContext): Promise<MarketingOSApprovalRecord>;
}

/**
 * The execution binding is deliberately small. Workflow state belongs to the
 * selected workflow provider/read model, and the full plan belongs to the
 * tenant-scoped plan repository.
 */
export interface ExecutionRecord {
  tenantId: string;
  planId: string;
  engagementId: string;
  locale: Locale;
  idempotencyKey: string;
  workflowId?: string;
  approvalId?: string;
  status: MarketingOSExecutionStatus;
  approved: boolean;
  reasons: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MarketingOSExecutionRecordRepository {
  save(context: TenantContext, record: ExecutionRecord): Promise<ExecutionRecord>;
  get(context: TenantContext, planId: string): Promise<ExecutionRecord | undefined>;
  findByIdempotencyKey(
    context: TenantContext,
    idempotencyKey: string,
  ): Promise<ExecutionRecord | undefined>;
}

/** Explicit test/development implementation; never constructed by production composition. */
export class InMemoryMarketingOSExecutionRecordRepository
  implements MarketingOSExecutionRecordRepository
{
  private readonly byPlan = new Map<string, ExecutionRecord>();
  private readonly byIdempotencyKey = new Map<string, ExecutionRecord>();

  async save(context: TenantContext, record: ExecutionRecord): Promise<ExecutionRecord> {
    assertTenant(context, record.tenantId);
    const copy = copyRecord(record);
    this.byPlan.set(record.planId, copy);
    this.byIdempotencyKey.set(key(record.tenantId, record.idempotencyKey), copy);
    return copyRecord(copy);
  }

  async get(context: TenantContext, planId: string): Promise<ExecutionRecord | undefined> {
    const record = this.byPlan.get(planId);
    if (!record) return undefined;
    assertTenant(context, record.tenantId);
    return copyRecord(record);
  }

  async findByIdempotencyKey(
    context: TenantContext,
    idempotencyKey: string,
  ): Promise<ExecutionRecord | undefined> {
    const record = this.byIdempotencyKey.get(key(context.tenantId, idempotencyKey));
    return record ? copyRecord(record) : undefined;
  }
}

/** A provider-neutral command boundary for starting a prepared workflow. */
export interface MarketingOSExecutionCoordinator {
  start(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow>;
}

export class WorkflowRuntimeExecutionCoordinator
  implements MarketingOSExecutionCoordinator
{
  constructor(private readonly runtime: WorkflowRuntime) {}

  start(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    return this.runtime.start(workflowId, context, metadata);
  }
}

export interface MarketingOSExecutionDependencies {
  runtime: WorkflowRuntime;
  query: WorkflowRuntimeQuery;
  records: MarketingOSExecutionRecordRepository;
  approvals?: MarketingOSApprovalGateway;
  coordinator?: MarketingOSExecutionCoordinator;
}

/**
 * Application service for the durable Marketing OS execution binding. It does
 * not create a runtime, read model, or repository; composition selects all of
 * those dependencies explicitly.
 */
export class MarketingOSExecutionService {
  private readonly coordinator: MarketingOSExecutionCoordinator;

  constructor(private readonly dependencies: MarketingOSExecutionDependencies) {
    this.coordinator =
      dependencies.coordinator ?? new WorkflowRuntimeExecutionCoordinator(dependencies.runtime);
  }

  async prepare(input: {
    plan: MarketingOSPlan;
    engagementId: string;
    locale: Locale;
    idempotencyKey: string;
    context: TenantContext;
  }): Promise<ExecutionRecord> {
    const planId = input.plan.plan.planId;
    assertTenant(input.context, input.plan.plan.tenantId);

    const idempotent = await this.dependencies.records.findByIdempotencyKey(
      input.context,
      input.idempotencyKey,
    );
    if (idempotent) {
      if (idempotent.planId !== planId) {
        throw new Error('Idempotency key is already bound to another Marketing OS plan.');
      }
      return idempotent;
    }

    const existing = await this.dependencies.records.get(input.context, planId);
    if (existing) {
      if (existing.idempotencyKey !== input.idempotencyKey) {
        throw new Error('Marketing OS plan already has an execution binding.');
      }
      return existing;
    }

    const timestamp = new Date().toISOString();
    if (input.plan.readiness.blocked) {
      return this.dependencies.records.save(input.context, {
        tenantId: input.context.tenantId,
        planId,
        engagementId: input.engagementId,
        locale: input.locale,
        idempotencyKey: input.idempotencyKey,
        status: 'BLOCKED',
        approved: false,
        reasons: [...input.plan.readiness.reasons],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    const workflow = await this.dependencies.runtime.createWorkflow({
      tenantId: input.context.tenantId,
      engagementId: input.engagementId,
      locale: input.locale,
      selectedWorkstreamIds: input.plan.plan.workstreams.map((workstream) => workstream.id),
      idempotencyKey: input.idempotencyKey,
    });

    const requiresHumanApproval =
      input.plan.plan.governance.requiresHumanApproval ||
      input.plan.plan.governance.externalExecutionBlockedUntilApproval;

    let approvalId: string | undefined;
    let approved = !requiresHumanApproval;

    if (requiresHumanApproval) {
      if (!this.dependencies.approvals) {
        throw new Error('Approval gateway is required for approval-gated execution.');
      }
      const approval = await this.dependencies.approvals.create(input.context, {
        artifactId: workflow.id,
        idempotencyKey: `${input.idempotencyKey}:approval`,
        planId,
        workflowId: workflow.id,
      });
      approvalId = approval.id;
      approved = isApproved(approval.decision);
    }

    return this.dependencies.records.save(input.context, {
      tenantId: input.context.tenantId,
      planId,
      engagementId: input.engagementId,
      locale: input.locale,
      idempotencyKey: input.idempotencyKey,
      workflowId: workflow.id,
      ...(approvalId ? { approvalId } : {}),
      status: approved ? 'PREPARED' : 'APPROVAL_REQUIRED',
      approved,
      reasons: approved
        ? []
        : [
            ...input.plan.plan.governance.approvalReasons,
            'External execution is blocked until the canonical approval service records an approval decision.',
          ],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async syncApproval(planId: string, context: TenantContext): Promise<ExecutionRecord> {
    const record = await this.get(planId, context);
    if (!record.approvalId) {
      if (record.approved && record.status === 'PREPARED') return record;
      return this.save(context, {
        ...record,
        approved: true,
        status: 'PREPARED',
        reasons: [],
      });
    }
    if (!this.dependencies.approvals) throw new Error('Approval gateway is required.');

    const approval = await this.dependencies.approvals.get(record.approvalId, context);
    const approved = isApproved(approval.decision);
    return this.save(context, {
      ...record,
      approved,
      status: approved ? 'PREPARED' : 'APPROVAL_REQUIRED',
      reasons: approved ? [] : ['Canonical approval decision has not approved this execution.'],
    });
  }

  async start(
    planId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<ExecutionRecord> {
    let record = await this.get(planId, context);
    if (record.status === 'RUNNING') return record;
    if (record.approvalId) record = await this.syncApproval(planId, context);

    if (!record.approved) {
      return this.save(context, {
        ...record,
        status: 'APPROVAL_REQUIRED',
        reasons:
          record.reasons.length > 0
            ? record.reasons
            : ['Canonical approval is required before execution.'],
      });
    }

    if (!record.workflowId) throw new Error('Execution workflow has not been prepared.');

    await this.coordinator.start(record.workflowId, context, metadata);
    await this.dependencies.query.getWorkflow(record.workflowId, context);
    return this.save(context, {
      ...record,
      status: 'RUNNING',
      reasons: [],
    });
  }

  async get(planId: string, context: TenantContext): Promise<ExecutionRecord> {
    const record = await this.dependencies.records.get(context, planId);
    if (!record) throw new Error('Marketing OS plan not found or access denied.');
    assertTenant(context, record.tenantId);
    return record;
  }

  private save(context: TenantContext, record: ExecutionRecord): Promise<ExecutionRecord> {
    return this.dependencies.records.save(context, {
      ...record,
      reasons: [...record.reasons],
      updatedAt: new Date().toISOString(),
    });
  }
}

function assertTenant(context: TenantContext, tenantId: string): void {
  if (!context.tenantId || context.tenantId !== tenantId) {
    throw new Error('Cross-tenant access denied');
  }
}

function isApproved(decision: ApprovalDecision | undefined): boolean {
  return decision === 'approved' || decision === 'approved_with_conditions';
}

function key(tenantId: string, idempotencyKey: string): string {
  return `${tenantId}\u0000${idempotencyKey}`;
}

function copyRecord(record: ExecutionRecord): ExecutionRecord {
  return { ...record, reasons: [...record.reasons] };
}
