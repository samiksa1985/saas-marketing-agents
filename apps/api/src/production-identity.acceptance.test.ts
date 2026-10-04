/**
 * WS-PROD-04 live runtime acceptance: the real Growth OS API booted with a
 * REAL locally generated OIDC provider (RS256 keys + discovery/JWKS fixture),
 * running against the disposable pilot PostgreSQL as the codecore_app runtime
 * identity (never the migration owner). Proves the full chain at HTTP level:
 *
 *   Bearer token -> OIDC verification -> authoritative tenant_membership ->
 *   TenantContext -> server-side permission checks -> RLS tenant scope.
 *
 * Also proves the production local-acceptance lockout and the non-production
 * pilot path regression. Credentials are never printed.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import postgres from 'postgres';

const apiRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(dirname(dirname(apiRoot)));
const dbPackageRoot = join(repoRoot, 'packages', 'db');

const API_PORT = 4199;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const PILOT_API_PORT = 4200;
const PILOT_API_BASE = `http://127.0.0.1:${PILOT_API_PORT}`;

const SUBJECT_ADMIN = 'wsp04-live-admin';
const SUBJECT_VIEWER = 'wsp04-live-viewer';
const SUBJECT_UNKNOWN = 'wsp04-live-unknown';

function resolvePilotDatabaseUrl(): string | undefined {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) return envUrl;
  try {
    const passwordFile = join(homedir(), '.nawa-secrets', 'phase1-postgres-password.txt');
    const password = readFileSync(passwordFile, 'utf8').trim();
    if (!password) return undefined;
    return `postgresql://phase1_owner:${encodeURIComponent(password)}@127.0.0.1:55432/ai_marketing_phase1`;
  } catch {
    return undefined;
  }
}

const ownerUrl = resolvePilotDatabaseUrl();

async function pilotDatabaseReachable(url: string): Promise<boolean> {
  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 5 });
  try {
    await client.unsafe('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 0 }).catch(() => undefined);
  }
}

/** Same session file as packages/db integration suites: the cluster-global
 * codecore_app credential must converge across concurrently running suites. */
function sharedTestAppPassword(): string {
  const file = join(tmpdir(), 'codecore-app-test-password');
  try {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing.length >= 32 && Date.now() - statSync(file).mtimeMs < 86_400_000) return existing;
  } catch { /* created below */ }
  const fresh = randomBytes(24).toString('hex');
  try {
    writeFileSync(file, fresh, { flag: 'wx', mode: 0o600 });
  } catch { /* another suite won the create race */ }
  return readFileSync(file, 'utf8').trim();
}

function urlAsAppRole(): string {
  const url = new URL(ownerUrl!);
  url.username = 'codecore_app';
  url.password = sharedTestAppPassword();
  return url.toString();
}

function hasVerifiedTls(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).searchParams.getAll('sslmode').join() === 'verify-full';
  } catch {
    return false;
  }
}

function asVerifiedTlsUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}

interface FixtureIdp {
  issuer: string;
  audience: string;
  server: Server;
  sign: (claims: Record<string, unknown>, options?: { audience?: string; expired?: boolean; omitExpiration?: boolean }) => Promise<string>;
  attackerSign: (claims: Record<string, unknown>) => Promise<string>;
}

