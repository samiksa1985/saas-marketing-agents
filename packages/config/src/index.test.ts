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
    'https://app.example.com',

  API_PUBLIC_URL:
    'https://api.example.com',

  RELEASE_VERSION:
    '1.0.0-test',

  CORS_ALLOWED_ORIGINS:
    'https://app.example.com',

  TRUST_PROXY:
    'false',

  DATABASE_URL:
    'postgresql://test?sslmode=verify-full',

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

function withConfigFile(contents: string, callback: (file: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'codecore-config-'));
  const file = join(directory, 'secret.txt');
  try {
    writeFileSync(file, contents, { encoding: 'utf8', mode: 0o600 });
    callback(file);
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

      test('runtime database configuration accepts a secret file and prefers it over direct input', () => {
        withConfigFile('postgresql://file-user:file-password@db.example.test/runtime\n', (file) => {
          const config = loadConfig({
            ...baseEnv,
            DATABASE_URL: 'postgresql://direct-user:direct-password@wrong.example.test/wrong',
            DATABASE_URL_FILE: file,
          });
          assert.equal(config.databaseUrl, 'postgresql://file-user:file-password@db.example.test/runtime');
        });
      });

      test('an unreadable database secret file fails closed instead of using the direct URL', () => {
        const privatePath = join(tmpdir(), 'missing-codecore-database-url');
        assert.throws(
          () =>
            loadConfig({
              ...baseEnv,
              DATABASE_URL: 'postgresql://direct-user:direct-password@wrong.example.test/wrong',
              DATABASE_URL_FILE: privatePath,
            }),
          (error: unknown) =>
            error instanceof Error &&
            error.message === 'DATABASE_URL_FILE_UNREADABLE' &&
            !error.message.includes(privatePath) &&
            !error.message.includes('direct-password'),
        );
      });

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
    assert.equal(config.metaAdsExecutionMode, 'DISABLED');
    assert.equal(config.metaAdsExecutionEnabled, false);
    assert.equal(config.metaAdsApiVersion, 'v21.0');
    assert.deepEqual(config.metaAdsSandboxAdAccountIds, []);
    assert.equal(config.localAcceptanceAuthEnabled, false);
    assert.equal(config.localAcceptanceDurableApprovals, false);
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

    test('browser OIDC client secret supports the existing secret-file boundary', () => {
      withConfigFile('oidc-client-secret-value\n', (file) => {
        const config = loadConfig({
          ...baseEnv,
          OIDC_ISSUER_URL: 'https://issuer.example.com',
          OIDC_AUDIENCE: 'platform-api',
          OIDC_CLIENT_ID: 'browser-client',
          OIDC_CLIENT_SECRET: '',
          OIDC_CLIENT_SECRET_FILE: file,
        });
        assert.equal(config.oidcClientId, 'browser-client');
        assert.equal(config.oidcClientSecret, 'oidc-client-secret-value');
      });
    });

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

test('configuration rejects malformed OIDC issuer URLs in all environments', () => {
  assert.throws(
    () =>
      loadConfig({
        ...baseEnv,
        OIDC_ISSUER_URL: 'issuer-without-scheme',
        OIDC_AUDIENCE: 'platform-api',
      }),
    /OIDC_ISSUER_URL must be an absolute URL/i,
  );
  assert.throws(
    () =>
      loadConfig({
        ...baseEnv,
        OIDC_ISSUER_URL: 'https://issuer.example.com/oidc?tenant=foo',
        OIDC_AUDIENCE: 'platform-api',
      }),
    /must not include a query string or fragment/i,
  );
});

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
      /WORKFLOW_RUNTIME_MODE=postgres/i,
    );
  },
);

test(
  'production rejects the retired Temporal workflow runtime',
  () => {
    assert.throws(
      () =>
        loadConfig({
          ...baseEnv,
          NODE_ENV: 'production',
          OIDC_ISSUER_URL: 'https://issuer.example.com',
          OIDC_AUDIENCE: 'platform-api',
          WORKFLOW_RUNTIME_MODE: 'temporal',
        }),
      /WORKFLOW_RUNTIME_MODE must be in-memory or postgres/i,
    );
  },
);

