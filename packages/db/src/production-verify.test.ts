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
import {
  PRODUCTION_APP_ROLE,
  assertNoProtectedTablesOwnedByRuntime,
  assertRuntimeRoleHasNoMemberships,
  assertRuntimeRoleIsSafe,
} from './runtime-role-verify.js';
import { assertMigrationAuthority } from './migration-url.js';
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
  const migrationUrl = new URL(ownerUrl!);
  migrationUrl.pathname = new URL(databaseUrl).pathname;
  return {
    ...baseConfigEnv(),
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    MIGRATION_DATABASE_URL: migrationUrl.toString(),
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
  return spawnTsx('scripts/provision-production-roles.ts', {
    ...baseConfigEnv(),
    MIGRATION_DATABASE_URL: ownerUrl!,
    ...extraEnv,
  });
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

const testRole = (name: string) => `wsp02_${name}`;
// Shared across concurrently running DB integration suites (see module doc).
const appPassword = sharedTestAppPassword();

test('cross-tenant probe fails closed on prerequisite errors and missing own-tenant data', async () => {
  const makeClient = (failAt?: number, emptyOwnRead = false) => {
    let call = 0;
    const transaction: {
      unsafe: (query: string) => Promise<unknown>;
      savepoint: <T>(operation: (tx: typeof transaction) => Promise<T>) => Promise<T>;
    } = {
      unsafe: async (query: string) => {
        call += 1;
        if (call === 10) {
          throw Object.assign(
            new Error('new row violates row-level security policy for table "marketing_memory_records"'),
            { code: '42501' },
          );
        }
        if (call === failAt) {
          throw Object.assign(new Error('permission denied'), { code: '42501' });
        }
        if (query.includes('SELECT 1 AS one FROM marketing_memory_records')) {
          return call === 5 && !emptyOwnRead ? [{ one: 1 }] : [];
        }
        if (query.includes('UPDATE marketing_memory_records') || query.includes('DELETE FROM marketing_memory_records')) {
          return [];
        }
        if (query.includes('SELECT statement FROM marketing_memory_records')) {
          return [{ statement: 'probe fixture (rolled back)' }];
        }
        return [];
      },
      savepoint: async (operation) => operation(transaction),
    };
    return {
      begin: async (operation: (tx: typeof transaction) => Promise<void>) => {
        try {
          await operation(transaction);
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'CROSS_TENANT_PROBE_ROLLBACK') throw error;
        }
      },
    };
  };

  for (const failAt of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    await assert.rejects(
      () => runCrossTenantProbe(makeClient(failAt)),
      /permission denied/,
      `prerequisite call ${failAt} must not be interpreted as isolation`,
    );
  }
  await assert.rejects(
    () => runCrossTenantProbe(makeClient(undefined, true)),
    /PROBE_SANITY_OWN_TENANT_FAILED/,
  );
  assert.deepEqual(await runCrossTenantProbe(makeClient()), {
    table: 'marketing_memory_records',
    selectIsolation: true,
    insertIsolation: true,
    updateIsolation: true,
    deleteIsolation: true,
  });
});

