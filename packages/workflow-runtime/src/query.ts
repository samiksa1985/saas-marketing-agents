import type { TenantContext } from '@platform/contracts';
import type {
  Handoff,
  InMemoryWorkflowRuntime,
  ProposedArtifact,
  ReadinessResult,
  Task,
  Workflow,
  WorkflowAuditEvent,
} from './index.js';

/** Read model used by API consumers regardless of the workflow provider. */
export interface WorkflowRuntimeQuery {
  getWorkflow(workflowId: string, context: TenantContext): Promise<Workflow>;
  getTasks(workflowId: string, context: TenantContext): Promise<Task[]>;
  getArtifacts(workflowId: string, context: TenantContext): Promise<ProposedArtifact[]>;
  getHandoffs(workflowId: string, context: TenantContext): Promise<Handoff[]>;
  getAudits(context: TenantContext): Promise<WorkflowAuditEvent[]>;
  getTaskReadiness(taskId: string, context: TenantContext): Promise<ReadinessResult>;
}

/** Development/test query adapter. The runtime remains the single in-memory engine. */
export class InMemoryWorkflowQuery implements WorkflowRuntimeQuery {
  constructor(private readonly runtime: InMemoryWorkflowRuntime) {}

  async getWorkflow(workflowId: string, context: TenantContext): Promise<Workflow> {
    return this.runtime.getWorkflow(workflowId, context);
  }

  async getTasks(workflowId: string, context: TenantContext): Promise<Task[]> {
    return this.runtime.getTasks(workflowId, context);
  }

  async getArtifacts(workflowId: string, context: TenantContext): Promise<ProposedArtifact[]> {
    return this.runtime.getArtifacts(workflowId, context);
  }

  async getHandoffs(workflowId: string, context: TenantContext): Promise<Handoff[]> {
    return this.runtime.getHandoffs(workflowId, context);
  }

  async getAudits(context: TenantContext): Promise<WorkflowAuditEvent[]> {
    return this.runtime.getAudits(context);
  }

  async getTaskReadiness(taskId: string, context: TenantContext): Promise<ReadinessResult> {
    return this.runtime.isTaskReady(taskId, context);
  }
}

/**
 * Injectable durable read model boundary. A Temporal deployment supplies this
 * adapter (for example backed by Temporal visibility plus a projected store);
 * no in-memory state is used for production reads.
 */
export interface TemporalWorkflowReadModel extends WorkflowRuntimeQuery {}

export class TemporalWorkflowQuery implements WorkflowRuntimeQuery {
  constructor(private readonly readModel: TemporalWorkflowReadModel) {}

  getWorkflow(workflowId: string, context: TenantContext): Promise<Workflow> {
    return this.readModel.getWorkflow(workflowId, context);
  }

  getTasks(workflowId: string, context: TenantContext): Promise<Task[]> {
    return this.readModel.getTasks(workflowId, context);
  }

  getArtifacts(workflowId: string, context: TenantContext): Promise<ProposedArtifact[]> {
    return this.readModel.getArtifacts(workflowId, context);
  }

  getHandoffs(workflowId: string, context: TenantContext): Promise<Handoff[]> {
    return this.readModel.getHandoffs(workflowId, context);
  }

  getAudits(context: TenantContext): Promise<WorkflowAuditEvent[]> {
    return this.readModel.getAudits(context);
  }

  getTaskReadiness(taskId: string, context: TenantContext): Promise<ReadinessResult> {
    return this.readModel.getTaskReadiness(taskId, context);
  }
}
