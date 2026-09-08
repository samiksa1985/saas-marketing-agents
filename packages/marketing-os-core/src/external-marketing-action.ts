/**
 * Provider-neutral lifecycle contract for an approval-gated external marketing
 * action. It describes durable intent and provider acknowledgements only; it
 * does not encode a vendor API or dispatch implementation.
 */
export const EXTERNAL_MARKETING_ACTION_STATUSES = [
  'DRAFT',
  'APPROVAL_REQUIRED',
  'APPROVED',
  'DISPATCHING',
  'DISPATCHED',
  'ACKNOWLEDGED',
  'FAILED',
  'CANCELLED',
] as const;

export type ExternalMarketingActionStatus = (typeof EXTERNAL_MARKETING_ACTION_STATUSES)[number];

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
}

const transitions: Record<ExternalMarketingActionStatus, readonly ExternalMarketingActionStatus[]> = {
  DRAFT: ['APPROVAL_REQUIRED', 'CANCELLED'],
  APPROVAL_REQUIRED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['DISPATCHING', 'CANCELLED'],
  DISPATCHING: ['DISPATCHED', 'FAILED'],
  DISPATCHED: ['ACKNOWLEDGED', 'FAILED'],
  ACKNOWLEDGED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionExternalMarketingAction(
  from: ExternalMarketingActionStatus,
  to: ExternalMarketingActionStatus,
): boolean {
  return transitions[from].includes(to);
}

export function assertExternalMarketingActionTransition(
  action: ExternalMarketingAction,
  next: ExternalMarketingActionStatus,
): void {
  if (!action.tenantId || !action.idempotencyKey || !action.planId || !action.workflowId) {
    throw new Error('EXTERNAL_ACTION_DURABLE_IDENTITY_REQUIRED');
  }
  if (next === 'APPROVED' && !action.approvalId) {
    throw new Error('EXTERNAL_ACTION_APPROVAL_REQUIRED');
  }
  if (!canTransitionExternalMarketingAction(action.status, next)) {
    throw new Error(`EXTERNAL_ACTION_INVALID_TRANSITION:${action.status}:${next}`);
  }
}
