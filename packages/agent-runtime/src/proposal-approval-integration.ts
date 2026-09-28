import type {
  Approval,
  ProposalDraft,
  TenantContext,
} from '@platform/contracts';

import type {
  ApprovalActor,
  ApprovableAgentArtifact,
} from './human-approval.js';

import type {
  HumanApprovalWorkflowDecision,
  HumanApprovalWorkflowResult,
  HumanApprovalWorkflowSubmission,
} from './human-approval-workflow-gate.js';

export interface ProposalApprovalPersistencePort {
  markProposalPendingApproval(
    context: TenantContext,
    input: {
      proposalId: string;
      tenantId: string;
      approvalId: string;
      workflowId: string;
    },
  ): Promise<void>;

  markProposalDecision(
    context: TenantContext,
    input: {
      proposalId: string;
      tenantId: string;
      status: 'APPROVED' | 'REJECTED';
    },
  ): Promise<void>;
}

export interface HumanApprovalGatePort {
  submitForApproval(
    request: HumanApprovalWorkflowSubmission,
  ): HumanApprovalWorkflowResult;

  decide(
    request: HumanApprovalWorkflowDecision,
  ): HumanApprovalWorkflowResult;
}

export interface ProposalWorkflowBinding {
  workflowId: string;
  taskId: string;
  workstreamId: string;
}

export function proposalToApprovableArtifact(
  proposal: ProposalDraft,
  binding: ProposalWorkflowBinding,
  locale: TenantContext['locale'],
): ApprovableAgentArtifact {
  if (proposal.status !== 'DRAFT') {
    throw new Error(
      `PROPOSAL_NOT_DRAFT:${proposal.id}:${proposal.status}`,
    );
  }

  if (!proposal.requiresApproval) {
    throw new Error(
      `PROPOSAL_APPROVAL_REQUIRED:${proposal.id}`,
    );
  }

  return {
    artifactId: proposal.id,
    version: '1',
    tenantId: proposal.tenantId,
    workflowId: binding.workflowId,
    taskId: binding.taskId,
    workstreamId: binding.workstreamId,
    status: 'draft',
    accepted: false,
    autoApproved: false,
    payload: {
      kind: 'sales_proposal',
      content: {
        proposalId: proposal.id,
        opportunityId: proposal.opportunityId,
        title: proposal.title,
        amount: proposal.amount,
        currency: proposal.currency,
        content: proposal.content,
      },
      locale,
    },
  };
}

export class ProposalApprovalCoordinator {
  constructor(
    private readonly gate: HumanApprovalGatePort,
    private readonly persistence: ProposalApprovalPersistencePort,
  ) {}

  async submit(
    input: {
      proposal: ProposalDraft;
      tenantContext: TenantContext;
      binding: ProposalWorkflowBinding;
      actorId: string;
      correlationId: string;
      timestamp: string;
    },
  ): Promise<Approval> {
    if (
      input.proposal.tenantId !==
      input.tenantContext.tenantId
    ) {
      throw new Error('TENANT_SCOPE_DENIED');
    }

    const artifact =
      proposalToApprovableArtifact(
        input.proposal,
        input.binding,
        input.tenantContext.locale,
      );

    const result =
      this.gate.submitForApproval({
        workflowId: input.binding.workflowId,
        taskId: input.binding.taskId,
        tenantContext: input.tenantContext,
        artifact,
        metadata: {
          actor: input.actorId,
          reason: 'sales_proposal_approval_requested',
          idempotencyKey: input.correlationId,
          timestamp: input.timestamp,
        },
      });

    await this.persistence.markProposalPendingApproval(
      input.tenantContext,
      {
        proposalId: input.proposal.id,
        tenantId: input.proposal.tenantId,
        approvalId: result.approval.id,
        workflowId: input.binding.workflowId,
      },
    );

    return result.approval;
  }

  async decide(
    input: {
      proposalId: string;
      tenantId: string;
      approvalId: string;
      tenantContext: TenantContext;
      actor: ApprovalActor;
      decision:
        | 'approved'
        | 'approved_with_conditions'
        | 'rejected';
      conditions?: string[];
      correlationId: string;
      timestamp: string;
    },
  ): Promise<HumanApprovalWorkflowResult> {
    if (
      input.tenantId !==
      input.tenantContext.tenantId
    ) {
      throw new Error('TENANT_SCOPE_DENIED');
    }

    const request: HumanApprovalWorkflowDecision = {
      approvalId: input.approvalId,
      tenantContext: input.tenantContext,
      actor: input.actor,
      decision: input.decision,
      metadata: {
        actor: input.actor.id,
        reason: 'sales_proposal_approval_decision',
        idempotencyKey: input.correlationId,
        timestamp: input.timestamp,
      },
    };

    if (input.conditions !== undefined) {
      request.conditions = input.conditions;
    }

    const result =
      this.gate.decide(request);

    await this.persistence.markProposalDecision(
      input.tenantContext,
      {
        proposalId: input.proposalId,
        tenantId: input.tenantId,
        status:
          input.decision === 'rejected'
            ? 'REJECTED'
            : 'APPROVED',
      },
    );

    return result;
  }
}