test('G: role provisioning converges codecore_app and is idempotent', { skip: !dbAvailable && skipReason }, async () => {
  const first = runProvision({ MIGRATION_DATABASE_URL: ownerUrl!, CODECORE_APP_PASSWORD: appPassword });
  assert.equal(first.status, 0, `first provisioning failed: ${first.stderr}`);
  assert.equal(first.json?.status, 'ok');

  const second = runProvision({ MIGRATION_DATABASE_URL: ownerUrl!, CODECORE_APP_PASSWORD: appPassword });
  assert.equal(second.status, 0, `second provisioning failed: ${second.stderr}`);
  assert.equal(second.json?.status, 'ok');

  // Assert absence of secrets in any output channel.
  for (const output of [first.stdout, first.stderr, second.stdout, second.stderr]) {
    assert.equal(output.includes(appPassword), false, 'provisioning must never print the password');
  }

  const client = postgres(ownerUrl!, { max: 1, prepare: false });
  const escalatedRole = testRole('escalation');
  const defaultPrivilegeTable = testRole('default_privileges');
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

    for (const table of ['tenants', 'users', 'roles', 'permissions', 'role_permissions', 'tenant_members']) {
      const privileges = Array.from(
        (await client.unsafe(
          `SELECT has_table_privilege($1, $2, 'SELECT') AS can_select,
                  has_table_privilege($1, $2, 'INSERT') AS can_insert,
                  has_table_privilege($1, $2, 'UPDATE') AS can_update,
                  has_table_privilege($1, $2, 'DELETE') AS can_delete`,
          [PRODUCTION_APP_ROLE, `public.${table}`],
        )) as Iterable<{ can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>,
      )[0]!;
      assert.equal(privileges.can_select, true, `${table} must remain readable for membership resolution`);
      assert.deepEqual(
        [privileges.can_insert, privileges.can_update, privileges.can_delete],
        [false, false, false],
        `${table} authorization/control writes must not be granted to runtime`,
      );
    }

    await client.unsafe(`DROP TABLE IF EXISTS public.${quoteIdentifier(defaultPrivilegeTable)}`);
    await client.unsafe(
      `CREATE TABLE public.${quoteIdentifier(defaultPrivilegeTable)} (id uuid PRIMARY KEY, payload text)`,
    );
    const futurePrivileges = Array.from(
      (await client.unsafe(
        `SELECT has_table_privilege($1, $2, 'SELECT') AS can_select,
                has_table_privilege($1, $2, 'INSERT') AS can_insert,
                has_table_privilege($1, $2, 'UPDATE') AS can_update,
                has_table_privilege($1, $2, 'DELETE') AS can_delete`,
        [PRODUCTION_APP_ROLE, `public.${defaultPrivilegeTable}`],
      )) as Iterable<{ can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>,
    )[0]!;
    assert.deepEqual(
      [futurePrivileges.can_select, futurePrivileges.can_insert, futurePrivileges.can_update, futurePrivileges.can_delete],
      [true, false, false, false],
      'future tables must not inherit broad runtime DML privileges',
    );

    await client.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(escalatedRole)}`);
    await client.unsafe(`CREATE ROLE ${quoteIdentifier(escalatedRole)} NOLOGIN CREATEDB`);
    await client.unsafe(`GRANT ${quoteIdentifier(escalatedRole)} TO ${quoteIdentifier(PRODUCTION_APP_ROLE)}`);
    await assert.rejects(() => assertRuntimeRoleHasNoMemberships(client), /PRODUCTION_RUNTIME_ROLE_MEMBERSHIP_FORBIDDEN/);

    const app = postgres(urlAsRole(PRODUCTION_APP_ROLE, appPassword), { max: 1, prepare: false });
    try {
      await app.unsafe(`SET ROLE ${quoteIdentifier(escalatedRole)}`);
      assert.equal(
        Array.from(await app.unsafe('SELECT current_user AS name') as Iterable<{ name: string }>)[0]?.name,
        escalatedRole,
        'the adversarial membership must demonstrate SET ROLE before provisioning',
      );
    } finally {
      await app.end();
    }

    const repaired = runProvision({ MIGRATION_DATABASE_URL: ownerUrl!, CODECORE_APP_PASSWORD: appPassword });
    assert.equal(repaired.status, 0, `membership convergence failed: ${repaired.stderr}`);
    const postProvisionApp = postgres(urlAsRole(PRODUCTION_APP_ROLE, appPassword), { max: 1, prepare: false });
    try {
      await assert.rejects(
        () => postProvisionApp.unsafe(`SET ROLE ${quoteIdentifier(escalatedRole)}`),
        /permission denied to set role|must be member of role/i,
      );
      for (const table of ['tenants', 'users', 'roles', 'permissions', 'role_permissions', 'tenant_members']) {
        await assert.rejects(() => postProvisionApp.unsafe(`INSERT INTO public.${table} DEFAULT VALUES`), /permission denied/i);
        const columns = Array.from(
          (await client.unsafe(
            `SELECT a.attname
             FROM pg_attribute a
             WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped
               AND a.attgenerated = '' AND a.attidentity = ''
             ORDER BY a.attnum LIMIT 1`,
            [`public.${table}`],
          )) as Iterable<{ attname: string }>,
        );
        assert.ok(columns[0], `${table} must have an ordinary column for the UPDATE denial probe`);
        const column = quoteIdentifier(columns[0].attname);
        await assert.rejects(
          () => postProvisionApp.unsafe(`UPDATE public.${table} SET ${column} = ${column} WHERE false`),
          /permission denied/i,
        );
        await assert.rejects(() => postProvisionApp.unsafe(`DELETE FROM public.${table} WHERE false`), /permission denied/i);
      }
    } finally {
      await postProvisionApp.end();
    }
  } finally {
    await client.unsafe(`DROP TABLE IF EXISTS public.${quoteIdentifier(defaultPrivilegeTable)}`).catch(() => undefined);
    await client.unsafe(`REVOKE ${quoteIdentifier(escalatedRole)} FROM ${quoteIdentifier(PRODUCTION_APP_ROLE)}`).catch(() => undefined);
    await client.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(escalatedRole)}`).catch(() => undefined);
    await client.end();
  }
});

