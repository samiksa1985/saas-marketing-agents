import assert from 'node:assert/strict';
import test from 'node:test';

import { TenantScopedDatabase, withTenantScope } from './index.js';

test('tenant scope is set locally before a transaction operation runs', async () => {
  const statements: unknown[] = [];

  const result = await withTenantScope(
    {
      transaction: async (operation) =>
        operation({
          execute: async (query) => {
            statements.push(query);
            return [];
          },
        }),
    },
    'tenant-a',
    async (transaction) => {
      await transaction.execute('tenant-bound-query');
      return 'complete';
    },
  );

  assert.equal(result, 'complete');
  assert.equal(statements.length, 2);
  assert.equal(statements[1], 'tenant-bound-query');
});

test('tenant scope refuses an empty tenant before beginning a transaction', async () => {
  let started = false;

  await assert.rejects(
    withTenantScope(
      {
        transaction: async () => {
          started = true;
          throw new Error('unreachable');
        },
      },
      '',
      async () => undefined,
    ),
    /Tenant context is required/,
  );

  assert.equal(started, false);
});

test('canonical tenant database keeps the operation on the scoped transaction', async () => {
  const statements: unknown[] = [];
  const database = new TenantScopedDatabase({
    transaction: async (operation) =>
      operation({
        execute: async (query) => {
          statements.push(query);
          return [];
        },
      }),
  });

  await database.execute('tenant-a', async (transaction) => {
    await transaction.execute('worker-or-api-query');
  });

  assert.equal(statements.length, 2);
  assert.equal(statements[1], 'worker-or-api-query');
});
