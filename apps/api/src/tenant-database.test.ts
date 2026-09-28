import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiTenantDatabase } from './tenant-database.js';

test('API tenant database establishes scope before request database work', async () => {
  const calls: unknown[] = [];
  const database = new ApiTenantDatabase({
    transaction: async (operation) =>
      operation({
        execute: async (query) => {
          calls.push(query);
          return [];
        },
      }),
  });

  await database.execute({ tenantId: 'tenant-a' }, async (transaction) => {
    await transaction.execute('api-query');
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1], 'api-query');
});

test('API tenant database fails closed with no tenant context', async () => {
  let started = false;
  const database = new ApiTenantDatabase({
    transaction: async () => {
      started = true;
      throw new Error('unreachable');
    },
  });

  await assert.rejects(
    () => database.execute({ tenantId: '' }, async () => undefined),
    /Tenant context is required/,
  );
  assert.equal(started, false);
});
