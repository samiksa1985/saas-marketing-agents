import type { Agent, Artifact, Task } from '@platform/contracts';

export interface AgentExecutionContext {
  tenantId: string;
  workflowId: string;
  locale: string;
  task: Task;
  agent: Agent;
}
export interface AgentRunner {
  run(context: AgentExecutionContext): Promise<Artifact[]>;
}

export function assertExecutionTenant(context: AgentExecutionContext): void {
  if (!context.tenantId) throw new Error('Agent execution requires tenant context');
}
