import type { Task, Workflow } from '@platform/contracts';

export interface WorkflowEngine {
  start(workflow: Workflow): Promise<string>;
  pause(workflowId: string): Promise<void>;
  resume(workflowId: string): Promise<void>;
}
export interface WorkflowRepository {
  getTasks(workflowId: string): Promise<Task[]>;
}

export function canRunTask(task: Task, hasBlockingInputs: boolean): boolean {
  return task.status === 'ready' && !hasBlockingInputs;
}
