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
  },
);

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
  },
);