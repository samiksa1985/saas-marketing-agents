import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { loadConfig } from '@platform/config';
import type { Permission, Role } from '@platform/contracts';
import type { TenantMembershipResolver, TenantMembership } from '@platform/auth/membership';
import {
  BrowserAuthService,
  type BrowserAuthStore,
  serializeSessionCookie,
  sessionCookieName,
} from './browser-auth.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

interface PendingLogin {
  bindingHash: string;
  transaction: { pkce_verifier: string; nonce: string; return_to: string };
}

class MemoryBrowserAuthStore implements BrowserAuthStore {
  readonly logins = new Map<string, PendingLogin>();
  readonly sessions = new Map<string, {
    subject: string;
    tenant_id: string;
    csrf_token: string;
    expires_at: Date;
  }>();

  async startLogin(input: {
    stateHash: string;
    bindingHash: string;
    verifier: string;
    nonce: string;
    returnTo: string;
  }): Promise<void> {
    this.logins.set(input.stateHash, {
      bindingHash: input.bindingHash,
      transaction: {
        pkce_verifier: input.verifier,
        nonce: input.nonce,
        return_to: input.returnTo,
      },
    });
  }

  async consumeLogin(stateHash: string, bindingHash: string) {
    const pending = this.logins.get(stateHash);
    if (!pending || pending.bindingHash !== bindingHash) return undefined;
    this.logins.delete(stateHash);
    return pending.transaction;
  }

  async createSession(input: { sessionHash: string; subject: string; tenantId: string; csrfToken: string }) {
    this.sessions.set(input.sessionHash, {
      subject: input.subject,
      tenant_id: input.tenantId,
      csrf_token: input.csrfToken,
      expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });
    return true;
  }

  async lookupSession(sessionHash: string) {
    const session = this.sessions.get(sessionHash);
    return session && session.expires_at > new Date() ? session : undefined;
  }

  async revokeSession(sessionHash: string) {
    this.sessions.delete(sessionHash);
  }

  async rotateSession(input: {
    sessionHash: string;
    oldSessionHash: string;
    subject: string;
    tenantId: string;
    csrfToken: string;
  }) {
    if (!this.sessions.has(input.oldSessionHash)) return false;
    this.sessions.delete(input.oldSessionHash);
    await this.createSession(input);
    return true;
  }

  async listTenants() {
    return [
      { tenant_id: TENANT_A, tenant_name: 'Tenant A' },
      { tenant_id: TENANT_B, tenant_name: 'Tenant B' },
    ];
  }
}

class MembershipResolver implements TenantMembershipResolver {
  async resolve(subject: string, tenantId: string): Promise<TenantMembership | null> {
    if (subject !== 'oidc-subject' || ![TENANT_A, TENANT_B].includes(tenantId)) return null;
    return {
      tenantId,
      role: 'tenant_admin' as Role,
      permissions: ['workflow:read'] as Permission[],
    };
  }
}

interface OidcFixture {
  issuer: string;
  server: Server;
  setNonce: (nonce: string) => void;
  setChallenge: (challenge: string) => void;
  setTenant: (tenantId: string) => void;
  tokenRequests: () => number;
}

async function startOidcFixture(): Promise<OidcFixture> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'browser-auth-test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  let nonce = '';
  let tenantId = TENANT_A;
  let expectedChallenge: string | undefined;
  let tokenRequestCount = 0;
  let issuer = '';

  const server = createServer(async (request, response) => {
    if (request.url === '/.well-known/openid-configuration') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        issuer,
        jwks_uri: `${issuer}/jwks.json`,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
      }));
      return;
    }
    if (request.url === '/jwks.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (request.url === '/token' && request.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = new URLSearchParams(Buffer.concat(chunks).toString());
      tokenRequestCount += 1;
      const verifier = body.get('code_verifier') ?? '';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (body.get('code') !== 'valid-code' || challenge !== expectedChallenge) {
        response.writeHead(400).end();
        return;
      }
      const idToken = await new SignJWT({ tenant_id: tenantId, nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'browser-auth-test-key' })
        .setIssuer(issuer)
        .setAudience('browser-client')
        .setSubject('oidc-subject')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        access_token: 'server-only-access-token',
        token_type: 'Bearer',
        id_token: idToken,
      }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    issuer,
    server,
    setNonce: (value) => { nonce = value; },
    setChallenge: (value) => { expectedChallenge = value; },
    setTenant: (value) => { tenantId = value; },
    tokenRequests: () => tokenRequestCount,
  };
}

