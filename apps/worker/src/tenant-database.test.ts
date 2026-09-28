import test from 'node:test';
import assert from 'node:assert/strict';

import { WorkerTenantDatabase } from './tenant-database.js';

test('worker tenant database establishes local scope before job database work', async () => {
  const calls: unknown[] = [];
  const database = new WorkerTenantDatabase({
    transaction: async (operation) =>
      operation({
        execute: async (query) => {
          calls.push(query);
          return [];
        },
      }),
  });

  await database.execute('tenant-a', async (transaction) => {
    await transaction.execute('worker-query');
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1], 'worker-query');
});
