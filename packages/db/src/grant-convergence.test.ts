/**
 * WAVE-AB P1-002: real isolated PostgreSQL upgrade-path acceptance.
 *
 * Creates a disposable database, applies the journal through 0033 only,
 * converges grants at that posture, proves the new-table DML default-deny
 * state, applies 0034+0035, proves convergence grants workflow DML without
 * rotating credentials, and verifies control/browser-auth boundaries.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

import { applyJournalMigrations, loadJournalMigrations } from './journal-migration-runner.js';
import { productionPostgresOptions } from './postgres-connection.js';
import {
  assertBrowserAuthRuntimePrivileges,
  assertWorkflowRuntimePrivileges,
  assertWorkflowSchedulerPrivileges,
  PRODUCTION_APP_ROLE,
} from './runtime-role-verify.js';
import { sharedTestAppPassword } from './test-app-password.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Run the convergence entrypoint as a child process (top-level side effects). */
function runConvergence(migrationUrl: string): void {
  const result = spawnSync('cmd.exe', ['/c', 'npx', '--no-install', 'tsx', 'src/converge-production-grants.ts'], {
    cwd: packageRoot,
    env: { ...process.env, MIGRATION_DATABASE_URL: migrationUrl },
    encoding: 'utf8',
    timeout: 180_000,
  });
  assert.equal(result.status, 0, `grant convergence failed: ${result.stderr}`);
  assert.match(result.stdout, /"status":"ok"/);
  assert.match(result.stdout, /"passwordRotation":"skipped-converge-only"/, 'convergence must never rotate credentials');
}

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
const tlsReady = (() => {
  try {
    return ownerUrl !== undefined &&
      new URL(ownerUrl).searchParams.getAll('sslmode').join() === 'verify-full';
  } catch {
    return false;
  }
})();
const skipReason = ownerUrl
  ? 'pilot PostgreSQL must use sslmode=verify-full for upgrade acceptance'
  : 'pilot PostgreSQL unavailable';

function urlWithDatabase(database: string, role?: string, password?: string): string {
  const url = new URL(ownerUrl!);
  url.pathname = `/${database}`;
  if (role) {
    url.username = role;
    url.password = password ?? '';
  }
  return url.toString();
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Run the DB migration CLI against the isolated database (authority only). */
function runMigrationCli(migrationUrl: string): void {
  const result = spawnSync('cmd.exe', ['/c', 'npx', '--no-install', 'tsx', 'src/migrate.ts'], {
    cwd: packageRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: migrationUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      WEB_URL: 'http://localhost:3000',
      ARTIFACT_BUCKET: 'waveab-upgrade',
      AI_PROVIDER: 'mock',
      AI_MODEL: 'mock',
    },
    encoding: 'utf8',
    timeout: 300_000,
  });
  assert.equal(result.status, 0, `migration CLI failed: ${result.stderr}`);
}

/** Run the actual production deployment entrypoint (MIGRATE→CONVERGE→VERIFY). */
function runDeploymentEntrypoint(migrationUrl: string, runtimeUrl: string): void {
  const repoRoot = dirname(dirname(packageRoot));
  const script = join(repoRoot, 'scripts', 'production-migrate.ps1');
  const result = spawnSync(
    process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NAWA_PRODUCTION_MIGRATION_CONFIRM: 'APPLY',
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
        WEB_URL: 'https://web.upgrade.example.com',
        API_PUBLIC_URL: 'https://api.upgrade.example.com',
        CORS_ALLOWED_ORIGINS: 'https://web.upgrade.example.com',
        TRUST_PROXY: 'false',
        RELEASE_VERSION: 'v1.0.0',
        OIDC_ISSUER_URL: 'https://issuer.upgrade.example.com',
        OIDC_AUDIENCE: 'upgrade-acceptance',
        WORKFLOW_RUNTIME_MODE: 'postgres',
        ARTIFACT_BUCKET: 'waveab-upgrade',
        AI_PROVIDER: 'mock',
        AI_MODEL: 'mock',
      },
      encoding: 'utf8',
      timeout: 600_000,
    },
  );
  assert.equal(result.status, 0, `deployment entrypoint failed: ${result.stderr}`);
  assert.match(result.stdout, /"status":"ok"/, 'convergence step must run and report ok');
  assert.match(result.stdout, /"passwordRotation":"skipped-converge-only"/, 'deployment convergence must never rotate credentials');
  assert.match(result.stdout, /"status":"ready"/, 'production verification must run after convergence');
}

