/**
 * Provider-neutral lifecycle contract for an approval-gated external marketing
 * action. It describes durable intent and provider acknowledgements only; it
 * does not encode a vendor API or dispatch implementation.
 */
export const EXTERNAL_MARKETING_ACTION_STATUSES = [
  'DRAFT',
  'PROPOSED',
  'SIMULATED',
  'BUDGET_APPROVED',
  'POLICY_APPROVED',
  'APPROVAL_REQUIRED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'DISPATCHING',
  'EXECUTING',
  'DISPATCHED',
  'VERIFYING',
  'VERIFIED',
  'ACKNOWLEDGED',
  'FAILED',
  'REJECTED',
  'CANCELLED',
  'ROLLBACK_REQUIRED',
  'ROLLED_BACK',
] as const;

export type ExternalMarketingActionStatus = (typeof EXTERNAL_MARKETING_ACTION_STATUSES)[number];

/** The first provider is Google Ads; this value deliberately remains extensible. */
export type ExternalMarketingProvider = 'GOOGLE_ADS' | (string & {});

export const GOOGLE_ADS_MUTATION_TYPES = [
  'PAUSE_CAMPAIGN',
  'ENABLE_CAMPAIGN',
  'UPDATE_CAMPAIGN_BUDGET',
  'UPDATE_TARGET_CPA',
  'UPDATE_TARGET_ROAS',
] as const;

export type GoogleAdsMutationType = (typeof GOOGLE_ADS_MUTATION_TYPES)[number];

export interface ExternalActionEvidenceReference {
  id: string;
  source: string;
  summary: string;
  observedAt?: string;
}

/**
 * Typed recommendation output. Agents may create this proposal, but it has no
 * provider credentials and cannot itself dispatch a mutation.
 */
export interface ExternalMarketingActionProposal {
  actionId: string;
  tenantId: string;
  organizationId: string;
  actor: string;
  agentIdentity: string;
  workflowRunId: string;
  recommendationId: string;
  provider: ExternalMarketingProvider;
  accountId: string;
  campaignId?: string;
  actionType: GoogleAdsMutationType | string;
  requestedPayload: Record<string, unknown>;
  reason: string;
  expectedOutcome: string;
  estimatedImpact: Record<string, unknown>;
  estimatedCost: number;
  currency: string;
  riskLevel: string;
  policyContext: Record<string, unknown>;
  approvalRequirement: 'REQUIRED' | 'OPTIONAL';
  idempotencyKey: string;
  requestedAt: string;
  expiresAt?: string;
  metadata: Record<string, unknown>;
  evidence: ExternalActionEvidenceReference[];
  confidence: number;
  rollback: {
    strategy: string;
    before: Record<string, unknown>;
  };
}

export interface ExternalMarketingAction {
  id: string;
  tenantId: string;
  planId: string;
  workflowId: string;
  type: string;
  idempotencyKey: string;
  status: ExternalMarketingActionStatus;
  approvalId?: string;
  providerReference?: string;
  failureCode?: string;
  failureMessage?: string;
  requestedAt: string;
  updatedAt: string;

