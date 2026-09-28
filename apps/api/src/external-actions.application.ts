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
  PersistentExternalActionReliabilityStore,
  PersistentExternalActionPolicyStore,
  PersistentProviderHealthMutationGate,
  toEvaluatedExternalActionPolicy,
  type DurableExternalActionPolicy,
  type ExternalActionPolicyUpdate,
  type MarketingOSPersistenceDatabase,
} from '@platform/marketing-os-persistence';
import type { ExternalActionProviderRegistry } from '@platform/tool-gateway';

import type { ApprovalApiService } from './approval.controller.js';
import { ApiTenantDatabase } from './tenant-database.js';

type ExternalActionTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;

/** Nest token for the single canonical external-action application instance. */
export const EXTERNAL_ACTION_APPLICATION_SERVICE =
  'PLATFORM_EXTERNAL_ACTION_APPLICATION_SERVICE';

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

/** The health gate uses the same transaction-local tenant setting as actions. */
class ApiTenantExternalActionSafetyGate<TTransaction extends ExternalActionTransaction> {
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}

  async allowMutation(context: TenantContext, proposal: { provider: string }) {
    try {
      return await this.tenantDatabase.execute(context, (transaction) =>
        new PersistentProviderHealthMutationGate(
          new PersistentExternalActionReliabilityStore(transaction),
        ).allowMutation(context, proposal),
      );
    } catch {
      // A missing/rejected health store must never silently permit a mutation.
      return { allowed: false, code: 'PROVIDER_HEALTH_STATE_UNAVAILABLE' };
    }
  }

  async recordSuccess(context: TenantContext, proposal: { provider: string }): Promise<void> {
    await this.tenantDatabase.execute(context, (transaction) =>
      new PersistentProviderHealthMutationGate(
        new PersistentExternalActionReliabilityStore(transaction),
      ).recordSuccess(context, proposal),
    );
  }

  async recordFailure(
    context: TenantContext,
    proposal: { provider: string },
    code: string,
    retryAfterMs?: number,
  ): Promise<void> {
    await this.tenantDatabase.execute(context, (transaction) =>
      new PersistentProviderHealthMutationGate(
        new PersistentExternalActionReliabilityStore(transaction),
      ).recordFailure(context, proposal, code, retryAfterMs),
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
  private readonly safetyGate: ApiTenantExternalActionSafetyGate<TTransaction>;
  private readonly tenantDatabase: ApiTenantDatabase<TTransaction>;

  constructor(
    tenantDatabase: ApiTenantDatabase<TTransaction>,
    private readonly providers: ExternalActionProviderRegistry,
    private readonly approvals: ApprovalApiService,
  ) {
    this.tenantDatabase = tenantDatabase;
    this.store = new ApiTenantExternalActionStore(tenantDatabase);
    this.entitlements = new ApiTenantEntitlementAuthority(tenantDatabase);
    this.policies = new ApiTenantExternalActionPolicySource(tenantDatabase);
    this.safetyGate = new ApiTenantExternalActionSafetyGate(tenantDatabase);
  }

  async propose(context: TenantContext, proposal: ExternalMarketingActionProposal): Promise<GovernedExternalAction> {
    const action = await (await this.executor(context, proposal.provider)).propose(context, proposal);
    await this.recordOperationalEvent(context, action, 'PROPOSAL_CREATED');
    return action;
  }

  async simulate(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    const started = Date.now();
    const simulated = await (await this.executor(context, action.proposal.provider)).simulate(context, actionId);
    await this.recordOperationalEvent(context, simulated, 'SIMULATION_COMPLETED', started);
    return simulated;
  }

  async requestApproval(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    const requested = await (await this.executor(context, action.proposal.provider)).requestApproval(context, actionId);
    await this.recordOperationalEvent(context, requested, 'POLICY_DECISION');
    if (requested.approvalId) await this.recordOperationalEvent(context, requested, 'APPROVAL_REQUESTED');
    return requested;
  }

  async execute(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    const started = Date.now();
    await this.recordOperationalEvent(context, action, 'EXECUTE_ATTEMPT');
    const executed = await (await this.executor(context, action.proposal.provider)).execute(context, actionId);
    const isRollback = typeof action.proposal.metadata.rollbackOf === 'string';
    if (executed.status === 'VERIFIED' || executed.status === 'ROLLBACK_REQUIRED') {
      await this.recordOperationalEvent(context, executed, 'PROVIDER_EXECUTED', started);
    }
    const event = executed.status === 'VERIFIED'
      ? isRollback ? 'ROLLBACK_SUCCEEDED' : 'PROVIDER_VERIFIED'
      : executed.status === 'ROLLBACK_REQUIRED'
        ? isRollback ? 'ROLLBACK_FAILED' : 'VERIFICATION_MISMATCH'
        : executed.failureCode === 'PROVIDER_OUTCOME_UNCERTAIN'
          ? 'PROVIDER_UNCERTAIN'
          : 'PROVIDER_SERVER_FAILURE';
    await this.recordOperationalEvent(context, executed, event, started, executed.failureCode);
    return executed;
  }

  async get(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    return (await this.executor(context, action.proposal.provider)).get(context, actionId);
  }

  async proposeRollback(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    const rollback = await (await this.executor(context, action.proposal.provider)).proposeRollback(context, actionId);
    await this.recordOperationalEvent(context, action, 'ROLLBACK_REQUESTED');
    return rollback;
  }

  async recordApprovalDecision(context: TenantContext, actionId: string): Promise<void> {
    const action = await this.get(context, actionId);
    const requested = action.evidence.find((item) => item.type === 'DURABLE_APPROVAL_REQUESTED')?.occurredAt;
    const latencyMs = requested ? Math.max(0, Date.now() - Date.parse(requested)) : undefined;
    await this.recordOperationalEvent(context, action, 'APPROVAL_DECIDED', undefined, undefined, latencyMs);
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
      this.providers.get(provider),
      budget,
      new ExternalActionPolicyEngine(),
      policy,
      this.approvals,
      { mutationSafetyGate: this.safetyGate },
    );
  }

  private async recordOperationalEvent(
    context: TenantContext,
    action: GovernedExternalAction,
    eventType:
      | 'PROPOSAL_CREATED'
      | 'SIMULATION_COMPLETED'
      | 'POLICY_DECISION'
      | 'APPROVAL_REQUESTED'
      | 'APPROVAL_DECIDED'
      | 'EXECUTE_ATTEMPT'
      | 'PROVIDER_EXECUTED'
      | 'PROVIDER_VERIFIED'
      | 'VERIFICATION_MISMATCH'
      | 'PROVIDER_UNCERTAIN'
      | 'PROVIDER_SERVER_FAILURE'
      | 'ROLLBACK_REQUESTED'
      | 'ROLLBACK_SUCCEEDED'
      | 'ROLLBACK_FAILED',
    startedAt?: number,
    errorCode?: string,
    explicitLatencyMs?: number,
  ): Promise<void> {
    try {
      await this.tenantDatabase.execute(context, (transaction) =>
        new PersistentExternalActionReliabilityStore(transaction).recordEvent(context, {
          id: `external-action-event:${action.id}:${eventType}`,
          provider: action.proposal.provider,
          externalActionId: action.id,
          workflowRunId: action.proposal.workflowRunId,
          correlationId: action.id,
          eventType,
          ...(startedAt !== undefined ? { latencyMs: Date.now() - startedAt } : {}),
          ...(explicitLatencyMs !== undefined ? { latencyMs: explicitLatencyMs } : {}),
          ...(errorCode ? { errorCode } : {}),
        }),
      );
    } catch {
      // Operational events are intentionally non-blocking. The durable action
      // state and the provider gate remain the governing system of record.
    }
  }
}
