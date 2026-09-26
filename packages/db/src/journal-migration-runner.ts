import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { normalizeMigrationSql } from './migration-sql.js';

export interface JournalMigrationEntry {
  idx: number;
  when: number;
  tag: string;
}

export interface JournalMigration {
  entry: JournalMigrationEntry;
  source: string;
  hash: string;
}

export interface JournalMigrationClient {
  unsafe(source: string, parameters?: readonly unknown[]): Promise<unknown>;
  reserve(): Promise<JournalMigrationReservedClient>;
}

/** A postgres.js connection retained from the pool for one opaque migration. */
export interface JournalMigrationReservedClient {
  unsafe(source: string, parameters?: readonly unknown[]): Promise<unknown>;
  release(): void | Promise<void>;
}

type PostgresFailure = {
  code?: unknown;
  message?: unknown;
  position?: unknown;
};

export class JournalMigrationExecutionError extends Error {
  constructor(
    readonly migration: string,
    readonly postgresCode: string | null,
    readonly position: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'JournalMigrationExecutionError';
  }
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.from(value as Iterable<Record<string, unknown>>);
}

function migrationFile(entry: JournalMigrationEntry): string {
  return `${entry.tag}.sql`;
}

/**
 * Read the canonical Drizzle journal without adopting Drizzle's fragment
 * execution semantics. SQL files are opaque PostgreSQL programs: a DO body or
 * a historical multi-statement file must reach PostgreSQL intact.
 */
export async function loadJournalMigrations(migrationsDirectory: string): Promise<JournalMigration[]> {
  const journal = JSON.parse(
    await readFile(join(migrationsDirectory, 'meta', '_journal.json'), 'utf8'),
  ) as { entries?: unknown };
  if (!Array.isArray(journal.entries)) {
    throw new Error('Drizzle migration journal has no entries array');
  }

  const entries = journal.entries as JournalMigrationEntry[];
  return Promise.all(
    entries.map(async (entry, index) => {
      if (
        !Number.isInteger(entry.idx) ||
        entry.idx !== index ||
        !Number.isInteger(entry.when) ||
        !entry.tag
      ) {
        throw new Error(`Invalid Drizzle migration journal entry at index ${index}`);
      }
      const source = await readFile(join(migrationsDirectory, migrationFile(entry)), 'utf8');
      return {
        entry,
        source,
        hash: createHash('sha256').update(source).digest('hex'),
      };
    }),
  );
}

/**
 * Apply each journaled migration as one PostgreSQL source program and record
 * it in Drizzle's standard ledger. This matches the real Phase-1 harness and
 * avoids splitting DO/function bodies. Each source program is sent through a
 * postgres.js reserved connection: 0018 deliberately owns its BEGIN/COMMIT,
 * so wrapping it in sql.begin() would create an invalid nested transaction.
 * The reservation also keeps the source and its ledger write ordered on one
 * connection without weakening migration-owned atomicity.
 */
export async function applyJournalMigrations(
  client: JournalMigrationClient,
  migrations: readonly JournalMigration[],
  log: (message: string) => void = console.log,
): Promise<void> {
  await client.unsafe('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const latest = rows(
    await client.unsafe(
      'SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1',
    ),
  )[0];
  const lastCreatedAt = latest?.created_at === undefined ? undefined : Number(latest.created_at);
  if (lastCreatedAt !== undefined && !Number.isSafeInteger(lastCreatedAt)) {
    throw new Error('Drizzle migration ledger contains an invalid created_at value');
  }

  for (const migration of migrations) {
    if (lastCreatedAt !== undefined && lastCreatedAt >= migration.entry.when) {
      continue;
    }

    const file = migrationFile(migration.entry);
    log(`MIGRATION_START=${file}`);
    let reserved: JournalMigrationReservedClient | undefined;
    try {
      reserved = await client.reserve();
      await reserved.unsafe(normalizeMigrationSql(migration.source));
      await reserved.unsafe(
        'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [migration.hash, migration.entry.when],
      );
    } catch (error) {
      const postgres = error as PostgresFailure;
      const message = String(postgres.message ?? error ?? 'PostgreSQL migration failure').slice(0, 600);
      const postgresCode = postgres.code === undefined ? null : String(postgres.code);
      const position = postgres.position === undefined ? null : String(postgres.position);
      log(`MIGRATION_FAIL=${file} code=${postgresCode ?? 'unknown'} position=${position ?? 'unknown'}`);
      throw new JournalMigrationExecutionError(file, postgresCode, position, message);
    } finally {
      await reserved?.release();
    }
    log(`MIGRATION_PASS=${file}`);
  }
}
