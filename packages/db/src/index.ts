import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export function createDb(connectionString: string) {
  return drizzle(postgres(connectionString), { schema });
}

/**
 * Minimal transaction shape required to establish PostgreSQL RLS tenant scope.
 * The caller must use a transaction runner backed by the same database
 * connection that will execute the tenant-bound operation.
 */
export interface TenantScopedTransaction {
  execute(query: unknown): Promise<unknown>;
}

export interface TenantScopedTransactionRunner<TTransaction extends TenantScopedTransaction> {
  transaction<TResult>(
    operation: (transaction: TTransaction) => Promise<TResult>,
  ): Promise<TResult>;
}

/**
 * Executes an operation with `app.tenant_id` set only for that transaction.
 * `set_config(..., true)` is equivalent to `SET LOCAL`, preventing a pooled
 * connection from retaining tenant scope after the transaction completes.
 */
export async function withTenantScope<TTransaction extends TenantScopedTransaction, TResult>(
  runner: TenantScopedTransactionRunner<TTransaction>,
  tenantId: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!tenantId.trim()) {
    throw new Error('Tenant context is required');
  }

  return runner.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return operation(transaction);
  });
}

/**
 * Canonical transaction-bound database façade for API and worker code. It
 * deliberately exposes the transaction to the operation, so a tenant scope
 * cannot be accidentally established on one connection and queried on another.
 */
export class TenantScopedDatabase<TTransaction extends TenantScopedTransaction> {
  constructor(
    private readonly runner: TenantScopedTransactionRunner<TTransaction>,
  ) {}

  execute<TResult>(
    tenantId: string,
    operation: (transaction: TTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return withTenantScope(this.runner, tenantId, operation);
  }
}

export { schema };
export * from './schema.js';
