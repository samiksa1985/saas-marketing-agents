import assert from 'node:assert/strict';
import test from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { loadConfig } from '@platform/config';
import {
  configureProductionRuntime,
  metricsAuthorizationAllowed,
  requestIdFor,
  safeHealthResponse,
  safeReadinessResponse,
  sanitizedRuntimeSummary,
} from './production-runtime.js';

function productionConfig(trustProxy = false) {
  return loadConfig({
    NODE_ENV: 'production',
    API_PORT: '4000',
    WEB_URL: 'https://app.example.com',
    API_PUBLIC_URL: 'https://api.example.com',
    RELEASE_VERSION: '1.0.0',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    TRUST_PROXY: String(trustProxy),
    DATABASE_URL: 'postgresql://app@db.example.com/platform?sslmode=verify-full',
    WORKFLOW_RUNTIME_MODE: 'postgres',
    OIDC_ISSUER_URL: 'https://issuer.example.com',
    OIDC_AUDIENCE: 'platform-api',
    ARTIFACT_BUCKET: 'test',
    AI_PROVIDER: 'mock',
    AI_MODEL: 'test',
  });
}

test('request correlation accepts bounded safe IDs and replaces unsafe values', () => {
  assert.equal(requestIdFor('pilot-request-123'), 'pilot-request-123');
  assert.notEqual(requestIdFor('bad value with spaces'), 'bad value with spaces');
});

test('metrics access requires an exact bearer token and rejects missing or malformed credentials', () => {
  const token = 'a'.repeat(40);
  assert.equal(metricsAuthorizationAllowed(`Bearer ${token}`, token), true);
  assert.equal(metricsAuthorizationAllowed(`bearer ${token}`, token), false);
  assert.equal(metricsAuthorizationAllowed(`Bearer ${token}x`, token), false);
  assert.equal(metricsAuthorizationAllowed(undefined, token), false);
  assert.equal(metricsAuthorizationAllowed(`Bearer ${token}`, undefined), false);
});

test('runtime summary does not expose provider or database credentials', () => {
  const summary = sanitizedRuntimeSummary({
    releaseVersion: '1.0.0',
    workflowRuntimeMode: 'postgres',
    databaseUrl: 'synthetic-database-url-canary',
    googleAdsExecutionEnabled: false,
    googleAdsExecutionMode: 'DISABLED',
    metaAdsExecutionEnabled: false,
    metaAdsExecutionMode: 'DISABLED',
  } as never);
  assert.deepEqual(summary, { releaseVersion: '1.0.0' });
  assert.equal(JSON.stringify(summary).match(/token|secret|password/i), null);
  assert.equal(JSON.stringify(summary).includes('synthetic-database-url-canary'), false);
  assert.deepEqual(safeHealthResponse(), { status: 'ok', service: 'api' });
  assert.deepEqual(safeReadinessResponse(), { status: 'ready' });
});

test('production runtime disables unconfigured proxy trust and denies non-allowlisted CORS origins', () => {
  const trustSettings: unknown[][] = [];
  const middleware: Array<(request: never, response: never, next: () => void) => void> = [];
  let corsOrigin:
    | ((
        origin: string | undefined,
        callback: (error: Error | null, allowed?: boolean) => void,
      ) => void)
    | undefined;
  const app = {
    getHttpAdapter: () => ({
      getInstance: () => ({ set: (...args: unknown[]) => trustSettings.push(args) }),
    }),
    use: (handler: (request: never, response: never, next: () => void) => void) =>
      middleware.push(handler),
    enableCors: (options: { origin: typeof corsOrigin }) => {
      corsOrigin = options.origin;
    },
    useLogger: () => undefined,
    useGlobalFilters: () => undefined,
  } as unknown as INestApplication;
  const config = productionConfig();

  configureProductionRuntime(app, config);
  assert.deepEqual(trustSettings, [['trust proxy', false]]);
  assert.ok(corsOrigin);
  corsOrigin!('https://app.example.com', (error, allowed) => {
    assert.equal(error, null);
    assert.equal(allowed, true);
  });
  corsOrigin!('https://attacker.example', (error, allowed) => {
    assert.equal(error, null);
    assert.equal(allowed, false);
  });
  assert.ok(middleware.length > 0);

  const responseHeaders: Record<string, string> = {};
  let calledNext = false;
  middleware[0]!(
    { headers: {} } as never,
    {
      setHeader: (name: string, value: string) => {
        responseHeaders[name] = value;
      },
    } as never,
    () => {
      calledNext = true;
    },
  );
  assert.equal(calledNext, true);
  assert.equal(responseHeaders['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.equal(responseHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(responseHeaders['X-Frame-Options'], 'DENY');

  configureProductionRuntime(app, productionConfig(true));
  assert.deepEqual(trustSettings, [
    ['trust proxy', false],
    ['trust proxy', 1],
  ]);
});

test('untrusted forwarded protocol, host, and client IP headers do not affect Express request identity', async () => {
  const adapter = new ExpressAdapter();
  const expressApp = adapter.getInstance();
  const app = {
    getHttpAdapter: () => adapter,
    use: (handler: unknown) => expressApp.use(handler as never),
    enableCors: () => undefined,
    useLogger: () => undefined,
    useGlobalFilters: () => undefined,
  } as unknown as INestApplication;
  configureProductionRuntime(app, productionConfig());
  expressApp.get(
    '/forwarded-headers',
    (
      request: { ip?: string; protocol: string; hostname: string },
      response: { json(value: unknown): void },
    ) => {
      response.json({ ip: request.ip, protocol: request.protocol, hostname: request.hostname });
    },
  );

  const server = expressApp.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/forwarded-headers`, {
      headers: {
        'x-forwarded-for': '198.51.100.77',
        'x-forwarded-host': 'spoof.example.com',
        'x-forwarded-proto': 'https',
      },
    });
    const identity = (await response.json()) as { ip: string; protocol: string; hostname: string };
    assert.ok(identity.ip.endsWith('127.0.0.1'));
    assert.equal(identity.protocol, 'http');
    assert.equal(identity.hostname, '127.0.0.1');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error: Error | undefined) => (error ? reject(error) : resolve()));
    });
  }
});
