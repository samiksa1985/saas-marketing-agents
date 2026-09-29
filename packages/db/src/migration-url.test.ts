import assert from 'node:assert/strict';
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
