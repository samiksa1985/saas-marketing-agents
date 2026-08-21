import type {
  ArtifactReference,
  Handoff,
  TenantContext,
} from '@platform/contracts';

import {
  InMemoryWorkflowRuntime,
  type ReadinessResult,
  type TransitionMetadata,
} from '@platform/workflow-runtime';

import {
  HandoffService,
  type HandoffCreationRequest,
} from './handoff-service.js';

export interface RuntimeHandoffCreationRequest {
  tenantContext: TenantContext;

  workflowId: string;

  fromWorkstreamId: string;

  toWorkstreamId: string;

  artifactIds: string[];

  artifacts: ArtifactReference[];
}

export interface RuntimeHandoffDecisionRequest {
  tenantContext: TenantContext;

  handoffId: string;

  actorId: string;

  metadata: TransitionMetadata;
}

export interface RuntimeHandoffResult {
  handoff: Handoff;

  runtimeHandoffId: string;

  downstreamTaskId: string;

  downstreamReadiness: ReadinessResult;
}

export type HandoffRuntimeIntegrationErrorCode =
  | 'downstream_task_not_found'
  | 'runtime_handoff_not_found';

export class HandoffRuntimeIntegrationError extends Error {
  constructor(
    public readonly code: HandoffRuntimeIntegrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name =
      'HandoffRuntimeIntegrationError';
  }
}

export class HandoffRuntimeIntegration {
  private readonly runtimeHandoffIds =
    new Map<string, string>();

  constructor(
    private readonly runtime: InMemoryWorkflowRuntime,
    private readonly handoffService: HandoffService =
      new HandoffService(),
  ) {}

  create(
    request: RuntimeHandoffCreationRequest,
  ): RuntimeHandoffResult {
    const handoffRequest: HandoffCreationRequest = {
      tenantContext:
        request.tenantContext,

      workflowId:
        request.workflowId,

      fromWorkstreamId:
        request.fromWorkstreamId,

      toWorkstreamId:
        request.toWorkstreamId,

      artifactIds:
        request.artifactIds,

      artifacts:
        request.artifacts,
    };

    const handoff =
      this.handoffService.create(
        handoffRequest,
      );

    const existingRuntimeHandoffId =
      this.runtimeHandoffIds.get(
        handoff.id,
      );

    if (existingRuntimeHandoffId) {
      return this.buildResult(
        handoff,
        existingRuntimeHandoffId,
        request.tenantContext,
        request.workflowId,
        request.toWorkstreamId,
      );
    }

    const runtimeHandoff =
      this.runtime.createHandoff({
        tenantId:
          handoff.tenantId,

        workflowId:
          handoff.workflowId,

        fromWorkstreamId:
          handoff.fromWorkstreamId,

        toWorkstreamId:
          handoff.toWorkstreamId,

        artifactIds:
          handoff.artifactIds,
      });

    this.runtimeHandoffIds.set(
      handoff.id,
      runtimeHandoff.id,
    );

    return this.buildResult(
      handoff,
      runtimeHandoff.id,
      request.tenantContext,
      request.workflowId,
      request.toWorkstreamId,
    );
  }

  accept(
    request: RuntimeHandoffDecisionRequest,
  ): RuntimeHandoffResult {
    const handoff =
      this.handoffService.get(
        request.handoffId,
        request.tenantContext,
      );

    const runtimeHandoffId =
      this.runtimeHandoffIds.get(
        handoff.id,
      );

    if (!runtimeHandoffId) {
      throw new HandoffRuntimeIntegrationError(
        'runtime_handoff_not_found',
        `Runtime handoff not found for service handoff: ${handoff.id}`,
      );
    }

    const accepted =
      this.handoffService.accept({
        tenantContext:
          request.tenantContext,

        handoffId:
          handoff.id,

        actorId:
          request.actorId,
      });

    this.runtime.acceptHandoff(
      runtimeHandoffId,
      request.tenantContext,
      request.metadata,
    );

    return this.buildResult(
      accepted,
      runtimeHandoffId,
      request.tenantContext,
      accepted.workflowId,
      accepted.toWorkstreamId,
    );
  }

  reject(
    request: RuntimeHandoffDecisionRequest,
  ): RuntimeHandoffResult {
    const handoff =
      this.handoffService.get(
        request.handoffId,
        request.tenantContext,
      );

    const runtimeHandoffId =
      this.runtimeHandoffIds.get(
        handoff.id,
      );

    if (!runtimeHandoffId) {
      throw new HandoffRuntimeIntegrationError(
        'runtime_handoff_not_found',
        `Runtime handoff not found for service handoff: ${handoff.id}`,
      );
    }

    const rejected =
      this.handoffService.reject({
        tenantContext:
          request.tenantContext,

        handoffId:
          handoff.id,

        actorId:
          request.actorId,
      });

    this.runtime.rejectHandoff(
      runtimeHandoffId,
      [
        {
          code: 'HANDOFF_REJECTED',
          message:
            `Handoff rejected by ${request.actorId}.`,
        },
      ],
      request.tenantContext,
      request.metadata,
    );

    return this.buildResult(
      rejected,
      runtimeHandoffId,
      request.tenantContext,
      rejected.workflowId,
      rejected.toWorkstreamId,
    );
  }

  private buildResult(
    handoff: Handoff,
    runtimeHandoffId: string,
    tenantContext: TenantContext,
    workflowId: string,
    toWorkstreamId: string,
  ): RuntimeHandoffResult {
    const tasks =
      this.runtime.getTasks(
        workflowId,
        tenantContext,
      );

    const downstreamTask =
      tasks.find(
        (task) =>
          task.workstreamId ===
          toWorkstreamId,
      );

    if (!downstreamTask) {
      throw new HandoffRuntimeIntegrationError(
        'downstream_task_not_found',
        `Downstream task not found for workstream ${toWorkstreamId}.`,
      );
    }

    const downstreamReadiness =
      this.runtime.isTaskReady(
        downstreamTask.id,
        tenantContext,
      );

    return {
      handoff,

      runtimeHandoffId,

      downstreamTaskId:
        downstreamTask.id,

      downstreamReadiness,
    };
  }
}