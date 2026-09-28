import assert from 'node:assert/strict';
import test from 'node:test';
import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import type { AuthProvider } from '@platform/auth';

import {
  AUTH_CONTEXT,
  AUTH_PROVIDER,
  ApiAuthGuard,
  type AuthenticatedRequest,
} from './auth.guard.js';
import { ApprovalApiService } from './approval.controller.js';
import { ExternalActionsController } from './external-actions.controller.js';
import { ExternalActionPoliciesController } from './external-action-policies.controller.js';
import {
  EXTERNAL_ACTION_APPLICATION_SERVICE,
  ExternalActionApplicationService,
} from './external-actions.application.js';

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

test('the authenticated policy endpoint resolves the canonical external-action application service shared with execution', async () => {
  const calls: string[] = [];
  const canonicalActions = {
    async listPolicies(context: { tenantId: string }) {
      calls.push(context.tenantId);
      return [{ id: 'policy-a', tenantId: context.tenantId }];
    },
  } as unknown as ExternalActionApplicationService<any>;

  @Module({
    controllers: [ExternalActionPoliciesController, ExternalActionsController],
    providers: [
      { provide: ExternalActionApplicationService, useValue: canonicalActions },
      { provide: EXTERNAL_ACTION_APPLICATION_SERVICE, useExisting: ExternalActionApplicationService },
      { provide: ApprovalApiService, useValue: {} },
      {
        provide: AUTH_PROVIDER,
        useValue: {
          async verifyAccessToken() {
            return request(['security_policy:read'])[AUTH_CONTEXT]!;
          },
        } satisfies AuthProvider,
      },
      {
        provide: ApiAuthGuard,
        useFactory: (provider: AuthProvider) => new ApiAuthGuard(provider),
        inject: [AUTH_PROVIDER],
      },
    ],
  })
  class PolicyControllerDiTestModule {}

  const application = await NestFactory.create(PolicyControllerDiTestModule, { logger: false });
  await application.listen(0, '127.0.0.1');
  try {
    const controller = application.get(ExternalActionPoliciesController);
    const executionController = application.get(ExternalActionsController) as unknown as {
      actions: ExternalActionApplicationService<any>;
    };
    const address = application.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(
      `http://127.0.0.1:${address.port}/marketing-os/external-action-policies`,
      { headers: { authorization: 'Bearer local-acceptance-test-token' } },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ id: 'policy-a', tenantId: 'tenant-a' }]);
    assert.deepEqual(calls, ['tenant-a']);
    assert.ok(controller);
    assert.equal(application.get(EXTERNAL_ACTION_APPLICATION_SERVICE), application.get(ExternalActionApplicationService));
    assert.equal(executionController.actions, application.get(EXTERNAL_ACTION_APPLICATION_SERVICE));
  } finally {
    await application.close();
  }
});