test('production requires OIDC_ISSUER_URL to use HTTPS', () => {
  assert.throws(
    () =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        OIDC_ISSUER_URL: 'http://issuer.example.com',
        OIDC_AUDIENCE: 'platform-api',
      }),
    /OIDC_ISSUER_URL must use HTTPS in production/i,
  );
});

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
    () => loadConfig({ ...baseEnv, LOCAL_ACCEPTANCE_DURABLE_APPROVALS: 'true' }),
    /LOCAL_ACCEPTANCE_DURABLE_APPROVALS requires LOCAL_ACCEPTANCE_AUTH_ENABLED/i,
  );
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
      WORKFLOW_RUNTIME_MODE: 'postgres',
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
    assert.equal(config.localAcceptanceDurableApprovals, false);
    assert.equal(config.localAcceptanceAuthTokenFile, tokenFile);
    assert.equal(config.localAcceptanceAuthTenantId, 'tenant-a');
    assert.equal(config.localAcceptanceAuthUserId, 'user-a');
    assert.equal(JSON.stringify(config).includes(token), false);
  });
});

test('local acceptance can explicitly require durable approvals without changing workflow mode', () => {
  withTokenFile((tokenFile) => {
    const config = loadConfig({
      ...baseEnv,
      LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
      LOCAL_ACCEPTANCE_DURABLE_APPROVALS: 'true',
      LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: tokenFile,
      LOCAL_ACCEPTANCE_AUTH_TENANT_ID: 'tenant-a',
      LOCAL_ACCEPTANCE_AUTH_USER_ID: 'user-a',
    });
    assert.equal(config.workflowRuntimeMode, 'in-memory');
    assert.equal(config.localAcceptanceDurableApprovals, true);
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

test('Meta Ads defaults are disabled and explicit REAL mode requires an allowlisted ad account', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, META_ADS_EXECUTION_MODE: 'REAL' }),
    /META_ADS_AD_ACCOUNT_ID/i,
  );
  assert.throws(
    () => loadConfig({
      ...baseEnv,
      META_ADS_EXECUTION_MODE: 'REAL',
      META_ADS_AD_ACCOUNT_ID: 'act_123456789',
    }),
    /META_ADS_SANDBOX_AD_ACCOUNT_IDS/i,
  );
  const config = loadConfig({
    ...baseEnv,
    META_ADS_EXECUTION_MODE: 'REAL',
    META_ADS_AD_ACCOUNT_ID: '123456789',
    META_ADS_SANDBOX_AD_ACCOUNT_IDS: 'act_123456789, act_987654321',
  });
  assert.equal(config.metaAdsApprovedAdAccountId, 'act_123456789');
  assert.deepEqual(config.metaAdsSandboxAdAccountIds, ['act_123456789', 'act_987654321']);
});

test('Meta Ads rejects malformed execution enablement and API version', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, META_ADS_EXECUTION_ENABLED: 'yes' }),
    /META_ADS_EXECUTION_ENABLED must be true or false/i,
  );
  assert.throws(
    () => loadConfig({ ...baseEnv, META_ADS_API_VERSION: 'latest' }),
    /META_ADS_API_VERSION/i,
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
      'postgres',
    );
  },
);

test('production fails closed for missing CORS/trusted-proxy/release configuration', () => {
  const production = { ...baseEnv, NODE_ENV: 'production', OIDC_ISSUER_URL: 'https://issuer.example.com', OIDC_AUDIENCE: 'platform-api' };
  assert.throws(() => loadConfig({ ...production, CORS_ALLOWED_ORIGINS: '' }), /CORS_ALLOWED_ORIGINS/i);
  assert.throws(() => loadConfig({ ...production, TRUST_PROXY: undefined }), /TRUST_PROXY/i);
  assert.throws(() => loadConfig({ ...production, RELEASE_VERSION: 'latest' }), /RELEASE_VERSION/i);
});

test('production database URLs require the single fully verified TLS mode', () => {
  const production = {
    ...baseEnv,
    NODE_ENV: 'production',
    OIDC_ISSUER_URL: 'https://issuer.example.com',
    OIDC_AUDIENCE: 'platform-api',
    RELEASE_VERSION: '1.0.0',
  };
  assert.equal(loadConfig({ ...production, DATABASE_URL: 'postgresql://app@db.example.com/platform?sslmode=verify-full' }).databaseUrl,
    'postgresql://app@db.example.com/platform?sslmode=verify-full');

  for (const mode of ['disable', 'allow', 'prefer', 'require', 'verify-ca']) {
    assert.throws(
      () => loadConfig({ ...production, DATABASE_URL: `postgresql://app@db.example.com/platform?sslmode=${mode}` }),
      /DATABASE_URL must set sslmode=verify-full/i,
    );
  }
  assert.throws(
    () => loadConfig({ ...production, DATABASE_URL: 'postgresql://app@db.example.com/platform' }),
    /DATABASE_URL must set sslmode=verify-full/i,
  );
  assert.throws(
    () => loadConfig({ ...production, DATABASE_URL: 'postgresql://app@db.example.com/platform?sslmode=verify-full&sslmode=disable' }),
    /DATABASE_URL must set sslmode=verify-full/i,
  );
});