test('production migration authority accepts the migration role and rejects codecore_app', { skip: !dbAvailable && skipReason }, async () => {
  const migrationClient = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    const migrationRole = await assertMigrationAuthority(migrationClient);
    assert.notEqual(migrationRole, PRODUCTION_APP_ROLE);
  } finally {
    await migrationClient.end();
  }

  assert.equal(runProvision({ MIGRATION_DATABASE_URL: ownerUrl!, CODECORE_APP_PASSWORD: appPassword }).status, 0);
  const runtimeClient = postgres(urlAsRole(PRODUCTION_APP_ROLE, appPassword), { max: 1, prepare: false });
  try {
    await assert.rejects(
      () => assertMigrationAuthority(runtimeClient),
      /PRODUCTION_MIGRATION_ROLE_IS_RUNTIME/,
    );
  } finally {
    await runtimeClient.end();
  }
});

test('A: verifier rejects a superuser runtime connection', { skip: !dbAvailable && skipReason }, async () => {
  // Function-level proof: the pilot owner identity is superuser and its
  // session_user is not codecore_app, so the session identity check fires first.
  const probe = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    await assert.rejects(() => assertRuntimeRoleIsSafe(probe), /PRODUCTION_RUNTIME_SESSION_USER_NOT_CODECORE_APP/);
  } finally {
    await probe.end();
  }

  // End-to-end proof through the production verify entrypoint.
  const result = runVerify(productionConfigEnv(ownerUrl!));
  assert.notEqual(result.status, 0, `superuser runtime must fail closed: ${result.stdout}`);
  assert.equal(result.json?.code, 'PRODUCTION_RUNTIME_SESSION_USER_NOT_CODECORE_APP');
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
    assert.equal(result.json?.code, 'PRODUCTION_RUNTIME_SESSION_USER_NOT_CODECORE_APP');
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
      `CREATE ROLE ${quoteIdentifier(role)} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`,
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

    await assert.rejects(
      () => assertNoProtectedTablesOwnedByRuntime(owner, role),
      /PRODUCTION_RUNTIME_OWNS_TENANT_TABLES/,
    );
    const result = runVerify(productionConfigEnv(urlAsRole(role, password)));
    assert.notEqual(result.status, 0);
    assert.equal(result.json?.code, 'PRODUCTION_RUNTIME_SESSION_USER_NOT_CODECORE_APP');
  } finally {
    await owner.unsafe(`DROP TABLE IF EXISTS public.${table}`).catch(() => undefined);
    await owner.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`).catch(() => undefined);
    await owner.end();
  }
});

test('E: verifier rejects a privileged session_user masquerading as codecore_app', { skip: !dbAvailable && skipReason }, async () => {
  // A superuser session can SET ROLE to codecore_app, making current_user
  // codecore_app while session_user remains the privileged owner. This must
  // fail closed before any tenant data is touched.
  const owner = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    await owner.unsafe(`SET ROLE ${quoteIdentifier(PRODUCTION_APP_ROLE)}`);
    await assert.rejects(
      () => assertRuntimeRoleIsSafe(owner),
      /PRODUCTION_RUNTIME_SESSION_USER_NOT_CODECORE_APP/,
    );
  } finally {
    await owner.unsafe(`SET ROLE NONE`).catch(() => undefined);
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
  assert.equal(result.json?.crossTenantInsertIsolation, 'enforced');
  assert.equal(result.json?.crossTenantUpdateIsolation, 'enforced');
  assert.equal(result.json?.crossTenantDeleteIsolation, 'enforced');
  assert.equal(result.json?.crossTenantWriteIsolation, 'enforced', 'production verify must prove cross-tenant write isolation');
  assert.match(String(result.json?.migrations), /^\d+$/);
});

test('cross-tenant probe proves SELECT, INSERT, UPDATE, and DELETE isolation with rollback', { skip: !dbAvailable && skipReason }, async () => {
  const client = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    const result = await runCrossTenantProbe(client, { appRole: PRODUCTION_APP_ROLE });
    assert.deepEqual(result, {
      table: 'marketing_memory_records',
      selectIsolation: true,
      insertIsolation: true,
      updateIsolation: true,
      deleteIsolation: true,
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

test('RLS verifier rejects a permissive or bypassing tenant-table policy', { skip: !dbAvailable && skipReason }, async () => {
  const table = 'marketing_memory_records';
  const bypassPolicy = 'wsp02_unscoped_policy';
  const missingUsingPolicy = 'wsp02_missing_using_policy';
  const policies = [bypassPolicy, missingUsingPolicy];
  const owner = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    // Permissive predicates that bypass or omit tenant scoping must be rejected.
    for (const policy of policies) {
      await owner.unsafe(`DROP POLICY IF EXISTS ${quoteIdentifier(policy)} ON public.${table}`);
    }
    await owner.unsafe(
      `CREATE POLICY ${quoteIdentifier(bypassPolicy)} ON public.${table} FOR ALL
       USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR true)
       WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR true)`,
    );
    await owner.unsafe(
      `CREATE POLICY ${quoteIdentifier(missingUsingPolicy)} ON public.${table} FOR ALL
       WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
  } finally {
    await owner.end();
  }
  try {
    assert.equal(runProvision({ CODECORE_APP_PASSWORD: appPassword }).status, 0);
    const result = runVerify(productionConfigEnv(urlAsRole(PRODUCTION_APP_ROLE, appPassword)));
    assert.notEqual(result.status, 0);
    assert.equal(result.json?.code, 'TENANT_POLICY_COVERAGE_GAP');
  } finally {
    const cleanup = postgres(ownerUrl!, { max: 1, prepare: false });
    try {
      for (const policy of policies) {
        await cleanup.unsafe(`DROP POLICY IF EXISTS ${quoteIdentifier(policy)} ON public.${table}`);
      }
    } finally {
      await cleanup.end();
    }
  }
});

