import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyJournalMigrations,
  JournalMigrationExecutionError,
  type JournalMigration,
  type JournalMigrationClient,
  type JournalMigrationReservedClient,
} from './journal-migration-runner.js';

class RecordingClient implements JournalMigrationClient {
  readonly calls: Array<{ source: string; parameters?: readonly unknown[] }> = [];
  readonly reserved: RecordingReservedClient;
  reserveCalls = 0;

  constructor(
    failSource?: string,
    private readonly latestCreatedAt?: number,
    private readonly rejectTransactionProgramOnPool = false,
  ) {
    this.reserved = new RecordingReservedClient(failSource);
  }

  async unsafe(source: string, parameters?: readonly unknown[]): Promise<unknown> {
    this.calls.push({
      source,
      ...(parameters === undefined ? {} : { parameters }),
    });
    if (source.startsWith('SELECT created_at')) {
      return this.latestCreatedAt === undefined ? [] : [{ created_at: this.latestCreatedAt }];
    }
    if (this.rejectTransactionProgramOnPool && source.startsWith('BEGIN;')) {
      throw { code: 'UNSAFE_TRANSACTION', message: 'Only use sql.begin, sql.reserved or max: 1' };
    }
    return [];
  }

  async reserve(): Promise<JournalMigrationReservedClient> {
    this.reserveCalls += 1;
    return this.reserved;
  }
}

class RecordingReservedClient implements JournalMigrationReservedClient {
  readonly calls: Array<{ source: string; parameters?: readonly unknown[] }> = [];
  releaseCalls = 0;

  constructor(private readonly failSource?: string) {}

  async unsafe(source: string, parameters?: readonly unknown[]): Promise<unknown> {
    this.calls.push({
      source,
      ...(parameters === undefined ? {} : { parameters }),
    });
    if (source === this.failSource) {
      throw { code: '42601', position: '1', message: 'syntax error at or near "CREATE"' };
    }
    return [];
  }

  release(): void {
    this.releaseCalls += 1;
  }
}

function migration(source: string): JournalMigration {
  return {
    entry: { idx: 0, when: 1, tag: '0000_fixture' },
    source,
    hash: 'fixture-hash',
  };
}

function journalMigration(tag: string, when: number, source: string): JournalMigration {
  return {
    entry: { idx: Number(tag.slice(0, 4)), when, tag },
    source,
    hash: `${tag}-hash`,
  };
}

test('journal runner reserves a connection for a migration-owned transaction and does not split its source program', async () => {
  const source = '\uFEFFBEGIN;\nDO $$ BEGIN EXECUTE \'CREATE POLICY fixture_tenant_policy ON fixture USING (true)\'; END $$;\nCOMMIT;';
  // This simulates postgres.js rejecting BEGIN from an ordinary pooled client.
  // The runner must send the opaque source to the reserved client instead.
  const client = new RecordingClient(undefined, undefined, true);

  await applyJournalMigrations(client, [migration(source)], () => undefined);

  assert.equal(client.reserveCalls, 1);
  assert.equal(client.reserved.calls[0]?.source, source.slice(1));
  assert.equal(client.reserved.calls[1]?.source, 'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)');
  assert.deepEqual(client.reserved.calls[1]?.parameters, ['fixture-hash', 1]);
  assert.equal(client.reserved.releaseCalls, 1);
  assert.equal(client.calls.some((call) => call.source === source.slice(1)), false);
});

test('journal runner leaves the migration ledger unchanged when PostgreSQL rejects a source program', async () => {
  const source = 'CREATE TABLE broken (';
  const client = new RecordingClient(source);
  const log: string[] = [];

  await assert.rejects(
    () => applyJournalMigrations(client, [migration(source)], (message) => log.push(message)),
    (error: unknown) => {
      assert.ok(error instanceof JournalMigrationExecutionError);
      assert.equal(error.migration, '0000_fixture.sql');
      assert.equal(error.postgresCode, '42601');
      assert.equal(error.position, '1');
      return true;
    },
  );

  assert.deepEqual(log, [
    'MIGRATION_START=0000_fixture.sql',
    'MIGRATION_FAIL=0000_fixture.sql code=42601 position=1',
  ]);
  assert.equal(client.reserved.calls.some((call) => call.source.startsWith('INSERT INTO "drizzle"')), false);
  assert.equal(client.reserved.releaseCalls, 1);
});

test('journal runner resumes from an existing ledger and reserves the connection for the next opaque migration', async () => {
  const applied = journalMigration('0017_already_applied', 17, 'CREATE TABLE applied_fixture (id integer);');
  const pending = journalMigration('0018_reconciliation_forward_repairs', 18, 'BEGIN;\nDO $$ BEGIN PERFORM 1; END $$;\nCOMMIT;');
  const client = new RecordingClient(undefined, 17);

  await applyJournalMigrations(client, [applied, pending], () => undefined);

  assert.equal(client.reserveCalls, 1);
  assert.equal(client.reserved.calls[0]?.source, pending.source);
  assert.deepEqual(client.reserved.calls[1]?.parameters, ['0018_reconciliation_forward_repairs-hash', 18]);
});
