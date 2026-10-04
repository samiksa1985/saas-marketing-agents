import { fileURLToPath } from 'node:url';
import { loadConfig } from '@platform/config';
import postgres from 'postgres';
import { loadJournalMigrations } from './journal-migration-runner.js';
import {
  PRODUCTION_APP_ROLE,
  assertBrowserAuthRuntimePrivileges,
  assertExpectedProductionRoles,
  assertProductionRuntimeAuthority,
  assertRlsPolicyCoverage,
  assertWorkflowRuntimePrivileges,
} from './runtime-role-verify.js';
import { runCrossTenantProbe } from './cross-tenant-probe.js';
import { assertMigrationAuthority, resolveMigrationDatabaseUrl } from './migration-url.js';
import { productionPostgresOptions } from './postgres-connection.js';

const config = loadConfig();
const client = postgres(
  config.databaseUrl,
  productionPostgresOptions(config.databaseUrl, { max: 1, prepare: false }),
);
const migrationsDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));

try {
  const result: Record<string, string | number | boolean> = {};

  // Strict runtime-authority verification applies ONLY in production so the
  // accepted local pilot (phase1_owner superuser) is not broken. Identity
  // checks run first: an unsafe runtime authority must fail closed even
  // before the ledger/shape checks execute.
  let runtimeRole: string | undefined;
  if (config.nodeEnv === 'production') {
    runtimeRole = await assertProductionRuntimeAuthority(client);
    await assertBrowserAuthRuntimePrivileges(client, runtimeRole);
    await assertWorkflowRuntimePrivileges(client, runtimeRole);
    await assertExpectedProductionRoles(client);
  }

  const expected = await loadJournalMigrations(migrationsDirectory);
  const ledger = await client.unsafe('SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at');
  const applied = Array.from(ledger as Iterable<{ created_at: number }>).map((row) => Number(row.created_at));
  const expectedLatest = expected.at(-1)?.entry.when;
  if (applied.length !== expected.length || applied.at(-1) !== expectedLatest) throw new Error('MIGRATION_LEDGER_NOT_CURRENT');
  result.migrations = expected.length;

  const vector = await client.unsafe("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
  if (Array.from(vector as Iterable<unknown>).length !== 1) throw new Error('PGVECTOR_EXTENSION_MISSING');
  result.pgvector = 'enabled';

  const rlsGaps = await client.unsafe(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
      AND NOT c.relrowsecurity
  `);
  if (Array.from(rlsGaps as Iterable<unknown>).length > 0) throw new Error('TENANT_RLS_NOT_ENABLED');
  result.tenantRls = 'enabled';

  if (config.nodeEnv === 'production') {
    await assertRlsPolicyCoverage(client);
    // Behavioral RLS verification must use the ACTUAL runtime connection
    // (codecore_app) rather than impersonating that role from the migration
    // authority. The migration/owner connection is used only to seed and clean
    // up the synthetic tenant fixtures.
    const migrationUrl = resolveMigrationDatabaseUrl(process.env, config.databaseUrl, config.nodeEnv);
    const migrationClient = postgres(
      migrationUrl,
      productionPostgresOptions(migrationUrl, { max: 1, prepare: false }),
    );
    let probe: Awaited<ReturnType<typeof runCrossTenantProbe>>;
    try {
      await assertMigrationAuthority(migrationClient);
      probe = await runCrossTenantProbe(client, { appRole: PRODUCTION_APP_ROLE, seedClient: migrationClient });
    } finally {
      await migrationClient.end();
    }
    result.runtimeRole = runtimeRole!;
    result.appRole = PRODUCTION_APP_ROLE;
    result.runtimeRoleSafe = true;
    result.browserAuthAuthority = 'restricted-functions';
    result.workflowRuntimeAuthority = 'allowlisted';
    result.tenantPolicyCoverage = 'enabled';
    result.crossTenantSelectIsolation = probe.selectIsolation ? 'enforced' : 'unproven';
    result.crossTenantInsertIsolation = probe.insertIsolation ? 'enforced' : 'unproven';
    result.crossTenantUpdateIsolation = probe.updateIsolation ? 'enforced' : 'unproven';
    result.crossTenantDeleteIsolation = probe.deleteIsolation ? 'enforced' : 'unproven';
    result.crossTenantWriteIsolation =
      probe.insertIsolation && probe.updateIsolation && probe.deleteIsolation ? 'enforced' : 'unproven';
  }

  process.stdout.write(JSON.stringify({ status: 'ready', ...result }) + '\n');
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  const code = /^[A-Z][A-Z0-9_]+/.exec(message)?.[0] ?? 'PRODUCTION_DATABASE_VERIFICATION_FAILED';
  process.stderr.write(JSON.stringify({ status: 'failed', code }) + '\n');
  process.exitCode = 1;
} finally {
  await client.end();
}
