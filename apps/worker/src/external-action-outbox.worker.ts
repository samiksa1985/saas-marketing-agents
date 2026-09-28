import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import {
  ExternalActionOutboxWorker,
  PersistentExternalActionReliabilityStore,
  type ExternalActionOutboxDeliveryStore,
  type MarketingOSPersistenceDatabase,
  type OutboxClaimOptions,
  type OutboxDelivery,
  type OutboxFailureInput,
  type ReliableExternalActionOutboxEvent,
} from '@platform/marketing-os-persistence';

import { WorkerTenantDatabase } from './tenant-database.js';

type ExternalActionOutboxTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;

/**
 * Each outbox operation gets a fresh transaction-local tenant setting. The
 * external delivery adapter runs outside that transaction and is explicit.
 */
class TenantScopedExternalActionOutboxStore<TTransaction extends ExternalActionOutboxTransaction>
  implements ExternalActionOutboxDeliveryStore
{
  constructor(private readonly database: WorkerTenantDatabase<TTransaction>) {}

  claimNext(context: TenantContext, options: OutboxClaimOptions) {
    return this.database.execute(context.tenantId, (transaction) =>
      new PersistentExternalActionReliabilityStore(transaction).claimNext(context, options),
    );
  }

  markDelivered(context: TenantContext, eventId: string, leaseId?: string) {
    return this.database.execute(context.tenantId, (transaction) =>
      new PersistentExternalActionReliabilityStore(transaction).markDelivered(context, eventId, leaseId),
    );
  }

  recordDeliveryFailure(context: TenantContext, eventId: string, input: OutboxFailureInput) {
    return this.database.execute(context.tenantId, (transaction) =>
      new PersistentExternalActionReliabilityStore(transaction).recordDeliveryFailure(context, eventId, input),
    );
  }
}

/**
 * Production composition boundary. The worker receives only a fixed workflow
 * continuation event and its durable idempotency key; it has no provider,
 * Google Ads client, credential resolver, or raw mutation capability.
 */
export function createExternalActionOutboxWorker<TTransaction extends ExternalActionOutboxTransaction>(
  database: WorkerTenantDatabase<TTransaction>,
  delivery: OutboxDelivery,
): ExternalActionOutboxWorker {
  return new ExternalActionOutboxWorker(
    new TenantScopedExternalActionOutboxStore(database),
    delivery,
  );
}

export type { ReliableExternalActionOutboxEvent };