test('RLS verifier rejects a policy on a quoted identifier collision', { skip: !dbAvailable && skipReason }, async () => {
  // A table with both the real tenant_id column and a quoted "TENANT_ID"
  // column must not satisfy coverage with a policy on the quoted impostor.
  const table = 'wsp02_quoted_tenant_collision';
  const policy = 'wsp02_quoted_tenant_policy';
  const owner = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    await owner.unsafe(`DROP TABLE IF EXISTS public.${quoteIdentifier(table)}`);
    await owner.unsafe(
      `CREATE TABLE public.${quoteIdentifier(table)} (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        "TENANT_ID" uuid NOT NULL
      )`,
    );
    await owner.unsafe(`ALTER TABLE public.${quoteIdentifier(table)} ENABLE ROW LEVEL SECURITY`);
    await owner.unsafe(
      `CREATE POLICY ${quoteIdentifier(policy)} ON public.${quoteIdentifier(table)} FOR ALL
       USING ("TENANT_ID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
       WITH CHECK ("TENANT_ID" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    );
  } finally {
    await owner.end();
  }
  try {
    assert.equal(runProvision({ CODECORE_APP_PASSWORD: appPassword }).status, 0);
    const result = runVerify(productionConfigEnv(urlAsRole(PRODUCTION_APP_ROLE, appPassword)));
    assert.notEqual(result.status, 0);
    assert.equal(result.json?.code, 'TENANT_POLICY_COVERAGE_GAP');
  } finally {
    const cleanup = postgres(ownerUrl!, { max: 1, prepare: false });
    try {
      await cleanup.unsafe(`DROP POLICY IF EXISTS ${quoteIdentifier(policy)} ON public.${quoteIdentifier(table)}`);
      await cleanup.unsafe(`DROP TABLE IF EXISTS public.${quoteIdentifier(table)}`);
    } finally {
      await cleanup.end();
    }
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
