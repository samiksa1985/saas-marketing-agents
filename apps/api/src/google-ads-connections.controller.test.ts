import assert from 'node:assert/strict';
import test from 'node:test';
import { Controller, Get, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { TenantContext } from '@platform/contracts';
import { ApiAuthGuard, AUTH_PROVIDER, AUTH_CONTEXT, type AuthenticatedRequest } from './auth.guard.js';
import {
  GOOGLE_ADS_CONNECTION_SERVICE,
  GoogleAdsConnectionsController,
} from './google-ads-connections.controller.js';
import type { GoogleAdsConnectionService } from '@platform/tool-gateway';

const adminContext: TenantContext = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  roles: ['tenant_admin'],
  permissions: ['integration:admin', 'artifact:read'],
  locale: 'en',
};
const viewerContext: TenantContext = {
  tenantId: 'tenant-a',
  userId: 'user-v',
  roles: ['viewer'],
  permissions: ['artifact:read'],
  locale: 'en',
};

function provider() {
  return {
    async verifyAccessToken(token: string) {
      if (token === 'admin-token') return adminContext;
      if (token === 'viewer-token') return viewerContext;
      throw new Error('invalid credentials');
    },
  };
}

function serviceDouble(calls: string[]) {
  return {
    async startConnection() {
      calls.push('start');
      return { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=x', connectionId: 'conn-1' };
    },
    async completeConnection() {
      calls.push('complete');
      return { connectionId: 'conn-1', verified: true };
    },
    async listConnections() {
      calls.push('list');
      return [{ id: 'conn-1', status: 'VERIFIED' }];
    },
    async listAccounts() {
      calls.push('accounts');
      return [];
    },
    async selectAccount() {
      calls.push('select');
    },
    async disconnect() {
      calls.push('disconnect');
    },
  };
}

async function appWith(service: unknown, config: { googleAdsConnectionEnabled: boolean }) {
  const calls: string[] = [];
  const svc = service ?? serviceDouble(calls);
  @Module({
    controllers: [GoogleAdsConnectionsController],
    providers: [
      { provide: AUTH_PROVIDER, useValue: provider() },
      { provide: ApiAuthGuard, useFactory: (p: never) => new ApiAuthGuard(p, undefined, false), inject: [AUTH_PROVIDER] },
      { provide: GOOGLE_ADS_CONNECTION_SERVICE, useValue: svc },
      { provide: 'PLATFORM_CONFIG', useValue: config },
    ],
  })
  class TestModule {}
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  return { app, calls };
}

test('connection API enforces the feature gate, permissions, and tenant context', async () => {
  const { app, calls } = await appWith(undefined, { googleAdsConnectionEnabled: true });
  try {
    const base = await app.getUrl();

    const unauthenticated = await fetch(`${base}/provider-connections/google-ads`, { method: 'GET' });
    assert.equal(unauthenticated.status, 401);

    const forbidden = await fetch(`${base}/provider-connections/google-ads/connect`, {
      method: 'POST',
      headers: { authorization: 'Bearer viewer-token', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(forbidden.status, 403, 'viewer cannot connect');

    const connected = await fetch(`${base}/provider-connections/google-ads/connect`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(connected.status, 201);
    const payload = await connected.json();
    assert.ok(String(payload.authorizationUrl).startsWith('https://accounts.google.com/'));
    assert.deepEqual(calls, ['start']);

    const listed = await fetch(`${base}/provider-connections/google-ads`, {
      headers: { authorization: 'Bearer viewer-token' },
    });
    assert.equal(listed.status, 200, 'artifact:read can view connections');
  } finally {
    await app.close();
  }
});

test('connection API returns 404 when the connection gate is disabled', async () => {
  const { app, calls } = await appWith(undefined, { googleAdsConnectionEnabled: false });
  try {
    const base = await app.getUrl();
    const response = await fetch(`${base}/provider-connections/google-ads/connect`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 404);
    assert.deepEqual(calls, [], 'disabled gate must not reach the service');
  } finally {
    await app.close();
  }
});

test('callback requires state and code and never echoes token material', async () => {
  const { app } = await appWith(undefined, { googleAdsConnectionEnabled: true });
  try {
    const base = await app.getUrl();
    const missing = await fetch(`${base}/provider-connections/google-ads/callback`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'only-state' }),
    });
    assert.equal(missing.status, 401);
    const complete = await fetch(`${base}/provider-connections/google-ads/callback`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
      body: JSON.stringify({ state: 's', code: 'c' }),
    });
    assert.equal(complete.status, 201);
    const body = await complete.text();
    assert.equal(/access_token|refresh_token|client_secret|developer/i.test(body), false);
  } finally {
    await app.close();
  }
});
