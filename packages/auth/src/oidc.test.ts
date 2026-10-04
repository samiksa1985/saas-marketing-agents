/**
 * OIDC production-contract tests with REAL local cryptography (WS-PROD-04).
 * Keys are generated per run; a local HTTP server emulates a standards-based
 * OIDC discovery + JWKS endpoint. No external IdP or secrets are involved.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { exportJWK, generateKeyPair, generateSecret, SignJWT } from 'jose';

import { AuthenticationError } from './index.js';
import { OidcAuthProvider } from './oidc.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

interface Fixture {
  issuer: string;
  audience: string;
  server: Server;
  setDiscoveryUnavailable: (unavailable: boolean) => void;
  discoveryRequests: () => number;
  sign: (
    claims: Record<string, unknown>,
    options?: { audience?: string; expired?: boolean; notBefore?: string; omitExpiration?: boolean },
  ) => Promise<string>;
  attackerSign: (claims: Record<string, unknown>) => Promise<string>;
}

async function startFixtureIdp(): Promise<Fixture> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const attacker = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'wsp04-test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const audience = 'growth-os-api';
  let discoveryUnavailable = false;
  let discoveryRequestCount = 0;
  const server = createServer((request, response) => {
    const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    if (request.url === '/.well-known/openid-configuration') {
      discoveryRequestCount += 1;
      if (discoveryUnavailable) {
        response.writeHead(503).end();
        return;
      }
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
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const sign = async (
    claims: Record<string, unknown>,
    options: { audience?: string; expired?: boolean; notBefore?: string; omitExpiration?: boolean } = {},
  ): Promise<string> => {
    const token = new SignJWT({ tenant_id: TENANT, roles: ['tenant_admin'], permissions: [], ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'wsp04-test-key' })
      .setIssuer(issuer)
      .setAudience(options.audience ?? audience)
      .setSubject(String(claims.sub ?? 'wsp04-subject'))
      .setIssuedAt();
    if (!options.omitExpiration) {
      token.setExpirationTime(options.expired ? new Date(Date.now() - 60_000) : '5m');
    }
    if (options.notBefore) token.setNotBefore(options.notBefore);
    return token.sign(privateKey as never);
  };

  const attackerSign = (claims: Record<string, unknown>): Promise<string> =>
    new SignJWT({ tenant_id: TENANT, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'wsp04-test-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(String(claims.sub ?? 'wsp04-attacker'))
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(attacker.privateKey as never);

  return {
    issuer,
    audience,
    server,
    sign,
    attackerSign,
    setDiscoveryUnavailable: (unavailable) => { discoveryUnavailable = unavailable; },
    discoveryRequests: () => discoveryRequestCount,
  };
}

test('valid OIDC token passes issuer, audience, signature, and expiry verification', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    const token = await fixture.sign({});
    const context = await provider.verifyAccessToken(token);
    assert.equal(context.tenantId, TENANT);
    assert.equal(context.userId, 'wsp04-subject');
    assert.deepEqual(context.roles, ['tenant_admin']);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC rejects a token from the wrong issuer', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    const foreign = await new SignJWT({ tenant_id: TENANT })
      .setProtectedHeader({ alg: 'RS256', kid: 'wsp04-test-key' })
      .setIssuer('http://127.0.0.1:1/other-issuer')
      .setAudience(fixture.audience)
      .setSubject('wsp04-subject')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign((await generateKeyPair('RS256')).privateKey as never);
    await assert.rejects(() => provider.verifyAccessToken(foreign), AuthenticationError);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC rejects a token for the wrong audience', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    const token = await fixture.sign({}, { audience: 'some-other-api' });
    await assert.rejects(() => provider.verifyAccessToken(token), AuthenticationError);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC rejects an expired token', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    const token = await fixture.sign({}, { expired: true });
    await assert.rejects(() => provider.verifyAccessToken(token), AuthenticationError);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC rejects a correctly signed token without exp', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    const token = await fixture.sign({}, { omitExpiration: true });
    await assert.rejects(() => provider.verifyAccessToken(token), AuthenticationError);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC rejects a malformed token payload', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    await assert.rejects(() => provider.verifyAccessToken('not-a-jwt'), AuthenticationError);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC rejects a token that is not valid yet (nbf in the future)', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    const token = await fixture.sign({}, { notBefore: '2m' });
    await assert.rejects(() => provider.verifyAccessToken(token), AuthenticationError);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC rejects a token signed with an unknown key', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    const forged = await fixture.attackerSign({});
    await assert.rejects(() => provider.verifyAccessToken(forged), AuthenticationError);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC rejects an off-allowlist signing algorithm (HS256 confusion)', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    const secret = await generateSecret('HS256');
    const confused = await new SignJWT({ tenant_id: TENANT })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(fixture.issuer)
      .setAudience(fixture.audience)
      .setSubject('wsp04-subject')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret as never);
    await assert.rejects(() => provider.verifyAccessToken(confused), AuthenticationError);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC rejects tokens without a subject or tenant claim', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({ issuerUrl: fixture.issuer, audience: fixture.audience });
    const noTenant = await fixture.sign({ tenant_id: undefined });
    await assert.rejects(() => provider.verifyAccessToken(noTenant), /tenant identifier/);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC discovery failure is not cached and a later request can recover', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({
      issuerUrl: fixture.issuer,
      audience: fixture.audience,
      discoveryRetryDelayMs: 0,
    });
    const token = await fixture.sign({});
    fixture.setDiscoveryUnavailable(true);
    await assert.rejects(() => provider.verifyAccessToken(token), AuthenticationError);
    fixture.setDiscoveryUnavailable(false);
    const context = await provider.verifyAccessToken(token);
    assert.equal(context.userId, 'wsp04-subject');
    assert.equal(fixture.discoveryRequests(), 2);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC discovery requests are deduplicated and expose browser endpoints', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({
      issuerUrl: fixture.issuer,
      audience: fixture.audience,
    });
    const [first, second, endpoints] = await Promise.all([
      provider.verifyAccessToken(await fixture.sign({})),
      provider.verifyAccessToken(await fixture.sign({ sub: 'another-subject' })),
      provider.getAuthorizationEndpoints(),
    ]);
    assert.equal(first.userId, 'wsp04-subject');
    assert.equal(second.userId, 'another-subject');
    assert.equal(endpoints.authorizationEndpoint, `${fixture.issuer}/authorize`);
    assert.equal(endpoints.tokenEndpoint, `${fixture.issuer}/token`);
    assert.equal(fixture.discoveryRequests(), 1);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});

test('OIDC ID token validation enforces the expected nonce', async () => {
  const fixture = await startFixtureIdp();
  try {
    const provider = new OidcAuthProvider({
      issuerUrl: fixture.issuer,
      audience: fixture.audience,
      expectedNonce: 'expected-nonce',
    });
    const matching = await fixture.sign({ nonce: 'expected-nonce' });
    const mismatched = await fixture.sign({ nonce: 'other-nonce' });
    await provider.verifyAccessToken(matching);
    await assert.rejects(() => provider.verifyAccessToken(mismatched), AuthenticationError);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
});
