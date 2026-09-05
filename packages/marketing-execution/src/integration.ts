import type {
  MarketingExecutionApprovalBinding,
  MarketingExecutionArtifact,
  MarketingExecutionHandoff,
  MarketingExecutionPublishReadiness,
  MarketingExecutionWorkflowBinding,
} from '@platform/contracts';


export class MarketingExecutionIntegrationError
  extends Error {}


function requireText(
  value: string,
  field: string,
): void {
  if (!value.trim()) {
    throw new MarketingExecutionIntegrationError(
      `${field} is required`,
    );
  }
}


function assertTenant(
  expected: string,
  actual: string,
): void {
  requireText(
    actual,
    'tenantId',
  );

  if (
    expected !== actual
  ) {
    throw new MarketingExecutionIntegrationError(
      'Cross-tenant marketing execution access denied',
    );
  }
}


export function bindMarketingExecutionArtifact(
  artifact:
    MarketingExecutionArtifact,
  tenantId:
    string,
): MarketingExecutionArtifact {
  assertTenant(
    artifact.tenantId,
    tenantId,
  );

  requireText(
    artifact.workflowId,
    'workflowId',
  );

  requireText(
    artifact.taskId,
    'taskId',
  );

  requireText(
    artifact.workstreamId,
    'workstreamId',
  );

  if (
    artifact.output.tenantId !==
    artifact.tenantId
  ) {
    throw new MarketingExecutionIntegrationError(
      'Marketing output tenant does not match artifact tenant',
    );
  }

  if (
    artifact.output.domain !==
    artifact.domain
  ) {
    throw new MarketingExecutionIntegrationError(
      'Marketing output domain does not match artifact domain',
    );
  }

  if (
    artifact.output.requiresApproval !==
    true
  ) {
    throw new MarketingExecutionIntegrationError(
      'Marketing execution artifacts must require approval',
    );
  }

  return {
    ...artifact,

    evidenceIds:
      Array.from(
        new Set(
          artifact.output.evidence.map(
            (evidence) =>
              evidence.id,
          ),
        ),
      ),
  };
}


export function bindMarketingApproval(
  artifact:
    MarketingExecutionArtifact,

  approval:
    MarketingExecutionApprovalBinding,
): MarketingExecutionArtifact {
  assertTenant(
    artifact.tenantId,
    approval.tenantId,
  );

  if (
    artifact.id !==
    approval.artifactId
  ) {
    throw new MarketingExecutionIntegrationError(
      'Approval artifact mismatch',
    );
  }

  switch (
    approval.status
  ) {
    case 'PENDING':
      return {
        ...artifact,

        approvalId:
          approval.approvalId,

        status:
          'AWAITING_APPROVAL',
      };

    case 'APPROVED':
      return {
        ...artifact,

        approvalId:
          approval.approvalId,

        status:
          'APPROVED',

        approvedConditions:
          [],
      };

    case 'APPROVED_WITH_CONDITIONS':
      if (
        !approval.conditions ||
        approval.conditions.length ===
          0
      ) {
        throw new MarketingExecutionIntegrationError(
          'Approved with conditions requires conditions',
        );
      }

      return {
        ...artifact,

        approvalId:
          approval.approvalId,

        status:
          'APPROVED_WITH_CONDITIONS',

        approvedConditions:
          [
            ...approval.conditions,
          ],
      };

    case 'REJECTED':
      return {
        ...artifact,

        approvalId:
          approval.approvalId,

        status:
          'REJECTED',
      };
  }
}


export function evaluatePublishReadiness(
  artifact:
    MarketingExecutionArtifact,

  tenantId:
    string,
): MarketingExecutionPublishReadiness {
  assertTenant(
    artifact.tenantId,
    tenantId,
  );

  const reasons:
    string[] = [];

  if (
    artifact.status !==
      'APPROVED' &&
    artifact.status !==
      'APPROVED_WITH_CONDITIONS'
  ) {
    reasons.push(
      'Human approval has not been granted.',
    );
  }

  if (
    !artifact.approvalId
  ) {
    reasons.push(
      'Canonical approval binding is missing.',
    );
  }

  if (
    artifact.output.qaFlags.some(
      (flag) =>
        flag.severity ===
        'BLOCKING',
    )
  ) {
    reasons.push(
      'Artifact contains blocking QA flags.',
    );
  }

  if (
    artifact.output.status !==
      'READY_FOR_REVIEW' &&
    artifact.output.status !==
      'APPROVED'
  ) {
    reasons.push(
      'Marketing output is not review-ready.',
    );
  }

  return {
    artifactId:
      artifact.id,

    tenantId:
      artifact.tenantId,

    ready:
      reasons.length === 0,

    reasons,

    requiresApproval:
      true,
  };
}


export function bindMarketingWorkflowHandoff(
  artifact:
    MarketingExecutionArtifact,

  handoff:
    MarketingExecutionHandoff,

  tenantId:
    string,
): MarketingExecutionWorkflowBinding {
  assertTenant(
    artifact.tenantId,
    tenantId,
  );

  assertTenant(
    artifact.tenantId,
    handoff.tenantId,
  );

  if (
    artifact.domain !==
    handoff.fromDomain
  ) {
    throw new MarketingExecutionIntegrationError(
      'Handoff source domain does not match artifact domain',
    );
  }

  if (
    !handoff.artifactIds.includes(
      artifact.id,
    )
  ) {
    throw new MarketingExecutionIntegrationError(
      'Handoff does not reference marketing artifact',
    );
  }

  return {
    tenantId:
      artifact.tenantId,

    artifactId:
      artifact.id,

    workflowId:
      artifact.workflowId,

    taskId:
      artifact.taskId,

    workstreamId:
      artifact.workstreamId,

    fromDomain:
      handoff.fromDomain,

    toDomain:
      handoff.toDomain,
  };
}


/*
 * This payload is intentionally structural.
 *
 * Existing Agent Runtime remains authoritative for
 * ProposedAgentArtifact and Human Approval lifecycle.
 *
 * Marketing Execution does not own or duplicate that runtime.
 */
export function toCanonicalAgentArtifactPayload(
  artifact:
    MarketingExecutionArtifact,

  tenantId:
    string,
) {
  assertTenant(
    artifact.tenantId,
    tenantId,
  );

  return {
    artifactId:
      artifact.id,

    tenantId:
      artifact.tenantId,

    workflowId:
      artifact.workflowId,

    taskId:
      artifact.taskId,

    workstreamId:
      artifact.workstreamId,

    status:
      'draft' as const,

    payload: {
      kind:
        'marketing-execution',

      domain:
        artifact.domain,

      capabilityId:
        artifact.capabilityId,

      content:
        artifact.output,

      locale:
        artifact.output.locale,
    },

    autoApproved:
      false,
  };
}
