import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  assertValidAgentProposalArtifact,
  validateAgentProposalArtifact,
  type AgentProposalArtifact,
} from './artifact-validation.js';

type ArtifactTestOverrides =
  Partial<
    Omit<
      AgentProposalArtifact,
      'accepted' | 'autoApproved'
    >
  > & {
    accepted?: boolean;
    autoApproved?: boolean;
  };

function createTenantContext(
  overrides: Partial<TenantContext> = {},
): TenantContext {
  return {
    tenantId: 'tenant-001',
    userId: 'user-001',
    roles: [
      'tenant_admin',
    ],
    permissions: [
      'workflow:execute',
      'artifact:write',
    ],
    locale: 'en-US',
    ...overrides,
  };
}

function createArtifact(
  overrides: ArtifactTestOverrides = {},
): AgentProposalArtifact {
  return {
    artifactId: 'artifact-001',
    version: '1',
    tenantId: 'tenant-001',
    status: 'draft',
    accepted:
      overrides.accepted ??
      false,
    workflowId: 'workflow-001',
    taskId: 'task-001',
    workstreamId: '01',
    payload: {
      kind: 'agent-proposal',
      content: {
        recommendation:
          'Example proposal',
      },
      locale: 'en-US',
    },
    autoApproved:
      overrides.autoApproved ??
      false,
    ...overrides,
  } as AgentProposalArtifact;
}

function createRequest(
  artifact: AgentProposalArtifact,
) {
  return {
    artifact,
    tenantContext:
      createTenantContext(),
    expectedWorkflowId:
      'workflow-001',
    expectedTaskId:
      'task-001',
    expectedWorkstreamId:
      '01',
    expectedLocale:
      'en-US' as const,
  };
}

test(
  'valid agent proposal artifact passes validation',
  () => {
    const result =
      validateAgentProposalArtifact(
        createRequest(
          createArtifact(),
        ),
      );

    assert.equal(
      result.valid,
      true,
    );

    assert.equal(
      result.disposition,
      'valid',
    );

    assert.deepEqual(
      result.issues,
      [],
    );
  },
);

test(
  'artifact validation rejects cross-tenant artifacts',
  () => {
    const result =
      validateAgentProposalArtifact(
        createRequest(
          createArtifact({
            tenantId:
              'tenant-999',
          }),
        ),
      );

    assert.equal(
      result.valid,
      false,
    );

    assert.equal(
      result.disposition,
      'repair_required',
    );

    assert.ok(
      result.issues.some(
        (item) =>
          item.code ===
          'tenant_mismatch',
      ),
    );
  },
);

test(
  'artifact validation rejects wrong workflow task and workstream',
  () => {
    const result =
      validateAgentProposalArtifact(
        createRequest(
          createArtifact({
            workflowId:
              'workflow-other',
            taskId:
              'task-other',
            workstreamId:
              '99',
          }),
        ),
      );

    assert.equal(
      result.valid,
      false,
    );

    assert.equal(
      result.issues.filter(
        (item) =>
          item.code ===
            'workflow_mismatch' ||
          item.code ===
            'task_mismatch' ||
          item.code ===
            'workstream_mismatch',
      ).length,
      3,
    );
  },
);

test(
  'artifact validation rejects auto-approved or already accepted artifacts',
  () => {
    const result =
      validateAgentProposalArtifact(
        createRequest(
          createArtifact({
            accepted: true,
            autoApproved: true,
          }),
        ),
      );

    assert.equal(
      result.valid,
      false,
    );

    assert.ok(
      result.issues.some(
        (item) =>
          item.code ===
          'already_accepted',
      ),
    );

    assert.ok(
      result.issues.some(
        (item) =>
          item.code ===
          'auto_approved',
      ),
    );
  },
);

test(
  'artifact validation rejects invalid locale and non-draft status',
  () => {
    const result =
      validateAgentProposalArtifact(
        createRequest(
          createArtifact({
            status: 'approved',
            payload: {
              kind:
                'agent-proposal',
              content: {
                recommendation:
                  'Example proposal',
              },
              locale: 'ar-SA',
            },
          }),
        ),
      );

    assert.equal(
      result.valid,
      false,
    );

    assert.ok(
      result.issues.some(
        (item) =>
          item.code ===
          'invalid_status',
      ),
    );

    assert.ok(
      result.issues.some(
        (item) =>
          item.code ===
          'invalid_locale',
      ),
    );
  },
);

test(
  'assertValidAgentProposalArtifact throws on invalid artifacts',
  () => {
    assert.throws(
      () =>
        assertValidAgentProposalArtifact(
          createRequest(
            createArtifact({
              accepted: true,
            }),
          ),
        ),
      /cannot arrive already accepted/i,
    );
  },
);