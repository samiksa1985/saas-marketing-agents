import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryDurableApprovalRepository } from '@platform/approvals';
import { ApprovalApiService } from './approval.controller.js';

const requester = {
  tenantId: 'tenant-a',
  userId: 'requester-a',
  roles: [],
  permissions: [],
  locale: 'en' as const,
};

test('ApprovalApiService has no process-local state and recovers from its injected repository', async () => {
  // The shared adapter stands in for the durable PostgreSQL adapter in this
  // unit test; a new service instance must read the same canonical record.
  const repository = new InMemoryDurableApprovalRepository();
  const beforeRestart = new ApprovalApiService(repository);
  const created = await beforeRestart.create(requester, {
    artifactId: 'workflow-a',
    idempotencyKey: 'approval-restart-a',
    planId: 'plan-a',
    workflowId: 'workflow-a',
  });

  const afterRestart = new ApprovalApiService(repository);
  const recovered = await afterRestart.get(created.id, requester);
  const decided = await afterRestart.decide(created.id, {
    ...requester,
    userId: 'approver-a',
  }, {
    decision: 'approved',
    idempotencyKey: 'decision-restart-a',
  });

  assert.equal(recovered.id, created.id);
  assert.equal(recovered.planId, 'plan-a');
  assert.equal(decided.decision, 'approved');
  assert.equal(decided.approverUserId, 'approver-a');
});