test('production web, API, issuer, and CORS origins require explicit public HTTPS domains', () => {
  const production = {
    ...baseEnv,
    NODE_ENV: 'production',
    RELEASE_VERSION: '1.0.0',
    DATABASE_URL: 'postgresql://app@db.example.com/platform?sslmode=verify-full',
    OIDC_ISSUER_URL: 'https://issuer.example.com',
    OIDC_AUDIENCE: 'platform-api',
  };
  assert.throws(() => loadConfig({ ...production, API_PUBLIC_URL: undefined }), /API_PUBLIC_URL/i);
  assert.throws(() => loadConfig({ ...production, API_PUBLIC_URL: 'http://api.example.com' }), /API_PUBLIC_URL/i);
  assert.throws(() => loadConfig({ ...production, WEB_URL: 'https://localhost' }), /public DNS hostname/i);
  assert.throws(() => loadConfig({ ...production, WEB_URL: 'https://192.168.1.10' }), /public DNS hostname/i);
  assert.throws(() => loadConfig({ ...production, API_PUBLIC_URL: 'https://api' }), /public DNS hostname/i);
  assert.throws(() => loadConfig({ ...production, OIDC_ISSUER_URL: 'https://issuer.internal' }), /public DNS hostname/i);
  assert.throws(() => loadConfig({ ...production, CORS_ALLOWED_ORIGINS: 'https://attacker.example.com' }), /must include WEB_URL/i);
  assert.throws(() => loadConfig({ ...production, CORS_ALLOWED_ORIGINS: '*' }), /CORS_ALLOWED_ORIGINS/i);
});

test('local development continues to accept explicit HTTP origins', () => {
  const config = loadConfig({
    ...baseEnv,
    NODE_ENV: 'development',
    WEB_URL: 'http://localhost:3000',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
  });
  assert.deepEqual(config.corsAllowedOrigins, ['http://localhost:3000', 'http://127.0.0.1:3000']);
  assert.deepEqual(
    loadConfig({ ...baseEnv, NODE_ENV: 'development', CORS_ALLOWED_ORIGINS: 'http://web:3000' }).corsAllowedOrigins,
    ['http://web:3000'],
  );
  assert.throws(
    () => loadConfig({ ...baseEnv, NODE_ENV: 'development', CORS_ALLOWED_ORIGINS: 'http://web:3000/path' }),
    /CORS_ALLOWED_ORIGINS/i,
  );
});

test('metrics endpoint configuration is disabled by default and requires a high-entropy token when enabled', () => {
  assert.equal(loadConfig(baseEnv).observabilityMetricsEnabled, false);
  assert.throws(
    () => loadConfig({ ...baseEnv, OBSERVABILITY_METRICS_ENABLED: 'true' }),
    /requires OBSERVABILITY_METRICS_TOKEN/i,
  );
  assert.throws(
    () => loadConfig({ ...baseEnv, OBSERVABILITY_METRICS_ENABLED: 'true', OBSERVABILITY_METRICS_TOKEN: 'too-short' }),
    /at least 32 characters/i,
  );
  const config = loadConfig({
    ...baseEnv,
    OBSERVABILITY_METRICS_ENABLED: 'true',
    OBSERVABILITY_METRICS_TOKEN: 'a'.repeat(40),
  });
  assert.equal(config.observabilityMetricsEnabled, true);
  assert.equal(config.observabilityMetricsToken, 'a'.repeat(40));
});

test('metrics endpoint token can be loaded from a secret file', () => {
  withConfigFile('b'.repeat(48), (file) => {
    const config = loadConfig({
      ...baseEnv,
      OBSERVABILITY_METRICS_ENABLED: 'true',
      OBSERVABILITY_METRICS_TOKEN_FILE: file,
    });
    assert.equal(config.observabilityMetricsToken, 'b'.repeat(48));
  });
});
