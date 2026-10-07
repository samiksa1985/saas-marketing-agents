import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { TenantContext } from '@platform/contracts';
import { ApiAuthGuard, AUTH_PROVIDER } from './auth.guard.js';
import {
  TENANT_LIFECYCLE_SERVICE_TOKEN,
  TenantLifecycleController,
} from './tenant-lifecycle.controller.js';
import { TenantLifecycleError } from './tenant-lifecycle.service.js';

const platformContext: TenantContext = {
  tenantId: 'platform-tenant',
  userId: 'operator-1',
  roles: ['tenant_admin'],
  permissions: ['platform:provision', 'artifact:read', 'audit:read'],
  locale: 'en',
};
const tenantAdminContext: TenantContext = {
  tenantId: 'tenant-a',
  userId: 'tenant-admin-1',
  roles: ['tenant_admin'],
  permissions: ['artifact:read', 'integration:admin'],
  locale: 'en',
};

function provider() {
  return {
    async verifyAccessToken(token: string) {
      if (token === 'platform-token') return platformContext;
      if (token === 'tenant-token') return tenantAdminContext;
      throw new Error('invalid credentials');
    },
  };
}

function lifecycleDouble(calls: string[]) {
  const error = (code: string) => { throw new TenantLifecycleError(code); };
  return {
    async createRequest(input: { slug?: string }) {
      calls.push(`create:${input.slug}`);
      return { id: 'req-1', status: 'REQUESTED', slug: input.slug, providerLiveMutation: false };
    },
    async getRequest(id: string) {
      calls.push(`get:${id}`);
      return { id, status: 'REQUESTED' };
    },
    async qualify(id: string) {
      calls.push(`qualify:${id}`);
      return { id, status: 'QUALIFIED' };
    },
    async approve(id: string, _actor: string, approvalId: string) {
      calls.push(`approve:${id}:${approvalId}`);
      return { id, status: 'APPROVED', approvalId };
    },
    async provision(id: string) {
      calls.push(`provision:${id}`);
      return { request: { id, status: 'PROVISIONED' }, tenantId: '11111111-1111-4111-8111-111111111111' };
    },
    async bootstrapAdmin(id: string) {
      calls.push(`bootstrap:${id}`);
      return { tenantId: '11111111-1111-4111-8111-111111111111', membershipCreated: true };
    },
    async getTenantStatus(tenantId: string) {
      calls.push(`status:${tenantId}`);
      if (tenantId === 'missing') error('TENANT_NOT_FOUND');
      return {
        tenantId,
        lifecycle: 'ACTIVE_CONTROLLED',
        limits: null,
        recentEvents: [],
      };
    },
    async suspend(tenantId: string) {
      calls.push(`suspend:${tenantId}`);
      return { tenantId, lifecycle: 'SUSPENDED' };
    },
    async resume(tenantId: string) {
      calls.push(`resume:${tenantId}`);
      return { tenantId, lifecycle: 'ACTIVE_CONTROLLED' };
    },
    async offboard(tenantId: string) {
      calls.push(`offboard:${tenantId}`);
      return { tenantId, lifecycle: 'OFFBOARDED' };
    },
    async markReady(tenantId: string) {
      calls.push(`ready:${tenantId}`);
      return { tenantId, lifecycle: 'READY' };
    },
  };
}

async function appWithLifecycle(service: unknown) {
  const calls: string[] = [];
  const svc = service ?? lifecycleDouble(calls);
  const providers = [
    { provide: AUTH_PROVIDER, useValue: provider() },
    { provide: ApiAuthGuard, useFactory: (p: never) => new ApiAuthGuard(p, undefined, false), inject: [AUTH_PROVIDER] },
    { provide: TENANT_LIFECYCLE_SERVICE_TOKEN, useValue: svc },
  ];

  @Module({ controllers: [TenantLifecycleController], providers })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  return { app, calls };
}

