import type { TenantContext } from '@platform/contracts';
import type {
  CreateWorkflowInput,
  TransitionMetadata,
  Workflow,
  WorkflowRuntime,
} from './index.js';

export interface TemporalWorkflowAdapter {
  startWorkflow(input: CreateWorkflowInput): Promise<Workflow>;
  signalWorkflow(
    workflowId: string,
    signal: 'start' | 'pause' | 'resume' | 'cancel',
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow>;
}
export interface TemporalActivityAdapter {
  executeTask(
    taskId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<unknown>;
}
export class TemporalWorkflowRuntime implements WorkflowRuntime {
  constructor(private readonly adapter: TemporalWorkflowAdapter) {}
  createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    return this.adapter.startWorkflow(input);
  }
  start(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    return this.adapter.signalWorkflow(workflowId, 'start', context, metadata);
  }
  pause(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    return this.adapter.signalWorkflow(workflowId, 'pause', context, metadata);
  }
  resume(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    return this.adapter.signalWorkflow(workflowId, 'resume', context, metadata);
  }
  cancel(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    return this.adapter.signalWorkflow(workflowId, 'cancel', context, metadata);
  }
}
export class TemporalActivityExecutor implements TemporalActivityAdapter {
  constructor(private readonly execute: TemporalActivityAdapter['executeTask']) {}
  executeTask(
    taskId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<unknown> {
    return this.execute(taskId, context, metadata);
  }
}
