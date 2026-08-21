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
  AgentWorkflowCompleter,
} from './agent-workflow-completer.js';

import {
  WorkflowAgentExecutor,
  type WorkflowAgentExecutionResult,
  type WorkflowAgentRequestBuilder,
} from './workflow-agent-executor.js';

import {
  WorkflowOrchestrator,
  type WorkflowTaskExecutionContext,
  type WorkflowTaskExecutionResult,
  type WorkflowTaskExecutor,
} from './workflow-orchestrator.js';

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

class AgentWorkflowTaskExecutor
  implements WorkflowTaskExecutor {
  public lastExecution:
    WorkflowAgentExecutionResult |
    undefined;

  constructor(
    private readonly agentExecutor:
      WorkflowAgentExecutor,
  ) {}

  async execute(
    context:
      WorkflowTaskExecutionContext,
  ): Promise<WorkflowTaskExecutionResult> {
    const execution =
      await this.agentExecutor.execute({
        workflow:
          context.workflow,

        task:
          context.task,

        tenantContext:
          context.tenantContext,

        inputArtifacts:
          context.inputArtifacts,
      });

    this.lastExecution =
      execution;

    return {
      artifact:
        execution.artifact as unknown as ProposedArtifact,
    };
  }

  clear(): void {
    this.lastExecution =
      undefined;
  }
}

export class AgentWorkflowRunner {
  private readonly agentExecutor:
    WorkflowAgentExecutor;

  private readonly taskExecutor:
    AgentWorkflowTaskExecutor;

  private readonly workflowOrchestrator:
    WorkflowOrchestrator;

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

    this.taskExecutor =
      new AgentWorkflowTaskExecutor(
        this.agentExecutor,
      );

    this.workflowOrchestrator =
      new WorkflowOrchestrator(
        options.runtime,
        this.taskExecutor,
        new AgentWorkflowCompleter(
          options.runtime,
        ),
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

    this.taskExecutor.clear();

    const result =
      await this.workflowOrchestrator.run({
        workflowId:
          request.workflowId,

        tenantContext:
          request.tenantContext,

        metadata:
          request.metadata,

        maxTasks:
          1,
      });

    const execution =
      this.taskExecutor.lastExecution;

    const record =
      result.executedTasks[0];

    if (
      !record ||
      !execution
    ) {
      const remainingTasks =
        result.remainingTasks;

      const blocked =
        this.hasBlockedTasks(
          remainingTasks,
        );

      const validationTask =
        remainingTasks.find(
          (task) =>
            task.status ===
            'awaiting_validation',
        );

      if (validationTask) {
        return {
          workflow:
            result.workflow,

          task:
            validationTask,

          stopReason:
            'awaiting_existing_validation',
        };
      }

      if (blocked) {
        return {
          workflow:
            result.workflow,

          stopReason:
            'blocked',
        };
      }

      return {
        workflow:
          result.workflow,

        stopReason:
          'no_ready_tasks',
      };
    }

    const completedTask =
      result.remainingTasks.find(
        (task) =>
          task.id ===
          record.taskId,
      );

    const response: AgentWorkflowRunnerResult =
      {
        workflow:
          result.workflow,

        lease:
          record.lease,

        execution,

        completedArtifact:
          record.artifact,

        stopReason:
          'executed',
      };

    if (completedTask) {
      response.task =
        completedTask;
    }

    return response;
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