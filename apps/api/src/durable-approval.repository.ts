import type {
  CreateDurableApprovalInput,
  DecideDurableApprovalInput,
  DurableApprovalRecord,
  DurableApprovalRepository,
} from '@platform/approvals';
import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import {
  PersistentDurableApprovalRepository,
  type MarketingOSPersistenceDatabase,
} from '@platform/marketing-os-persistence';
import { ApiTenantDatabase } from './tenant-database.js';

type DurableApprovalTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;

/**
 * Keeps the canonical approval service on the request-scoped tenant transaction.
 * The API never gives its PostgreSQL approval adapter a process-global client.
 */
export class ApiTenantDurableApprovalRepository<TTransaction extends DurableApprovalTransaction>
  implements DurableApprovalRepository
{
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  create(
    context: TenantContext,
    input: CreateDurableApprovalInput,
  ): Promise<DurableApprovalRecord> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentDurableApprovalRepository(transaction).create(context, input),
    );
  }

  get(context: TenantContext, approvalId: string): Promise<DurableApprovalRecord | undefined> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentDurableApprovalRepository(transaction).get(context, approvalId),
    );
  }

  decide(
    context: TenantContext,
    approvalId: string,
    input: DecideDurableApprovalInput,
  ): Promise<DurableApprovalRecord> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentDurableApprovalRepository(transaction).decide(context, approvalId, input),
    );
  }

  list(context: TenantContext): Promise<DurableApprovalRecord[]> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentDurableApprovalRepository(transaction).list(context),
    );
  }
}
