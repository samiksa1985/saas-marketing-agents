import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveMigrationDatabaseUrl } from './migration-url.js';

test('migration authority separation: MIGRATION_DATABASE_URL overrides the runtime URL', () => {
  const resolved = resolveMigrationDatabaseUrl(
    { MIGRATION_DATABASE_URL: 'postgresql://owner@example.internal/db' },
    'postgresql://app@example.internal/db',
  );
  assert.equal(resolved, 'postgresql://owner@example.internal/db');
});

test('production migration authority requires and accepts an explicit URL', () => {
  assert.equal(
    resolveMigrationDatabaseUrl(
      { MIGRATION_DATABASE_URL: 'postgresql://owner@example.internal/db' },
      'postgresql://app@example.internal/db',
      'production',
    ),
    'postgresql://owner@example.internal/db',
  );
});

test('migration authority separation: runtime URL fallback is limited to non-production', () => {
  assert.equal(
    resolveMigrationDatabaseUrl({}, 'postgresql://app@example.internal/db'),
    'postgresql://app@example.internal/db',
  );
  assert.equal(
    resolveMigrationDatabaseUrl({ MIGRATION_DATABASE_URL: undefined }, 'postgresql://app@example.internal/db'),
    'postgresql://app@example.internal/db',
  );
});

test('migration URL resolution requires a runtime URL when no override is supplied', () => {
  assert.throws(() => resolveMigrationDatabaseUrl({}, ''), /DATABASE_URL_REQUIRED/);
});

test('migration authority separation: a whitespace-only override falls back only outside production', () => {
  assert.equal(
    resolveMigrationDatabaseUrl({ MIGRATION_DATABASE_URL: '   ' }, 'postgresql://app@example.internal/db'),
    'postgresql://app@example.internal/db',
  );
  assert.throws(
    () => resolveMigrationDatabaseUrl({}, 'postgresql://app@example.internal/db', 'production'),
    /PRODUCTION_MIGRATION_DATABASE_URL_REQUIRED/,
  );
  assert.throws(
    () => resolveMigrationDatabaseUrl(
      { MIGRATION_DATABASE_URL: '   ' },
      'postgresql://app@example.internal/db',
      'production',
    ),
    /PRODUCTION_MIGRATION_DATABASE_URL_REQUIRED/,
  );
});

test('file-based migration credentials override direct values without changing runtime authority', () => {
  const directory = mkdtempSync(join(tmpdir(), 'codecore-migration-url-'));
  const file = join(directory, 'migration-url.txt');
  try {
    writeFileSync(file, 'postgresql://owner:file-password@example.internal/db\n', { mode: 0o600 });
    assert.equal(
      resolveMigrationDatabaseUrl(
        {
          MIGRATION_DATABASE_URL: 'postgresql://owner:direct-password@wrong.internal/wrong',
          MIGRATION_DATABASE_URL_FILE: file,
        },
        'postgresql://app:runtime-password@example.internal/db',
        'production',
      ),
      'postgresql://owner:file-password@example.internal/db',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an unreadable migration secret file fails closed rather than falling back to direct credentials', () => {
  const file = join(tmpdir(), 'missing-codecore-migration-url');
  assert.throws(
    () =>
      resolveMigrationDatabaseUrl(
        {
          MIGRATION_DATABASE_URL: 'postgresql://owner:direct-password@example.internal/db',
          MIGRATION_DATABASE_URL_FILE: file,
        },
        'postgresql://app:runtime-password@example.internal/db',
        'production',
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'MIGRATION_DATABASE_URL_FILE_UNREADABLE' &&
      !error.message.includes(file) &&
      !error.message.includes('direct-password'),
  );
});
