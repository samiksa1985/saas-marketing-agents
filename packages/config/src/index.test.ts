import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadConfig,
} from './index.js';

const baseEnv = {
  NODE_ENV:
    'test',

  WEB_URL:
    'http://localhost:3000',

  DATABASE_URL:
    'postgresql://test',

  TEMPORAL_ADDRESS:
    'localhost:7233',

  TEMPORAL_NAMESPACE:
    'test',

  ARTIFACT_BUCKET:
    'test',

  AI_PROVIDER:
    'mock',

  AI_MODEL:
    'test',
};

function withTokenFile(callback: (tokenFile: string, token: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'nawa-local-acceptance-'));
  const tokenFile = join(directory, 'token.txt');
  const token = randomBytes(48).toString('base64url');
  try {
    writeFileSync(tokenFile, token, { encoding: 'utf8' });
    callback(tokenFile, token);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test(
  'configuration rejects missing required infrastructure secrets',
  () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV:
            'test',
        }),
    );
  },
);

test(
  'configuration loads safe non-production defaults',
  () => {
    const config =
      loadConfig(
        baseEnv,
      );

    assert.equal(
      config.apiPort,
      4000,
    );

    assert.equal(
      config.oidcIssuerUrl,
      undefined,
    );

    assert.equal(
      config.oidcAudience,
      undefined,
    );

    assert.equal(
      config.workflowRuntimeMode,
      'in-memory',
    );

    assert.equal(config.googleAdsExecutionMode, 'DISABLED');
    assert.equal(config.googleAdsExecutionEnabled, false);
    assert.equal(config.localAcceptanceAuthEnabled, false);
    assert.equal(config.localAcceptanceAuthTokenFile, undefined);
  },
);

test(
  'configuration accepts OIDC settings in test environment',
  () => {
    const config =
      loadConfig({
        ...baseEnv,

        OIDC_ISSUER_URL:
          'https://issuer.example.com',

        OIDC_AUDIENCE:
          'platform-api',
      });

    assert.equal(
      config.oidcIssuerUrl,
      'https://issuer.example.com',
    );

    assert.equal(
      config.oidcAudience,
      'platform-api',
    );

    assert.equal(
      config.workflowRuntimeMode,
      'in-memory',
    );
  },
);

test(
  'production rejects the in-memory workflow runtime',
  () => {
    assert.throws(
      () =>
        loadConfig({
          ...baseEnv,
          NODE_ENV:
            'production',
          OIDC_ISSUER_URL:
            'https://issuer.example.com',
          OIDC_AUDIENCE:
            'platform-api',
          WORKFLOW_RUNTIME_MODE:
            'in-memory',
        }),
      /WORKFLOW_RUNTIME_MODE=temporal/i,
    );
  },
);

test(
  'configuration rejects an unknown workflow runtime mode',
  () => {
    assert.throws(
      () =>
        loadConfig({
          ...baseEnv,
          WORKFLOW_RUNTIME_MODE:
            'unsupported',
        }),
      /WORKFLOW_RUNTIME_MODE must be/i,
    );
  },
);

test('configuration refuses MOCK Google Ads execution in production', () => {
  assert.throws(
    () =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        OIDC_ISSUER_URL: 'https://issuer.example.com',
        OIDC_AUDIENCE: 'platform-api',
        GOOGLE_ADS_EXECUTION_MODE: 'MOCK',
      }),
    /cannot use.*MOCK/i,
  );
});

test('configuration validates explicit Google Ads enablement', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, GOOGLE_ADS_EXECUTION_ENABLED: 'yes' }),
    /GOOGLE_ADS_EXECUTION_ENABLED must be true or false/i,
  );
});

test('local acceptance auth is disabled by default and rejects incomplete configuration', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true' }),
    /LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE/i,
  );
  withTokenFile((tokenFile) => {
    assert.throws(
      () => loadConfig({
        ...baseEnv,
        LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
        LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: tokenFile,
      }),
      /LOCAL_ACCEPTANCE_AUTH_TENANT_ID/i,
    );
    assert.throws(
      () => loadConfig({
        ...baseEnv,
        LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
        LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: tokenFile,
        LOCAL_ACCEPTANCE_AUTH_TENANT_ID: 'tenant-a',
      }),
      /LOCAL_ACCEPTANCE_AUTH_USER_ID/i,
    );
  });
});