/** A failing migration step must stop the deployment entrypoint before converge/verify. */
function runDeploymentEntrypointExpectFailure(runtimeUrl: string): void {
  const repoRoot = dirname(dirname(packageRoot));
  const script = join(repoRoot, 'scripts', 'production-migrate.ps1');
  const badMigration = new URL(runtimeUrl);
  badMigration.username = 'codecore_app';
  badMigration.password = 'definitely-wrong-password-for-upgrade-gate';
  const result = spawnSync(
    process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NAWA_PRODUCTION_MIGRATION_CONFIRM: 'APPLY',
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: badMigration.toString(),
        WEB_URL: 'https://web.upgrade.example.com',
        API_PUBLIC_URL: 'https://api.upgrade.example.com',
        CORS_ALLOWED_ORIGINS: 'https://web.upgrade.example.com',
        TRUST_PROXY: 'false',
        RELEASE_VERSION: 'v1.0.0',
        OIDC_ISSUER_URL: 'https://issuer.upgrade.example.com',
        OIDC_AUDIENCE: 'upgrade-acceptance',
        WORKFLOW_RUNTIME_MODE: 'postgres',
        ARTIFACT_BUCKET: 'waveab-upgrade',
        AI_PROVIDER: 'mock',
        AI_MODEL: 'mock',
      },
      encoding: 'utf8',
      timeout: 300_000,
    },
  );
  assert.notEqual(result.status, 0, 'deployment entrypoint must fail when migration fails');
  assert.match(result.stderr, /Migration failed/, 'failure must stop before convergence/verification');
  assert.doesNotMatch(result.stdout, /"status":"ready"/, 'verification must not run after a failed migration');
}

