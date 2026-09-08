import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { normalizeMigrationSql } from './migration-sql.js';

export interface Phase1JournalEntry {
  idx: number;
  tag: string;
}

export interface Phase1MigrationDescriptor {
  entry: Phase1JournalEntry;
  absolutePath: string;
  relativePath: string;
}

export interface Phase1MigrationFailureEvidence {
  status: 'FAIL';
  phase: 'migration';
  migration: string;
  file: string;
  path: string;
  absolutePath: string;
  order: number;
  postgresCode: string | null;
  message: string;
  position: string | null;
  routine: string | null;
  sqlContext: string;
}

export interface SqlMigrationClient {
  unsafe(source: string): Promise<unknown>;
}

type PostgresFailure = {
  code?: unknown;
  message?: unknown;
  position?: unknown;
  routine?: unknown;
};

const maxSqlContextLength = 480;

export class Phase1MigrationExecutionError extends Error {
  constructor(readonly evidence: Phase1MigrationFailureEvidence) {
    super(evidence.message);
    this.name = 'Phase1MigrationExecutionError';
  }
}

export function migrationNumber(entry: Phase1JournalEntry): string {
  return entry.tag.match(/^(\d+)/)?.[1] ?? String(entry.idx);
}

/** Return a bounded neighbourhood of the PostgreSQL error position. */
export function boundedSqlContext(source: string, position: unknown): string {
  const oneBased = Number(position);
  if (!Number.isSafeInteger(oneBased) || oneBased < 1) {
    return '<position unavailable from PostgreSQL>';
  }

  const index = Math.min(oneBased - 1, Math.max(source.length - 1, 0));
  const statementBreak = source.lastIndexOf('--> statement-breakpoint', index);
  const nextStatementBreak = source.indexOf('--> statement-breakpoint', index);
  const segmentStart = statementBreak < 0 ? 0 : statementBreak + '--> statement-breakpoint'.length;
  const segmentEnd = nextStatementBreak < 0 ? source.length : nextStatementBreak;
  const before = Math.max(segmentStart, index - Math.floor(maxSqlContextLength / 2));
  const after = Math.min(segmentEnd, index + Math.ceil(maxSqlContextLength / 2));
  const prefix = before > segmentStart ? '…' : '';
  const suffix = after < segmentEnd ? '…' : '';
  return `${prefix}${source.slice(before, after)}${suffix}`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxSqlContextLength + 2);
}

export async function executePhase1Migration(
  client: SqlMigrationClient,
  descriptor: Phase1MigrationDescriptor,
  log: (message: string) => void = console.log,
): Promise<void> {
  const file = basename(descriptor.absolutePath);
  log(`PHASE1_MIGRATION_START=${file}`);
  const source = normalizeMigrationSql(await readFile(descriptor.absolutePath, 'utf8'));
  try {
    await client.unsafe(source);
    log(`PHASE1_MIGRATION_PASS=${file}`);
  } catch (error) {
    const postgres = error as PostgresFailure;
    const message = String(postgres.message ?? error ?? 'Unknown PostgreSQL migration failure').slice(0, 600);
    throw new Phase1MigrationExecutionError({
      status: 'FAIL',
      phase: 'migration',
      migration: migrationNumber(descriptor.entry),
      file,
      path: descriptor.relativePath,
      absolutePath: descriptor.absolutePath,
      order: descriptor.entry.idx,
      postgresCode: postgres.code === undefined ? null : String(postgres.code),
      message,
      position: postgres.position === undefined ? null : String(postgres.position),
      routine: postgres.routine === undefined ? null : String(postgres.routine),
      sqlContext: boundedSqlContext(source, postgres.position),
    });
  }
}
