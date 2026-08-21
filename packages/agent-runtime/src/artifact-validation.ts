import type {
  ArtifactReference,
  Locale,
  TenantContext,
} from '@platform/contracts';

export type ArtifactValidationFailureCode =
  | 'tenant_mismatch'
  | 'workflow_mismatch'
  | 'task_mismatch'
  | 'workstream_mismatch'
  | 'invalid_status'
  | 'already_accepted'
  | 'auto_approved'
  | 'invalid_payload'
  | 'invalid_locale'
  | 'invalid_artifact_id'
  | 'invalid_version';

export type ArtifactValidationDisposition =
  | 'valid'
  | 'repair_required';

export interface AgentProposalArtifact
  extends ArtifactReference {
  workflowId: string;
  taskId: string;
  workstreamId: string;

  payload: {
    kind: string;
    content: unknown;
    locale: Locale;
  };

  autoApproved: false;
}

export interface ArtifactValidationRequest {
  artifact: AgentProposalArtifact;

  tenantContext: TenantContext;

  expectedWorkflowId: string;
  expectedTaskId: string;
  expectedWorkstreamId: string;

  expectedLocale: Locale;
}

export interface ArtifactValidationIssue {
  code: ArtifactValidationFailureCode;
  message: string;
  field?: string;
}

export interface ArtifactValidationResult {
  disposition: ArtifactValidationDisposition;
  valid: boolean;
  issues: ArtifactValidationIssue[];
}

export class ArtifactValidationError extends Error {
  constructor(
    public readonly code: ArtifactValidationFailureCode,
    message: string,
  ) {
    super(message);
    this.name =
      'ArtifactValidationError';
  }
}

function issue(
  code: ArtifactValidationFailureCode,
  message: string,
  field?: string,
): ArtifactValidationIssue {
  return {
    code,
    message,
    ...(field ? { field } : {}),
  };
}

export function validateAgentProposalArtifact(
  request: ArtifactValidationRequest,
): ArtifactValidationResult {
  const issues: ArtifactValidationIssue[] = [];

  const {
    artifact,
    tenantContext,
    expectedWorkflowId,
    expectedTaskId,
    expectedWorkstreamId,
    expectedLocale,
  } = request;

  if (!tenantContext?.tenantId) {
    issues.push(
      issue(
        'tenant_mismatch',
        'Tenant context is required.',
        'tenantContext.tenantId',
      ),
    );
  }

  if (
    tenantContext?.tenantId &&
    artifact.tenantId !==
      tenantContext.tenantId
  ) {
    issues.push(
      issue(
        'tenant_mismatch',
        'Artifact tenant does not match execution tenant.',
        'tenantId',
      ),
    );
  }

  if (
    artifact.workflowId !==
    expectedWorkflowId
  ) {
    issues.push(
      issue(
        'workflow_mismatch',
        'Artifact workflow does not match the expected workflow.',
        'workflowId',
      ),
    );
  }

  if (
    artifact.taskId !==
    expectedTaskId
  ) {
    issues.push(
      issue(
        'task_mismatch',
        'Artifact task does not match the expected task.',
        'taskId',
      ),
    );
  }

  if (
    artifact.workstreamId !==
    expectedWorkstreamId
  ) {
    issues.push(
      issue(
        'workstream_mismatch',
        'Artifact workstream does not match the expected workstream.',
        'workstreamId',
      ),
    );
  }

  if (!artifact.artifactId.trim()) {
    issues.push(
      issue(
        'invalid_artifact_id',
        'Artifact ID is required.',
        'artifactId',
      ),
    );
  }

  if (!artifact.version.trim()) {
    issues.push(
      issue(
        'invalid_version',
        'Artifact version is required.',
        'version',
      ),
    );
  }

  if (artifact.status !== 'draft') {
    issues.push(
      issue(
        'invalid_status',
        'Agent proposal artifacts must enter validation in draft status.',
        'status',
      ),
    );
  }

  if (artifact.accepted !== false) {
    issues.push(
      issue(
        'already_accepted',
        'An agent proposal cannot arrive already accepted.',
        'accepted',
      ),
    );
  }

  if (artifact.autoApproved !== false) {
    issues.push(
      issue(
        'auto_approved',
        'Agent-generated artifacts cannot be auto-approved.',
        'autoApproved',
      ),
    );
  }

  if (!artifact.payload) {
    issues.push(
      issue(
        'invalid_payload',
        'Artifact payload is required.',
        'payload',
      ),
    );
  } else {
    if (
      typeof artifact.payload.kind !==
        'string' ||
      !artifact.payload.kind.trim()
    ) {
      issues.push(
        issue(
          'invalid_payload',
          'Artifact payload kind is required.',
          'payload.kind',
        ),
      );
    }

    if (
      artifact.payload.content ===
      undefined
    ) {
      issues.push(
        issue(
          'invalid_payload',
          'Artifact payload content is required.',
          'payload.content',
        ),
      );
    }

    if (
      artifact.payload.locale !==
      expectedLocale
    ) {
      issues.push(
        issue(
          'invalid_locale',
          'Artifact locale does not match the expected execution locale.',
          'payload.locale',
        ),
      );
    }
  }

  return {
    disposition:
      issues.length === 0
        ? 'valid'
        : 'repair_required',

    valid:
      issues.length === 0,

    issues,
  };
}

export function assertValidAgentProposalArtifact(
  request: ArtifactValidationRequest,
): void {
  const result =
    validateAgentProposalArtifact(
      request,
    );

  if (!result.valid) {
    const firstIssue =
      result.issues[0];

    if (!firstIssue) {
      throw new ArtifactValidationError(
        'invalid_payload',
        'Artifact validation failed.',
      );
    }

    throw new ArtifactValidationError(
      firstIssue.code,
      firstIssue.message,
    );
  }
}