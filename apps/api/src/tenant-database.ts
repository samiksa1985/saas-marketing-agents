import type { TenantContext } from '@platform/contracts';
import {
  TenantScopedDatabase,
  type TenantScopedTransaction,
  type TenantScopedTransactionRunner,
} from '@platform/db';

/**
 * The only API composition point for tenant-bound persistence work. Request
 * handlers/services must use the transaction supplied to their callback rather
 * than a global database client.
 */
export class ApiTenantDatabase<TTransaction extends TenantScopedTransaction> {
  private readonly database: TenantScopedDatabase<TTransaction>;

  constructor(runner: TenantScopedTransactionRunner<TTransaction>) {
    this.database = new TenantScopedDatabase(runner);
  }

  execute<TResult>(
    context: Pick<TenantContext, 'tenantId'>,
    operation: (transaction: TTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.execute(context.tenantId, operation);
  }
}
