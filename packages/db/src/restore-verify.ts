/**
 * Post-restore verification for an ISOLATED restore target (WS-PROD-03).
 *
 * Runs deeper than `production:verify`'s baseline because a disaster restore
 * must prove not only runtime safety but that the restored database actually
 * contains the application schema, migration history, pgvector state, RLS
 * posture, and representative tenant data.
 *
 * Fail-closed: any gap exits non-zero with a machine-readable code.
 * The connection URL is consumed from the environment and never printed.
 */
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { readSecretEnvironmentValue } from '@platform/config';
import { loadJournalMigrations } from './journal-migration-runner.js';
import { assertRlsPolicyCoverage } from './runtime-role-verify.js';
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from './schema.js';
import { productionPostgresOptions } from './postgres-connection.js';

const databaseUrl = readSecretEnvironmentValue('DATABASE_URL')?.trim();
if (!databaseUrl) {
  process.stderr.write(JSON.stringify({ status: 'failed', code: 'DATABASE_URL_REQUIRED' }) + '\n');
  process.exit(1);
}

const parsed = new URL(databaseUrl!);
const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
const canonicalNames = new Set(['ai_marketing_phase1', 'platform', 'postgres']);
if (canonicalNames.has(database) || !/(restore|recovery|acceptance)/i.test(database)) {
  process.stderr.write(JSON.stringify({ status: 'failed', code: 'RESTORE_TARGET_NOT_ISOLATED', database }) + '\n');
  process.exit(1);
}

const client = postgres(
  databaseUrl!,
  productionPostgresOptions(databaseUrl!, { max: 1, prepare: false }, { ...process.env, NODE_ENV: 'production' }),
);
const migrationsDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));

function rowsOf<T>(value: unknown): T[] {
  return Array.from(value as Iterable<T>);
}

try {
  const result: Record<string, string | number | boolean> = { database };

  // 1. Connection + identity of the restoring (owner-authority) session.
  const self = rowsOf<{ name: string; rolsuper: boolean }>(
    await client.unsafe(
      `SELECT current_user AS name, r.rolsuper FROM pg_roles r WHERE r.rolname = current_user`,
    ),
  )[0];
  if (!self) throw new Error('RESTORE_CONNECTION_FAILED');
  result.restoredBy = self.name;

  // 2. Migration ledger matches the shipped journal exactly.
  const expected = await loadJournalMigrations(migrationsDirectory);
  const ledger = await client.unsafe('SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at');
  const applied = rowsOf<{ created_at: number }>(ledger).map((row) => Number(row.created_at));
  const expectedLatest = expected.at(-1)?.entry.when;
  if (applied.length !== expected.length || applied.at(-1) !== expectedLatest) {
    throw new Error('RESTORE_MIGRATION_LEDGER_INVALID');
  }
  result.migrations = expected.length;

  // 3. Application schema present: every tenant-scoped table restored with RLS on.
  const rlsGaps = rowsOf<{ relname: string }>(
    await client.unsafe(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
        AND NOT c.relrowsecurity
    `),
  );
  if (rlsGaps.length > 0) throw new Error(`RESTORE_RLS_NOT_ENABLED:${rlsGaps.length}`);
  const tenantTables = rowsOf<{ count: number }>(
    await client.unsafe(`
      SELECT count(*)::int AS count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
    `),
  );
  if (Number(tenantTables[0]?.count ?? 0) === 0) throw new Error('RESTORE_APPLICATION_TABLES_MISSING');
  result.tenantTables = Number(tenantTables[0]!.count);

  // 4. RLS policies present (ALL-command coverage on every tenant table).
  await assertRlsPolicyCoverage(client);
  result.rlsPolicies = 'present';

  // 5. pgvector extension + canonical embedding column type restored.
  const vectorExt = rowsOf<unknown>(
    await client.unsafe("SELECT 1 FROM pg_extension WHERE extname = 'vector'"),
  );
  if (vectorExt.length !== 1) throw new Error('RESTORE_PGVECTOR_EXTENSION_MISSING');
  const vectorColumn = rowsOf<{ column_type: string }>(
    await client.unsafe(`
      SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) AS column_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'knowledge_document_chunks'
        AND a.attname = 'embedding_vector' AND NOT a.attisdropped
    `),
  )[0];
  if (!vectorColumn || vectorColumn.column_type !== `vector(${KNOWLEDGE_EMBEDDING_DIMENSIONS})`) {
    throw new Error('RESTORE_PGVECTOR_COLUMN_INVALID');
  }
  result.pgvector = 'valid';

  // 6. Representative application data actually restored (not an empty schema).
  const tenants = rowsOf<{ count: number }>(
    await client.unsafe('SELECT count(*)::int AS count FROM tenants'),
  );
  if (Number(tenants[0]?.count ?? 0) === 0) throw new Error('RESTORE_REPRESENTATIVE_DATA_MISSING');
  result.tenants = Number(tenants[0]!.count);

  // 7. Ownership reconstructed under migration authority (--no-owner restores
  //    objects owned by the restoring identity = owner role on this cluster).
  const ownershipDrift = rowsOf<{ relname: string }>(
    await client.unsafe(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND pg_get_userbyid(c.relowner) != current_user
      LIMIT 5
    `),
  );
  if (ownershipDrift.length > 0) {
    throw new Error(`RESTORE_OWNERSHIP_DRIFT:${ownershipDrift.map((r) => r.relname).join(',')}`);
  }
  result.ownership = 'migration-authority';

  process.stdout.write(JSON.stringify({ status: 'verified', ...result }) + '\n');
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  const code = /^[A-Z][A-Z0-9_]+/.exec(message)?.[0] ?? 'RESTORE_VERIFICATION_FAILED';
  process.stderr.write(JSON.stringify({ status: 'failed', code }) + '\n');
  process.exitCode = 1;
} finally {
  await client.end();
}
