import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  HumanApprovalWorkflowDecision,
  HumanApprovalWorkflowSubmission,
} from './human-approval-workflow-gate.js';

import {
  ProposalApprovalCoordinator,
  proposalToApprovableArtifact,
} from './proposal-approval-integration.js';

const tenantContext = {
  tenantId: 'tenant-1',
  roles: [],
  permissions: ['approval:decide'],
  locale: 'en',
} as const;

const proposal = {
  id: 'proposal-1',
  tenantId: 'tenant-1',
  opportunityId: 'opportunity-1',
  title: 'Enterprise Proposal',
  amount: 100000,
  currency: 'SAR',
  status: 'DRAFT',
  content: {
    executiveSummary: 'Test proposal',
  },
  requiresApproval: true,
} as const;

const binding = {
  workflowId: 'workflow-1',
  taskId: 'task-1',
  workstreamId: 'sales',
};

test('converts proposal into non-auto-approved workflow artifact', () => {
  const artifact =
    proposalToApprovableArtifact(
      proposal,
      binding,
      'en',
    );

  assert.equal(
    artifact.artifactId,
    proposal.id,
  );

  assert.equal(
    artifact.status,
    'draft',
  );

  assert.equal(
    artifact.accepted,
    false,
  );

  assert.equal(
    artifact.autoApproved,
    false,
  );

  assert.equal(
    artifact.payload.kind,
    'sales_proposal',
  );
});

test('rejects cross-tenant proposal submission', async () => {
  const coordinator =
    new ProposalApprovalCoordinator(
      {
        submitForApproval() {
          throw new Error('should not execute');
        },
        decide() {
          throw new Error('should not execute');
        },
      },
      {
        async markProposalPendingApproval() {},
        async markProposalDecision() {},
      },
    );

  await assert.rejects(
    coordinator.submit({
      proposal,
      tenantContext: {
        tenantId: 'tenant-2',
        roles: [],
        permissions: [],
        locale: 'en',
      },
      binding,
      actorId: 'system',
      correlationId: 'corr-1',
      timestamp: new Date().toISOString(),
    }),
    /TENANT_SCOPE_DENIED/,
  );
});

test('submission persists canonical approval binding', async () => {
  let pending:
    | {
        proposalId: string;
        approvalId: string;
        workflowId: string;
      }
    | undefined;

  const gate = {
    submitForApproval(
      request: HumanApprovalWorkflowSubmission,
    ) {
      return {
        approval: {
          id: 'approval-1',
          tenantId: request.tenantContext.tenantId,
          artifactId: request.artifact.artifactId,
        },
        task: {
          id: request.taskId,
        } as never,
        artifact: request.artifact,
      };
    },

    decide(
      _request: HumanApprovalWorkflowDecision,
    ) {
      throw new Error('not used');
    },
  };

  const coordinator =
    new ProposalApprovalCoordinator(
      gate,
      {
        async markProposalPendingApproval(
          _context,
          input,
        ) {
          pending = {
            proposalId: input.proposalId,
            approvalId: input.approvalId,
            workflowId: input.workflowId,
          };
        },

        async markProposalDecision() {},
      },
    );

  const approval =
    await coordinator.submit({
      proposal,
      tenantContext: {
        tenantId: 'tenant-1',
        roles: [],
        permissions: ['approval:decide'],
        locale: 'en',
      },
      binding,
      actorId: 'system',
      correlationId: 'corr-1',
      timestamp: new Date().toISOString(),
    });

  assert.equal(
    approval.id,
    'approval-1',
  );

  assert.deepEqual(
    pending,
    {
      proposalId: 'proposal-1',
      approvalId: 'approval-1',
      workflowId: 'workflow-1',
    },
  );
});

test('approved decision persists APPROVED state', async () => {
  let persistedStatus:
    | 'APPROVED'
    | 'REJECTED'
    | undefined;

  const coordinator =
    new ProposalApprovalCoordinator(
      {
        submitForApproval() {
          throw new Error('not used');
        },

        decide(request) {
          return {
            approval: {
              id: request.approvalId,
              tenantId:
                request.tenantContext.tenantId,
              artifactId: 'proposal-1',
              decision: request.decision,
            },
            task: {
              id: 'task-1',
            } as never,
          };
        },
      },
      {
        async markProposalPendingApproval() {},

        async markProposalDecision(
          _context,
          input,
        ) {
          persistedStatus =
            input.status;
        },
      },
    );

  await coordinator.decide({
    proposalId: 'proposal-1',
    tenantId: 'tenant-1',
    approvalId: 'approval-1',
    tenantContext: {
      tenantId: 'tenant-1',
      roles: [],
      permissions: ['approval:decide'],
      locale: 'en',
    },
    actor: {
      type: 'user',
      id: 'user-1',
    },
    decision: 'approved',
    correlationId: 'corr-2',
    timestamp: new Date().toISOString(),
  });

  assert.equal(
    persistedStatus,
    'APPROVED',
  );
});

test('rejected decision persists REJECTED state', async () => {
  let persistedStatus:
    | 'APPROVED'
    | 'REJECTED'
    | undefined;

  const coordinator =
    new ProposalApprovalCoordinator(
      {
        submitForApproval() {
          throw new Error('not used');
        },

        decide(request) {
          return {
            approval: {
              id: request.approvalId,
              tenantId:
                request.tenantContext.tenantId,
              artifactId: 'proposal-1',
              decision: request.decision,
            },
            task: {
              id: 'task-1',
            } as never,
          };
        },
      },
      {
        async markProposalPendingApproval() {},

        async markProposalDecision(
          _context,
          input,
        ) {
          persistedStatus =
            input.status;
        },
      },
    );

  await coordinator.decide({
    proposalId: 'proposal-1',
    tenantId: 'tenant-1',
    approvalId: 'approval-1',
    tenantContext: {
      tenantId: 'tenant-1',
      roles: [],
      permissions: ['approval:decide'],
      locale: 'en',
    },
    actor: {
      type: 'user',
      id: 'user-1',
    },
    decision: 'rejected',
    correlationId: 'corr-3',
    timestamp: new Date().toISOString(),
  });

  assert.equal(
    persistedStatus,
    'REJECTED',
  );
});
