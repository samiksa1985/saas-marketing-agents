import {
  TenantScopedDatabase,
  type TenantScopedTransaction,
  type TenantScopedTransactionRunner,
} from '@platform/db';

/**
 * Worker jobs must provide an explicit tenant id. The callback receives the
 * same transaction in which app.tenant_id was set with SET LOCAL semantics.
 */
export class WorkerTenantDatabase<TTransaction extends TenantScopedTransaction> {
  private readonly database: TenantScopedDatabase<TTransaction>;

  constructor(runner: TenantScopedTransactionRunner<TTransaction>) {
    this.database = new TenantScopedDatabase(runner);
  }

  execute<TResult>(
    tenantId: string,
    operation: (transaction: TTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.execute(tenantId, operation);
  }
}
