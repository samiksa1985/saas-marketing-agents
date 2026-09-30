/**
 * WS-PROD-03 real end-to-end DR drill against the disposable Growth OS pilot
 * PostgreSQL container. Proves: backup creation + structural validation, an
 * isolated restore (never touching the canonical database), role/grant
 * re-provisioning, restore verification, production verification, and
 * cross-tenant isolation on the restored environment — then cleans up only
 * resources created by this test.
 *
 * Gated off (skipped) when the pilot database or docker container is absent.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { sharedTestAppPassword } from './test-app-password.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(packageRoot));
const backupScript = join(repositoryRoot, 'scripts', 'backup-postgres.ps1');
const restoreScript = join(repositoryRoot, 'scripts', 'restore-postgres-isolated.ps1');

const DOCKER_CONTAINER = process.env.PG_DOCKER_CONTAINER ?? 'nawa-growth-phase1-postgres-1';
const TEST_RUN_ID = randomUUID().replaceAll('-', '').slice(0, 12);
const ISOLATED_DB = `wsp03_restore_acceptance_${TEST_RUN_ID}`;
const CORRUPT_DB = `wsp03_corrupt_artifact_acceptance_${TEST_RUN_ID}`;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function resolvePilotDatabaseUrl(): string | undefined {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) return envUrl;
  try {
    const passwordFile = join(homedir(), '.nawa-secrets', 'phase1-postgres-password.txt');
    const password = readFileSync(passwordFile, 'utf8').trim();
    if (!password) return undefined;
    const portMapping = spawnSync('docker', ['port', DOCKER_CONTAINER, '5432/tcp'], { encoding: 'utf8' });
    if (portMapping.status !== 0) return undefined;
    const binding = portMapping.stdout.trim().split(/\r?\n/)[0];
    const match = /^(.+):(\d+)$/.exec(binding ?? '');
    if (!match?.[1] || !match[2]) return undefined;
    const host = match[1].replace(/^\[|\]$/g, '');
    const connectionHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
    return `postgresql://phase1_owner:${encodeURIComponent(password)}@${connectionHost}:${match[2]}/ai_marketing_phase1`;
  } catch {
    return undefined;
  }
}

const ownerUrl = resolvePilotDatabaseUrl();

function urlWithDatabase(database: string, role?: string, password?: string): string {
  const url = new URL(ownerUrl!);
  url.pathname = `/${database}`;
  if (role) {
    url.username = role;
    url.password = password ?? '';
  }
  return url.toString();
}

function dockerAvailable(): boolean {
  const probe = spawnSync('docker', ['exec', DOCKER_CONTAINER, 'pg_isready', '-q'], { encoding: 'utf8' });
  return probe.status === 0;
}

const prerequisites = ownerUrl !== undefined && dockerAvailable();
const skipReason = 'pilot PostgreSQL container or DATABASE_URL secret unavailable';

interface SpawnedJson {
  status: number | null;
  stdout: string;
  stderr: string;
  json: Record<string, unknown> | undefined;
}

function lastJson(stdout: string, stderr: string): Record<string, unknown> | undefined {
  const line = `${stdout}\n${stderr}`
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{') && l.endsWith('}'))
    .at(-1);
  if (!line) return undefined;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function runPowerShell(script: string, args: string[], env: NodeJS.ProcessEnv): SpawnedJson {
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const result = spawnSync(
    shell,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
    { env, cwd: repositoryRoot, encoding: 'utf8', timeout: 600_000 },
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return { status: result.status, stdout, stderr, json: lastJson(stdout, stderr) };
}

function runTsx(script: string, env: NodeJS.ProcessEnv): SpawnedJson {
  const result = spawnSync('cmd.exe', ['/c', 'npx', '--no-install', 'tsx', script], {
    env,
    cwd: packageRoot,
    encoding: 'utf8',
    timeout: 300_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return { status: result.status, stdout, stderr, json: lastJson(stdout, stderr) };
}

function drillEnv(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: ownerUrl!,
    WEB_URL: 'http://localhost:3000',
    TEMPORAL_ADDRESS: 'localhost:7233',
    TEMPORAL_NAMESPACE: 'default',
    ARTIFACT_BUCKET: 'wsp03-drill-artifacts',
    AI_PROVIDER: 'mock',
    AI_MODEL: 'foundation-mock',
    PG_DOCKER_CONTAINER: DOCKER_CONTAINER,
    ...extra,
  };
}

function productionEnv(databaseUrl: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const migrationDatabase = new URL(databaseUrl).pathname.replace(/^\//, '');
  return drillEnv({
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    MIGRATION_DATABASE_URL: urlWithDatabase(migrationDatabase),
    WEB_URL: 'https://drill.wsp03.example.test',
    CORS_ALLOWED_ORIGINS: 'https://drill.wsp03.example.test',
    TRUST_PROXY: 'false',
    RELEASE_VERSION: 'v1.0.0',
    OIDC_ISSUER_URL: 'https://issuer.wsp03.example.test',
    OIDC_AUDIENCE: 'wsp03-drill',
    ...extra,
  });
}

async function canonicalSnapshot(client: ReturnType<typeof postgres>): Promise<{ tenants: number; migrations: number; databases: string[] }> {
  const tenants = Array.from(
    (await client.unsafe('SELECT count(*)::int AS count FROM tenants')) as Iterable<{ count: number }>,
  )[0]!;
  const migrations = Array.from(
    (await client.unsafe('SELECT count(*)::int AS count FROM "drizzle"."__drizzle_migrations"')) as Iterable<{ count: number }>,
  )[0]!;
  const databases = Array.from(
    (await client.unsafe('SELECT datname FROM pg_database ORDER BY datname')) as Iterable<{ datname: string }>,
  ).map((d) => d.datname);
  return { tenants: Number(tenants.count), migrations: Number(migrations.count), databases };
}

test('WS-PROD-03 DR drill: backup, isolated restore, role model, isolation probes on restored DB', { skip: !prerequisites && skipReason }, async () => {
  const workDir = mkdtempSync(join(tmpdir(), 'wsp03-drill-'));
  // Shared across concurrently running DB integration suites (see module doc).
  const appPassword = sharedTestAppPassword();
  const owner = postgres(ownerUrl!, { max: 1, prepare: false });
  const timings: Record<string, number> = {};
  try {
    // Defensive cleanup: a prior interrupted run may have left the isolated
    // target behind. Terminate connections and drop it before asserting freshness.
    await owner.unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [ISOLATED_DB]).catch(() => undefined);
    await owner.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(ISOLATED_DB)}`).catch(() => undefined);

    const before = await canonicalSnapshot(owner);
    assert.ok(before.tenants > 0, 'canonical pilot must contain representative tenant data');
    assert.ok(before.migrations > 0, 'canonical pilot must have a migration ledger');
    assert.equal(before.databases.includes(ISOLATED_DB), false, 'isolated target must not pre-exist');

    // 1. BACKUP_CREATED + BACKUP_STRUCTURALLY_VALID (validated inside the script).
    let startedAt = Date.now();
    const backup = runPowerShell(backupScript, ['-BackupOutputDirectory', workDir, '-Label', 'wsp03drill'], drillEnv({ NAWA_BACKUP_CONFIRM: 'YES' }));
    timings.backupMs = Date.now() - startedAt;
    assert.equal(backup.status, 0, `backup failed: ${backup.stderr}`);
    assert.equal(backup.json?.status, 'verified');
    const backupFile = String(backup.json?.backupFile);
    assert.match(backupFile, /nawa-backup-ai_marketing_phase1-.*wsp03drill\.dump$/);
    const manifest = JSON.parse(
      readFileSync(String(backup.json?.manifest), 'utf8').replace(/^﻿/, ''),
    ) as Record<string, unknown>;
    assert.equal(manifest.database, 'ai_marketing_phase1');
    assert.equal(typeof manifest.timestampUtc, 'string');
    assert.ok(Number(manifest.sizeBytes) > 1024, 'backup artifact must not be trivially small');
    assert.match(String(manifest.sha256), /^[0-9a-f]{64}$/);
    assert.match(String(manifest.pgDumpVersion), /pg_dump/);
    // Artifact and manifest must never carry credentials.
    for (const text of [backup.stdout, backup.stderr, readFileSync(backupFile === '' ? '.' : String(backup.json?.manifest), 'utf8')]) {
      assert.equal(text.includes(String(new URL(ownerUrl!).password)), false, 'credentials must never appear in backup output/manifest');
    }

    // A canonical target with different credentials must be rejected before
    // target creation or pg_restore --clean can touch the database.
    const canonicalAttempt = runPowerShell(
      restoreScript,
      ['-BackupFile', backupFile, '-CreateDatabase'],
      drillEnv({
        NAWA_ISOLATED_RESTORE_CONFIRM: 'YES',
        ISOLATED_RESTORE_DATABASE_URL: urlWithDatabase(
          new URL(ownerUrl!).pathname.replace(/^\//, ''),
          'different_user',
          'different_password',
        ),
        PG_RESTORE_PATH: join(workDir, 'must-not-be-resolved.exe'),
      }),
    );
    assert.notEqual(canonicalAttempt.status, 0);
    assert.match(canonicalAttempt.stderr, /RESTORE_TARGET_CANONICAL_DATABASE/);
    assert.deepEqual(await canonicalSnapshot(owner), before, 'canonical data and database inventory must remain untouched');

    // 2. RESTORE_TARGET_ISOLATED + RESTORE_COMPLETED (separate disposable DB).
    startedAt = Date.now();
    const restore = runPowerShell(
      restoreScript,
      ['-BackupFile', backupFile, '-CreateDatabase'],
      drillEnv({
        NAWA_ISOLATED_RESTORE_CONFIRM: 'YES',
        ISOLATED_RESTORE_DATABASE_URL: urlWithDatabase(ISOLATED_DB),
      }),
    );
    timings.restoreMs = Date.now() - startedAt;
    assert.equal(restore.status, 0, `isolated restore failed: ${restore.stderr}`);
    assert.equal(restore.json?.status, 'restored');
    assert.equal(restore.json?.database, ISOLATED_DB);

    // 3. ROLE_MODEL_REESTABLISHED: deliberately re-provision runtime grants and
    //    the codecore_app credential on the restored database (roles are
    //    cluster-global; grants/default privileges are per-database and are
    //    NOT restored from a --no-privileges dump by design).
    const migrationUrl = urlWithDatabase(ISOLATED_DB);
    const restoredAuthority = postgres(migrationUrl, { max: 1, prepare: false });
    try {
      const rows = Array.from((await restoredAuthority.unsafe('SELECT current_database() AS name')) as Iterable<{ name: string }>);
      assert.equal(rows[0]?.name, ISOLATED_DB);
    } finally {
      await restoredAuthority.end();
    }
    const provision = runTsx('scripts/provision-production-roles.ts', drillEnv({
      MIGRATION_DATABASE_URL: migrationUrl,
      CODECORE_APP_PASSWORD: appPassword,
    }));
    assert.equal(provision.status, 0, `role re-provisioning failed: ${provision.stderr}`);
    assert.equal(provision.json?.status, 'ok');
    assert.equal(provision.stdout.includes(appPassword), false, 'password must never be printed');

    // 4. RESTORE VERIFICATION: ledger, schema, pgvector, RLS, policies,
    //    representative data, ownership under migration authority.
    const restoreVerify = runTsx('src/restore-verify.ts', drillEnv({ DATABASE_URL: urlWithDatabase(ISOLATED_DB) }));
    assert.equal(restoreVerify.status, 0, `restore verification failed: ${restoreVerify.stderr}`);
    assert.equal(restoreVerify.json?.status, 'verified');
    assert.equal(restoreVerify.json?.migrations, before.migrations, 'MIGRATION_LEDGER_VALID');
    assert.equal(restoreVerify.json?.pgvector, 'valid', 'PGVECTOR_VALID');
    assert.equal(restoreVerify.json?.rlsPolicies, 'present', 'TENANT_POLICIES_VALID');
    assert.equal(Number(restoreVerify.json?.tenantTables) > 0, true, 'RLS_VALID tenant tables restored');
    assert.equal(restoreVerify.json?.tenants, before.tenants, 'representative tenant data must match the source');
    assert.equal(restoreVerify.json?.ownership, 'migration-authority');

    // 5. PRODUCTION_VERIFY_PASS + CROSS_TENANT_SELECT_BLOCKED + CROSS_TENANT_WRITE_BLOCKED
    //    against the restored database, connecting as the runtime identity.
    const verify = runTsx('src/production-verify.ts', productionEnv(urlWithDatabase(ISOLATED_DB, 'codecore_app', appPassword)));
    assert.equal(verify.status, 0, `production verify on restored DB failed: ${verify.stderr}`);
    assert.equal(verify.json?.status, 'ready');
    assert.equal(verify.json?.runtimeRole, 'codecore_app');
    assert.equal(verify.json?.runtimeRoleSafe, true);
    assert.equal(verify.json?.crossTenantSelectIsolation, 'enforced', 'cross-tenant SELECT must be blocked after restore');
    assert.equal(verify.json?.crossTenantWriteIsolation, 'enforced', 'cross-tenant WRITE must be blocked after restore');

    // 6. CANONICAL_DB_UNCHANGED.
    const after = await canonicalSnapshot(owner);
    assert.deepEqual(after.databases, [...before.databases, ISOLATED_DB].sort(), 'only the isolated database may be added');
    assert.equal(after.tenants, before.tenants, 'canonical tenant data must be untouched');
    assert.equal(after.migrations, before.migrations, 'canonical migration ledger must be untouched');

    console.log(`DR_DRILL_EVIDENCE=${JSON.stringify({
      backupCreated: true,
      backupStructurallyValid: true,
      restoreTargetIsolated: true,
      restoreCompleted: true,
      migrationLedgerValid: true,
      pgvectorValid: true,
      rlsValid: true,
      tenantPoliciesValid: true,
      roleModelReestablished: true,
      crossTenantSelectBlocked: true,
      crossTenantWriteBlocked: true,
      productionVerifyPass: true,
      canonicalDbUnchanged: true,
      backupMs: timings.backupMs,
      restoreMs: timings.restoreMs,
      sizeBytes: Number(manifest.sizeBytes),
    })}`);
  } finally {
    await owner.unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [ISOLATED_DB]).catch(() => undefined);
    await owner.unsafe(`DROP DATABASE IF EXISTS ${ISOLATED_DB}`).catch(() => undefined);
    await owner.end();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('backup tooling fails closed without explicit confirmation', () => {
  const result = runPowerShell(backupScript, ['-BackupOutputDirectory', tmpdir()], drillEnv({ NAWA_BACKUP_CONFIRM: '' }));
  assert.notEqual(result.status, 0);
});

test('restore target guards reject malformed URLs, query parameters, and source identity', () => {
  const runGuard = (target: string, source = ownerUrl!, createDatabase = false) => {
    const args = ['-BackupFile', 'missing.dump'];
    if (createDatabase) { args.push('-CreateDatabase'); }
    return runPowerShell(
      restoreScript,
      args,
      drillEnv({
        DATABASE_URL: source,
        ISOLATED_RESTORE_DATABASE_URL: target,
        NAWA_ISOLATED_RESTORE_CONFIRM: 'YES',
      }),
    );
  };
  const targetUrl = (database: string, username = 'restore_user', password = 'restore_password') => {
    const url = new URL(ownerUrl!);
    url.username = username;
    url.password = password;
    url.pathname = `/${database}`;
    return url.toString();
  };

  const markerInUsername = runGuard(targetUrl('plain_target', 'restore_user'));
  assert.match(markerInUsername.stderr, /isolated restore\/recovery database/i);
  const hostWithMarker = new URL(targetUrl('plain_target'));
  hostWithMarker.hostname = 'restore-host.example';
  const markerInHost = runGuard(hostWithMarker.toString());
  assert.match(markerInHost.stderr, /isolated restore\/recovery database/i);
  const queryWithMarker = new URL(targetUrl('plain_target'));
  queryWithMarker.search = '?mode=restore';
  const markerInQuery = runGuard(queryWithMarker.toString());
  assert.match(markerInQuery.stderr, /POSTGRES_CONNECTION_IDENTITY_FAILED/);
  const encodedPathTrick = runGuard(targetUrl('wsp03%2Frestore'));
  assert.match(encodedPathTrick.stderr, /POSTGRES_CONNECTION_IDENTITY_FAILED/);

  const canonicalWithDifferentCredentials = runGuard(
    targetUrl('ai_marketing_phase1', 'different_user', 'different_password'),
  );
  assert.match(canonicalWithDifferentCredentials.stderr, /RESTORE_TARGET_CANONICAL_DATABASE/);
  const encodedCanonicalUrl = new URL(targetUrl('ai_marketing_phase1', 'different_user', 'different_password'));
  encodedCanonicalUrl.pathname = '/%61i_marketing_phase1';
  const encodedCanonical = runGuard(encodedCanonicalUrl.toString());
  assert.match(encodedCanonical.stderr, /RESTORE_TARGET_CANONICAL_DATABASE/);

  const sameSourceDifferentCredentials = runGuard(
    targetUrl('wsp03_restore_source', 'different_user', 'different_password'),
    targetUrl('wsp03_restore_source', 'source_user', 'source_password'),
  );
  assert.match(sameSourceDifferentCredentials.stderr, /RESTORE_TARGET_MATCHES_SOURCE_DATABASE/);

  // Without -CreateDatabase the target must already exist for identity proof.
  const validIsolatedMissing = runGuard(urlWithDatabase('wsp03_restore_acceptance'));
  assert.match(validIsolatedMissing.stderr, /RESTORE_TARGET_DATABASE_MISSING|Backup file does not exist/);

  // With -CreateDatabase the target must not exist; the backup file is then the
  // first hard failure.
  const validIsolatedCreate = runGuard(urlWithDatabase('wsp03_restore_acceptance_create'), ownerUrl!, true);
  assert.match(validIsolatedCreate.stderr, /Backup file does not exist/);
});

test('restore fails closed before invoking restore tools for canonical targets', () => {
  const result = runPowerShell(
    restoreScript,
    ['-BackupFile', join(tmpdir(), 'valid-looking-backup.dump'), '-CreateDatabase'],
    drillEnv({
      NAWA_ISOLATED_RESTORE_CONFIRM: 'YES',
      ISOLATED_RESTORE_DATABASE_URL: urlWithDatabase('ai_marketing_phase1', 'different_user', 'different_password'),
      PG_RESTORE_PATH: join(tmpdir(), 'must-not-be-resolved-before-target-validation.exe'),
    }),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RESTORE_TARGET_CANONICAL_DATABASE/);
});

test('restore tooling fails closed for missing and corrupt artifacts', { skip: !prerequisites && skipReason }, async () => {
  const missing = runPowerShell(restoreScript, ['-BackupFile', join(tmpdir(), 'wsp03-does-not-exist.dump')], drillEnv({
    NAWA_ISOLATED_RESTORE_CONFIRM: 'YES',
    ISOLATED_RESTORE_DATABASE_URL: urlWithDatabase(ISOLATED_DB),
  }));
  assert.notEqual(missing.status, 0);

  const corruptDb = CORRUPT_DB;
  const owner = postgres(ownerUrl!, { max: 1, prepare: false });
  try {
    await owner.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(corruptDb)}`);
  } finally {
    await owner.end();
  }

  const corrupt = join(mkdtempSync(join(tmpdir(), 'wsp03-corrupt-')), 'corrupt.dump');
  writeFileSync(corrupt, Buffer.from('this is not a pg_dump custom archive'));
  try {
    const unreadable = runPowerShell(restoreScript, ['-BackupFile', corrupt, '-CreateDatabase'], drillEnv({
      NAWA_ISOLATED_RESTORE_CONFIRM: 'YES',
      ISOLATED_RESTORE_DATABASE_URL: urlWithDatabase(corruptDb),
    }));
    assert.notEqual(unreadable.status, 0);
    assert.equal(Number((unreadable.stderr.match(/BACKUP_ARTIFACT_UNREADABLE|restore failed/i) ?? []).length) > 0, true, `expected unreadable-artifact failure, got: ${unreadable.stderr}`);
  } finally {
    rmSync(dirname(corrupt), { recursive: true, force: true });
    const cleanup = postgres(ownerUrl!, { max: 1, prepare: false });
    try {
      await cleanup.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(corruptDb)}`);
    } finally {
      await cleanup.end();
    }
  }
});

test('restore verification refuses to run against a canonical database name', { skip: !prerequisites && skipReason }, () => {
  const result = runTsx('src/restore-verify.ts', drillEnv({ DATABASE_URL: ownerUrl! }));
  assert.notEqual(result.status, 0);
  assert.equal(result.json?.code, 'RESTORE_TARGET_NOT_ISOLATED');
});