async function startFixtureIdp(): Promise<FixtureIdp> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const attacker = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'wsp04-live-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const audience = 'growth-os-api';
  const server = createServer((request, response) => {
    const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    if (request.url === '/.well-known/openid-configuration') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks.json` }));
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
  const sign = (
    claims: Record<string, unknown>,
    options: { audience?: string; expired?: boolean; omitExpiration?: boolean } = {},
  ): Promise<string> => {
    const token = new SignJWT({ tenant_id: claims.tenant_id, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'wsp04-live-key' })
      .setIssuer(issuer)
      .setAudience(options.audience ?? audience)
      .setSubject(String(claims.sub))
      .setIssuedAt();
    if (!options.omitExpiration) {
      token.setExpirationTime(options.expired ? new Date(Date.now() - 60_000) : '5m');
    }
    return token.sign(privateKey as never);
  };
  const attackerSign = (claims: Record<string, unknown>): Promise<string> =>
    new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'wsp04-live-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(String(claims.sub))
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(attacker.privateKey as never);
  return { issuer, audience, server, sign, attackerSign };
}

function baseApiEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    WEB_URL: 'http://localhost:3000',
    DATABASE_URL: databaseUrl,
    DATABASE_URL_FILE: '',
    TEMPORAL_ADDRESS: 'localhost:7233',
    TEMPORAL_NAMESPACE: 'wsp04-acceptance',
    ARTIFACT_BUCKET: 'wsp04-artifacts',
    AI_PROVIDER: 'mock',
    AI_MODEL: 'foundation-mock',
  };
}

async function startApi(port: number, env: NodeJS.ProcessEnv): Promise<{ child: ChildProcess; logs: string[] }> {
  const logs: string[] = [];
  const child = spawn(process.execPath, ['--import', 'tsx', 'main.ts'], {
    cwd: apiRoot,
    env: { ...env, API_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  const deadline = Date.now() + 180_000;
  for (;;) {
    const tail = () => logs.join('').slice(-4000);
    if (child.exitCode !== null) {
      killPortListeners(port);
      throw new Error(`API exited before listening (code ${child.exitCode}): ${tail()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return { child, logs };
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      child.kill();
      killPortListeners(port);
      throw new Error(`API did not become healthy: ${tail()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function stopApi(child: ChildProcess, port: number): Promise<void> {
  if (child.exitCode !== null) {
    killPortListeners(port);
    return;
  }
  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 8000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  killPortListeners(port);
}

function killPortListeners(port: number): void {
  // cmd.exe wrapper may leave the grandchild; terminate anything on the port best-effort on Windows.
  if (process.platform === 'win32') {
    spawnSync('cmd.exe', ['/c', 'for /f "tokens=5" %a in (\'netstat -ano ^| findstr LISTENING ^| findstr :' + port + '\') do taskkill /PID %a /F'], { stdio: 'ignore' });
  }
}

function provisionAppRole(): void {
  const result = spawnSync(
    'cmd.exe',
    ['/c', 'npx', '--no-install', 'tsx', 'scripts/provision-production-roles.ts'],
    {
      cwd: dbPackageRoot,
      env: {
        ...process.env,
        DATABASE_URL: ownerUrl!,
        MIGRATION_DATABASE_URL: ownerUrl!,
        CODECORE_APP_PASSWORD: sharedTestAppPassword(),
      },
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  const diagnostics = `${result.stderr ?? ''}${result.error ? `\n${String(result.error)}` : ''}`.trim();
  assert.equal(result.status, 0, `provisioning failed: ${diagnostics || 'unknown error'}`);
}

test('WS-PROD-04 live acceptance: OIDC + authoritative membership + codecore_app runtime', { skip: !ownerUrl && 'pilot database unavailable', timeout: 300_000 }, async (t) => {
  if (!(await pilotDatabaseReachable(ownerUrl!))) {
    t.skip('pilot database unavailable');
    return;
  }
  provisionAppRole();
  const owner = postgres(ownerUrl!, { max: 1, prepare: false });
  const idp = await startFixtureIdp();
  let api: { child: ChildProcess; logs: string[] } | undefined;
  let artifactPermissionId: string | undefined;
  let createdArtifactPermission = false;
  let adminRoleId: string | undefined;
  let viewerRoleId: string | undefined;
  let insertedAdminGrant = false;
  let removedViewerGrant = false;
  try {
    const tenant = Array.from(
      (await owner.unsafe(`SELECT id::text AS id FROM tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`)) as Iterable<{ id: string }>,
    )[0];
    assert.ok(tenant, 'pilot tenant must exist');
    const artifactPermission = Array.from(
      (await owner.unsafe(
        `SELECT id::text AS id FROM permissions WHERE name = 'artifact:read' LIMIT 1`,
      )) as Iterable<{ id: string }>,
    )[0];
    if (artifactPermission) {
      artifactPermissionId = artifactPermission.id;
    } else {
      const insertedPermission = Array.from(
        (await owner.unsafe(
          `INSERT INTO permissions (name, description)
           VALUES ('artifact:read', 'WS-PROD-04 live acceptance test permission seed')
           RETURNING id::text AS id`,
        )) as Iterable<{ id: string }>,
      )[0];
      assert.ok(insertedPermission, 'artifact:read permission seed insert must return an id');
      artifactPermissionId = insertedPermission.id;
      createdArtifactPermission = true;
    }

    const canonicalRoles = new Map(
      Array.from(
        (await owner.unsafe(
          `SELECT id::text AS id, name
           FROM roles
           WHERE name IN ('tenant_admin','viewer')`,
        )) as Iterable<{ id: string; name: string }>,
      ).map((row) => [row.name, row.id]),
    );
    adminRoleId = canonicalRoles.get('tenant_admin');
    viewerRoleId = canonicalRoles.get('viewer');
    assert.ok(adminRoleId, 'tenant_admin role must be seeded');
    assert.ok(viewerRoleId, 'viewer role must be seeded');

    const adminGrantPresent = Array.from(
      (await owner.unsafe(
        `SELECT 1
         FROM role_permissions
         WHERE role_id = $1::uuid AND permission_id = $2::uuid
         LIMIT 1`,
        [adminRoleId, artifactPermissionId],
      )) as Iterable<unknown>,
    ).length > 0;
    if (!adminGrantPresent) {
      await owner.unsafe(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1::uuid, $2::uuid)`,
        [adminRoleId, artifactPermissionId],
      );
      insertedAdminGrant = true;
    }

    const viewerGrantPresent = Array.from(
      (await owner.unsafe(
        `SELECT 1
         FROM role_permissions
         WHERE role_id = $1::uuid AND permission_id = $2::uuid
         LIMIT 1`,
        [viewerRoleId, artifactPermissionId],
      )) as Iterable<unknown>,
    ).length > 0;
    if (viewerGrantPresent) {
      await owner.unsafe(
        `DELETE FROM role_permissions
         WHERE role_id = $1::uuid AND permission_id = $2::uuid`,
        [viewerRoleId, artifactPermissionId],
      );
      removedViewerGrant = true;
    }

    for (const [subject, roleId] of [[SUBJECT_ADMIN, adminRoleId], [SUBJECT_VIEWER, viewerRoleId]] as const) {
      await owner.unsafe(`INSERT INTO users (subject, display_name) VALUES ($1, $1) ON CONFLICT (subject) DO NOTHING`, [subject]);
      const user = Array.from(
        (await owner.unsafe(`SELECT id::text AS id FROM users WHERE subject = $1`, [subject])) as Iterable<{ id: string }>,
      )[0]!;
      await owner.unsafe(
        `INSERT INTO tenant_members (tenant_id, user_id, role_id, status) VALUES ($1::uuid, $2::uuid, $3::uuid, 'active')
         ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        [tenant.id, user.id, roleId],
      );
    }

    api = await startApi(API_PORT, {
      ...baseApiEnv(urlAsAppRole()),
      OIDC_ISSUER_URL: idp.issuer,
      OIDC_AUDIENCE: idp.audience,
    });

    // 1-2. Health + readiness prove the API operates on the runtime identity.
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.status, 200);
    const ready = await fetch(`${API_BASE}/ready`);
    assert.equal(ready.status, 200, 'readiness must succeed connecting as codecore_app only');

    const call = (path: string, token?: string) =>
      fetch(`${API_BASE}${path}`, token ? { headers: { authorization: `Bearer ${token}` } } : {});

    // A. No auth -> 401
    assert.equal((await call('/provider-integrations/bindings')).status, 401);
    // B. Invalid auth -> 401 (garbage, bad audience, expired, forged signature)
    assert.equal((await call('/provider-integrations/bindings', 'not-a-jwt')).status, 401);
    const wrongAudience = await idp.sign({ sub: SUBJECT_ADMIN, tenant_id: tenant.id }, { audience: 'other-api' });
    assert.equal((await call('/provider-integrations/bindings', wrongAudience)).status, 401);
    const expired = await idp.sign({ sub: SUBJECT_ADMIN, tenant_id: tenant.id }, { expired: true });
    assert.equal((await call('/provider-integrations/bindings', expired)).status, 401);
    const withoutExpiration = await idp.sign(
      { sub: SUBJECT_ADMIN, tenant_id: tenant.id },
      { omitExpiration: true },
    );
    assert.equal((await call('/provider-integrations/bindings', withoutExpiration)).status, 401);
    const forged = await idp.attackerSign({ sub: SUBJECT_ADMIN, tenant_id: tenant.id });
    assert.equal((await call('/provider-integrations/bindings', forged)).status, 401);

    // C. Valid identity but arbitrary/foreign tenant selection -> 401
    const unknownSubject = await idp.sign({ sub: SUBJECT_UNKNOWN, tenant_id: tenant.id });
    assert.equal((await call('/provider-integrations/bindings', unknownSubject)).status, 401);
    const foreignTenant = await idp.sign({ sub: SUBJECT_ADMIN, tenant_id: randomUUID() });
    const foreignResponse = await call('/provider-integrations/bindings', foreignTenant);
    assert.equal(foreignResponse.status, 401);

    // D. Valid identity + authoritative membership (tenant_admin) -> 200
    const admin = await idp.sign({ sub: SUBJECT_ADMIN, tenant_id: tenant.id });
    const authorized = await call('/provider-integrations/bindings', admin);
    assert.equal(authorized.status, 200);

    // E. Valid identity without the required permission -> 403
    const viewer = await idp.sign({ sub: SUBJECT_VIEWER, tenant_id: tenant.id });
    assert.equal((await call('/provider-integrations/bindings', viewer)).status, 403, 'viewer role must not read artifact-gated bindings');

    // Secret hygiene: error responses must never echo tokens.
    const leakCheck = await call('/provider-integrations/bindings', admin);
    const body = await leakCheck.text();
    for (const secret of [admin, viewer, forged, expired, withoutExpiration, wrongAudience]) {
      assert.equal(body.includes(secret), false, 'responses must never contain bearer tokens');
    }
  } finally {
    if (api) await stopApi(api.child, API_PORT);
    await new Promise((resolve) => idp.server.close(resolve));
    await owner.unsafe(`DELETE FROM tenant_members WHERE user_id IN (SELECT id FROM users WHERE subject IN ($1, $2, $3))`, [SUBJECT_ADMIN, SUBJECT_VIEWER, SUBJECT_UNKNOWN]).catch(() => undefined);
    await owner.unsafe(`DELETE FROM users WHERE subject IN ($1, $2, $3)`, [SUBJECT_ADMIN, SUBJECT_VIEWER, SUBJECT_UNKNOWN]).catch(() => undefined);
    if (insertedAdminGrant && adminRoleId && artifactPermissionId) {
      await owner.unsafe(
        `DELETE FROM role_permissions
         WHERE role_id = $1::uuid AND permission_id = $2::uuid`,
        [adminRoleId, artifactPermissionId],
      ).catch(() => undefined);
    }
    if (removedViewerGrant && viewerRoleId && artifactPermissionId) {
      await owner.unsafe(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1::uuid, $2::uuid)
         ON CONFLICT DO NOTHING`,
        [viewerRoleId, artifactPermissionId],
      ).catch(() => undefined);
    }
    if (createdArtifactPermission && artifactPermissionId) {
      await owner.unsafe(`DELETE FROM role_permissions WHERE permission_id = $1::uuid`, [artifactPermissionId]).catch(() => undefined);
      await owner.unsafe(`DELETE FROM permissions WHERE id = $1::uuid`, [artifactPermissionId]).catch(() => undefined);
    }
    await owner.end();
  }
});

