import type { Locale, TenantContext } from '@platform/contracts';
import type { MarketingOSPlan } from './index.js';
import {
  LocalWorkflowExecutor,
  InMemoryWorkflowRuntime,
  type TransitionMetadata,
  type Workflow,
} from '@platform/workflow-runtime';

export type MarketingOSExecutionStatus =
  | 'BLOCKED'
  | 'PREPARED'
  | 'APPROVAL_REQUIRED'
  | 'RUNNING';

export interface ExecutionRecord {
  plan: MarketingOSPlan;
  engagementId: string;
  locale: Locale;
  idempotencyKey: string;
  workflow?: Workflow;
  status: MarketingOSExecutionStatus;
  approved: boolean;
  reasons: string[];
}

export class MarketingOSExecutionService {
  private readonly records = new Map<string, ExecutionRecord>();

  constructor(
    private readonly runtime: InMemoryWorkflowRuntime = new InMemoryWorkflowRuntime(),
  ) {}

  async prepare(input: {
    plan: MarketingOSPlan;
    engagementId: string;
    locale: Locale;
    idempotencyKey: string;
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
      selectedWorkstreamIds: input.plan.plan.workstreams.map(
        (workstream) => workstream.id,
      ),
      idempotencyKey: input.idempotencyKey,
    });

    const record: ExecutionRecord = {
      ...input,
      workflow,
      status: 'APPROVAL_REQUIRED',
      approved: false,
      reasons: [
        ...input.plan.plan.governance.approvalReasons,
        'External execution is blocked until human approval.',
      ],
    };

    this.records.set(input.plan.plan.planId, record);
    return record;
  }

  approve(planId: string, context: TenantContext): ExecutionRecord {
    const record = this.get(planId, context);
    record.approved = true;
    record.status = 'PREPARED';
    record.reasons = [];
    return record;
  }

  async start(
    planId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<ExecutionRecord> {
    const record = this.get(planId, context);

    if (!record.approved) {
      record.status = 'APPROVAL_REQUIRED';
      record.reasons = ['Human approval is required before execution.'];
      return record;
    }

    if (!record.workflow) {
      throw new Error('Execution workflow has not been prepared.');
    }

    const executor = new LocalWorkflowExecutor(this.runtime);
    await executor.run(
      record.workflow.id,
      context,
      metadata,
    );

    record.workflow = this.runtime.getWorkflow(
      record.workflow.id,
      context,
    );
    record.status = 'RUNNING';
    record.reasons = [];
    return record;
  }

  get(planId: string, context: TenantContext): ExecutionRecord {
    const record = this.records.get(planId);
    if (!record) throw new Error('Marketing OS plan not found.');
    if (record.plan.plan.tenantId !== context.tenantId) {
      throw new Error('Cross-tenant access denied');
    }
    return record;
  }
}
