import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AuthProvider } from '@platform/auth';
import type { TenantContext } from '@platform/contracts';

import { AUTH_PROVIDER, ApiAuthGuard } from './auth.guard.js';
import { CUSTOMER_ACQUISITION_REVENUE_APPLICATION_SERVICE } from './customer-acquisition-revenue.application.js';
import { CustomerAcquisitionRevenueController } from './customer-acquisition-revenue.controller.js';

test('EPIC09 API is tenant-scoped, guarded, provider-neutral, and has no CRM mutation route', async () => {
  const controller = await readFile(new URL('../src/customer-acquisition-revenue.controller.ts', import.meta.url), 'utf8');
  const application = await readFile(new URL('../src/customer-acquisition-revenue.application.ts', import.meta.url), 'utf8');
  for (const route of ["@Post('leads')", "@Get('leads')", "@Get('leads/:id')", "@Get('leads/:id/qualification')", "@Get('leads/:id/identity')", "@Get('leads/:id/engagement')", "@Get('customer-identities/:id')", "@Get('opportunities')", "@Get('opportunities/:id')", "@Get('revenue-events')", "@Get('revenue-intelligence')", "@Get('funnel')", "@Get('revenue-attribution')", "@Get('acquisition-diagnostics')", "@Get('lead-routing-recommendations')"]) assert.match(controller, new RegExp(route.replace(/[()]/g, '\\$&')));
  assert.match(controller, /@UseGuards\(ApiAuthGuard\)/); assert.doesNotMatch(controller, /@platform\/tool-gateway|HubSpot|Salesforce|Dynamics|Vendasta|execute\(/i);
  assert.doesNotMatch(application, /GoogleAds|MetaAds|CredentialResolver|this\.actions\.execute\(/);
});

test('EPIC09 API forwards only authenticated tenant context and applies RBAC', async () => {
  const operator: TenantContext = { tenantId: 'tenant-acquisition-a', userId: 'user-a', roles: ['tenant_admin'], permissions: ['marketing:admin', 'artifact:read', 'audit:read'], locale: 'en' as never };
  const calls: string[] = []; const service = Object.fromEntries(['captureLead', 'listLeads', 'getLead', 'qualification', 'identity', 'engagement', 'getIdentity', 'listOpportunities', 'getOpportunity', 'listRevenueEvents', 'revenueIntelligence', 'listFunnel', 'listRevenueAttribution', 'diagnostics', 'routingRecommendations'].map((method) => [method, async (context: TenantContext) => { calls.push(context.tenantId); return { method, tenantId: context.tenantId }; }]));
  @Module({ controllers: [CustomerAcquisitionRevenueController], providers: [{ provide: CUSTOMER_ACQUISITION_REVENUE_APPLICATION_SERVICE, useValue: service }, { provide: AUTH_PROVIDER, useValue: { async verifyAccessToken(token: string) { return token === 'operator' ? operator : { ...operator, permissions: [] }; } } satisfies AuthProvider }, { provide: ApiAuthGuard, useFactory: (provider: AuthProvider) => new ApiAuthGuard(provider), inject: [AUTH_PROVIDER] }] }) class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false }); await app.listen(0, '127.0.0.1');
  try {
    const address = app.getHttpServer().address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`; const headers = { authorization: 'Bearer operator', 'content-type': 'application/json' };
    const requests = [['POST', '/leads'], ['GET', '/leads'], ['GET', '/leads/lead-a'], ['GET', '/leads/lead-a/qualification'], ['GET', '/leads/lead-a/identity'], ['GET', '/leads/lead-a/engagement'], ['GET', '/customer-identities/identity-a'], ['GET', '/opportunities'], ['GET', '/opportunities/opportunity-a'], ['GET', '/revenue-events'], ['GET', '/revenue-intelligence'], ['GET', '/funnel'], ['GET', '/revenue-attribution'], ['GET', '/acquisition-diagnostics'], ['GET', '/lead-routing-recommendations']] as const;
    for (const [method, path] of requests) { const response = await fetch(`${base}${path}`, { method, headers, ...(method === 'POST' ? { body: JSON.stringify({ idempotencyKey: 'lead', source: 'form', capturedAt: '2026-09-14T00:00:00.000Z', email: 'lead@example.test' }) } : {}) }); assert.equal(response.status, method === 'POST' ? 201 : 200, `${method} ${path}`); }
    const denied = await fetch(`${base}/leads`, { method: 'POST', headers: { authorization: 'Bearer denied', 'content-type': 'application/json' }, body: '{}' }); assert.equal(denied.status, 403); assert.deepEqual(calls, Array(15).fill(operator.tenantId));
  } finally { await app.close(); }
});
