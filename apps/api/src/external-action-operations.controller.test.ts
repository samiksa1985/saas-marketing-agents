import assert from 'node:assert/strict';
import test from 'node:test';
import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AuthProvider } from '@platform/auth';
import type { TenantContext } from '@platform/contracts';

import { AUTH_PROVIDER, ApiAuthGuard } from './auth.guard.js';
import {
  ExternalActionOperationsController,
  EXTERNAL_ACTION_OPERATIONS_APPLICATION_SERVICE,
} from './external-action-operations.controller.js';

const operatorContext: TenantContext = {
  tenantId: 'tenant-operations-a',
  userId: 'operator-a',
  roles: ['tenant_admin'],
  permissions: ['system_health:read', 'security_policy:manage', 'integration:admin'],
  locale: 'en' as const,
};

test('external-action operations run behind the normal HTTP guard, tenant context, and recovery RBAC', async () => {
  const calls: Array<{ method: string; tenantId: string; eventId?: string }> = [];
  const operations = {
    summary: async (context: typeof operatorContext) => {
      calls.push({ method: 'summary', tenantId: context.tenantId });
      return { PENDING: 1, PROCESSING: 0, FAILED: 0, DEAD_LETTER: 1, DELIVERED: 2 };
    },
    outbox: async (context: typeof operatorContext) => {
      calls.push({ method: 'outbox', tenantId: context.tenantId });
      return [{ id: 'dead-letter-a', tenantId: context.tenantId, deliveryStatus: 'DEAD_LETTER' }];
    },
    providerHealth: async (context: typeof operatorContext, provider: string) => {
      calls.push({ method: `provider:${provider}`, tenantId: context.tenantId });
      return { tenantId: context.tenantId, provider, status: 'RATE_LIMITED' };
    },
    credentialHealth: async (context: typeof operatorContext, provider: string) => {
      calls.push({ method: `credential:${provider}`, tenantId: context.tenantId });
      return { tenantId: context.tenantId, provider, status: 'REVOKED' };
    },
    replay: async (context: typeof operatorContext, eventId: string) => {
      calls.push({ method: 'replay', tenantId: context.tenantId, eventId });
      return { id: eventId, tenantId: context.tenantId, deliveryStatus: 'PENDING' };
    },
    recoverExpiredLeases: async (context: typeof operatorContext) => {
      calls.push({ method: 'recover', tenantId: context.tenantId });
      return 1;
    },
  };

  @Module({
    controllers: [ExternalActionOperationsController],
    providers: [
      { provide: EXTERNAL_ACTION_OPERATIONS_APPLICATION_SERVICE, useValue: operations },
      {
        provide: AUTH_PROVIDER,
        useValue: {
          async verifyAccessToken(token: string) {
            if (token === 'operator-token') return operatorContext;
            return { ...operatorContext, permissions: [] };
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
  class ExternalActionOperationsHttpTestModule {}

  const application = await NestFactory.create(ExternalActionOperationsHttpTestModule, { logger: false });
  await application.listen(0, '127.0.0.1');
  try {
    const address = application.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/marketing-os/external-action-operations`;
    const headers = { authorization: 'Bearer operator-token' };

    for (const path of ['/summary', '/outbox', '/provider-health/GOOGLE_ADS', '/credential-health/GOOGLE_ADS']) {
      const response = await fetch(`${baseUrl}${path}`, { headers });
      assert.equal(response.status, 200, `${path} must be readable by the authorized tenant operator`);
    }
    const replay = await fetch(`${baseUrl}/outbox/dead-letter-a/replay`, { method: 'POST', headers });
    assert.equal(replay.status, 201);
    assert.deepEqual(await replay.json(), {
      id: 'dead-letter-a', tenantId: operatorContext.tenantId, deliveryStatus: 'PENDING',
    });
    const recovery = await fetch(`${baseUrl}/outbox/recover-expired-leases`, { method: 'POST', headers });
    assert.equal(recovery.status, 201);
    assert.equal(await recovery.json(), 1);

    const denied = await fetch(`${baseUrl}/summary`, { headers: { authorization: 'Bearer underprivileged-token' } });
    assert.equal(denied.status, 403, 'a valid identity without system-health permission must be denied');
    assert.deepEqual(calls, [
      { method: 'summary', tenantId: operatorContext.tenantId },
      { method: 'outbox', tenantId: operatorContext.tenantId },
      { method: 'provider:GOOGLE_ADS', tenantId: operatorContext.tenantId },
      { method: 'credential:GOOGLE_ADS', tenantId: operatorContext.tenantId },
      { method: 'replay', tenantId: operatorContext.tenantId, eventId: 'dead-letter-a' },
      { method: 'recover', tenantId: operatorContext.tenantId },
    ]);
  } finally {
    await application.close();
  }
});

test('external action operations cannot expose a provider bypass', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/external-action-operations.controller.ts', import.meta.url), 'utf8');
  assert.match(source, /requirePermissions\(context, \['system_health:read'\]\)/);
  assert.match(source, /requirePermissions\(context, \['security_policy:manage', 'integration:admin'\]\)/);
  assert.doesNotMatch(source, /@platform\/tool-gateway|GoogleAds|CredentialResolver|\.execute\(context,/);
  assert.match(source, /operations\.replay\(context, eventId\)/);
});
