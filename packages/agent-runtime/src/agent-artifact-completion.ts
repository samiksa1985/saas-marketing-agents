import type {
  TenantContext,
} from '@platform/contracts';

import type {
  InMemoryWorkflowRuntime,
  ProposedArtifact,
  Task,
  TransitionMetadata,
} from '@platform/workflow-runtime';

import type {
  ProposedAgentArtifact,
} from './index.js';

export interface AgentArtifactCompletionRequest {
  workflowId: string;
  taskId: string;
  tenantContext: TenantContext;
  artifact: ProposedAgentArtifact;
  metadata: TransitionMetadata;
}

export interface AgentArtifactCompletionResult {
  task: Task;
  artifact: ProposedArtifact;
}

export class AgentArtifactCompletionError
  extends Error {
  constructor(
    public readonly code:
      | 'tenant_mismatch'
      | 'workflow_mismatch'
      | 'task_mismatch'
      | 'workstream_mismatch'
      | 'invalid_artifact'
      | 'invalid_task_state',
    message: string,
  ) {
    super(message);
    this.name =
      'AgentArtifactCompletionError';
  }
}

export class AgentArtifactCompletionService {
  constructor(
    private readonly runtime:
      InMemoryWorkflowRuntime,
  ) {}

  complete(
    request: AgentArtifactCompletionRequest,
  ): AgentArtifactCompletionResult {
    const workflow =
      this.runtime.getWorkflow(
        request.workflowId,
        request.tenantContext,
      );

    const tasks =
      this.runtime.getTasks(
        request.workflowId,
        request.tenantContext,
      );

    const task =
      tasks.find(
        (item) =>
          item.id ===
          request.taskId,
      );

    if (!task) {
      throw new AgentArtifactCompletionError(
        'task_mismatch',
        `Task not found: ${request.taskId}`,
      );
    }

    this.assertArtifactScope(
      workflow.tenantId,
      workflow.id,
      task,
      request.artifact,
    );

    this.assertTaskState(
      task,
    );

    const workflowArtifact =
      this.toWorkflowArtifact(
        request.artifact,
      );

    /*
     * The current InMemoryWorkflowRuntime exposes
     * its Task objects by reference through getTasks().
     * We deliberately keep the mutation in this isolated
     * completion service until a first-class runtime API
     * exists, rather than calling executeTask() and
     * triggering the MockAgentExecutor a second time.
     */
    task.status =
      'awaiting_validation';

    task.updatedAt =
      request.metadata.timestamp;

    task.attempts =
      task.attempts.map(
        (attempt) => ({
          ...attempt,
          status:
            'awaiting_validation',
          finishedAt:
            request.metadata.timestamp,
        }),
      );

    const artifacts =
      this.runtime.getArtifacts(
        request.workflowId,
        request.tenantContext,
      );

    const existing =
      artifacts.find(
        (item) =>
          item.artifactId ===
          workflowArtifact.artifactId,
      );

    if (existing) {
      return {
        task,
        artifact:
          existing,
      };
    }

    /*
     * The current runtime does not expose an
     * addArtifact() API. The completion result therefore
     * returns the canonical workflow artifact and keeps
     * persistence behind this service until the runtime
     * contract is extended.
     */
    return {
      task,
      artifact:
        workflowArtifact,
    };
  }

  private assertArtifactScope(
    tenantId: string,
    workflowId: string,
    task: Task,
    artifact: ProposedAgentArtifact,
  ): void {
    if (
      artifact.tenantId !==
      tenantId
    ) {
      throw new AgentArtifactCompletionError(
        'tenant_mismatch',
        'Agent artifact tenant does not match workflow tenant.',
      );
    }

    if (
      artifact.workflowId !==
      workflowId
    ) {
      throw new AgentArtifactCompletionError(
        'workflow_mismatch',
        'Agent artifact workflow does not match workflow.',
      );
    }

    if (
      artifact.taskId !==
      task.id
    ) {
      throw new AgentArtifactCompletionError(
        'task_mismatch',
        'Agent artifact task does not match task.',
      );
    }

    if (
      artifact.workstreamId !==
      task.workstreamId
    ) {
      throw new AgentArtifactCompletionError(
        'workstream_mismatch',
        'Agent artifact workstream does not match task.',
      );
    }

    if (
      artifact.status !==
      'draft'
    ) {
      throw new AgentArtifactCompletionError(
        'invalid_artifact',
        'Only draft agent artifacts can enter workflow validation.',
      );
    }

    if (
      artifact.accepted ||
      artifact.autoApproved
    ) {
      throw new AgentArtifactCompletionError(
        'invalid_artifact',
        'Agent artifacts cannot be accepted or auto-approved.',
      );
    }
  }

  private assertTaskState(
    task: Task,
  ): void {
    if (
      ![
        'claimed',
        'running',
        'repair_required',
        'retryable_failure',
      ].includes(task.status)
    ) {
      throw new AgentArtifactCompletionError(
        'invalid_task_state',
        `Task cannot receive a new agent artifact from state ${task.status}.`,
      );
    }
  }

  private toWorkflowArtifact(
    artifact: ProposedAgentArtifact,
  ): ProposedArtifact {
    const content =
      typeof artifact.payload
        .content === 'string'
        ? artifact.payload.content
        : JSON.stringify(
            artifact.payload.content,
          );

    return {
      artifactId:
        artifact.artifactId,

      version:
        artifact.version,

      tenantId:
        artifact.tenantId,

      status:
        'draft',

      accepted:
        false,

      workflowId:
        artifact.workflowId,

      taskId:
        artifact.taskId,

      workstreamId:
        artifact.workstreamId,

      payload: {
        kind:
          'mock-proposal',

        content,

        locale:
          artifact.payload.locale,
      },

      autoApproved:
        false,
    };
  }
}