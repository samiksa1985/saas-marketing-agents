import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  ApprovableAgentArtifact,
} from './human-approval.js';

import {
  HumanApprovalError,
  HumanApprovalService,
} from './human-approval.js';

import type {
  TenantContext,
} from '@platform/contracts';

function createTenantContext(
  overrides: Partial<TenantContext> = {},
): TenantContext {
  return {
    tenantId: 'tenant-001',
    userId: 'reviewer-001',
    roles: [
      'reviewer',
    ],
    permissions: [
      'approval:decide',
      'artifact:read',
      'artifact:write',
    ],
    locale: 'en-US',
    ...overrides,
  };
}

function createArtifact(): ApprovableAgentArtifact {
  return {
    artifactId: 'artifact-001',
    version: '1',
    tenantId: 'tenant-001',
    status: 'draft',
    accepted: false,

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

    autoApproved: false,
  };
}

function createServiceWithApproval() {
  const service =
    new HumanApprovalService();

  const tenantContext =
    createTenantContext();

  const approval =
    service.request({
      tenantContext,
      artifact:
        createArtifact(),
      requestedBy: {
        type: 'system',
        id: 'workflow-system',
      },
      correlationId:
        'correlation-001',
    });

  return {
    service,
    tenantContext,
    approval,
  };
}

test(
  'human approval request creates a pending approval',
  () => {
    const service =
      new HumanApprovalService();

    const tenantContext =
      createTenantContext();

    const approval =
      service.request({
        tenantContext,

        artifact:
          createArtifact(),

        requestedBy: {
          type: 'system',
          id: 'workflow-system',
        },

        correlationId:
          'correlation-001',
      });

    assert.equal(
      approval.tenantId,
      'tenant-001',
    );

    assert.equal(
      approval.artifactId,
      'artifact-001',
    );

    assert.equal(
      approval.decision,
      undefined,
    );
  },
);

test(
  'approved decision accepts the artifact',
  () => {
    const {
      service,
      tenantContext,
      approval,
    } =
      createServiceWithApproval();

    const result =
      service.decide({
        tenantContext,

        approvalId:
          approval.id,

        actor: {
          type: 'user',
          id: 'reviewer-001',
        },

        decision:
          'approved',

        correlationId:
          'correlation-002',
      });

    assert.equal(
      result.approval.decision,
      'approved',
    );

    assert.ok(
      result.artifact,
    );

    assert.equal(
      result.artifact?.status,
      'approved',
    );

    assert.equal(
      result.artifact?.accepted,
      true,
    );
  },
);

test(
  'approved with conditions requires and preserves conditions',
  () => {
    const {
      service,
      tenantContext,
      approval,
    } =
      createServiceWithApproval();

    const result =
      service.decide({
        tenantContext,

        approvalId:
          approval.id,

        actor: {
          type: 'user',
          id: 'reviewer-001',
        },

        decision:
          'approved_with_conditions',

        conditions: [
          'Validate pricing before publication.',
          'Confirm Arabic localization.',
        ],

        correlationId:
          'correlation-003',
      });

    assert.equal(
      result.approval.decision,
      'approved_with_conditions',
    );

    assert.deepEqual(
      result.approval.conditions,
      [
        'Validate pricing before publication.',
        'Confirm Arabic localization.',
      ],
    );

    assert.equal(
      result.artifact?.status,
      'approved_with_conditions',
    );

    assert.equal(
      result.artifact?.accepted,
      true,
    );
  },
);

test(
  'rejected decision does not accept the artifact',
  () => {
    const {
      service,
      tenantContext,
      approval,
    } =
      createServiceWithApproval();

    const result =
      service.decide({
        tenantContext,

        approvalId:
          approval.id,

        actor: {
          type: 'user',
          id: 'reviewer-001',
        },

        decision:
          'rejected',

        correlationId:
          'correlation-004',
      });

    assert.equal(
      result.approval.decision,
      'rejected',
    );

    assert.equal(
      result.artifact?.accepted,
      false,
    );

    assert.equal(
      result.artifact?.status,
      'blocked',
    );
  },
);

test(
  'agent cannot make the human approval decision',
  () => {
    const {
      service,
      tenantContext,
      approval,
    } =
      createServiceWithApproval();

    assert.throws(
      () =>
        service.decide({
          tenantContext,

          approvalId:
            approval.id,

          actor: {
            type: 'agent',
            id: 'abm-agent-001',
          },

          decision:
            'approved',

          correlationId:
            'correlation-005',
        }),
      (error) => {
        assert.ok(
          error instanceof
            HumanApprovalError,
        );

        assert.equal(
          error.code,
          'self_approval',
        );

        return true;
      },
    );
  },
);

test(
  'cross-tenant approval access is denied',
  () => {
    const {
      service,
      approval,
    } =
      createServiceWithApproval();

    assert.throws(
      () =>
        service.decide({
          tenantContext:
            createTenantContext({
              tenantId:
                'tenant-999',
            }),

          approvalId:
            approval.id,

          actor: {
            type: 'user',
            id: 'reviewer-999',
          },

          decision:
            'approved',

          correlationId:
            'correlation-006',
        }),
      (error) => {
        assert.ok(
          error instanceof
            HumanApprovalError,
        );

        assert.equal(
          error.code,
          'tenant_mismatch',
        );

        return true;
      },
    );
  },
);

test(
  'approval requires approval:decide permission',
  () => {
    const {
      service,
      approval,
    } =
      createServiceWithApproval();

    assert.throws(
      () =>
        service.decide({
          tenantContext:
            createTenantContext({
              permissions: [
                'artifact:read',
              ],
            }),

          approvalId:
            approval.id,

          actor: {
            type: 'user',
            id: 'reviewer-001',
          },

          decision:
            'approved',

          correlationId:
            'correlation-007',
        }),
      (error) => {
        assert.ok(
          error instanceof
            HumanApprovalError,
        );

        assert.equal(
          error.code,
          'permission_denied',
        );

        return true;
      },
    );
  },
);

test(
  'approved with conditions requires at least one condition',
  () => {
    const {
      service,
      tenantContext,
      approval,
    } =
      createServiceWithApproval();

    assert.throws(
      () =>
        service.decide({
          tenantContext,

          approvalId:
            approval.id,

          actor: {
            type: 'user',
            id: 'reviewer-001',
          },

          decision:
            'approved_with_conditions',

          conditions: [],

          correlationId:
            'correlation-008',
        }),
      (error) => {
        assert.ok(
          error instanceof
            HumanApprovalError,
        );

        assert.equal(
          error.code,
          'condition_required',
        );

        return true;
      },
    );
  },
);

test(
  'terminal approval cannot be decided again',
  () => {
    const {
      service,
      tenantContext,
      approval,
    } =
      createServiceWithApproval();

    service.decide({
      tenantContext,

      approvalId:
        approval.id,

      actor: {
        type: 'user',
        id: 'reviewer-001',
      },

      decision:
        'approved',

      correlationId:
        'correlation-009',
    });

    assert.throws(
      () =>
        service.decide({
          tenantContext,

          approvalId:
            approval.id,

          actor: {
            type: 'user',
            id: 'reviewer-001',
          },

          decision:
            'rejected',

          correlationId:
            'correlation-010',
        }),
      (error) => {
        assert.ok(
          error instanceof
            HumanApprovalError,
        );

        assert.equal(
          error.code,
          'approval_terminal',
        );

        return true;
      },
    );
  },
);