test('local acceptance auth rejects production and unreadable or empty token files', () => {
  assert.throws(
    () => loadConfig({
      ...baseEnv,
      NODE_ENV: 'production',
      OIDC_ISSUER_URL: 'https://issuer.example.com',
      OIDC_AUDIENCE: 'platform-api',
      WORKFLOW_RUNTIME_MODE: 'temporal',
      LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
    }),
    /LOCAL_ACCEPTANCE_AUTH_ENABLED is forbidden in production/i,
  );
  assert.throws(
    () => loadConfig({
      ...baseEnv,
      LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
      LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: join(tmpdir(), 'does-not-exist-local-acceptance-token.txt'),
      LOCAL_ACCEPTANCE_AUTH_TENANT_ID: 'tenant-a',
      LOCAL_ACCEPTANCE_AUTH_USER_ID: 'user-a',
    }),
    /readable non-empty high-entropy token file/i,
  );
  const directory = mkdtempSync(join(tmpdir(), 'nawa-empty-local-acceptance-'));
  const emptyTokenFile = join(directory, 'token.txt');
  try {
    writeFileSync(emptyTokenFile, '', { encoding: 'utf8' });
    assert.throws(
      () => loadConfig({
        ...baseEnv,
        LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
        LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: emptyTokenFile,
        LOCAL_ACCEPTANCE_AUTH_TENANT_ID: 'tenant-a',
        LOCAL_ACCEPTANCE_AUTH_USER_ID: 'user-a',
      }),
      /readable non-empty high-entropy token file/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('local acceptance auth exposes only its non-secret local configuration', () => {
  withTokenFile((tokenFile, token) => {
    const config = loadConfig({
      ...baseEnv,
      LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
      LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: tokenFile,
      LOCAL_ACCEPTANCE_AUTH_TENANT_ID: 'tenant-a',
      LOCAL_ACCEPTANCE_AUTH_USER_ID: 'user-a',
    });
    assert.equal(config.localAcceptanceAuthEnabled, true);
    assert.equal(config.localAcceptanceAuthTokenFile, tokenFile);
    assert.equal(config.localAcceptanceAuthTenantId, 'tenant-a');
    assert.equal(config.localAcceptanceAuthUserId, 'user-a');
    assert.equal(JSON.stringify(config).includes(token), false);
  });
});

test('REAL Google Ads mode requires an explicit numeric sandbox allowlist containing the approved account', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, GOOGLE_ADS_EXECUTION_MODE: 'REAL', GOOGLE_ADS_CUSTOMER_ID: '1234567890' }),
    /GOOGLE_ADS_SANDBOX_CUSTOMER_IDS/i,
  );
  const config = loadConfig({
    ...baseEnv,
    GOOGLE_ADS_EXECUTION_MODE: 'REAL',
    GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
    GOOGLE_ADS_SANDBOX_CUSTOMER_IDS: '1234567890, 222-222-2222',
  });
  assert.equal(config.googleAdsApprovedCustomerId, '1234567890');
  assert.deepEqual(config.googleAdsSandboxCustomerIds, ['1234567890', '2222222222']);
  assert.equal(config.googleAdsApiVersion, 'v25');
});

test('REAL Google Ads mode rejects an approved account outside its sandbox allowlist', () => {
  assert.throws(
    () => loadConfig({
      ...baseEnv,
      GOOGLE_ADS_EXECUTION_MODE: 'REAL',
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_SANDBOX_CUSTOMER_IDS: '2222222222',
    }),
    /must be included/i,
  );
});

test(
  'production requires OIDC issuer',
  () => {
    assert.throws(
      () =>
        loadConfig({
          ...baseEnv,

          NODE_ENV:
            'production',

          OIDC_AUDIENCE:
            'platform-api',
        }),
      /OIDC_ISSUER_URL/i,
    );
  },
);

test(
  'production requires OIDC audience',
  () => {
    assert.throws(
      () =>
        loadConfig({
          ...baseEnv,

          NODE_ENV:
            'production',

          OIDC_ISSUER_URL:
            'https://issuer.example.com',
        }),
      /OIDC_AUDIENCE/i,
    );
  },
);

test(
  'production accepts complete OIDC configuration',
  () => {
    const config =
      loadConfig({
        ...baseEnv,

        NODE_ENV:
          'production',

        OIDC_ISSUER_URL:
          'https://issuer.example.com',

        OIDC_AUDIENCE:
          'platform-api',
      });

    assert.equal(
      config.oidcIssuerUrl,
      'https://issuer.example.com',
    );

    assert.equal(
      config.oidcAudience,
      'platform-api',
    );

    assert.equal(
      config.workflowRuntimeMode,
      'temporal',
    );
  },
);
