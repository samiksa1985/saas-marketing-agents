import { createHash } from 'node:crypto';

import type {
  ArtifactReference,
  Handoff,
  TenantContext,
} from '@platform/contracts';

export interface HandoffCreationRequest {
  tenantContext: TenantContext;

  workflowId: string;

  fromWorkstreamId: string;

  toWorkstreamId: string;

  artifactIds: string[];

  artifacts: ArtifactReference[];
}

export interface HandoffDecisionRequest {
  tenantContext: TenantContext;

  handoffId: string;

  actorId: string;
}

export type HandoffServiceErrorCode =
  | 'tenant_mismatch'
  | 'artifact_not_found'
  | 'artifact_not_accepted'
  | 'invalid_handoff'
  | 'handoff_not_found'
  | 'handoff_terminal'
  | 'same_workstream';

export class HandoffServiceError extends Error {
  constructor(
    public readonly code: HandoffServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HandoffServiceError';
  }
}

function deterministicId(
  prefix: string,
  value: string,
): string {
  return `${prefix}-${createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, 32)}`;
}

function assertTenant(
  expectedTenantId: string,
  context: TenantContext,
): void {
  if (!context.tenantId) {
    throw new HandoffServiceError(
      'tenant_mismatch',
      'Tenant context is required.',
    );
  }

  if (
    context.tenantId !==
    expectedTenantId
  ) {
    throw new HandoffServiceError(
      'tenant_mismatch',
      'Cross-tenant handoff access is denied.',
    );
  }
}

function assertAcceptedArtifact(
  artifact: ArtifactReference,
  context: TenantContext,
): void {
  assertTenant(
    artifact.tenantId,
    context,
  );

  if (
    !artifact.accepted ||
    ![
      'approved',
      'approved_with_conditions',
    ].includes(
      artifact.status,
    )
  ) {
    throw new HandoffServiceError(
      'artifact_not_accepted',
      `Artifact is not accepted for handoff: ${artifact.artifactId}`,
    );
  }
}

export class HandoffService {
  private readonly handoffs =
    new Map<string, Handoff>();

  create(
    request: HandoffCreationRequest,
  ): Handoff {
    if (
      request.fromWorkstreamId ===
      request.toWorkstreamId
    ) {
      throw new HandoffServiceError(
        'same_workstream',
        'A handoff cannot target the same workstream.',
      );
    }

    if (
      request.artifactIds.length === 0
    ) {
      throw new HandoffServiceError(
        'invalid_handoff',
        'At least one artifact is required.',
      );
    }

    for (
      const artifactId of request.artifactIds
    ) {
      const artifact =
        request.artifacts.find(
          (item) =>
            item.artifactId ===
            artifactId,
        );

      if (!artifact) {
        throw new HandoffServiceError(
          'artifact_not_found',
          `Artifact not found: ${artifactId}`,
        );
      }

      assertAcceptedArtifact(
        artifact,
        request.tenantContext,
      );
    }

    const id =
      deterministicId(
        'handoff',
        [
          request.tenantContext.tenantId,
          request.workflowId,
          request.fromWorkstreamId,
          request.toWorkstreamId,
          ...request.artifactIds,
        ].join(':'),
      );

    const existing =
      this.handoffs.get(id);

    if (existing) {
      return existing;
    }

    const handoff: Handoff = {
      id,
      tenantId:
        request.tenantContext.tenantId,
      workflowId:
        request.workflowId,
      fromWorkstreamId:
        request.fromWorkstreamId,
      toWorkstreamId:
        request.toWorkstreamId,
      artifactIds: [
        ...request.artifactIds,
      ],
      status: 'pending',
    };

    this.handoffs.set(
      id,
      handoff,
    );

    return handoff;
  }

  accept(
    request: HandoffDecisionRequest,
  ): Handoff {
    const handoff =
      this.handoffs.get(
        request.handoffId,
      );

    if (!handoff) {
      throw new HandoffServiceError(
        'handoff_not_found',
        `Handoff not found: ${request.handoffId}`,
      );
    }

    assertTenant(
      handoff.tenantId,
      request.tenantContext,
    );

    if (
      handoff.status !== 'pending'
    ) {
      throw new HandoffServiceError(
        'handoff_terminal',
        `Handoff is already ${handoff.status}.`,
      );
    }

    handoff.status =
      'accepted';

    return handoff;
  }

  reject(
    request: HandoffDecisionRequest,
  ): Handoff {
    const handoff =
      this.handoffs.get(
        request.handoffId,
      );

    if (!handoff) {
      throw new HandoffServiceError(
        'handoff_not_found',
        `Handoff not found: ${request.handoffId}`,
      );
    }

    assertTenant(
      handoff.tenantId,
      request.tenantContext,
    );

    if (
      handoff.status !== 'pending'
    ) {
      throw new HandoffServiceError(
        'handoff_terminal',
        `Handoff is already ${handoff.status}.`,
      );
    }

    handoff.status =
      'rejected';

    return handoff;
  }

  block(
    request: HandoffDecisionRequest,
  ): Handoff {
    const handoff =
      this.handoffs.get(
        request.handoffId,
      );

    if (!handoff) {
      throw new HandoffServiceError(
        'handoff_not_found',
        `Handoff not found: ${request.handoffId}`,
      );
    }

    assertTenant(
      handoff.tenantId,
      request.tenantContext,
    );

    if (
      handoff.status !== 'pending'
    ) {
      throw new HandoffServiceError(
        'handoff_terminal',
        `Handoff is already ${handoff.status}.`,
      );
    }

    handoff.status =
      'blocked';

    return handoff;
  }

  get(
    handoffId: string,
    context: TenantContext,
  ): Handoff {
    const handoff =
      this.handoffs.get(
        handoffId,
      );

    if (!handoff) {
      throw new HandoffServiceError(
        'handoff_not_found',
        `Handoff not found: ${handoffId}`,
      );
    }

    assertTenant(
      handoff.tenantId,
      context,
    );

    return handoff;
  }
}