test(
  'grant convergence: isolated 0033→0034/0035 upgrade applies workflow DML without credential rotation',
  { skip: !tlsReady && skipReason, timeout: 300_000 },
  async () => {
    const dbName = `waveab_upgrade_acceptance_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const appPassword = sharedTestAppPassword();
    const owner = postgres(ownerUrl!, productionPostgresOptions(ownerUrl!, { max: 1, prepare: false }));
    try {
      await owner.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
      await owner.unsafe(`CREATE DATABASE ${quoteIdentifier(dbName)}`);

      const migrationUrl = urlWithDatabase(dbName);
      const migration = postgres(migrationUrl, productionPostgresOptions(migrationUrl, { max: 1, prepare: false }));
      try {
        // Phase 1: apply the journal only through 0033 (browser sessions).
        const all = await loadJournalMigrations(join(packageRoot, 'drizzle'));
        const through0033 = all.filter((m) => m.entry.idx <= 33);
        await applyJournalMigrations(migration as never, through0033, () => undefined);

        // Ensure runtime role exists (cluster-global) with the known test password.
        const roleRows = Array.from(
          (await migration.unsafe(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [PRODUCTION_APP_ROLE])) as Iterable<unknown>,
        );
        if (roleRows.length === 0) {
          await migration.unsafe(
            `CREATE ROLE ${quoteIdentifier(PRODUCTION_APP_ROLE)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`,
          );
        }
        await migration.unsafe(
          `ALTER ROLE ${quoteIdentifier(PRODUCTION_APP_ROLE)} WITH PASSWORD '${appPassword.replaceAll("'", "''")}'`,
        );

        // Converge grants at the 0033 posture via the dedicated command path
        // (CODECORE_GRANTS_CONVERGE_ONLY with no rotation).
        runConvergence(migrationUrl);

        const app = postgres(
          urlWithDatabase(dbName, PRODUCTION_APP_ROLE, appPassword),
          productionPostgresOptions(urlWithDatabase(dbName, PRODUCTION_APP_ROLE, appPassword), { max: 1, prepare: false }),
        );
        try {
          // At 0033 the workflow tables do not exist yet; prove posture.
          const preTables = Array.from(
            (await app.unsafe(
              `SELECT to_regclass('public.codecore_workflow_executions') AS t`,
            )) as Iterable<{ t: string | null }>,
          );
          assert.equal(preTables[0]?.t, null, 'workflow tables must not exist at 0033');
          await assertBrowserAuthRuntimePrivileges(app, PRODUCTION_APP_ROLE);
        } finally {
          await app.end();
        }

        // Phase 2: apply 0034+ (durable runtime + scheduler boundary) through
        // the same migration CLI the deployment entrypoint wraps.
        runMigrationCli(migrationUrl);

        // Before convergence, new tables exist and runtime DML must fail with
        // a missing TABLE PRIVILEGE specifically — not an RLS denial (seed the
        // parent tenant and scope the transaction so RLS would pass).
        const denyTenant = randomUUID();
        await migration.unsafe(`INSERT INTO tenants(id, name) VALUES ($1::uuid, $2)`, [denyTenant, `upgrade-deny-${denyTenant}`]);
        const appBefore = postgres(
          urlWithDatabase(dbName, PRODUCTION_APP_ROLE, appPassword),
          productionPostgresOptions(urlWithDatabase(dbName, PRODUCTION_APP_ROLE, appPassword), { max: 1, prepare: false }),
        );
        try {
          await appBefore.begin(async (tx) => {
            await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [denyTenant]);
            let error: unknown;
            try {
              await tx.unsafe(
                `INSERT INTO codecore_workflow_executions(tenant_id, workflow_id, workflow_type, idempotency_key)
                 VALUES ($1::uuid, 'wf', 'workflow', $2)`,
                [denyTenant, `deny-${randomUUID()}`],
              );
            } catch (caught) {
              error = caught;
            }
            assert.ok(error, 'pre-convergence workflow insert must fail');
            const code = (error as { code?: string }).code;
            assert.equal(code, '42501', `expected table-privilege denial (42501), got ${String(code)}`);
            throw new Error('EXPECTED_ROLLBACK');
          }).catch((error) => {
            if ((error as Error).message !== 'EXPECTED_ROLLBACK') throw error;
          });
        } finally {
          await appBefore.end();
        }

        // Actual deployment entrypoint: MIGRATE (no-op) → CONVERGE → VERIFY.
        runDeploymentEntrypoint(migrationUrl, urlWithDatabase(dbName, PRODUCTION_APP_ROLE, appPassword));
        runDeploymentEntrypointExpectFailure(urlWithDatabase(dbName, PRODUCTION_APP_ROLE, appPassword));

        const appAfter = postgres(
          urlWithDatabase(dbName, PRODUCTION_APP_ROLE, appPassword),
          productionPostgresOptions(urlWithDatabase(dbName, PRODUCTION_APP_ROLE, appPassword), { max: 2, prepare: false }),
        );
        try {
          await assertWorkflowRuntimePrivileges(appAfter, PRODUCTION_APP_ROLE);
          await assertWorkflowSchedulerPrivileges(appAfter, PRODUCTION_APP_ROLE);
          await assertBrowserAuthRuntimePrivileges(appAfter, PRODUCTION_APP_ROLE);

          // Runtime workflow DML now succeeds within an authoritative tenant scope.
          const tenant = randomUUID();
          await appAfter.unsafe(`INSERT INTO tenants(id, name) VALUES($1::uuid, $2)`, [tenant, `upgrade-tenant-${tenant}`]).catch(async (error) => {
            // tenants is a control table: runtime cannot seed it. Seed as owner.
            await migration.unsafe(`INSERT INTO tenants(id, name) VALUES($1::uuid, $2)`, [tenant, `upgrade-tenant-${tenant}`]);
            void error;
          });
          const claim = await appAfter.unsafe(
            `SELECT * FROM public.codecore_claim_workflow_execution('upgrade-worker', 30000)`,
          );
          // Nothing eligible yet; the function must still execute successfully.
          assert.ok(Array.isArray(claim));
          const scoped = await appAfter.begin(async (tx) => {
            await tx.unsafe(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
            return tx.unsafe(
              `INSERT INTO codecore_workflow_executions(tenant_id, workflow_id, workflow_type, idempotency_key)
               VALUES ($1::uuid, 'wf-upgrade', 'workflow', $2) RETURNING id`,
              [tenant, `upgrade-${randomUUID()}`],
            );
          });
          assert.equal(scoped.length, 1, 'workflow DML must succeed after convergence within tenant scope');

          // Control-table mutation remains denied.
          await assert.rejects(
            () => appAfter.unsafe(`UPDATE tenant_members SET status = 'inactive' WHERE false`),
            /permission denied/i,
          );
          // Browser-auth direct access remains denied.
          await assert.rejects(
            () => appAfter.unsafe(`SELECT count(*) FROM codecore_web_sessions`),
            /permission denied/i,
          );
        } finally {
          await appAfter.end();
        }
      } finally {
        await migration.end();
      }
    } finally {
      await owner.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
      await owner.end();
    }
  },
);