test('design-partner lifecycle requires the platform permission and never lets tenant admins provision', async () => {
  const { app, calls } = await appWithLifecycle(undefined);
  try {
    const base = await app.getUrl();
    const unauthenticated = await fetch(`${base}/design-partners/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(unauthenticated.status, 401);

    const tenantAdmin = await fetch(`${base}/design-partners/requests`, {
      method: 'POST',
      headers: { authorization: 'Bearer tenant-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: 'acme-partner',
        displayName: 'Acme',
        designPartnerRef: 'DP-1',
        adminSubject: 's1',
        adminDisplayName: 'Admin',
        idempotencyKey: 'k1',
      }),
    });
    assert.equal(tenantAdmin.status, 403, 'tenant admins cannot provision tenants');

    const created = await fetch(`${base}/design-partners/requests`, {
      method: 'POST',
      headers: { authorization: 'Bearer platform-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: 'acme-partner',
        displayName: 'Acme',
        designPartnerRef: 'DP-1',
        adminSubject: 's1',
        adminDisplayName: 'Admin',
        idempotencyKey: 'k1',
      }),
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.providerLiveMutation, false);
    assert.deepEqual(calls, ['create:acme-partner']);

    const liveMutation = await fetch(`${base}/design-partners/requests`, {
      method: 'POST',
      headers: { authorization: 'Bearer platform-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: 'acme-partner-2',
        displayName: 'Acme 2',
        designPartnerRef: 'DP-2',
        adminSubject: 's2',
        adminDisplayName: 'Admin 2',
        idempotencyKey: 'k2',
        providerLiveMutation: true,
      }),
    });
    assert.equal(liveMutation.status, 400, 'live mutation requests are rejected');
  } finally {
    await app.close();
  }
});

test('lifecycle transitions require approval references and platform authority', async () => {
  const { app, calls } = await appWithLifecycle(undefined);
  try {
    const base = await app.getUrl();
    const approveWithoutId = await fetch(`${base}/design-partners/requests/req-1/approve`, {
      method: 'POST',
      headers: { authorization: 'Bearer platform-token', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(approveWithoutId.status, 400);

    const approved = await fetch(`${base}/design-partners/requests/req-1/approve`, {
      method: 'POST',
      headers: { authorization: 'Bearer platform-token', 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: 'approval-1' }),
    });
    assert.equal(approved.status, 201);
    assert.ok(calls.includes('approve:req-1:approval-1'));

    const provision = await fetch(`${base}/design-partners/requests/req-1/provision`, {
      method: 'POST',
      headers: { authorization: 'Bearer platform-token', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(provision.status, 201);
    assert.ok(calls.includes('provision:req-1'));
    assert.ok(calls.includes('bootstrap:req-1'), 'provisioning bootstraps the initial admin');

    const suspended = await fetch(`${base}/design-partners/tenants/11111111-1111-4111-8111-111111111111/suspend`, {
      method: 'POST',
      headers: { authorization: 'Bearer platform-token', 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'investigation' }),
    });
    assert.equal(suspended.status, 201);

    const offboarded = await fetch(`${base}/design-partners/tenants/11111111-1111-4111-8111-111111111111/offboard`, {
      method: 'POST',
      headers: { authorization: 'Bearer platform-token', 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'complete' }),
    });
    assert.equal(offboarded.status, 201);
  } finally {
    await app.close();
  }
});

test('tenant status is tenant-scoped; cross-tenant reads are denied', async () => {
  const { app } = await appWithLifecycle(undefined);
  try {
    const base = await app.getUrl();
    const own = await fetch(`${base}/design-partners/tenants/tenant-a/status`, {
      headers: { authorization: 'Bearer tenant-token' },
    });
    assert.equal(own.status, 200);

    const cross = await fetch(`${base}/design-partners/tenants/tenant-b/status`, {
      headers: { authorization: 'Bearer tenant-token' },
    });
    assert.equal(cross.status, 403, 'tenant admin cannot read another tenant lifecycle status');

    const missing = await fetch(`${base}/design-partners/tenants/missing/status`, {
      headers: { authorization: 'Bearer platform-token' },
    });
    assert.equal(missing.status, 404);
  } finally {
    await app.close();
  }
});
