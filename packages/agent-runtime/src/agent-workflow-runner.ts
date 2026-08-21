import type {
  TenantContext,
} from '@platform/contracts';

import type {
  ExecutionLease,
  InMemoryWorkflowRuntime,
  ProposedArtifact,
  Task,
  TransitionMetadata,
  Workflow,
} from '@platform/workflow-runtime';

import {
  AgentExecutionOrchestrator,
} from './execution-orchestrator.js';

import {
  AgentArtifactCompletionService,
} from './agent-artifact-completion.js';

import {
  WorkflowAgentExecutor,
  type WorkflowAgentExecutionResult,
  type WorkflowAgentRequestBuilder,
} from './workflow-agent-executor.js';

export interface AgentWorkflowRunnerRequest {
  workflowId: string;
  tenantContext: TenantContext;
  metadata: TransitionMetadata;
}

export type AgentWorkflowRunnerStopReason =
  | 'executed'
  | 'no_ready_tasks'
  | 'blocked'
  | 'awaiting_existing_validation';

export interface AgentWorkflowRunnerResult {
  workflow: Workflow;

  task?: Task;

  lease?: ExecutionLease;

  execution?: WorkflowAgentExecutionResult;

  completedArtifact?: ProposedArtifact;

  stopReason:
    AgentWorkflowRunnerStopReason;
}

export interface AgentWorkflowRunnerOptions {
  runtime: InMemoryWorkflowRuntime;

  agentOrchestrator:
    AgentExecutionOrchestrator;

  requestBuilder:
    WorkflowAgentRequestBuilder;
}

export class AgentWorkflowRunner {
  private readonly agentExecutor:
    WorkflowAgentExecutor;

  private readonly artifactCompletion:
    AgentArtifactCompletionService;

  constructor(
    private readonly options:
      AgentWorkflowRunnerOptions,
  ) {
    this.agentExecutor =
      new WorkflowAgentExecutor({
        orchestrator:
          options.agentOrchestrator,

        requestBuilder:
          options.requestBuilder,
      });

    this.artifactCompletion =
      new AgentArtifactCompletionService(
        options.runtime,
      );
  }

  async runNextReadyTask(
    request:
      AgentWorkflowRunnerRequest,
  ): Promise<
    AgentWorkflowRunnerResult
  > {
    const workflow =
      this.options.runtime.getWorkflow(
        request.workflowId,
        request.tenantContext,
      );

    if (
      workflow.status ===
      'created'
    ) {
      await this.options.runtime.start(
        workflow.id,
        request.tenantContext,
        request.metadata,
      );
    }

    const tasks =
      this.options.runtime.getTasks(
        workflow.id,
        request.tenantContext,
      );

    const existingValidation =
      tasks.find(
        (task) =>
          task.status ===
          'awaiting_validation',
      );

    if (existingValidation) {
      return {
        workflow,

        task:
          existingValidation,

        stopReason:
          'awaiting_existing_validation',
      };
    }

    const readyTask =
      this.findNextReadyTask(
        tasks,
        request.tenantContext,
      );

    if (!readyTask) {
      return {
        workflow,

        stopReason:
          this.hasBlockedTasks(
            tasks,
          )
            ? 'blocked'
            : 'no_ready_tasks',
      };
    }

    const lease =
      await this.options.runtime.claimTask(
        readyTask.id,

        'agent-workflow-runner',

        `${request.metadata.idempotencyKey}:${readyTask.id}`,

        request.tenantContext,

        {
          ...request.metadata,

          idempotencyKey:
            `${request.metadata.idempotencyKey}:claim:${readyTask.id}`,
        },
      );

    const execution =
      await this.agentExecutor.execute({
        workflow,

        task:
          readyTask,

        tenantContext:
          request.tenantContext,

        inputArtifacts:
          readyTask.inputArtifactReferences,
      });

    const completion =
      this.artifactCompletion.complete({
        workflowId:
          workflow.id,

        taskId:
          readyTask.id,

        tenantContext:
          request.tenantContext,

        artifact:
          execution.artifact,

        metadata: {
          ...request.metadata,

          reason:
            'Agent execution completed with proposed artifact',

          idempotencyKey:
            `${request.metadata.idempotencyKey}:complete:${readyTask.id}`,
        },
      });

    return {
      workflow,

      task:
        completion.task,

      lease,

      execution,

      completedArtifact:
        completion.artifact,

      stopReason:
        'executed',
    };
  }

  private findNextReadyTask(
    tasks: Task[],
    context: TenantContext,
  ): Task | undefined {
    const ordered =
      [...tasks].sort(
        (left, right) =>
          left.workstreamId.localeCompare(
            right.workstreamId,
          ),
      );

    for (const task of ordered) {
      if (
        ![
          'created',
          'ready',
          'repair_required',
          'retryable_failure',
        ].includes(task.status)
      ) {
        continue;
      }

      const readiness =
        this.options.runtime.isTaskReady(
          task.id,
          context,
        );

      if (readiness.ready) {
        return task;
      }
    }

    return undefined;
  }

  private hasBlockedTasks(
    tasks: Task[],
  ): boolean {
    return tasks.some(
      (task) =>
        task.status ===
          'blocked' ||
        task.unresolvedInputs.length >
          0 ||
        task.dependencyReferences.some(
          (dependency) =>
            dependency.kind ===
              'blocking' &&
            !dependency.satisfied,
        ),
    );
  }
}