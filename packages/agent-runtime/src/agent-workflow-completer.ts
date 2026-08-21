import type {
  InMemoryWorkflowRuntime,
  ProposedArtifact,
} from '@platform/workflow-runtime';

import type {
  WorkflowTaskCompletionContext,
  WorkflowTaskCompletionResult,
  WorkflowTaskCompleter,
} from './workflow-orchestrator.js';

import {
  AgentArtifactCompletionService,
} from './agent-artifact-completion.js';

import type {
  ProposedAgentArtifact,
} from './index.js';

export class AgentWorkflowCompleter
  implements WorkflowTaskCompleter {
  private readonly completionService:
    AgentArtifactCompletionService;

  constructor(
    runtime:
      InMemoryWorkflowRuntime,
  ) {
    this.completionService =
      new AgentArtifactCompletionService(
        runtime,
      );
  }

  async complete(
    context:
      WorkflowTaskCompletionContext,
  ): Promise<WorkflowTaskCompletionResult> {
    const agentArtifact =
      context.artifact as unknown as ProposedAgentArtifact;

    const result =
      this.completionService.complete({
        workflowId:
          context.workflow.id,

        taskId:
          context.task.id,

        tenantContext:
          context.tenantContext,

        artifact:
          agentArtifact,

        metadata:
          context.metadata,
      });

    return {
      task:
        result.task,

      artifact:
        result.artifact as ProposedArtifact,
    };
  }
}