function config(issuer: string) {
  return loadConfig({
    NODE_ENV: 'test',
    WEB_URL: 'https://app.example.test',
    API_PUBLIC_URL: 'https://api.example.test',
    RELEASE_VERSION: '1.0.0-test',
    CORS_ALLOWED_ORIGINS: 'https://app.example.test',
    TRUST_PROXY: 'false',
    DATABASE_URL: 'postgresql://test?sslmode=verify-full',
    TEMPORAL_ADDRESS: 'localhost:7233',
    TEMPORAL_NAMESPACE: 'test',
    ARTIFACT_BUCKET: 'test',
    AI_PROVIDER: 'mock',
    AI_MODEL: 'test',
    OIDC_ISSUER_URL: issuer,
    OIDC_AUDIENCE: 'platform-api',
    OIDC_CLIENT_ID: 'browser-client',
  });
}

test('browser OIDC uses PKCE, state, nonce, one-time callback, durable sessions, and authoritative tenant choices', async () => {
  const fixture = await startOidcFixture();
  const store = new MemoryBrowserAuthStore();
  try {
    const service = new BrowserAuthService(config(fixture.issuer), store, new MembershipResolver());
    const start = await service.startLogin('/growth?period=30D');
    const authorization = new URL(start.authorizationUrl);
    const state = authorization.searchParams.get('state')!;
    const nonce = authorization.searchParams.get('nonce')!;
    fixture.setNonce(nonce);
    fixture.setChallenge(authorization.searchParams.get('code_challenge')!);
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(
      authorization.searchParams.get('code_challenge'),
      createHash('sha256')
        .update(store.logins.values().next().value!.transaction.pkce_verifier)
        .digest('base64url'),
    );
    const login = await service.completeLogin({
      code: 'valid-code',
      state,
      binding: start.bindingCookie,
      error: undefined,
      authorizationIssuer: fixture.issuer,
    });
    assert.equal(login.returnTo, '/growth?period=30D');
    assert.equal(fixture.tokenRequests(), 1);
    assert.doesNotMatch(JSON.stringify(login), /server-only-access-token/);
    const session = await service.getSession(login.sessionId);
    assert.equal(session.authenticated, true);
    assert.equal(session.tenantId, TENANT_A);
    assert.deepEqual(session.tenants, [
      { id: TENANT_A, name: 'Tenant A' },
      { id: TENANT_B, name: 'Tenant B' },
    ]);
    await assert.rejects(
      () => service.completeLogin({
        code: 'valid-code',
        state,
        binding: start.bindingCookie,
        error: undefined,
        authorizationIssuer: fixture.issuer,
      }),
      /invalid or expired/i,
    );

    await assert.rejects(
      () => service.switchTenant({
        sessionId: login.sessionId,
        tenantId: TENANT_B,
        origin: 'https://attacker.example.test',
        csrfToken: session.csrfToken,
      }),
      /origin or CSRF/i,
    );
    const selected = await service.switchTenant({
      sessionId: login.sessionId,
      tenantId: TENANT_B,
      origin: 'https://app.example.test',
      csrfToken: session.csrfToken,
    });
    assert.equal((await service.getSession(login.sessionId)).authenticated, false);
    assert.equal((await service.getSession(selected)).tenantId, TENANT_B);
    await service.logout({
      sessionId: selected,
      origin: 'https://app.example.test',
      csrfToken: (await service.getSession(selected)).csrfToken,
    });
    assert.equal((await service.getSession(selected)).authenticated, false);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('browser OIDC rejects open redirects, wrong state bindings, and unsafe cookie attributes', async () => {
  const fixture = await startOidcFixture();
  try {
    const store = new MemoryBrowserAuthStore();
    const service = new BrowserAuthService(config(fixture.issuer), store, new MembershipResolver());
    await assert.rejects(() => service.startLogin('//attacker.example/steal'), /destination/i);
    const start = await service.startLogin('/');
    const state = new URL(start.authorizationUrl).searchParams.get('state')!;
    await assert.rejects(
      () => service.completeLogin({
        code: 'valid-code',
        state,
        binding: 'abcdefghijklmnopqrstuvwxyzABCDEFG_123456789',
        error: undefined,
        authorizationIssuer: fixture.issuer,
      }),
      /invalid or expired/i,
    );
    const validBindingStart = await service.startLogin('/');
    const validBindingUrl = new URL(validBindingStart.authorizationUrl);
    fixture.setNonce(validBindingUrl.searchParams.get('nonce')!);
    fixture.setChallenge(validBindingUrl.searchParams.get('code_challenge')!);
    fixture.setTenant('33333333-3333-4333-8333-333333333333');
    await assert.rejects(
      () => service.completeLogin({
        code: 'valid-code',
        state: validBindingUrl.searchParams.get('state')!,
        binding: validBindingStart.bindingCookie,
        error: undefined,
        authorizationIssuer: fixture.issuer,
      }),
      /membership|tenant/i,
    );
    assert.equal(store.sessions.size, 0);
    assert.equal(sessionCookieName(true), '__Host-codecore_session');
    const cookie = serializeSessionCookie('abcdefghijklmnopqrstuvwxyzABCDEFG_123456789', true);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(cookie, /Domain=/i);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});
