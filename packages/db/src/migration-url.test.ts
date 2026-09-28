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

test('migration authority separation: runtime URL is the fallback when no override exists', () => {
  assert.equal(
    resolveMigrationDatabaseUrl({}, 'postgresql://app@example.internal/db'),
    'postgresql://app@example.internal/db',
  );
  assert.equal(
    resolveMigrationDatabaseUrl({ MIGRATION_DATABASE_URL: undefined }, 'postgresql://app@example.internal/db'),
    'postgresql://app@example.internal/db',
  );
});

test('migration authority separation: a whitespace-only override still falls back', () => {
  assert.equal(
    resolveMigrationDatabaseUrl({ MIGRATION_DATABASE_URL: '   ' }, 'postgresql://app@example.internal/db'),
    'postgresql://app@example.internal/db',
  );
});
