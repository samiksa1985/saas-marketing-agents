import assert from 'node:assert/strict';
import test from 'node:test';

import { AUTH_CONTEXT, type AuthenticatedRequest } from './auth.guard.js';
import { ExternalActionPoliciesController } from './external-action-policies.controller.js';

const policy = {
  organizationId: 'org-a',
  enabled: true,
  executionMode: 'DRY_RUN' as const,
  allowedActionTypes: ['UPDATE_CAMPAIGN_BUDGET'],
  allowedAccounts: ['account-a'],
  deniedAccounts: [],
  allowedCampaigns: [],
  deniedCampaigns: [],
  maxAbsoluteBudgetDelta: 25,
  maxPercentageBudgetDelta: 10,
  monthlySpendCeiling: 500,
  minimumConfidence: 0.8,
  requiredEvidence: true,
  approvalMode: 'HUMAN' as const,
  killSwitch: false,
  dryRunOnly: true,
};

function request(permissions: string[], tenantId = 'tenant-a'): AuthenticatedRequest {
  return {
    headers: {},
    [AUTH_CONTEXT]: {
      tenantId,
      userId: 'policy-admin',
      roles: ['tenant_admin'],
      permissions: permissions as any,
      locale: 'en',
    },
  };
}

test('external-action policy administration requires elevated security-policy RBAC', async () => {
  const calls: Array<{ tenantId: string; provider: string }> = [];
  const controller = new ExternalActionPoliciesController({
    async listPolicies() {
      return [];
    },
    async upsertPolicy(context: { tenantId: string }, provider: string) {
      calls.push({ tenantId: context.tenantId, provider });
      return { id: 'policy-a' };
    },
  } as any);

  await controller.upsert(request(['security_policy:manage']), 'GOOGLE_ADS', policy);
  assert.deepEqual(calls, [{ tenantId: 'tenant-a', provider: 'GOOGLE_ADS' }]);

  assert.throws(
    () => controller.upsert(request(['marketing:admin', 'workflow:execute']), 'GOOGLE_ADS', policy),
    /Permission denied|Forbidden/,
  );
  assert.throws(
    () => controller.upsert(request(['approval:decide']), 'GOOGLE_ADS', policy),
    /Permission denied|Forbidden/,
  );
});

test('external-action policy administration never accepts a missing tenant context', async () => {
  const controller = new ExternalActionPoliciesController({} as any);
  assert.throws(
    () => controller.list({ headers: {} } as AuthenticatedRequest),
    /Authenticated context is missing/,
  );
});
