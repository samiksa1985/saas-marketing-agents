import type {
  ArtifactReference,
  TenantContext,
} from '@platform/contracts';

import {
  AgentExecutionOrchestrator,
  type AgentOrchestrationRequest,
  type AgentOrchestrationResult,
} from './execution-orchestrator.js';

import type {
  Task,
  Workflow,
} from '@platform/workflow-runtime';

export interface WorkflowAgentExecutionRequest {
  workflow: Workflow;
  task: Task;
  tenantContext: TenantContext;
  inputArtifacts: ArtifactReference[];
}

export type WorkflowAgentRequestBuilder = (
  context: WorkflowAgentExecutionRequest,
) => AgentOrchestrationRequest;

export interface WorkflowAgentExecutionResult {
  orchestration: AgentOrchestrationResult;
  artifact: AgentOrchestrationResult['proposedArtifact'];
}

export interface WorkflowAgentExecutorOptions {
  orchestrator: AgentExecutionOrchestrator;
  requestBuilder: WorkflowAgentRequestBuilder;
}

export class WorkflowAgentExecutor {
  constructor(
    private readonly options: WorkflowAgentExecutorOptions,
  ) {}

  async execute(
    context: WorkflowAgentExecutionRequest,
  ): Promise<WorkflowAgentExecutionResult> {
    const request =
      this.options.requestBuilder(
        context,
      );

    this.assertExecutionScope(
      request,
      context,
    );

    const orchestration =
      await this.options.orchestrator.execute(
        request,
      );

    this.assertArtifactScope(
      orchestration.proposedArtifact,
      context,
    );

    return {
      orchestration,
      artifact:
        orchestration.proposedArtifact,
    };
  }

  private assertExecutionScope(
    request: AgentOrchestrationRequest,
    context: WorkflowAgentExecutionRequest,
  ): void {
    if (
      request.tenantContext.tenantId !==
      context.tenantContext.tenantId
    ) {
      throw new Error(
        'Workflow agent execution crossed tenant boundary.',
      );
    }

    if (
      request.workflowId !==
      context.workflow.id
    ) {
      throw new Error(
        'Workflow agent execution workflow mismatch.',
      );
    }

    if (
      request.taskId !==
      context.task.id
    ) {
      throw new Error(
        'Workflow agent execution task mismatch.',
      );
    }

    if (
      request.workstreamId !==
      context.task.workstreamId
    ) {
      throw new Error(
        'Workflow agent execution workstream mismatch.',
      );
    }
  }

  private assertArtifactScope(
    artifact:
      AgentOrchestrationResult['proposedArtifact'],
    context: WorkflowAgentExecutionRequest,
  ): void {
    if (
      artifact.tenantId !==
      context.tenantContext.tenantId
    ) {
      throw new Error(
        'Agent artifact crossed tenant boundary.',
      );
    }

    if (
      artifact.workflowId !==
      context.workflow.id
    ) {
      throw new Error(
        'Agent artifact workflow mismatch.',
      );
    }

    if (
      artifact.taskId !==
      context.task.id
    ) {
      throw new Error(
        'Agent artifact task mismatch.',
      );
    }

    if (
      artifact.workstreamId !==
      context.task.workstreamId
    ) {
      throw new Error(
        'Agent artifact workstream mismatch.',
      );
    }

    if (
      artifact.accepted ||
      artifact.autoApproved
    ) {
      throw new Error(
        'Agent execution cannot return an accepted or auto-approved artifact.',
      );
    }
  }
}