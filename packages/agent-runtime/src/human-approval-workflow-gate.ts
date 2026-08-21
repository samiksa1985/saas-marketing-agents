import type {
  Approval,
  TenantContext,
} from '@platform/contracts';

import type {
  InMemoryWorkflowRuntime,
  Task,
  TransitionMetadata,
} from '@platform/workflow-runtime';

import {
  HumanApprovalService,
  type ApprovalActor,
  type ApprovableAgentArtifact,
} from './human-approval.js';

export interface HumanApprovalWorkflowSubmission {
  workflowId: string;
  taskId: string;
  tenantContext: TenantContext;
  artifact: ApprovableAgentArtifact;
  metadata: TransitionMetadata;
}

export interface HumanApprovalWorkflowDecision {
  approvalId: string;
  tenantContext: TenantContext;
  actor: ApprovalActor;
  decision:
    | 'approved'
    | 'approved_with_conditions'
    | 'rejected';
  conditions?: string[];
  metadata: TransitionMetadata;
}

export interface HumanApprovalWorkflowResult {
  approval: Approval;
  task: Task;
  artifact?: ApprovableAgentArtifact;
}

export class HumanApprovalWorkflowGateError
  extends Error {
  constructor(
    public readonly code:
      | 'tenant_mismatch'
      | 'workflow_mismatch'
      | 'task_mismatch'
      | 'workstream_mismatch'
      | 'invalid_task_state'
      | 'artifact_mismatch',
    message: string,
  ) {
    super(message);
    this.name =
      'HumanApprovalWorkflowGateError';
  }
}

export class HumanApprovalWorkflowGate {
  constructor(
    private readonly runtime:
      InMemoryWorkflowRuntime,
    private readonly approvalService:
      HumanApprovalService =
      new HumanApprovalService(),
  ) {}

  submitForApproval(
    request: HumanApprovalWorkflowSubmission,
  ): HumanApprovalWorkflowResult {
    const task =
      this.getScopedTask(
        request.workflowId,
        request.taskId,
        request.tenantContext,
      );

    this.assertSubmissionState(task);

    this.assertArtifactScope(
      task,
      request.artifact,
      request.tenantContext,
    );

    const approval =
      this.approvalService.request({
        tenantContext:
          request.tenantContext,

        artifact:
          request.artifact,

        requestedBy: {
          type: 'system',
          id: request.metadata.actor,
        },

        correlationId:
          request.metadata.idempotencyKey,
      });

    task.status =
      'awaiting_human';

    task.updatedAt =
      request.metadata.timestamp;

    return {
      approval,
      task,
      artifact:
        request.artifact,
    };
  }

  decide(
    request: HumanApprovalWorkflowDecision,
  ): HumanApprovalWorkflowResult {
    const approval =
      this.approvalService.getApproval(
        request.approvalId,
        request.tenantContext,
      );

    const artifact =
      this.approvalService.getArtifact(
        approval.artifactId,
        request.tenantContext,
      );

    const task =
      this.getScopedTask(
        artifact.workflowId,
        artifact.taskId,
        request.tenantContext,
      );

    if (
      task.status !==
      'awaiting_human'
    ) {
      throw new HumanApprovalWorkflowGateError(
        'invalid_task_state',
        `Task must be awaiting_human before an approval decision. Current state: ${task.status}`,
      );
    }

    const approvalRequest = {
      tenantContext:
        request.tenantContext,

      approvalId:
        request.approvalId,

      actor:
        request.actor,

      decision:
        request.decision,

      correlationId:
        request.metadata.idempotencyKey,
    };

    if (
      request.conditions !==
      undefined
    ) {
      Object.assign(
        approvalRequest,
        {
          conditions:
            request.conditions,
        },
      );
    }

    const result =
      this.approvalService.decide(
        approvalRequest,
      );

    if (
      request.decision ===
        'approved' ||
      request.decision ===
        'approved_with_conditions'
    ) {
      task.status =
        'accepted';
    } else {
      task.status =
        'repair_required';
    }

    task.updatedAt =
      request.metadata.timestamp;

    const workflowResult: HumanApprovalWorkflowResult =
      {
        approval:
          result.approval,

        task,
      };

    if (
      result.artifact !==
      undefined
    ) {
      workflowResult.artifact =
        result.artifact;
    }

    return workflowResult;
  }

  getApproval(
    approvalId: string,
    tenantContext: TenantContext,
  ): Approval {
    return this.approvalService.getApproval(
      approvalId,
      tenantContext,
    );
  }

  getArtifact(
    artifactId: string,
    tenantContext: TenantContext,
  ): ApprovableAgentArtifact {
    return this.approvalService.getArtifact(
      artifactId,
      tenantContext,
    );
  }

  private getScopedTask(
    workflowId: string,
    taskId: string,
    tenantContext: TenantContext,
  ): Task {
    const tasks =
      this.runtime.getTasks(
        workflowId,
        tenantContext,
      );

    const task =
      tasks.find(
        (item) =>
          item.id === taskId,
      );

    if (!task) {
      throw new HumanApprovalWorkflowGateError(
        'task_mismatch',
        `Task not found in workflow: ${taskId}`,
      );
    }

    if (
      task.tenantId !==
      tenantContext.tenantId
    ) {
      throw new HumanApprovalWorkflowGateError(
        'tenant_mismatch',
        'Task tenant does not match tenant context.',
      );
    }

    if (
      task.workflowId !==
      workflowId
    ) {
      throw new HumanApprovalWorkflowGateError(
        'workflow_mismatch',
        'Task workflow does not match requested workflow.',
      );
    }

    return task;
  }

  private assertSubmissionState(
    task: Task,
  ): void {
    if (
      task.status !==
      'awaiting_validation'
    ) {
      throw new HumanApprovalWorkflowGateError(
        'invalid_task_state',
        `Task must be awaiting_validation before human approval. Current state: ${task.status}`,
      );
    }
  }

  private assertArtifactScope(
    task: Task,
    artifact: ApprovableAgentArtifact,
    tenantContext: TenantContext,
  ): void {
    if (
      artifact.tenantId !==
      tenantContext.tenantId
    ) {
      throw new HumanApprovalWorkflowGateError(
        'tenant_mismatch',
        'Artifact tenant does not match tenant context.',
      );
    }

    if (
      artifact.workflowId !==
      task.workflowId
    ) {
      throw new HumanApprovalWorkflowGateError(
        'workflow_mismatch',
        'Artifact workflow does not match task workflow.',
      );
    }

    if (
      artifact.taskId !==
      task.id
    ) {
      throw new HumanApprovalWorkflowGateError(
        'task_mismatch',
        'Artifact task does not match workflow task.',
      );
    }

    if (
      artifact.workstreamId !==
      task.workstreamId
    ) {
      throw new HumanApprovalWorkflowGateError(
        'workstream_mismatch',
        'Artifact workstream does not match task workstream.',
      );
    }

    if (
      artifact.accepted
    ) {
      throw new HumanApprovalWorkflowGateError(
        'artifact_mismatch',
        'Artifact is already accepted.',
      );
    }

    if (
      artifact.autoApproved
    ) {
      throw new HumanApprovalWorkflowGateError(
        'artifact_mismatch',
        'Agent artifact cannot be auto-approved.',
      );
    }
  }
}