import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AuthProvider } from '@platform/auth';
import type { TenantContext } from '@platform/contracts';

import { AUTH_PROVIDER, ApiAuthGuard } from './auth.guard.js';
import { UnifiedCampaignsController } from './unified-campaigns.controller.js';
import { UNIFIED_CAMPAIGN_APPLICATION_SERVICE } from './unified-campaigns.application.js';

test('unified campaign API stays tenant-scoped, RBAC-protected, and cannot expose provider execution', async () => {
  const source = await readFile(new URL('../src/unified-campaigns.controller.ts', import.meta.url), 'utf8');

  for (const route of [
    "@Post()",
    "@Get(':campaignId')",
    "@Post(':campaignId/plan')",
    "@Post(':campaignId/simulate')",
    "@Post(':campaignId/submit')",
    "@Get(':campaignId/execution')",
    "@Get(':campaignId/performance')",
    "@Get(':campaignId/recommendations')",
  ]) {
    assert.match(source, new RegExp(route.replace(/[()]/g, '\\$&')));
  }
  assert.match(source, /@UseGuards\(ApiAuthGuard\)/);
  assert.match(source, /requirePermissions\(context, \['marketing:admin', 'workflow:execute'\]\)/);
  assert.match(source, /requirePermissions\(context, \['artifact:read'\]\)/);
  assert.match(source, /requirePermissions\(context, \['artifact:read', 'audit:read'\]\)/);
  assert.doesNotMatch(source, /@platform\/tool-gateway|GoogleAds|MetaAds|CredentialResolver/);
  assert.doesNotMatch(source, /\.execute\(context,/);
});

test('unified campaign application decomposes to governed proposals and never dispatches a provider', async () => {
  const source = await readFile(new URL('../src/unified-campaigns.application.ts', import.meta.url), 'utf8');

  assert.match(source, /this\.actions\.propose\(context, step\.proposal\)/);
  assert.doesNotMatch(source, /this\.actions\.execute\(/);
  assert.doesNotMatch(source, /providers\.get\(/);
  assert.match(source, /UNIFIED_CAMPAIGN_SIMULATION_REQUIRED/);
  assert.match(source, /deriveCampaignCompensationPlan/);
});

test('unified campaign routes use guarded tenant context and never add a bypass execute surface', async () => {
  const operator: TenantContext = {
    tenantId: 'tenant-unified-a',
    userId: 'operator-a',
    roles: ['tenant_admin'],
    permissions: ['marketing:admin', 'workflow:execute', 'artifact:read', 'audit:read'],
    locale: 'en' as const,
  };
  const calls: Array<{ method: string; tenantId: string }> = [];
  const service = Object.fromEntries(
    ['create', 'get', 'plan', 'simulate', 'submit', 'execution', 'performance', 'recommendations'].map((method) => [
      method,
      async (context: TenantContext) => {
        calls.push({ method, tenantId: context.tenantId });
        return { method, tenantId: context.tenantId };
      },
    ]),
  );

  @Module({
    controllers: [UnifiedCampaignsController],
    providers: [
      { provide: UNIFIED_CAMPAIGN_APPLICATION_SERVICE, useValue: service },
      {
        provide: AUTH_PROVIDER,
        useValue: {
          async verifyAccessToken(token: string) {
            return token === 'operator-token' ? operator : { ...operator, permissions: [] };
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
  class UnifiedCampaignHttpTestModule {}

  const application = await NestFactory.create(UnifiedCampaignHttpTestModule, { logger: false });
  await application.listen(0, '127.0.0.1');
  try {
    const address = application.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const root = `http://127.0.0.1:${address.port}/campaigns/unified`;
    const base = `${root}/campaign-a`;
    const headers = { authorization: 'Bearer operator-token', 'content-type': 'application/json' };
    for (const [method, url] of [
      ['POST', root], ['GET', base], ['POST', `${base}/plan`], ['POST', `${base}/simulate`], ['POST', `${base}/submit`],
      ['GET', `${base}/execution`], ['GET', `${base}/performance`], ['GET', `${base}/recommendations`],
    ] as const) {
      const response = await fetch(url, {
        method,
        headers,
        ...(method === 'POST' ? { body: '{}' } : {}),
      });
      assert.equal(response.status, method === 'POST' ? 201 : 200, `${method} ${url} must be authorized`);
    }
    const denied = await fetch(`${base}/submit`, { method: 'POST', headers: { authorization: 'Bearer denied-token' } });
    assert.equal(denied.status, 403);
    assert.deepEqual(calls.map((call) => call.tenantId), Array(8).fill(operator.tenantId));
    assert.deepEqual(calls.map((call) => call.method), [
      'create', 'get', 'plan', 'simulate', 'submit', 'execution', 'performance', 'recommendations',
    ]);
  } finally {
    await application.close();
  }
});
