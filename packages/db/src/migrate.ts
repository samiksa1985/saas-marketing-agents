import { loadConfig } from '@platform/config';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';

import {
  applyJournalMigrations,
  loadJournalMigrations,
  type JournalMigrationClient,
} from './journal-migration-runner.js';

const config = loadConfig();
// Keep the migration client aligned with the proven Phase-1 harness. The
// runner additionally reserves a connection for each opaque source program.
const client = postgres(config.databaseUrl, { max: 1, prepare: false });
const migrationsDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));

try {
  const migrations = await loadJournalMigrations(migrationsDirectory);
  await applyJournalMigrations(client as unknown as JournalMigrationClient, migrations);
} finally {
  await client.end();
}
