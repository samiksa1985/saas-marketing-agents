/**
 * WS-PROD-02 real-PostgreSQL security tests against the disposable pilot
 * database (docker service nawa-growth-phase1-postgres-1, database
 * ai_marketing_phase1). Role attributes, RLS enforcement, and cross-tenant
 * isolation cannot be faithfully tested with mocks — the spec (A–J) requires
 * real PostgreSQL semantics.
 *
 * Connection resolution order:
 *   1. DATABASE_URL from the environment (CI / explicit invocation)
 *   2. The local pilot secret file outside the repository, exactly as
 *      scripts/start-local-pilot.ps1 resolves it (~/.nawa-secrets/...).
 * Passwords are never printed or asserted as strings.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { runCrossTenantProbe } from './cross-tenant-probe.js';
import { PRODUCTION_APP_ROLE, assertRuntimeRoleIsSafe } from './runtime-role-verify.js';
import { sharedTestAppPassword } from './test-app-password.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
const skipReason = 'pilot PostgreSQL unavailable (DATABASE_URL unset and no local pilot secret file)';
const dbAvailable = ownerUrl !== undefined;

function urlAsRole(role: string, password: string): string {
  const url = new URL(ownerUrl!);
  url.username = role;
  url.password = password;
  return url.toString();
}

interface SpawnedJson {
  status: number | null;
  stdout: string;
  stderr: string;
  json: Record<string, unknown> | undefined;
}

function spawnTsx(script: string, env: NodeJS.ProcessEnv): SpawnedJson {
  const result = spawnSync('cmd.exe', ['/c', 'npx', '--no-install', 'tsx', script], {
    cwd: packageRoot,
    env,
    encoding: 'utf8',
    timeout: 180_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = `${result.stderr ?? ''}${result.error ? `\n${String(result.error)}` : ''}`;
  const jsonLine = `${stdout}\n${stderr}`
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'))
    .at(-1);
  let json: Record<string, unknown> | undefined;
  if (jsonLine) {
    try {
      json = JSON.parse(jsonLine) as Record<string, unknown>;
    } catch {
      json = undefined;
    }
  }
  return { status: result.status, stdout, stderr, json };
}

function baseConfigEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: ownerUrl!,
    WEB_URL: 'http://localhost:3000',
    TEMPORAL_ADDRESS: 'localhost:7233',
    TEMPORAL_NAMESPACE: 'default',
    ARTIFACT_BUCKET: 'wsp02-test-artifacts',
    AI_PROVIDER: 'mock',
    AI_MODEL: 'foundation-mock',
  };
}

function productionConfigEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...baseConfigEnv(),
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    WEB_URL: 'https://pilot.wsp02.example.test',
    CORS_ALLOWED_ORIGINS: 'https://pilot.wsp02.example.test',
    TRUST_PROXY: 'false',
    RELEASE_VERSION: 'v1.0.0',
    OIDC_ISSUER_URL: 'https://issuer.wsp02.example.test',
    OIDC_AUDIENCE: 'wsp02-pilot',
  };
}

function runVerify(env: NodeJS.ProcessEnv): SpawnedJson {
  return spawnTsx('src/production-verify.ts', env);
}

function runProvision(extraEnv: NodeJS.ProcessEnv = {}): SpawnedJson {
  return spawnTsx('scripts/provision-production-roles.ts', { ...baseConfigEnv(), ...extraEnv });
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

const testRole = (name: string) => `wsp02_${name}`;
// Shared across concurrently running DB integration suites (see module doc).
const appPassword = sharedTestAppPassword();

test('G: role provisioning converges codecore_app and is idempotent', { skip: !dbAvailable && skipReason }, async () => {
  const first = runProvision({ CODECORE_APP_PASSWORD: appPassword });
  assert.equal(first.status, 0, `first provisioning failed: ${first.stderr}`);
  assert.equal(first.json?.status, 'ok');

  const second = runProvision({ CODECORE_APP_PASSWORD: appPassword });
  assert.equal(second.status, 0, `second provisioning failed: ${second.stderr}`);
  assert.equal(second.json?.status, 'ok');

  // Assert absence of secrets in any output channel.
  for (const output of [first.stdout, first.stderr, second.stdout, second.stderr]) {
    assert.equal(output.includes(appPassword), false, 'provisioning must never print the password');
  }

  const client = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    const rows = Array.from(
      (await client.unsafe(
        `SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
         FROM pg_roles WHERE rolname = $1`,
        [PRODUCTION_APP_ROLE],
      )) as Iterable<Record<string, boolean>>,
    );
    assert.equal(rows.length, 1, 'codecore_app must exist after provisioning');
    assert.deepEqual(rows[0], {
      rolcanlogin: true,
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });

    const owned = Array.from(
      (await client.unsafe(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND pg_get_userbyid(c.relowner) = $1
           AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)`,
        [PRODUCTION_APP_ROLE],
      )) as Iterable<{ relname: string }>,
    );
    assert.deepEqual(owned, [], 'codecore_app must not own protected tenant tables');
  } finally {
    await client.end();
  }
});

test('A: verifier rejects a superuser runtime connection', { skip: !dbAvailable && skipReason }, async () => {
  // Function-level proof: the pilot owner identity is superuser.
  const probe = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    await assert.rejects(() => assertRuntimeRoleIsSafe(probe), /PRODUCTION_RUNTIME_USER_SUPERUSER/);
  } finally {
    await probe.end();
  }

  // End-to-end proof through the production verify entrypoint.
  const result = runVerify(productionConfigEnv(ownerUrl!));
  assert.notEqual(result.status, 0, `superuser runtime must fail closed: ${result.stdout}`);
  assert.equal(result.json?.code, 'PRODUCTION_RUNTIME_USER_SUPERUSER');
});

test('B: verifier rejects a BYPASSRLS runtime role', { skip: !dbAvailable && skipReason }, async () => {
  const role = testRole('bypass');
  const password = randomBytes(24).toString('hex');
  const owner = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    await owner.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
    await owner.unsafe(
      `CREATE ROLE ${quoteIdentifier(role)} LOGIN NOSUPERUSER BYPASSRLS PASSWORD '${password}'`,
    );
    const result = runVerify(productionConfigEnv(urlAsRole(role, password)));
    assert.notEqual(result.status, 0);
    assert.equal(result.json?.code, 'PRODUCTION_RUNTIME_USER_BYPASSRLS');
  } finally {
    await owner.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`).catch(() => undefined);
    await owner.end();
  }
});

test('C: verifier rejects a runtime role that owns protected tenant tables', { skip: !dbAvailable && skipReason }, async () => {
  const role = testRole('owning');
  const password = randomBytes(24).toString('hex');
  const table = 'wsp02_owned_tenant';
  const owner = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    await owner.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
    await owner.unsafe(
      `CREATE ROLE ${quoteIdentifier(role)} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
    );
    await owner.unsafe(`DROP TABLE IF EXISTS public.${table}`);
    await owner.unsafe(
      `CREATE TABLE public.${table} (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, payload text)`,
    );
    // Keep global RLS-coverage checks green for this tenant-scoped table.
    await owner.unsafe(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await owner.unsafe(
      `CREATE POLICY ${table}_tenant_policy ON public.${table} FOR ALL
       USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
       WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
    await owner.unsafe(`ALTER TABLE public.${table} OWNER TO ${quoteIdentifier(role)}`);

    const result = runVerify(productionConfigEnv(urlAsRole(role, password)));
    assert.notEqual(result.status, 0);
    assert.equal(result.json?.code, 'PRODUCTION_RUNTIME_OWNS_TENANT_TABLES');
  } finally {
    await owner.unsafe(`DROP TABLE IF EXISTS public.${table}`).catch(() => undefined);
    await owner.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`).catch(() => undefined);
    await owner.end();
  }
});

test('D: verifier accepts a correctly configured codecore_app runtime authority', { skip: !dbAvailable && skipReason }, () => {
  // Re-provision immediately before verification: idempotent and races safely
  // with any other suite that legitimately rotates the application credential.
  assert.equal(runProvision({ CODECORE_APP_PASSWORD: appPassword }).status, 0);
  const appUrl = urlAsRole(PRODUCTION_APP_ROLE, appPassword);
  const result = runVerify(productionConfigEnv(appUrl));
  assert.equal(result.status, 0, `codecore_app runtime must verify: ${result.stderr}`);
  assert.equal(result.json?.status, 'ready');
  assert.equal(result.json?.runtimeRole, PRODUCTION_APP_ROLE);
  assert.equal(result.json?.runtimeRoleSafe, true);
  assert.equal(result.json?.tenantPolicyCoverage, 'enabled');
  assert.equal(result.json?.crossTenantSelectIsolation, 'enforced', 'production verify must prove cross-tenant SELECT isolation');
  assert.equal(result.json?.crossTenantWriteIsolation, 'enforced', 'production verify must prove cross-tenant write isolation');
  assert.match(String(result.json?.migrations), /^\d+$/);
});

test('E/F: cross-tenant probe proves SELECT and WRITE isolation with a rolled-back transaction', { skip: !dbAvailable && skipReason }, async () => {
  const client = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    const result = await runCrossTenantProbe(client, { appRole: PRODUCTION_APP_ROLE });
    assert.deepEqual(result, {
      table: 'marketing_memory_records',
      selectIsolation: true,
      writeIsolation: true,
    });

    // No persistent probe data may remain (transaction must have rolled back).
    const leftovers = Array.from(
      (await client.unsafe(
        `SELECT count(*)::int AS count FROM tenants WHERE name LIKE 'ws-prod-02-probe-%'`,
      )) as Iterable<{ count: number }>,
    );
    assert.equal(Number(leftovers[0]?.count ?? -1), 0, 'probe tenants must roll back');
    const fixtureLeftovers = Array.from(
      (await client.unsafe(
        `SELECT count(*)::int AS count FROM marketing_memory_records WHERE scope = 'ws-prod-02-probe'`,
      )) as Iterable<{ count: number }>,
    );
    assert.equal(Number(fixtureLeftovers[0]?.count ?? -1), 0, 'probe fixtures must roll back');
  } finally {
    await client.end();
  }
});

test('I + J: development verification keeps existing behavior and skips production-only role checks', { skip: !dbAvailable && skipReason }, () => {
  const result = runVerify({ ...baseConfigEnv(), NODE_ENV: 'development' });
  assert.equal(result.status, 0, `local pilot verification must keep passing: ${result.stderr}`);
  assert.equal(result.json?.status, 'ready');
  assert.equal(result.json?.pgvector, 'enabled');
  assert.equal(result.json?.tenantRls, 'enabled');
  assert.equal('runtimeRoleSafe' in (result.json ?? {}), false);
  assert.equal('crossTenantSelectIsolation' in (result.json ?? {}), false);
});

test('probe data is transaction-local and survives repeated verifier runs', { skip: !dbAvailable && skipReason }, () => {
  assert.equal(runProvision({ CODECORE_APP_PASSWORD: appPassword }).status, 0);
  const appUrl = urlAsRole(PRODUCTION_APP_ROLE, appPassword);
  const rerun = runVerify(productionConfigEnv(appUrl));
  assert.equal(rerun.status, 0, `verify must be repeatable: ${rerun.stderr}`);
});
