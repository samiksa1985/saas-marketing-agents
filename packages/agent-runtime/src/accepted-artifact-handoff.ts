import type {
  TenantContext,
} from '@platform/contracts';

import type {
  ReadinessResult,
} from '@platform/workflow-runtime';

import {
  HandoffRuntimeIntegration,
  type RuntimeHandoffResult,
} from './handoff-runtime-integration.js';

import type {
  ApprovableAgentArtifact,
} from './human-approval.js';

export interface AcceptedArtifactHandoffRequest {
  tenantContext: TenantContext;

  workflowId: string;

  fromWorkstreamId: string;

  toWorkstreamId: string;

  artifact: ApprovableAgentArtifact;
}

export interface AcceptedArtifactHandoffDecision {
  tenantContext: TenantContext;

  handoffId: string;

  actorId: string;

  metadata: {
    actor: string;
    reason: string;
    timestamp: string;
    idempotencyKey: string;
  };
}

export interface AcceptedArtifactHandoffResult {
  handoffId: string;

  runtimeHandoffId: string;

  downstreamTaskId: string;

  downstreamReadiness: ReadinessResult;

  status:
    | 'pending'
    | 'accepted'
    | 'rejected'
    | 'blocked';
}

export type AcceptedArtifactHandoffErrorCode =
  | 'artifact_not_accepted'
  | 'tenant_mismatch'
  | 'workflow_mismatch'
  | 'workstream_mismatch';

export class AcceptedArtifactHandoffError
  extends Error {
  constructor(
    public readonly code:
      AcceptedArtifactHandoffErrorCode,
    message: string,
  ) {
    super(message);

    this.name =
      'AcceptedArtifactHandoffError';
  }
}

export class AcceptedArtifactHandoffService {
  constructor(
    private readonly integration:
      HandoffRuntimeIntegration,
  ) {}

  create(
    request:
      AcceptedArtifactHandoffRequest,
  ): AcceptedArtifactHandoffResult {
    this.assertAcceptedArtifact(
      request,
    );

    const result =
      this.integration.create({
        tenantContext:
          request.tenantContext,

        workflowId:
          request.workflowId,

        fromWorkstreamId:
          request.fromWorkstreamId,

        toWorkstreamId:
          request.toWorkstreamId,

        artifactIds: [
          request.artifact.artifactId,
        ],

        artifacts: [
          request.artifact,
        ],
      });

    return this.toResult(
      result,
    );
  }

  accept(
    request:
      AcceptedArtifactHandoffDecision,
  ): AcceptedArtifactHandoffResult {
    const result =
      this.integration.accept({
        tenantContext:
          request.tenantContext,

        handoffId:
          request.handoffId,

        actorId:
          request.actorId,

        metadata:
          request.metadata,
      });

    return this.toResult(
      result,
    );
  }

  reject(
    request:
      AcceptedArtifactHandoffDecision,
  ): AcceptedArtifactHandoffResult {
    const result =
      this.integration.reject({
        tenantContext:
          request.tenantContext,

        handoffId:
          request.handoffId,

        actorId:
          request.actorId,

        metadata:
          request.metadata,
      });

    return this.toResult(
      result,
    );
  }

  private assertAcceptedArtifact(
    request:
      AcceptedArtifactHandoffRequest,
  ): void {
    const {
      artifact,
      tenantContext,
      workflowId,
      fromWorkstreamId,
    } = request;

    if (
      artifact.tenantId !==
      tenantContext.tenantId
    ) {
      throw new AcceptedArtifactHandoffError(
        'tenant_mismatch',
        'Artifact tenant does not match tenant context.',
      );
    }

    if (
      artifact.workflowId !==
      workflowId
    ) {
      throw new AcceptedArtifactHandoffError(
        'workflow_mismatch',
        'Artifact workflow does not match requested workflow.',
      );
    }

    if (
      artifact.workstreamId !==
      fromWorkstreamId
    ) {
      throw new AcceptedArtifactHandoffError(
        'workstream_mismatch',
        'Artifact workstream must match the handoff source workstream.',
      );
    }

    if (
      !artifact.accepted ||
      ![
        'approved',
        'approved_with_conditions',
      ].includes(
        artifact.status,
      )
    ) {
      throw new AcceptedArtifactHandoffError(
        'artifact_not_accepted',
        'Only approved and accepted artifacts can enter a handoff.',
      );
    }
  }

  private toResult(
    result:
      RuntimeHandoffResult,
  ): AcceptedArtifactHandoffResult {
    return {
      handoffId:
        result.handoff.id,

      runtimeHandoffId:
        result.runtimeHandoffId,

      downstreamTaskId:
        result.downstreamTaskId,

      downstreamReadiness:
        result.downstreamReadiness,

      status:
        result.handoff.status,
    };
  }
}