import { createHash } from 'node:crypto';

import type {
  Approval,
  ApprovalDecision,
  ArtifactReference,
  Id,
  Locale,
  TenantContext,
} from '@platform/contracts';

export interface ApprovableAgentArtifact
  extends ArtifactReference {
  workflowId: Id;
  taskId: Id;
  workstreamId: string;

  payload: {
    kind: string;
    content: unknown;
    locale: Locale;
  };

  autoApproved: false;
}

export interface ApprovalActor {
  type: 'user' | 'agent' | 'system' | 'tool';
  id: Id;
}

export interface ApprovalRequest {
  tenantContext: TenantContext;

  artifact: ApprovableAgentArtifact;

  requestedBy: ApprovalActor;

  correlationId: string;
}

export interface ApprovalDecisionRequest {
  tenantContext: TenantContext;

  approvalId: Id;

  actor: ApprovalActor;

  decision:
    | 'approved'
    | 'approved_with_conditions'
    | 'rejected';

  conditions?: string[];

  correlationId: string;
}

export interface HumanApprovalResult {
  approval: Approval;

  artifact?: ApprovableAgentArtifact;
}

export type HumanApprovalErrorCode =
  | 'tenant_mismatch'
  | 'permission_denied'
  | 'invalid_artifact'
  | 'invalid_decision'
  | 'approval_not_found'
  | 'approval_terminal'
  | 'self_approval'
  | 'condition_required'
  | 'condition_not_allowed';

export class HumanApprovalError extends Error {
  constructor(
    public readonly code: HumanApprovalErrorCode,
    message: string,
  ) {
    super(message);
    this.name =
      'HumanApprovalError';
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
    throw new HumanApprovalError(
      'tenant_mismatch',
      'Tenant context is required.',
    );
  }

  if (
    context.tenantId !==
    expectedTenantId
  ) {
    throw new HumanApprovalError(
      'tenant_mismatch',
      'Cross-tenant approval access is denied.',
    );
  }
}

function assertApprovalPermission(
  context: TenantContext,
): void {
  if (
    !context.permissions.includes(
      'approval:decide',
    )
  ) {
    throw new HumanApprovalError(
      'permission_denied',
      'Approval decision permission is required.',
    );
  }
}

function assertApprovableArtifact(
  artifact: ApprovableAgentArtifact,
): void {
  if (!artifact.artifactId.trim()) {
    throw new HumanApprovalError(
      'invalid_artifact',
      'Artifact ID is required.',
    );
  }

  if (!artifact.tenantId.trim()) {
    throw new HumanApprovalError(
      'invalid_artifact',
      'Artifact tenant ID is required.',
    );
  }

  if (!artifact.workflowId.trim()) {
    throw new HumanApprovalError(
      'invalid_artifact',
      'Artifact workflow ID is required.',
    );
  }

  if (!artifact.taskId.trim()) {
    throw new HumanApprovalError(
      'invalid_artifact',
      'Artifact task ID is required.',
    );
  }

  if (artifact.status !== 'draft') {
    throw new HumanApprovalError(
      'invalid_artifact',
      'Only draft artifacts can enter human approval.',
    );
  }

  if (artifact.accepted) {
    throw new HumanApprovalError(
      'invalid_artifact',
      'Artifact is already accepted.',
    );
  }

  if (artifact.autoApproved) {
    throw new HumanApprovalError(
      'invalid_artifact',
      'Agent artifacts cannot be auto-approved.',
    );
  }

  if (!artifact.payload) {
    throw new HumanApprovalError(
      'invalid_artifact',
      'Artifact payload is required.',
    );
  }
}

function normalizeConditions(
  decision:
    | 'approved'
    | 'approved_with_conditions'
    | 'rejected',
  conditions: string[] | undefined,
): string[] {
  const normalized = (conditions ?? [])
    .map((item) => item.trim())
    .filter(Boolean);

  if (
    decision ===
      'approved_with_conditions' &&
    normalized.length === 0
  ) {
    throw new HumanApprovalError(
      'condition_required',
      'Approved-with-conditions decisions require at least one condition.',
    );
  }

  if (
    decision !==
      'approved_with_conditions' &&
    normalized.length > 0
  ) {
    throw new HumanApprovalError(
      'condition_not_allowed',
      'Conditions are only allowed with an approved_with_conditions decision.',
    );
  }

  return normalized;
}