  /** Provider-neutral recommendation fields introduced for governed actions. */
  proposal?: ExternalMarketingActionProposal;
  organizationId?: string;
  actor?: string;
  agentIdentity?: string;
  recommendationId?: string;
  provider?: ExternalMarketingProvider;
  accountId?: string;
  campaignId?: string;
  actionType?: string;
  requestedPayload?: Record<string, unknown>;
  reason?: string;
  expectedOutcome?: string;
  estimatedImpact?: Record<string, unknown>;
  estimatedCost?: number;
  currency?: string;
  riskLevel?: string;
  policyContext?: Record<string, unknown>;
  approvalRequirement?: 'REQUIRED' | 'OPTIONAL';
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

const transitions: Record<ExternalMarketingActionStatus, readonly ExternalMarketingActionStatus[]> = {
  DRAFT: ['PROPOSED', 'APPROVAL_REQUIRED', 'CANCELLED'],
  PROPOSED: ['SIMULATED', 'CANCELLED', 'REJECTED'],
  SIMULATED: ['BUDGET_APPROVED', 'REJECTED', 'CANCELLED'],
  BUDGET_APPROVED: ['POLICY_APPROVED', 'REJECTED', 'CANCELLED'],
  POLICY_APPROVED: ['APPROVAL_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVAL_REQUIRED: ['AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['DISPATCHING', 'EXECUTING', 'REJECTED', 'CANCELLED'],
  DISPATCHING: ['DISPATCHED', 'FAILED'],
  EXECUTING: ['VERIFYING', 'FAILED', 'ROLLBACK_REQUIRED'],
  DISPATCHED: ['VERIFYING', 'ACKNOWLEDGED', 'FAILED'],
  VERIFYING: ['VERIFIED', 'ROLLBACK_REQUIRED', 'FAILED'],
  VERIFIED: ['ROLLBACK_REQUIRED'],
  ACKNOWLEDGED: [],
  // A retry returns to APPROVED and must pass the entire pre-execution gate
  // again. It never resumes a provider operation in place.
  // A confirmed read-back can recover an ambiguous provider timeout directly
  // into verification. Inconclusive outcomes still remain blocked from replay.
  FAILED: ['APPROVED', 'VERIFYING'],
  REJECTED: [],
  CANCELLED: [],
  ROLLBACK_REQUIRED: ['ROLLED_BACK', 'FAILED'],
  ROLLED_BACK: [],
};

export function canTransitionExternalMarketingAction(
  from: ExternalMarketingActionStatus,
  to: ExternalMarketingActionStatus,
): boolean {
  return transitions[from].includes(to);
}

export function assertExternalMarketingActionProposal(
  proposal: ExternalMarketingActionProposal,
): void {
  const required = [
    proposal.actionId,
    proposal.tenantId,
    proposal.organizationId,
    proposal.actor,
    proposal.agentIdentity,
    proposal.workflowRunId,
    proposal.recommendationId,
    proposal.provider,
    proposal.accountId,
    proposal.actionType,
    proposal.reason,
    proposal.expectedOutcome,
    proposal.currency,
    proposal.riskLevel,
    proposal.idempotencyKey,
    proposal.requestedAt,
    proposal.rollback?.strategy,
  ];
  if (required.some((value) => !value?.trim())) {
    throw new Error('EXTERNAL_ACTION_PROPOSAL_IDENTITY_REQUIRED');
  }
  if (!Number.isFinite(proposal.estimatedCost) || proposal.estimatedCost < 0) {
    throw new Error('EXTERNAL_ACTION_ESTIMATED_COST_INVALID');
  }
  if (!Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1) {
    throw new Error('EXTERNAL_ACTION_CONFIDENCE_INVALID');
  }
  if (!proposal.evidence.length) {
    throw new Error('EXTERNAL_ACTION_EVIDENCE_REQUIRED');
  }
  if (!proposal.requestedPayload || !proposal.estimatedImpact || !proposal.policyContext) {
    throw new Error('EXTERNAL_ACTION_GOVERNANCE_CONTEXT_REQUIRED');
  }
}

export function assertExternalMarketingActionTransition(
  action: ExternalMarketingAction,
  next: ExternalMarketingActionStatus,
): void {
  if (!action.tenantId || !action.idempotencyKey || !action.planId || !action.workflowId) {
    throw new Error('EXTERNAL_ACTION_DURABLE_IDENTITY_REQUIRED');
  }
  if (next === 'APPROVED' && action.approvalRequirement !== 'OPTIONAL' && !action.approvalId) {
    throw new Error('EXTERNAL_ACTION_APPROVAL_REQUIRED');
  }
  if (!canTransitionExternalMarketingAction(action.status, next)) {
    throw new Error(`EXTERNAL_ACTION_INVALID_TRANSITION:${action.status}:${next}`);
  }
}
