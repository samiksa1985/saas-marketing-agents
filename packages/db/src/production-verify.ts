import { fileURLToPath } from 'node:url';
import { loadConfig } from '@platform/config';
import postgres from 'postgres';
import { loadJournalMigrations } from './journal-migration-runner.js';

const config = loadConfig();
const client = postgres(config.databaseUrl, { max: 1, prepare: false });
const migrationsDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));

try {
  const expected = await loadJournalMigrations(migrationsDirectory);
  const ledger = await client.unsafe('SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at');
  const applied = Array.from(ledger as Iterable<{ created_at: number }>).map((row) => Number(row.created_at));
  const expectedLatest = expected.at(-1)?.entry.when;
  if (applied.length !== expected.length || applied.at(-1) !== expectedLatest) throw new Error('MIGRATION_LEDGER_NOT_CURRENT');
  const vector = await client.unsafe("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
  if (Array.from(vector as Iterable<unknown>).length !== 1) throw new Error('PGVECTOR_EXTENSION_MISSING');
  const rlsGaps = await client.unsafe(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
      AND NOT c.relrowsecurity
  `);
  if (Array.from(rlsGaps as Iterable<unknown>).length > 0) throw new Error('TENANT_RLS_NOT_ENABLED');
  process.stdout.write(JSON.stringify({ status: 'ready', migrations: expected.length, pgvector: 'enabled', tenantRls: 'enabled' }) + '\n');
} catch (error) {
  const code = error instanceof Error && /^(MIGRATION_LEDGER_NOT_CURRENT|PGVECTOR_EXTENSION_MISSING|TENANT_RLS_NOT_ENABLED)$/.test(error.message) ? error.message : 'PRODUCTION_DATABASE_VERIFICATION_FAILED';
  process.stderr.write(JSON.stringify({ status: 'failed', code }) + '\n');
  process.exitCode = 1;
} finally {
  await client.end();
}
