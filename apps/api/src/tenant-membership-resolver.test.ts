import assert from 'node:assert/strict';
import test from 'node:test';

import type { TenantScopedTransaction, TenantScopedTransactionRunner } from '@platform/db';

import { DatabaseTenantMembershipResolver } from './tenant-membership-resolver.js';

const TENANT_A = '11111111-1111-1111-1111-111111111111';

class ScriptedRunner implements TenantScopedTransactionRunner<TenantScopedTransaction> {
  public transactionCalls = 0;
  public executeCalls = 0;

  constructor(private readonly responses: unknown[]) {}

  async transaction<TResult>(
    operation: (transaction: TenantScopedTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    this.transactionCalls += 1;
    const transaction: TenantScopedTransaction = {
      execute: async () => {
        this.executeCalls += 1;
        return this.responses.shift() ?? [];
      },
    };
    return operation(transaction);
  }
}

test('database resolver returns authoritative active membership and canonical permissions only', async () => {
  const runner = new ScriptedRunner([
    [], // set_config
    [{ id: 'user-1' }],
    [{ role_id: 'role-1', status: 'active' }],
    [{ name: 'tenant_admin' }],
    [{ name: 'approval:decide' }, { name: 'not:canonical' }, { name: 'workflow:execute' }],
  ]);
  const resolver = new DatabaseTenantMembershipResolver(runner);

  const membership = await resolver.resolve('subject-a', TENANT_A);

  assert.deepEqual(membership, {
    tenantId: TENANT_A,
    role: 'tenant_admin',
    permissions: ['approval:decide', 'workflow:execute'],
  });
});

test('database resolver rejects missing membership for a valid identity', async () => {
  const runner = new ScriptedRunner([
    [], // set_config
    [{ id: 'user-1' }],
    [],
  ]);
  const resolver = new DatabaseTenantMembershipResolver(runner);

  assert.equal(await resolver.resolve('subject-a', TENANT_A), null);
});

test('database resolver rejects inactive memberships', async () => {
  const runner = new ScriptedRunner([
    [], // set_config
    [{ id: 'user-1' }],
    [{ role_id: 'role-1', status: 'disabled' }],
  ]);
  const resolver = new DatabaseTenantMembershipResolver(runner);

  assert.equal(await resolver.resolve('subject-a', TENANT_A), null);
  assert.equal(runner.executeCalls, 3, 'inactive membership must short-circuit role/permission reads');
});

test('database resolver rejects memberships bound to unknown roles', async () => {
  const runner = new ScriptedRunner([
    [], // set_config
    [{ id: 'user-1' }],
    [{ role_id: 'role-1', status: 'active' }],
    [{ name: 'forged_role' }],
  ]);
  const resolver = new DatabaseTenantMembershipResolver(runner);

  assert.equal(await resolver.resolve('subject-a', TENANT_A), null);
});

test('database resolver fails closed before DB access for malformed tenant ids or subjects', async () => {
  const runner = new ScriptedRunner([]);
  const resolver = new DatabaseTenantMembershipResolver(runner);

  assert.equal(await resolver.resolve('subject-a', 'tenant-not-uuid'), null);
  assert.equal(await resolver.resolve('subject-a', '111111111111-1111-1111-1111-111111111111'), null);
  assert.equal(await resolver.resolve('', TENANT_A), null);
  assert.equal(runner.transactionCalls, 0);
});
