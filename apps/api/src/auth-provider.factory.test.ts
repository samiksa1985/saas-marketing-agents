import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { OidcAuthProvider } from '@platform/auth/oidc';
import { loadConfig } from '@platform/config';

import { createApiAuthProvider, RejectingAuthProvider } from './auth-provider.factory.js';
import { LocalAcceptanceAuthProvider } from './local-acceptance-auth.js';

const baseEnv = {
  NODE_ENV: 'test',
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://test',
  TEMPORAL_ADDRESS: 'localhost:7233',
  TEMPORAL_NAMESPACE: 'test',
  ARTIFACT_BUCKET: 'test',
  AI_PROVIDER: 'mock',
  AI_MODEL: 'test',
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
    const productionConfig = loadConfig({
      ...baseEnv,
      NODE_ENV: 'production',
      OIDC_ISSUER_URL: 'https://issuer.example.com',
      OIDC_AUDIENCE: 'platform-api',
      WORKFLOW_RUNTIME_MODE: 'temporal',
    });
    assert.ok(createApiAuthProvider(productionConfig) instanceof OidcAuthProvider);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
