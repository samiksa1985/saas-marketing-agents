import * as assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryWorkflowRuntime } from './index.js';
import { createWorkflowRuntime } from './provider.js';
import { PostgresWorkflowRuntime } from './postgres.js';
import { PostgresWorkflowQuery } from './postgres-query.js';

const postgresClient: {
  unsafe(source: string, parameters?: readonly unknown[]): Promise<unknown>;
  begin<TResult>(operation: (transaction: typeof postgresClient) => Promise<TResult>): Promise<TResult>;
} = {
  async unsafe(): Promise<unknown> {
    return [];
  },
  async begin<TResult>(operation: (transaction: typeof postgresClient) => Promise<TResult>): Promise<TResult> {
    return operation(this);
  },
};

test('workflow provider selects the in-memory runtime only when explicitly requested', () => {
  const selection = createWorkflowRuntime({
    mode: 'in-memory',
    repositoryRoot: process.cwd(),
  });

  assert.equal(selection.mode, 'in-memory');
  assert.equal(selection.durable, false);
  assert.ok(selection.runtime instanceof InMemoryWorkflowRuntime);
});

test('workflow provider selects the durable PostgreSQL runtime without Temporal adapters', () => {
  const selection = createWorkflowRuntime({
    mode: 'postgres',
    postgresClient,
  });

  assert.equal(selection.mode, 'postgres');
  assert.equal(selection.durable, true);
  assert.ok(selection.runtime instanceof PostgresWorkflowRuntime);
  assert.ok(selection.query instanceof PostgresWorkflowQuery);
});

test('workflow provider refuses PostgreSQL mode without a durable database client', () => {
  assert.throws(
    () => createWorkflowRuntime({ mode: 'postgres' }),
    /PostgreSQL workflow client/i,
  );
});

test('workflow provider refuses retired Temporal mode', () => {
  assert.throws(
    () => createWorkflowRuntime({ mode: 'temporal' as never }),
    /PostgreSQL workflow client|Temporal/i,
  );
});
