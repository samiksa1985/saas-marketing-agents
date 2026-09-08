import test from 'node:test';
import assert from 'node:assert/strict';

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
