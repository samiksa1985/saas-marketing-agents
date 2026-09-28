import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import {
  PersistentExternalActionReliabilityStore,
  type MarketingOSPersistenceDatabase,
} from '@platform/marketing-os-persistence';

import { ApiTenantDatabase } from './tenant-database.js';

type ExternalActionOperationsTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;

/**
 * Tenant-bound operations model. It exposes delivery state only; it has no
 * provider, credential resolver, or mutation method and cannot bypass the
 * original governed-action pipeline.
 */
export class ExternalActionOperationsApplicationService<
  TTransaction extends ExternalActionOperationsTransaction,
> {
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  summary(context: TenantContext) {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionReliabilityStore(transaction).operationalSummary(context),
    );
  }

  outbox(context: TenantContext) {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionReliabilityStore(transaction).listOutbox(context),
    );
  }

  providerHealth(context: TenantContext, provider: string) {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionReliabilityStore(transaction).getProviderHealth(context, provider),
    );
  }

  credentialHealth(context: TenantContext, provider: string) {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionReliabilityStore(transaction).getCredentialHealth(context, provider),
    );
  }

  replay(context: TenantContext, eventId: string) {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionReliabilityStore(transaction).replay(context, eventId),
    );
  }

  recoverExpiredLeases(context: TenantContext) {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionReliabilityStore(transaction).recoverExpiredLeases(context),
    );
  }
}
