import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { TenantMembershipAuthProvider } from '@platform/auth/membership';
import { OidcAuthProvider } from '@platform/auth/oidc';
import { loadConfig } from '@platform/config';

import { createApiAuthProvider, RejectingAuthProvider } from './auth-provider.factory.js';
import { LocalAcceptanceAuthProvider } from './local-acceptance-auth.js';

const baseEnv = {
  NODE_ENV: 'test',
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://test?sslmode=verify-full',
  TEMPORAL_ADDRESS: 'localhost:7233',
  TEMPORAL_NAMESPACE: 'test',
  ARTIFACT_BUCKET: 'test',
  AI_PROVIDER: 'mock',
  AI_MODEL: 'test',
};

const stubMembershipResolver = {
  async resolve() {
    return null;
  },
};

test('auth provider selection is OIDC first, then explicit local acceptance, then rejecting', () => {
  assert.ok(createApiAuthProvider(loadConfig(baseEnv)) instanceof RejectingAuthProvider);
  const directory = mkdtempSync(join(tmpdir(), 'nawa-local-acceptance-factory-'));
  const tokenFile = join(directory, 'token.txt');
  try {
    writeFileSync(tokenFile, randomBytes(48).toString('base64url'), { encoding: 'utf8' });
    const localConfig = loadConfig({
      ...baseEnv,
      LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
      LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: tokenFile,
      LOCAL_ACCEPTANCE_AUTH_TENANT_ID: 'tenant-a',
      LOCAL_ACCEPTANCE_AUTH_USER_ID: 'user-a',
    });
    assert.ok(createApiAuthProvider(localConfig) instanceof LocalAcceptanceAuthProvider);
    const oidcConfig = loadConfig({
      ...baseEnv,
      OIDC_ISSUER_URL: 'https://issuer.example.com',
      OIDC_AUDIENCE: 'platform-api',
      LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
      LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: tokenFile,
      LOCAL_ACCEPTANCE_AUTH_TENANT_ID: 'tenant-a',
      LOCAL_ACCEPTANCE_AUTH_USER_ID: 'user-a',
    });
    assert.ok(createApiAuthProvider(oidcConfig) instanceof OidcAuthProvider);
    // Non-production OIDC composes with membership enforcement when available.
    const oidcWithMembership = createApiAuthProvider(oidcConfig, { membershipResolver: stubMembershipResolver });
    assert.ok(oidcWithMembership instanceof TenantMembershipAuthProvider);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production requires OIDC plus an authoritative tenant membership resolver', () => {
  const productionEnv = {
    ...baseEnv,
    NODE_ENV: 'production',
    WEB_URL: 'https://web.example.com',
    API_PUBLIC_URL: 'https://api.example.com',
    CORS_ALLOWED_ORIGINS: 'https://web.example.com',
    TRUST_PROXY: 'false',
    OIDC_ISSUER_URL: 'https://issuer.example.com',
    OIDC_AUDIENCE: 'platform-api',
    WORKFLOW_RUNTIME_MODE: 'temporal',
    RELEASE_VERSION: '1.0.0',
  };
  const productionConfig = loadConfig(productionEnv);
  // Production OIDC without a membership resolver must fail closed.
  assert.throws(() => createApiAuthProvider(productionConfig), /PRODUCTION_TENANT_MEMBERSHIP_RESOLVER_REQUIRED/);
  const provider = createApiAuthProvider(productionConfig, { membershipResolver: stubMembershipResolver });
  assert.ok(provider instanceof TenantMembershipAuthProvider);
});

test('local acceptance fails closed when the flag is missing or false, and a token file alone never activates auth', () => {
  assert.ok(createApiAuthProvider(loadConfig(baseEnv)) instanceof RejectingAuthProvider);
  assert.ok(
    createApiAuthProvider(loadConfig({ ...baseEnv, LOCAL_ACCEPTANCE_AUTH_ENABLED: 'false' })) instanceof
      RejectingAuthProvider,
  );
  // A token file without the explicit enable flag must NOT activate authentication.
  assert.ok(
    createApiAuthProvider(
      loadConfig({ ...baseEnv, LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: 'C:\\temp\\unused.txt' }),
    ) instanceof RejectingAuthProvider,
  );
});
