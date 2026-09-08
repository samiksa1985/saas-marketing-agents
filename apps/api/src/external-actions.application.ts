import { AuthoritativeEntitlementAccess } from '@platform/billing-entitlements';
import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import {
  CanonicalExternalActionBudgetAuthority,
  ExternalActionPolicyEngine,
  type ExternalActionPolicyProvider,
  GovernedExternalActionExecutor,
  type ExternalActionPolicy,
  type ExternalActionStore,
  type ExternalMarketingActionProposal,
  type GovernedExternalAction,
} from '@platform/marketing-os-core';
import {
  AtomicBillingUsageStore,
  PersistentBillingAuthorityRepository,
  PersistentExternalActionStore,
  PersistentExternalActionPolicyStore,
  toEvaluatedExternalActionPolicy,
  type DurableExternalActionPolicy,
  type ExternalActionPolicyUpdate,
  type MarketingOSPersistenceDatabase,
} from '@platform/marketing-os-persistence';
import type { ExternalMarketingProviderGateway } from '@platform/marketing-os-core';

import type { ApprovalApiService } from './approval.controller.js';
import { ApiTenantDatabase } from './tenant-database.js';

type ExternalActionTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;

class ApiTenantExternalActionStore<TTransaction extends ExternalActionTransaction>
  implements ExternalActionStore
{
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  create(context: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionStore(transaction).create(context, action),
    );
  }

  get(context: TenantContext, actionId: string): Promise<GovernedExternalAction | undefined> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionStore(transaction).get(context, actionId),
    );
  }

  save(context: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionStore(transaction).save(context, action),
    );
  }

  findByIdempotency(
    context: TenantContext,
    provider: string,
    actionId: string,
    idempotencyKey: string,
  ): Promise<GovernedExternalAction | undefined> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionStore(transaction).findByIdempotency(
        context,
        provider,
        actionId,
        idempotencyKey,
      ),
    );
  }
}

class ApiTenantEntitlementAuthority<TTransaction extends ExternalActionTransaction> {
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  authorize(tenantId: string, entitlementKey: string) {
    return this.tenantDatabase.execute({ tenantId }, (transaction) =>
      new AuthoritativeEntitlementAccess(
        new PersistentBillingAuthorityRepository(transaction),
        new AtomicBillingUsageStore(transaction),
        { source: 'external-action-executor' },
      ).authorize(tenantId, entitlementKey),
    );
  }
}

/** Tenant-scoped façade; controllers never receive a raw policy repository. */
class ApiTenantExternalActionPolicySource<TTransaction extends ExternalActionTransaction>
  implements ExternalActionPolicyProvider
{
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  get(context: TenantContext, provider: string): Promise<DurableExternalActionPolicy | undefined> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionPolicyStore(transaction).get(context, provider),
    );
  }

  async resolve(context: TenantContext, provider: string) {
    const durablePolicy = await this.get(context, provider);
    const policy = toEvaluatedExternalActionPolicy(durablePolicy);
    if (!durablePolicy || !policy) return undefined;
    return {
      policy,
      hardDailySpendLimit: durablePolicy.maxAbsoluteBudgetDelta,
      hardMonthlySpendLimit: durablePolicy.monthlySpendCeiling,
    };
  }

  list(context: TenantContext): Promise<DurableExternalActionPolicy[]> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionPolicyStore(transaction).list(context),
    );
  }

  upsert(
    context: TenantContext,
    provider: string,
    update: ExternalActionPolicyUpdate,
  ): Promise<DurableExternalActionPolicy> {
    return this.tenantDatabase.execute(context, (transaction) =>
      new PersistentExternalActionPolicyStore(transaction).upsert(context, provider, update),
    );
  }
}

/**
 * API composition only. Controllers call this service; they never receive a
 * provider or a credential resolver. A missing tenant policy fails closed.
 */
export class ExternalActionApplicationService<TTransaction extends ExternalActionTransaction> {
  private readonly store: ExternalActionStore;
  private readonly entitlements: ApiTenantEntitlementAuthority<TTransaction>;
  private readonly policies: ApiTenantExternalActionPolicySource<TTransaction>;

  constructor(
    tenantDatabase: ApiTenantDatabase<TTransaction>,
    private readonly provider: ExternalMarketingProviderGateway,
    private readonly approvals: ApprovalApiService,
  ) {
    this.store = new ApiTenantExternalActionStore(tenantDatabase);
    this.entitlements = new ApiTenantEntitlementAuthority(tenantDatabase);
    this.policies = new ApiTenantExternalActionPolicySource(tenantDatabase);
  }

  async propose(context: TenantContext, proposal: ExternalMarketingActionProposal): Promise<GovernedExternalAction> {
    return (await this.executor(context, proposal.provider)).propose(context, proposal);
  }

  async simulate(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    return (await this.executor(context, action.proposal.provider)).simulate(context, actionId);
  }

  async requestApproval(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    return (await this.executor(context, action.proposal.provider)).requestApproval(context, actionId);
  }

  async execute(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    return (await this.executor(context, action.proposal.provider)).execute(context, actionId);
  }

  async get(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    return (await this.executor(context, action.proposal.provider)).get(context, actionId);
  }

  async proposeRollback(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    return (await this.executor(context, action.proposal.provider)).proposeRollback(context, actionId);
  }

  listPolicies(context: TenantContext): Promise<DurableExternalActionPolicy[]> {
    return this.policies.list(context);
  }

  upsertPolicy(
    context: TenantContext,
    provider: string,
    update: ExternalActionPolicyUpdate,
  ): Promise<DurableExternalActionPolicy> {
    return this.policies.upsert(context, provider, update);
  }

  private async executor(
    context: TenantContext,
    provider: string,
  ): Promise<GovernedExternalActionExecutor> {
    const resolution = await this.policies.resolve(context, provider);
    const policy: ExternalActionPolicy | undefined = resolution?.policy;
    const budget = new CanonicalExternalActionBudgetAuthority(
      this.entitlements,
      resolution
        ? {
            tenantId: policy!.tenantId,
            // A per-action maximum is also the daily mutation ceiling. A
            // missing positive cap remains a block in the core authority.
            hardDailySpendLimit: resolution.hardDailySpendLimit,
            hardMonthlySpendLimit: resolution.hardMonthlySpendLimit,
          }
        : undefined,
    );
    return new GovernedExternalActionExecutor(
      this.store,
      this.provider,
      budget,
      new ExternalActionPolicyEngine(),
      policy,
      this.approvals,
    );
  }
}