export class HumanApprovalService {
  private readonly approvals =
    new Map<Id, Approval>();

  private readonly artifacts =
    new Map<
      Id,
      ApprovableAgentArtifact
    >();

  request(
    request: ApprovalRequest,
  ): Approval {
    assertTenant(
      request.artifact.tenantId,
      request.tenantContext,
    );

    assertApprovableArtifact(
      request.artifact,
    );

    if (
      request.requestedBy.type ===
      'agent'
    ) {
      throw new HumanApprovalError(
        'self_approval',
        'Agents cannot request or perform human approval decisions as the approving actor.',
      );
    }

    const approvalId =
      deterministicId(
        'approval',
        `${request.tenantContext.tenantId}:${request.artifact.artifactId}`,
      );

    const existing =
      this.approvals.get(
        approvalId,
      );

    if (existing) {
      return existing;
    }

    const approval: Approval = {
      id: approvalId,
      tenantId:
        request.artifact.tenantId,
      artifactId:
        request.artifact.artifactId,
    };

    this.approvals.set(
      approval.id,
      approval,
    );

    this.artifacts.set(
      request.artifact.artifactId,
      {
        ...request.artifact,
      },
    );

    return approval;
  }

  decide(
    request: ApprovalDecisionRequest,
  ): HumanApprovalResult {
    const approval =
      this.approvals.get(
        request.approvalId,
      );

    if (!approval) {
      throw new HumanApprovalError(
        'approval_not_found',
        `Approval not found: ${request.approvalId}`,
      );
    }

    assertTenant(
      approval.tenantId,
      request.tenantContext,
    );

    assertApprovalPermission(
      request.tenantContext,
    );

    if (
      request.actor.type !==
        'user' ||
      !request.actor.id
    ) {
      throw new HumanApprovalError(
        'self_approval',
        'Only a human user can make an approval decision.',
      );
    }

    if (approval.decision) {
      throw new HumanApprovalError(
        'approval_terminal',
        'Approval already has a terminal decision.',
      );
    }

    const conditions =
      normalizeConditions(
        request.decision,
        request.conditions,
      );

    const artifact =
      this.artifacts.get(
        approval.artifactId,
      );

    if (!artifact) {
      throw new HumanApprovalError(
        'invalid_artifact',
        'Approval artifact could not be resolved.',
      );
    }

    assertTenant(
      artifact.tenantId,
      request.tenantContext,
    );

    const decidedAt =
      new Date().toISOString();

    approval.approverUserId =
      request.actor.id;

    approval.decision =
      request.decision;

    if (conditions.length > 0) {
      approval.conditions =
        conditions;
    }

    const resultArtifact: ApprovableAgentArtifact =
      {
        ...artifact,
        status:
          request.decision ===
          'approved_with_conditions'
            ? 'approved_with_conditions'
            : request.decision ===
                'approved'
              ? 'approved'
              : 'blocked',
        accepted:
          request.decision ===
            'approved' ||
          request.decision ===
            'approved_with_conditions',
      };

    this.artifacts.set(
      resultArtifact.artifactId,
      resultArtifact,
    );

    approval.expiresAt =
      decidedAt;

    return {
      approval,
      artifact:
        request.decision ===
          'rejected'
          ? resultArtifact
          : resultArtifact,
    };
  }

  getApproval(
    approvalId: Id,
    tenantContext: TenantContext,
  ): Approval {
    const approval =
      this.approvals.get(
        approvalId,
      );

    if (!approval) {
      throw new HumanApprovalError(
        'approval_not_found',
        `Approval not found: ${approvalId}`,
      );
    }

    assertTenant(
      approval.tenantId,
      tenantContext,
    );

    return approval;
  }

  getArtifact(
    artifactId: Id,
    tenantContext: TenantContext,
  ): ApprovableAgentArtifact {
    const artifact =
      this.artifacts.get(
        artifactId,
      );

    if (!artifact) {
      throw new HumanApprovalError(
        'invalid_artifact',
        `Artifact not found: ${artifactId}`,
      );
    }

    assertTenant(
      artifact.tenantId,
      tenantContext,
    );

    return artifact;
  }
}