import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AuthProvider } from '@platform/auth';
import type { TenantContext } from '@platform/contracts';

import { AUTH_PROVIDER, ApiAuthGuard } from './auth.guard.js';
import { PerformanceOptimizationController } from './performance-optimization.controller.js';
import { PERFORMANCE_OPTIMIZATION_APPLICATION_SERVICE } from './performance-optimization.application.js';

test('performance optimization routes are tenant-scoped, guarded, and expose no provider execution path', async () => {
  const controller = await readFile(new URL('../src/performance-optimization.controller.ts', import.meta.url), 'utf8');
  const application = await readFile(new URL('../src/performance-optimization.application.ts', import.meta.url), 'utf8');
  for (const route of [
    "@Get(':campaignId/performance/intelligence')",
    "@Get(':campaignId/performance/diagnostics')",
    "@Get(':campaignId/performance/anomalies')",
    "@Get(':campaignId/performance/recommendations')",
    "@Post(':campaignId/performance/recommendations/generate')",
    "@Get(':campaignId/performance/recommendations/:recommendationId/simulation')",
    "@Post(':campaignId/performance/recommendations/:recommendationId/governed-proposal')",
    "@Get(':campaignId/performance/outcomes')",
    "@Get(':campaignId/performance/learning')",
  ]) assert.match(controller, new RegExp(route.replace(/[()]/g, '\\$&')));
  assert.match(controller, /@UseGuards\(ApiAuthGuard\)/);
  assert.doesNotMatch(controller, /@platform\/tool-gateway|GoogleAds|MetaAds|CredentialResolver/);
  assert.match(application, /this\.actions\.propose\(context,/);
  assert.doesNotMatch(application, /this\.actions\.execute\(/);
  assert.doesNotMatch(application, /providers\.get\(/);
});

test('performance optimization controller applies existing RBAC and forwards the authenticated tenant only', async () => {
  const operator: TenantContext = {
    tenantId: 'tenant-performance-a', userId: 'operator-a', roles: ['tenant_admin'],
    permissions: ['marketing:admin', 'workflow:execute', 'artifact:read', 'audit:read'], locale: 'en' as const,
  };
  const calls: Array<{ method: string; tenantId: string }> = [];
  const service = Object.fromEntries([
    'ingestObservation', 'performance', 'diagnostics', 'anomalies', 'recommendations', 'generateRecommendations', 'getSimulation', 'proposeGovernedAction', 'listOutcomes', 'listLearning',
  ].map((method) => [method, async (context: TenantContext) => {
    calls.push({ method, tenantId: context.tenantId });
    return { method, tenantId: context.tenantId };
  }]));

  @Module({
    controllers: [PerformanceOptimizationController],
    providers: [
      { provide: PERFORMANCE_OPTIMIZATION_APPLICATION_SERVICE, useValue: service },
      { provide: AUTH_PROVIDER, useValue: { async verifyAccessToken(token: string) { return token === 'operator-token' ? operator : { ...operator, permissions: [] }; } } satisfies AuthProvider },
      { provide: ApiAuthGuard, useFactory: (provider: AuthProvider) => new ApiAuthGuard(provider), inject: [AUTH_PROVIDER] },
    ],
  })
  class PerformanceOptimizationHttpTestModule {}

  const application = await NestFactory.create(PerformanceOptimizationHttpTestModule, { logger: false });
  await application.listen(0, '127.0.0.1');
  try {
    const address = application.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/campaigns/unified/campaign-a/performance`;
    const headers = { authorization: 'Bearer operator-token', 'content-type': 'application/json' };
    const requests = [
      ['GET', `${base}/intelligence`], ['GET', `${base}/diagnostics`], ['GET', `${base}/anomalies`], ['GET', `${base}/recommendations`],
      ['POST', `${base}/recommendations/generate`], ['GET', `${base}/recommendations/recommendation-a/simulation`],
      ['POST', `${base}/recommendations/recommendation-a/governed-proposal`], ['GET', `${base}/outcomes`], ['GET', `${base}/learning`],
    ] as const;
    for (const [method, url] of requests) {
      const response = await fetch(url, { method, headers, ...(method === 'POST' ? { body: '{}' } : {}) });
      assert.equal(response.status, method === 'POST' ? 201 : 200, `${method} ${url}`);
    }
    const denied = await fetch(`${base}/recommendations/generate`, { method: 'POST', headers: { authorization: 'Bearer denied-token' } });
    assert.equal(denied.status, 403);
    assert.deepEqual(calls.map((call) => call.tenantId), Array(9).fill(operator.tenantId));
  } finally {
    await application.close();
  }
});
