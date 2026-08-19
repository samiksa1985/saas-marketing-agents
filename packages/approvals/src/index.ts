import type { Approval, ApprovalDecision, Id } from '@platform/contracts';

export interface ApprovalService {
  request(tenantId: Id, artifactId: Id): Promise<Approval>;
  decide(approvalId: Id, decision: ApprovalDecision, approverUserId: Id): Promise<Approval>;
}

export function isApprovalTerminal(decision: ApprovalDecision | undefined): boolean {
  return (
    decision === 'approved' || decision === 'approved_with_conditions' || decision === 'rejected'
  );
}
