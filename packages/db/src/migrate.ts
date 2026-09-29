import { loadConfig } from '@platform/config';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';

import {
  applyJournalMigrations,
  loadJournalMigrations,
  type JournalMigrationClient,
} from './journal-migration-runner.js';
import { assertMigrationAuthority, resolveMigrationDatabaseUrl } from './migration-url.js';
import { assertProductionRuntimeAuthority } from './runtime-role-verify.js';
const config = loadConfig();
// Migration authority separation (WS-PROD-02): migrations may run as the
// privileged owner identity via MIGRATION_DATABASE_URL while the runtime
// application connects as codecore_app via DATABASE_URL. Never printed.
const migrationUrl = resolveMigrationDatabaseUrl(process.env, config.databaseUrl, config.nodeEnv);
// Keep the migration client aligned with the proven Phase-1 harness. The
// runner additionally reserves a connection for each opaque source program.
const client = postgres(migrationUrl, { max: 1, prepare: false });
const migrationsDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));

try {
  if (config.nodeEnv === 'production') {
    const runtimeClient = postgres(config.databaseUrl, { max: 1, prepare: false });
    try {
      await assertProductionRuntimeAuthority(runtimeClient);
    } finally {
      await runtimeClient.end();
    }
    await assertMigrationAuthority(client);
  }
  const migrations = await loadJournalMigrations(migrationsDirectory);
  await applyJournalMigrations(client as unknown as JournalMigrationClient, migrations);
} finally {
  await client.end();
}