test('WS-PROD-04 production lockout: local acceptance auth cannot boot in production', { skip: !ownerUrl && 'pilot database unavailable', timeout: 120_000 }, async () => {
  const tokenDir = mkdtempSync(join(tmpdir(), 'wsp04-lockout-'));
  const tokenFile = join(tokenDir, 'token.txt');
  writeFileSync(tokenFile, randomBytes(48).toString('base64url'));
  try {
    const child = spawn(process.execPath, ['--import', 'tsx', 'main.ts'], {
      cwd: apiRoot,
      env: {
        ...baseApiEnv(asVerifiedTlsUrl(urlAsAppRole())),
        API_PORT: '4299',
        NODE_ENV: 'production',
        WEB_URL: 'https://web.wsp04.example.com',
        API_PUBLIC_URL: 'https://api.wsp04.example.com',
        CORS_ALLOWED_ORIGINS: 'https://web.wsp04.example.com',
        TRUST_PROXY: 'false',
        RELEASE_VERSION: '1.0.0',
        OIDC_ISSUER_URL: 'https://issuer.wsp04.example.com',
        OIDC_AUDIENCE: 'growth-os-api',
        WORKFLOW_RUNTIME_MODE: 'postgres',
        LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
        LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: tokenFile,
        LOCAL_ACCEPTANCE_AUTH_TENANT_ID: randomUUID(),
        LOCAL_ACCEPTANCE_AUTH_USER_ID: 'wsp04',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const logs: string[] = [];
    child.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
    const exitCode = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 60_000);
      child.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    assert.notEqual(exitCode, 0, 'production must refuse to start with local acceptance auth enabled');
    assert.match(logs.join(''), /LOCAL_ACCEPTANCE_AUTH_ENABLED is forbidden in production/);
  } finally {
    rmSync(tokenDir, { recursive: true, force: true });
  }
});

test('production API refuses to listen with migration-owner database authority', { skip: !hasVerifiedTls(ownerUrl) && 'pilot database must use sslmode=verify-full', timeout: 60_000 }, async (t) => {
  if (!(await pilotDatabaseReachable(ownerUrl!))) {
    t.skip('pilot database unavailable');
    return;
  }
  const child = spawn(process.execPath, ['--import', 'tsx', 'main.ts'], {
    cwd: apiRoot,
    env: {
      ...baseApiEnv(ownerUrl!),
      API_PORT: '4298',
      NODE_ENV: 'production',
      WEB_URL: 'https://web.wsp04.example.com',
      API_PUBLIC_URL: 'https://api.wsp04.example.com',
      CORS_ALLOWED_ORIGINS: 'https://web.wsp04.example.com',
      TRUST_PROXY: 'false',
      RELEASE_VERSION: '1.0.0',
      OIDC_ISSUER_URL: 'https://issuer.wsp04.example.com',
      OIDC_AUDIENCE: 'growth-os-api',
      WORKFLOW_RUNTIME_MODE: 'postgres',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs: string[] = [];
  child.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  const exitCode = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 45_000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  assert.notEqual(exitCode, null, 'API must reject unsafe database authority before listening');
  assert.notEqual(exitCode, 0);
  assert.match(logs.join(''), /PRODUCTION_RUNTIME_USER_(?:SUPERUSER|IS_MIGRATION_OWNER)/);
});

test('WS-PROD-04 pilot regression: explicit local acceptance still works outside production', { skip: !ownerUrl && 'pilot database unavailable', timeout: 180_000 }, async (t) => {
  if (!(await pilotDatabaseReachable(ownerUrl!))) {
    t.skip('pilot database unavailable');
    return;
  }
  const tokenDir = mkdtempSync(join(tmpdir(), 'wsp04-pilot-'));
  const tokenFile = join(tokenDir, 'token.txt');
  const pilotToken = randomBytes(48).toString('base64url');
  writeFileSync(tokenFile, pilotToken);
  const owner = postgres(ownerUrl!, { max: 1, prepare: false });
  let api: { child: ChildProcess; logs: string[] } | undefined;
  try {
    const tenant = Array.from(
      (await owner.unsafe(`SELECT id::text AS id FROM tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`)) as Iterable<{ id: string }>,
    )[0]!;
    api = await startApi(PILOT_API_PORT, {
      ...baseApiEnv(urlAsAppRole()),
      LOCAL_ACCEPTANCE_AUTH_ENABLED: 'true',
      LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE: tokenFile,
      LOCAL_ACCEPTANCE_AUTH_TENANT_ID: tenant.id,
      LOCAL_ACCEPTANCE_AUTH_USER_ID: 'wsp04-pilot-user',
    });
    // Without the token: fail closed.
    assert.equal((await fetch(`${PILOT_API_BASE}/provider-integrations/bindings`)).status, 401);
    // With the token: accepted on the explicitly enabled local path.
    const withToken = await fetch(`${PILOT_API_BASE}/provider-integrations/bindings`, {
      headers: { authorization: `Bearer ${pilotToken}` },
    });
    assert.equal(withToken.status, 200);
    assert.equal((await withToken.text()).includes(pilotToken), false);
  } finally {
    if (api) await stopApi(api.child, PILOT_API_PORT);
    await owner.end();
    rmSync(tokenDir, { recursive: true, force: true });
  }
});
