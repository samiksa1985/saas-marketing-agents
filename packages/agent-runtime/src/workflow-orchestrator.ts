import type {
  ArtifactReference,
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

export interface WorkflowTaskExecutionContext {
  workflow: Workflow;
  task: Task;
  tenantContext: TenantContext;
  inputArtifacts: ArtifactReference[];
}

export interface WorkflowTaskExecutionResult {
  artifact: ProposedArtifact;
}

export interface WorkflowTaskExecutor {
  execute(
    context: WorkflowTaskExecutionContext,
  ): Promise<WorkflowTaskExecutionResult>;
}

export type WorkflowOrchestrationStopReason =
  | 'completed'
  | 'awaiting_validation'
  | 'blocked'
  | 'max_tasks_reached'
  | 'no_ready_tasks';

export interface WorkflowOrchestrationRequest {
  workflowId: string;
  tenantContext: TenantContext;

  metadata: TransitionMetadata;

  maxTasks?: number;
}

export interface WorkflowTaskExecutionRecord {
  taskId: string;
  workstreamId: string;
  lease: ExecutionLease;
  artifact: ProposedArtifact;
}

export interface WorkflowOrchestrationResult {
  workflow: Workflow;

  executedTasks: WorkflowTaskExecutionRecord[];

  remainingTasks: Task[];

  stopReason: WorkflowOrchestrationStopReason;
}

export type WorkflowOrchestratorErrorCode =
  | 'workflow_not_found'
  | 'no_executor'
  | 'task_execution_failed';

export class WorkflowOrchestratorError
  extends Error
{
  constructor(
    public readonly code: WorkflowOrchestratorErrorCode,
    message: string,
  ) {
    super(message);
    this.name =
      'WorkflowOrchestratorError';
  }
}

export class WorkflowOrchestrator {
  constructor(
    private readonly runtime: InMemoryWorkflowRuntime,
    private readonly taskExecutor: WorkflowTaskExecutor,
  ) {}

  async run(
    request: WorkflowOrchestrationRequest,
  ): Promise<WorkflowOrchestrationResult> {
    const workflow =
      this.runtime.getWorkflow(
        request.workflowId,
        request.tenantContext,
      );

    const maxTasks =
      request.maxTasks ?? 100;

    if (maxTasks <= 0) {
      return {
        workflow,
        executedTasks: [],
        remainingTasks:
          this.runtime.getTasks(
            workflow.id,
            request.tenantContext,
          ),
        stopReason:
          'max_tasks_reached',
      };
    }

    if (
      workflow.status ===
      'created'
    ) {
      await this.runtime.start(
        workflow.id,
        request.tenantContext,
        request.metadata,
      );
    }

    const executedTasks: WorkflowTaskExecutionRecord[] =
      [];

    for (
      let iteration = 0;
      iteration < maxTasks;
      iteration += 1
    ) {
      const tasks =
        this.runtime.getTasks(
          workflow.id,
          request.tenantContext,
        );

      const readyTask =
        this.findNextReadyTask(
          tasks,
          request.tenantContext,
        );

      if (!readyTask) {
        return this.buildResult(
          workflow,
          executedTasks,
          tasks,
          this.resolveStopReason(
            tasks,
          ),
        );
      }

      const lease =
        await this.runtime.claimTask(
          readyTask.id,
          'workflow-orchestrator',
          `${request.metadata.idempotencyKey}:${readyTask.id}`,
          request.tenantContext,
          {
            ...request.metadata,
            idempotencyKey:
              `${request.metadata.idempotencyKey}:claim:${readyTask.id}`,
          },
        );

      let execution:
        | WorkflowTaskExecutionResult;

      try {
        execution =
          await this.taskExecutor.execute(
            {
              workflow,
              task: readyTask,
              tenantContext:
                request.tenantContext,
              inputArtifacts:
                readyTask.inputArtifactReferences,
            },
          );
      } catch (error) {
        throw new WorkflowOrchestratorError(
          'task_execution_failed',
          error instanceof Error
            ? error.message
            : 'Workflow task execution failed.',
        );
      }

      executedTasks.push({
        taskId: readyTask.id,
        workstreamId:
          readyTask.workstreamId,
        lease,
        artifact:
          execution.artifact,
      });

      await this.runtime.executeTask(
        readyTask.id,
        request.tenantContext,
        {
          ...request.metadata,
          idempotencyKey:
            `${request.metadata.idempotencyKey}:execute:${readyTask.id}`,
        },
      );

      const remainingTasks =
        this.runtime.getTasks(
          workflow.id,
          request.tenantContext,
        );

      const validationPending =
        remainingTasks.some(
          (task) =>
            task.status ===
            'awaiting_validation',
        );

      if (validationPending) {
        return this.buildResult(
          workflow,
          executedTasks,
          remainingTasks,
          'awaiting_validation',
        );
      }
    }

    return this.buildResult(
      workflow,
      executedTasks,
      this.runtime.getTasks(
        workflow.id,
        request.tenantContext,
      ),
      'max_tasks_reached',
    );
  }

  private findNextReadyTask(
    tasks: Task[],
    tenantContext: TenantContext,
  ): Task | undefined {
    const ordered = [...tasks].sort(
      (a, b) =>
        a.workstreamId.localeCompare(
          b.workstreamId,
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
        this.runtime.isTaskReady(
          task.id,
          tenantContext,
        );

      if (readiness.ready) {
        return task;
      }
    }

    return undefined;
  }

  private resolveStopReason(
    tasks: Task[],
  ): WorkflowOrchestrationStopReason {
    if (
      tasks.some(
        (task) =>
          task.status ===
          'awaiting_validation',
      )
    ) {
      return 'awaiting_validation';
    }

    if (
      tasks.some(
        (task) =>
          task.status === 'blocked',
      )
    ) {
      return 'blocked';
    }

    if (
      tasks.every(
        (task) =>
          task.status ===
            'accepted' ||
          task.status ===
            'cancelled',
      )
    ) {
      return 'completed';
    }

    return 'no_ready_tasks';
  }

  private buildResult(
    workflow: Workflow,
    executedTasks: WorkflowTaskExecutionRecord[],
    remainingTasks: Task[],
    stopReason: WorkflowOrchestrationStopReason,
  ): WorkflowOrchestrationResult {
    return {
      workflow,
      executedTasks,
      remainingTasks,
      stopReason,
    };
  }
}