import type { ApprovalDecision, Locale, TenantContext } from '@platform/contracts';
import type { MarketingOSPlan } from './index.js';
import { LocalWorkflowExecutor, InMemoryWorkflowRuntime, type TransitionMetadata, type Workflow } from '@platform/workflow-runtime';

export type MarketingOSExecutionStatus = 'BLOCKED' | 'PREPARED' | 'APPROVAL_REQUIRED' | 'RUNNING';

export interface MarketingOSApprovalRecord {
  id: string;
  tenantId: string;
  artifactId: string;
  decision?: ApprovalDecision;
}

export interface MarketingOSApprovalGateway {
  create(context: TenantContext, input: { artifactId: string; idempotencyKey: string }): MarketingOSApprovalRecord;
  get(approvalId: string, context: TenantContext): MarketingOSApprovalRecord;
}

export interface ExecutionRecord {
  plan: MarketingOSPlan;
  engagementId: string;
  locale: Locale;
  idempotencyKey: string;
  workflow?: Workflow;
  approvalId?: string;
  status: MarketingOSExecutionStatus;
  approved: boolean;
  reasons: string[];
}

export class MarketingOSExecutionService {
  private readonly records = new Map<string, ExecutionRecord>();

  constructor(
    private readonly runtime: InMemoryWorkflowRuntime = new InMemoryWorkflowRuntime(),
    private readonly approvals?: MarketingOSApprovalGateway,
  ) {}

  async prepare(input: {
    plan: MarketingOSPlan;
    engagementId: string;
    locale: Locale;
    idempotencyKey: string;
    context: TenantContext;
  }): Promise<ExecutionRecord> {
    const existing = this.records.get(input.plan.plan.planId);
    if (existing) return existing;

    if (input.plan.readiness.blocked) {
      const record: ExecutionRecord = {
        ...input,
        status: 'BLOCKED',
        approved: false,
        reasons: input.plan.readiness.reasons,
      };
      this.records.set(input.plan.plan.planId, record);
      return record;
    }

    const workflow = await this.runtime.createWorkflow({
      tenantId: input.plan.plan.tenantId,
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
      if (!this.approvals) throw new Error('Approval gateway is required for approval-gated execution.');
      const approval = this.approvals.create(input.context, {
        artifactId: workflow.id,
        idempotencyKey: `${input.idempotencyKey}:approval`,
      });
      approvalId = approval.id;
      approved = approval.decision === 'approved' || approval.decision === 'approved_with_conditions';
    }

    const record: ExecutionRecord = {
      ...input,
      workflow,
      ...(approvalId ? { approvalId } : {}),
      status: approved ? 'PREPARED' : 'APPROVAL_REQUIRED',
      approved,
      reasons: approved
        ? []
        : [
            ...input.plan.plan.governance.approvalReasons,
            'External execution is blocked until the canonical approval service records an approval decision.',
          ],
    };

    this.records.set(input.plan.plan.planId, record);
    return record;
  }

  syncApproval(planId: string, context: TenantContext): ExecutionRecord {
    const record = this.get(planId, context);
    if (!record.approvalId) {
      record.approved = true;
      record.status = 'PREPARED';
      record.reasons = [];
      return record;
    }
    if (!this.approvals) throw new Error('Approval gateway is required.');
    const approval = this.approvals.get(record.approvalId, context);
    const approved = approval.decision === 'approved' || approval.decision === 'approved_with_conditions';
    record.approved = approved;
    record.status = approved ? 'PREPARED' : 'APPROVAL_REQUIRED';
    record.reasons = approved ? [] : ['Canonical approval decision has not approved this execution.'];
    return record;
  }

  async start(planId: string, context: TenantContext, metadata: TransitionMetadata): Promise<ExecutionRecord> {
    let record = this.get(planId, context);
    if (record.approvalId) record = this.syncApproval(planId, context);

    if (!record.approved) {
      record.status = 'APPROVAL_REQUIRED';
      if (record.reasons.length === 0) record.reasons = ['Canonical approval is required before execution.'];
      return record;
    }

    if (!record.workflow) throw new Error('Execution workflow has not been prepared.');

    const executor = new LocalWorkflowExecutor(this.runtime);
    await executor.run(record.workflow.id, context, metadata);

    record.workflow = this.runtime.getWorkflow(record.workflow.id, context);
    record.status = 'RUNNING';
    record.reasons = [];
    return record;
  }

  get(planId: string, context: TenantContext): ExecutionRecord {
    const record = this.records.get(planId);
    if (!record) throw new Error('Marketing OS plan not found.');
    if (record.plan.plan.tenantId !== context.tenantId) throw new Error('Cross-tenant access denied');
    return record;
  }
}
