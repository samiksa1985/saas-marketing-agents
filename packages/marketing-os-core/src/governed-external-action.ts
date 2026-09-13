import { createHash, randomUUID } from 'node:crypto';

import type { EntitlementDecision, TenantContext } from '@platform/contracts';

import {
  assertExternalMarketingActionProposal,
  assertExternalMarketingActionTransition,
  type ExternalActionEvidenceReference,
  type ExternalMarketingProvider,
  type ExternalMarketingAction,
  type ExternalMarketingActionProposal,
  type ExternalMarketingActionStatus,
} from './external-marketing-action.js';

export type ExternalActionAssessment = 'ALLOW' | 'WARN' | 'BLOCK';
export type ExternalActionPolicyOutcome = 'ALLOW' | 'REQUIRE_APPROVAL' | 'DENY';
export type ExternalActionVerificationStatus = 'VERIFIED' | 'PARTIAL' | 'MISMATCH' | 'FAILED';

export interface ExternalActionSimulation {
  assessment: ExternalActionAssessment;
  reasons: string[];
  currentValue?: number;
  proposedValue?: number;
  absoluteDelta?: number;
  percentageDelta?: number;
  estimatedDailySpendDelta?: number;
  estimatedMonthlySpendDelta?: number;
  expectedKpiImpact?: Record<string, unknown>;
  confidence: number;
  assumptions: string[];
  providerState: Record<string, unknown>;
  simulatedAt: string;
}

export interface ExternalActionBudgetDecision {
  assessment: ExternalActionAssessment;
  reasons: string[];
  entitlement?: EntitlementDecision;
  hardDailySpendLimit?: number;
  hardMonthlySpendLimit?: number;
  checkedAt: string;
}

export interface ExternalActionPolicy {
  /** Stable durable policy identity, recorded with every evaluated action. */
  policyId?: string;
  /** Monotonic durable policy revision, recorded with every evaluated action. */
  policyVersion?: number;
  tenantId: string;
  providerAllowlist: string[];
  actionTypeAllowlist: string[];
  accountAllowlist?: string[];
  accountDenylist?: string[];
  campaignAllowlist?: string[];
  campaignDenylist?: string[];
  maxAbsoluteBudgetDelta?: number;
  maxPercentageBudgetDelta?: number;
  minimumConfidence: number;
  requiredEvidence: boolean;
  requiredApprovalLevel: 'NONE' | 'HUMAN';
  /** Canonical role required to decide an approval when policy mandates it. */
  requiredApprovalRole?: string;
  allowedExecutionHoursUtc?: { start: number; end: number };
  highRiskActionTypes?: string[];
  killSwitch: boolean;
  dryRunOnly: boolean;
}

export interface ExternalActionPolicyDecision {
  outcome: ExternalActionPolicyOutcome;
  reasons: string[];
  evaluatedAt: string;
  policyId?: string;
  policyVersion?: number;
  requiredApprovalRole?: string;
  dryRunOnly: boolean;
}

/**
 * Narrow product-facing policy port. The local PostgreSQL implementation is
 * authoritative today; a future NAWA Core adapter can implement this without
 * moving Google Ads semantics or marketing evidence out of this domain.
 */
export interface ExternalActionPolicyResolution {
  policy: ExternalActionPolicy;
  hardDailySpendLimit: number;
  hardMonthlySpendLimit: number;
}

export interface ExternalActionPolicyProvider {
  resolve(
    context: TenantContext,
    provider: ExternalMarketingProvider,
  ): Promise<ExternalActionPolicyResolution | undefined>;
}

export interface ExternalActionProviderSimulation {
  currentValue?: number;
  currentState: Record<string, unknown>;
  expectedKpiImpact?: Record<string, unknown>;
  assumptions?: string[];
}

export interface ExternalActionProviderExecution {
  providerReference: string;
  observedState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ExternalActionProviderVerification {
  status: ExternalActionVerificationStatus;
  observedState: Record<string, unknown>;
  reasons: string[];
  verifiedAt: string;
}

/**
 * Read-back result used only after a provider reports an ambiguous outcome.
 * APPLIED permits verification without a second mutation; INCONCLUSIVE keeps
 * the action failed and blocks automated replay.
 */
export interface ExternalActionProviderReconciliation {
  status: 'APPLIED' | 'NOT_APPLIED' | 'INCONCLUSIVE';
  execution?: ExternalActionProviderExecution;
  observedState?: Record<string, unknown>;
  reasons: string[];
}

/**
 * Opaque, in-process dispatch capability minted solely by the governed
 * executor. Provider gateways verify it at runtime, so a controller, agent,
 * workflow payload, or adapter caller cannot manufacture an EXECUTING action
 * object to bypass the approval and policy chain.
 */
export interface GovernedExternalActionDispatch {
  readonly action: GovernedExternalAction;
}

const governedDispatches = new WeakSet<object>();

function createGovernedDispatch(action: GovernedExternalAction): GovernedExternalActionDispatch {
  const dispatch = Object.freeze({ action: clone(action) });
  governedDispatches.add(dispatch);
  return dispatch;
}

export function isGovernedExternalActionDispatch(value: unknown): value is GovernedExternalActionDispatch {
  return Boolean(value && typeof value === 'object' && governedDispatches.has(value as object));
}

/**
 * The orchestrator can only reach an external provider through this gateway.
 * Credential resolution and provider transport deliberately live behind it.
 */
export interface ExternalMarketingProviderGateway {
  /**
   * Providers without an explicit dry-run declaration are treated as live
   * when a policy is dry-run only. This keeps that policy fail-closed.
   */
  readonly executionMode?: 'DRY_RUN' | 'LIVE';
  /**
   * Derives a new restoration operation from a durable original action. The
   * executor deliberately does not infer provider semantics from a payload:
   * a state-setting provider may need a different action type to undo a
   * previous action. Providers must fail closed when the durable before-state
   * is not sufficient to derive a safe rollback.
   */
  deriveRollbackProposal?(
    context: TenantContext,
    original: GovernedExternalAction,
  ): Promise<ExternalActionRollbackDerivation>;
  simulate(
    context: TenantContext,
    proposal: ExternalMarketingActionProposal,
  ): Promise<ExternalActionProviderSimulation>;
  execute(
    context: TenantContext,
    dispatch: GovernedExternalActionDispatch,
  ): Promise<ExternalActionProviderExecution>;
  verify(
    context: TenantContext,
    action: GovernedExternalAction,
    execution: ExternalActionProviderExecution,
  ): Promise<ExternalActionProviderVerification>;
  reconcileUnknownExecution?(
    context: TenantContext,
    action: GovernedExternalAction,
  ): Promise<ExternalActionProviderReconciliation>;
}

/** Provider-neutral restoration intent returned by a provider gateway. */
export interface ExternalActionRollbackDerivation {
  actionType: string;
  requestedPayload: Record<string, unknown>;
  reason?: string;
}

export interface ExternalActionApprovalRecord {
  id: string;
  tenantId: string;
  decision?: 'approved' | 'approved_with_conditions' | 'rejected' | 'expired';
  expiresAt?: string;
}

export interface ExternalActionApprovalGateway {
  create(
    context: TenantContext,
    input: {
      artifactId: string;
      idempotencyKey: string;
      expiresAt?: string;
      conditions?: string[];
      planId?: string;
      workflowId?: string;
      reason?: string;
      policyReference?: string;
      riskLevel?: string;
      actionSummary?: string;
    },
  ): Promise<ExternalActionApprovalRecord>;
  get(approvalId: string, context: TenantContext): Promise<ExternalActionApprovalRecord>;
}

export interface ExternalActionEntitlementAuthority {
  authorize(tenantId: string, entitlementKey: string): Promise<EntitlementDecision>;
}

export interface ExternalActionBudgetPolicy {
  tenantId: string;
  hardDailySpendLimit?: number;
  hardMonthlySpendLimit?: number;
}

/** Uses the Phase-1 authoritative entitlement port; callers cannot supply a quota. */
export class CanonicalExternalActionBudgetAuthority {
  constructor(
    private readonly entitlements: ExternalActionEntitlementAuthority | undefined,
    private readonly policy: ExternalActionBudgetPolicy | undefined,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async evaluate(
    context: TenantContext,
    proposal: ExternalMarketingActionProposal,
    simulation: ExternalActionSimulation,
  ): Promise<ExternalActionBudgetDecision> {
    const checkedAt = this.now();
    if (!context.tenantId || context.tenantId !== proposal.tenantId) {
      return { assessment: 'BLOCK', reasons: ['MISSING_OR_CROSS_TENANT_CONTEXT'], checkedAt };
    }
    if (!this.entitlements || !this.policy || this.policy.tenantId !== context.tenantId) {
      return { assessment: 'BLOCK', reasons: ['BILLING_OR_BUDGET_POLICY_UNAVAILABLE'], checkedAt };
    }
    let entitlement: EntitlementDecision;
    try {
      entitlement = await this.entitlements.authorize(context.tenantId, 'marketing.external_action.google_ads');
    } catch {
      return { assessment: 'BLOCK', reasons: ['BILLING_AUTHORITY_UNAVAILABLE'], checkedAt };
    }
    if (!entitlement.allowed) {
      return { assessment: 'BLOCK', reasons: ['ENTITLEMENT_DENIED'], entitlement, checkedAt };
    }
    const daily = Math.max(0, simulation.estimatedDailySpendDelta ?? 0);
    const monthly = Math.max(0, simulation.estimatedMonthlySpendDelta ?? 0);
    if (
      (daily > 0 && this.policy.hardDailySpendLimit === undefined) ||
      (monthly > 0 && this.policy.hardMonthlySpendLimit === undefined)
    ) {
      return {
        assessment: 'BLOCK',
        reasons: ['BUDGET_HARD_LIMIT_UNAVAILABLE'],
        entitlement,
        checkedAt,
      };
    }
    if (
      (this.policy.hardDailySpendLimit !== undefined && daily > this.policy.hardDailySpendLimit) ||
      (this.policy.hardMonthlySpendLimit !== undefined && monthly > this.policy.hardMonthlySpendLimit)
    ) {
      return {
        assessment: 'BLOCK',
        reasons: ['BUDGET_HARD_LIMIT_EXCEEDED'],
        entitlement,
        ...(this.policy.hardDailySpendLimit !== undefined
          ? { hardDailySpendLimit: this.policy.hardDailySpendLimit }
          : {}),
        ...(this.policy.hardMonthlySpendLimit !== undefined
          ? { hardMonthlySpendLimit: this.policy.hardMonthlySpendLimit }
          : {}),
        checkedAt,
      };
    }
    return {
      assessment: simulation.assessment === 'BLOCK' ? 'BLOCK' : simulation.assessment,
      reasons: simulation.assessment === 'WARN' ? ['SIMULATION_WARNING'] : [],
      entitlement,
      ...(this.policy.hardDailySpendLimit !== undefined
        ? { hardDailySpendLimit: this.policy.hardDailySpendLimit }
        : {}),
      ...(this.policy.hardMonthlySpendLimit !== undefined
        ? { hardMonthlySpendLimit: this.policy.hardMonthlySpendLimit }
        : {}),
      checkedAt,
    };
  }
}

export class ExternalActionPolicyEngine {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  evaluate(
    context: TenantContext,
    proposal: ExternalMarketingActionProposal,
    simulation: ExternalActionSimulation,
    policy: ExternalActionPolicy | undefined,
  ): ExternalActionPolicyDecision {
    const evaluatedAt = this.now();
    if (!context.tenantId || context.tenantId !== proposal.tenantId || !policy) {
      return deny(['MISSING_TENANT_OR_POLICY'], evaluatedAt);
    }
    if (policy.tenantId !== context.tenantId || policy.killSwitch) {
      return deny([policy.killSwitch ? 'KILL_SWITCH_ENABLED' : 'POLICY_TENANT_MISMATCH'], evaluatedAt);
    }
    if (!policy.providerAllowlist.includes(proposal.provider)) return deny(['PROVIDER_NOT_ALLOWED'], evaluatedAt);
    if (!policy.actionTypeAllowlist.includes(proposal.actionType)) return deny(['ACTION_TYPE_NOT_ALLOWED'], evaluatedAt);
    if (policy.accountDenylist?.includes(proposal.accountId)) return deny(['ACCOUNT_DENYLISTED'], evaluatedAt);
    if (policy.accountAllowlist && !policy.accountAllowlist.includes(proposal.accountId)) return deny(['ACCOUNT_NOT_ALLOWLISTED'], evaluatedAt);
    if (proposal.campaignId && policy.campaignDenylist?.includes(proposal.campaignId)) return deny(['CAMPAIGN_DENYLISTED'], evaluatedAt);
    if (proposal.campaignId && policy.campaignAllowlist && !policy.campaignAllowlist.includes(proposal.campaignId)) return deny(['CAMPAIGN_NOT_ALLOWLISTED'], evaluatedAt);
    if (proposal.confidence < policy.minimumConfidence) return deny(['MINIMUM_CONFIDENCE_NOT_MET'], evaluatedAt);
    if (policy.requiredEvidence && proposal.evidence.length === 0) return deny(['EVIDENCE_REQUIRED'], evaluatedAt);
    if (
      policy.maxAbsoluteBudgetDelta !== undefined &&
      Math.abs(simulation.absoluteDelta ?? 0) > policy.maxAbsoluteBudgetDelta
    ) return deny(['MAX_ABSOLUTE_BUDGET_DELTA_EXCEEDED'], evaluatedAt);
    if (
      policy.maxPercentageBudgetDelta !== undefined &&
      Math.abs(simulation.percentageDelta ?? 0) > policy.maxPercentageBudgetDelta
    ) return deny(['MAX_PERCENTAGE_BUDGET_DELTA_EXCEEDED'], evaluatedAt);
    if (policy.allowedExecutionHoursUtc && !isAllowedHour(this.now(), policy.allowedExecutionHoursUtc)) {
      return deny(['OUTSIDE_ALLOWED_EXECUTION_HOURS'], evaluatedAt);
    }
    const approvalRequired =
      proposal.approvalRequirement === 'REQUIRED' ||
      policy.requiredApprovalLevel === 'HUMAN' ||
      policy.highRiskActionTypes?.includes(proposal.actionType) === true ||
      proposal.riskLevel.toUpperCase() === 'HIGH';
    return {
      outcome: approvalRequired ? 'REQUIRE_APPROVAL' : 'ALLOW',
      reasons: policy.dryRunOnly ? ['DRY_RUN_ONLY'] : [],
      evaluatedAt,
      ...(policy.policyId ? { policyId: policy.policyId } : {}),
      ...(policy.policyVersion !== undefined ? { policyVersion: policy.policyVersion } : {}),
      ...(policy.requiredApprovalRole ? { requiredApprovalRole: policy.requiredApprovalRole } : {}),
      dryRunOnly: policy.dryRunOnly,
    };
  }
}

export interface ExternalActionEvidence {
  id: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface GovernedExternalAction extends ExternalMarketingAction {
  proposal: ExternalMarketingActionProposal;
  simulation?: ExternalActionSimulation;
  budgetDecision?: ExternalActionBudgetDecision;
  policyDecision?: ExternalActionPolicyDecision;
  execution?: ExternalActionProviderExecution;
  verification?: ExternalActionProviderVerification;
  evidence: ExternalActionEvidence[];
  version: number;
}

export interface ExternalActionStore {
  create(context: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction>;
  get(context: TenantContext, actionId: string): Promise<GovernedExternalAction | undefined>;
  save(context: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction>;
  findByIdempotency(
    context: TenantContext,
    provider: string,
    actionId: string,
    idempotencyKey: string,
  ): Promise<GovernedExternalAction | undefined>;
}

/** Test/dev-only implementation. Production composition must inject a durable store. */
export class InMemoryExternalActionStore implements ExternalActionStore {
  private readonly byId = new Map<string, GovernedExternalAction>();
  private readonly locks = new Map<string, string>();

  async create(context: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction> {
    assertActionTenant(context, action);
    const existing = await this.findByIdempotency(
      context,
      action.proposal.provider,
      action.id,
      action.idempotencyKey,
    );
    if (existing) return existing;
    this.claimTarget(action);
    this.byId.set(key(context.tenantId, action.id), clone(action));
    return clone(action);
  }

  async get(context: TenantContext, actionId: string): Promise<GovernedExternalAction | undefined> {
    if (!context.tenantId) throw new Error('TENANT_CONTEXT_REQUIRED');
    const action = this.byId.get(key(context.tenantId, actionId));
    return action ? clone(action) : undefined;
  }

  async save(context: TenantContext, action: GovernedExternalAction): Promise<GovernedExternalAction> {
    assertActionTenant(context, action);
    const stored = this.byId.get(key(context.tenantId, action.id));
    if (!stored) throw new Error('EXTERNAL_ACTION_NOT_FOUND');
    if (stored.version !== action.version) throw new Error('EXTERNAL_ACTION_OPTIMISTIC_CONFLICT');
    const next = { ...clone(action), version: action.version + 1 };
    this.updateTargetLock(stored, next);
    this.byId.set(key(context.tenantId, action.id), next);
    return clone(next);
  }

  async findByIdempotency(
    context: TenantContext,
    provider: string,
    actionId: string,
    idempotencyKey: string,
  ): Promise<GovernedExternalAction | undefined> {
    if (!context.tenantId) throw new Error('TENANT_CONTEXT_REQUIRED');
    return [...this.byId.values()]
      .filter((item) => item.tenantId === context.tenantId)
      .find((item) => item.proposal.provider === provider && item.id === actionId && item.idempotencyKey === idempotencyKey)
      ? clone([...this.byId.values()].find((item) => item.tenantId === context.tenantId && item.proposal.provider === provider && item.id === actionId && item.idempotencyKey === idempotencyKey)!)
      : undefined;
  }

  private claimTarget(action: GovernedExternalAction): void {
    const target = targetKey(action);
    const owner = this.locks.get(target);
    if (owner && owner !== action.id) throw new Error('EXTERNAL_ACTION_CONFLICTING_TARGET');
    this.locks.set(target, action.id);
  }

  private updateTargetLock(previous: GovernedExternalAction, next: GovernedExternalAction): void {
    const target = targetKey(next);
    if (isActive(next.status)) this.claimTarget(next);
    else if (this.locks.get(target) === previous.id) this.locks.delete(target);
  }
}

export interface GovernedExternalActionExecutorOptions {
  now?: () => string;
  createId?: () => string;
  /**
   * Optional provider-neutral health gate. It is evaluated only immediately
   * before a governed mutation; simulation and read-back verification remain
   * available so an unsafe provider can be diagnosed without a raw bypass.
   */
  mutationSafetyGate?: ExternalActionMutationSafetyGate;
}

/** Persistence adapters may supply a fail-closed provider health circuit breaker. */
export interface ExternalActionMutationSafetyGate {
  allowMutation(
    context: TenantContext,
    proposal: Pick<ExternalMarketingActionProposal, 'provider'>,
  ): Promise<{ allowed: boolean; code?: string }>;
  recordSuccess?(
    context: TenantContext,
    proposal: Pick<ExternalMarketingActionProposal, 'provider'>,
  ): Promise<void>;
  recordFailure?(
    context: TenantContext,
    proposal: Pick<ExternalMarketingActionProposal, 'provider'>,
    code: string,
  ): Promise<void>;
}

/**
 * The sole mutating orchestration path. It owns all state transitions and
 * never exposes a provider method to agents or HTTP controllers.
 */
export class GovernedExternalActionExecutor {
  private readonly now: () => string;
  private readonly createId: () => string;
  private readonly mutationSafetyGate: ExternalActionMutationSafetyGate | undefined;

  constructor(
    private readonly store: ExternalActionStore,
    private readonly provider: ExternalMarketingProviderGateway,
    private readonly budget: CanonicalExternalActionBudgetAuthority,
    private readonly policyEngine: ExternalActionPolicyEngine,
    private readonly policy: ExternalActionPolicy | undefined,
    private readonly approvals: ExternalActionApprovalGateway,
    options: GovernedExternalActionExecutorOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? randomUUID;
    this.mutationSafetyGate = options.mutationSafetyGate;
  }

  async propose(context: TenantContext, proposal: ExternalMarketingActionProposal): Promise<GovernedExternalAction> {
    assertExternalMarketingActionProposal(proposal);
    if (!context.tenantId || context.tenantId !== proposal.tenantId) throw new Error('TENANT_SCOPE_DENIED');
    const existing = await this.store.findByIdempotency(
      context,
      proposal.provider,
      proposal.actionId,
      proposal.idempotencyKey,
    );
    if (existing) return existing;
    const timestamp = this.now();
    const action: GovernedExternalAction = {
      id: proposal.actionId,
      tenantId: proposal.tenantId,
      planId: proposal.recommendationId,
      workflowId: proposal.workflowRunId,
      type: proposal.actionType,
      idempotencyKey: proposal.idempotencyKey,
      status: 'PROPOSED',
      requestedAt: proposal.requestedAt,
      updatedAt: timestamp,
      proposal: clone(proposal),
      organizationId: proposal.organizationId,
      actor: proposal.actor,
      agentIdentity: proposal.agentIdentity,
      recommendationId: proposal.recommendationId,
      provider: proposal.provider,
      accountId: proposal.accountId,
      ...(proposal.campaignId ? { campaignId: proposal.campaignId } : {}),
      actionType: proposal.actionType,
      requestedPayload: clone(proposal.requestedPayload),
      reason: proposal.reason,
      expectedOutcome: proposal.expectedOutcome,
      estimatedImpact: clone(proposal.estimatedImpact),
      estimatedCost: proposal.estimatedCost,
      currency: proposal.currency,
      riskLevel: proposal.riskLevel,
      policyContext: clone(proposal.policyContext),
      approvalRequirement: proposal.approvalRequirement,
      ...(proposal.expiresAt ? { expiresAt: proposal.expiresAt } : {}),
      metadata: clone(proposal.metadata),
      evidence: [this.evidence('PROPOSAL_CREATED', { proposal, recommendationEvidence: proposal.evidence })],
      version: 0,
    };
    return this.store.create(context, action);
  }

  async simulate(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    let action = await this.required(context, actionId);
    if (action.simulation) return action;
    if (action.status !== 'PROPOSED') throw new Error('EXTERNAL_ACTION_SIMULATION_NOT_ALLOWED');
    const providerSimulation = await this.provider.simulate(context, action.proposal);
    const simulation = makeSimulation(action.proposal, providerSimulation, this.now);
    action = await this.transition(context, action, 'SIMULATED', {
      simulation,
      evidence: [...action.evidence, this.evidence('SIMULATION_COMPLETED', simulation)],
    });
    return action;
  }

  async requestApproval(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const current = await this.required(context, actionId);
    if (current.status === 'AWAITING_APPROVAL' || current.status === 'APPROVED') return current;
    let action = await this.simulate(context, actionId);
    if (!action.simulation) throw new Error('EXTERNAL_ACTION_SIMULATION_REQUIRED');
    const budget = await this.budget.evaluate(context, action.proposal, action.simulation);
    if (budget.assessment === 'BLOCK') {
      return this.transition(context, action, 'REJECTED', {
        budgetDecision: budget,
        evidence: [...action.evidence, this.evidence('BUDGET_DENIED', budget)],
      });
    }
    action = await this.transition(context, action, 'BUDGET_APPROVED', {
      budgetDecision: budget,
      evidence: [...action.evidence, this.evidence('BUDGET_DECISION', budget)],
    });
    const policy = this.policyEngine.evaluate(context, action.proposal, action.simulation!, this.policy);
    if (policy.outcome === 'DENY') {
      return this.transition(context, action, 'REJECTED', {
        policyDecision: policy,
        evidence: [...action.evidence, this.evidence('POLICY_DENIED', policy)],
      });
    }
    action = await this.transition(context, action, 'POLICY_APPROVED', {
      policyDecision: policy,
      evidence: [...action.evidence, this.evidence('POLICY_DECISION', policy)],
    });
    if (policy.outcome === 'ALLOW' && action.proposal.approvalRequirement === 'OPTIONAL') {
      return this.transition(context, action, 'APPROVED', {
        evidence: [...action.evidence, this.evidence('APPROVAL_NOT_REQUIRED', { policy })],
      });
    }
    const approval = await this.approvals.create(context, {
      artifactId: action.id,
      idempotencyKey: `external-action:${action.id}:${action.idempotencyKey}`,
      ...(action.proposal.expiresAt ? { expiresAt: action.proposal.expiresAt } : {}),
      planId: action.planId,
      workflowId: action.workflowId,
      reason: action.proposal.reason,
      policyReference: 'external-action-policy',
      riskLevel: action.proposal.riskLevel,
      actionSummary: `${action.proposal.provider}:${action.proposal.actionType}:${action.proposal.accountId}`,
    });
    action = await this.transition(context, action, 'APPROVAL_REQUIRED', {
      approvalId: approval.id,
      evidence: [...action.evidence, this.evidence('DURABLE_APPROVAL_REQUESTED', { approvalId: approval.id })],
    });
    return this.transition(context, action, 'AWAITING_APPROVAL', {});
  }

  async execute(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    let action = await this.required(context, actionId);
    if (action.status === 'VERIFIED') return action;
    if (action.status !== 'AWAITING_APPROVAL' && action.status !== 'APPROVED') {
      throw new Error('EXTERNAL_ACTION_NOT_READY_FOR_EXECUTION');
    }
    if (isExpired(action.proposal.expiresAt, this.now())) {
      return this.transition(context, action, 'REJECTED', {
        evidence: [...action.evidence, this.evidence('APPROVAL_OR_ACTION_EXPIRED', {})],
      });
    }
    if (!action.simulation || !action.budgetDecision || !action.policyDecision) {
      throw new Error('EXTERNAL_ACTION_GOVERNANCE_CHAIN_INCOMPLETE');
    }
    const refreshedBudget = await this.budget.evaluate(context, action.proposal, action.simulation);
    if (refreshedBudget.assessment === 'BLOCK') {
      return this.transition(context, action, 'REJECTED', {
        budgetDecision: refreshedBudget,
        evidence: [...action.evidence, this.evidence('PRE_EXECUTION_BUDGET_DENIED', refreshedBudget)],
      });
    }
    const refreshedPolicy = this.policyEngine.evaluate(context, action.proposal, action.simulation, this.policy);
    if (refreshedPolicy.outcome === 'DENY') {
      return this.transition(context, action, 'REJECTED', {
        policyDecision: refreshedPolicy,
        evidence: [...action.evidence, this.evidence('PRE_EXECUTION_POLICY_DENIED', refreshedPolicy)],
      });
    }
    if (refreshedPolicy.outcome === 'REQUIRE_APPROVAL' || action.proposal.approvalRequirement === 'REQUIRED') {
      if (!action.approvalId) throw new Error('EXTERNAL_ACTION_APPROVAL_REQUIRED');
      const approval = await this.approvals.get(action.approvalId, context);
      const approved = approval.decision === 'approved' || approval.decision === 'approved_with_conditions';
      if (!approved || isExpired(approval.expiresAt, this.now())) {
        return this.transition(context, action, 'REJECTED', {
          evidence: [
            ...action.evidence,
            this.evidence('DURABLE_APPROVAL_NOT_VALID', {
              approvalId: action.approvalId,
              decision: approval.decision ?? 'PENDING',
              expired: isExpired(approval.expiresAt, this.now()),
            }),
          ],
        });
      }
    }
    if (action.status === 'AWAITING_APPROVAL') action = await this.transition(context, action, 'APPROVED', {});
    if (refreshedPolicy.dryRunOnly && this.provider.executionMode !== 'DRY_RUN') {
      return this.transition(context, action, 'REJECTED', {
        policyDecision: refreshedPolicy,
        failureCode: 'POLICY_DRY_RUN_ONLY',
        evidence: [...action.evidence, this.evidence('DRY_RUN_ONLY_BLOCKED_LIVE_EXECUTION', refreshedPolicy)],
      });
    }
    const healthDecision = await this.mutationSafetyGate?.allowMutation(context, action.proposal);
    if (healthDecision && !healthDecision.allowed) {
      return this.transition(context, action, 'REJECTED', {
        failureCode: healthDecision.code ?? 'PROVIDER_HEALTH_BLOCKED',
        evidence: [
          ...action.evidence,
          this.evidence('PROVIDER_HEALTH_MUTATION_BLOCKED', {
            code: healthDecision.code ?? 'PROVIDER_HEALTH_BLOCKED',
          }),
        ],
      });
    }
    action = await this.transition(context, action, 'EXECUTING', {
      budgetDecision: refreshedBudget,
      policyDecision: refreshedPolicy,
      evidence: [...action.evidence, this.evidence('EXECUTION_STARTED', {})],
    });
    try {
      const execution = await this.provider.execute(context, createGovernedDispatch(action));
      const verified = await this.verifyExecution(context, action, execution, 'PROVIDER_EXECUTED');
      await this.recordProviderHealthSuccess(context, action.proposal);
      return verified;
    } catch (error) {
      const details = providerErrorDetails(error);
      await this.recordProviderHealthFailure(context, action.proposal, details.code);
      if (details.unknownOutcome) {
        const recovery = await this.reconcileUnknownExecution(context, action);
        if (recovery.status === 'APPLIED' && recovery.execution) {
          return this.verifyExecution(context, action, recovery.execution, 'PROVIDER_TIMEOUT_RECONCILED', recovery);
        }
        return this.transition(context, action, 'FAILED', {
          failureCode: recovery.status === 'INCONCLUSIVE' ? 'PROVIDER_OUTCOME_UNCERTAIN' : details.code,
          ...(details.message ? { failureMessage: details.message } : {}),
          evidence: [
            ...action.evidence,
            this.evidence('PROVIDER_EXECUTION_AMBIGUOUS', { details, recovery }),
          ],
        });
      }
      return this.transition(context, action, 'FAILED', {
        failureCode: details.code,
        ...(details.message ? { failureMessage: details.message } : {}),
        evidence: [...action.evidence, this.evidence('PROVIDER_EXECUTION_FAILED', details)],
      });
    }
  }

  /**
   * A retry is a new governed attempt over the durable action record. It
   * revalidates budget, policy, and the durable approval before the provider
   * boundary is reached; provider idempotency prevents duplicate mutations.
   */
  async retry(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const action = await this.required(context, actionId);
    if (action.status !== 'FAILED') throw new Error('EXTERNAL_ACTION_RETRY_NOT_ALLOWED');
    if (action.failureCode === 'PROVIDER_OUTCOME_UNCERTAIN') {
      const recovery = await this.reconcileUnknownExecution(context, action);
      if (recovery.status === 'APPLIED' && recovery.execution) {
        return this.verifyExecution(context, action, recovery.execution, 'PROVIDER_RETRY_RECONCILED', recovery);
      }
      if (recovery.status === 'INCONCLUSIVE') {
        throw new Error('EXTERNAL_ACTION_RECOVERY_REQUIRED');
      }
    }
    const { failureCode: _failureCode, failureMessage: _failureMessage, ...retryable } = action;
    const prepared = await this.transition(context, retryable, 'APPROVED', {
      evidence: [...retryable.evidence, this.evidence('RETRY_REQUESTED', {})],
    });
    return this.execute(context, prepared.id);
  }

  /** Rollback is a new proposal and therefore follows the same full pipeline. */
  async proposeRollback(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    const original = await this.required(context, actionId);
    if (original.status !== 'ROLLBACK_REQUIRED' && original.status !== 'VERIFIED') {
      throw new Error('EXTERNAL_ACTION_ROLLBACK_NOT_AVAILABLE');
    }
    if (!this.provider.deriveRollbackProposal) {
      throw new Error('EXTERNAL_ACTION_ROLLBACK_DERIVATION_UNSUPPORTED');
    }
    const derived = await this.provider.deriveRollbackProposal(context, clone(original));
    assertRollbackDerivation(derived);
    const rollbackIdentity = rollbackIdentityFor(original);
    const proposal: ExternalMarketingActionProposal = {
      ...clone(original.proposal),
      actionId: `rollback-action:${rollbackIdentity}`,
      recommendationId: `${original.proposal.recommendationId}:rollback`,
      idempotencyKey: `rollback:${rollbackIdentity}`,
      actionType: derived.actionType,
      requestedPayload: clone(derived.requestedPayload),
      reason: derived.reason ?? `Rollback of ${original.id}: ${original.proposal.rollback.strategy}`,
      requestedAt: this.now(),
      metadata: { ...original.proposal.metadata, rollbackOf: original.id, rollbackActionType: derived.actionType },
      evidence: [
        ...original.proposal.evidence,
        {
          id: original.id,
          source: 'external-action',
          summary: `Rollback proposal derived from durable before-state as ${derived.actionType}.`,
        },
      ],
    };
    return this.propose(context, proposal);
  }

  get(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    return this.required(context, actionId);
  }

  private async required(context: TenantContext, actionId: string): Promise<GovernedExternalAction> {
    if (!context.tenantId) throw new Error('TENANT_CONTEXT_REQUIRED');
    const action = await this.store.get(context, actionId);
    if (!action) throw new Error('EXTERNAL_ACTION_NOT_FOUND_OR_ACCESS_DENIED');
    assertActionTenant(context, action);
    return action;
  }

  private async transition(
    context: TenantContext,
    action: GovernedExternalAction,
    next: ExternalMarketingActionStatus,
    patch: Partial<GovernedExternalAction>,
  ): Promise<GovernedExternalAction> {
    assertExternalMarketingActionTransition(action, next);
    return this.store.save(context, {
      ...action,
      ...patch,
      status: next,
      updatedAt: this.now(),
      evidence: patch.evidence ?? action.evidence,
    });
  }

  private async recordProviderHealthSuccess(
    context: TenantContext,
    proposal: ExternalMarketingActionProposal,
  ): Promise<void> {
    try {
      await this.mutationSafetyGate?.recordSuccess?.(context, proposal);
    } catch {
      // Health telemetry must never hide a completed governed provider result.
    }
  }

  private async recordProviderHealthFailure(
    context: TenantContext,
    proposal: ExternalMarketingActionProposal,
    code: string,
  ): Promise<void> {
    try {
      await this.mutationSafetyGate?.recordFailure?.(context, proposal, code);
    } catch {
      // The original provider failure remains authoritative if metrics fail.
    }
  }

  private async verifyExecution(
    context: TenantContext,
    action: GovernedExternalAction,
    execution: ExternalActionProviderExecution,
    evidenceType: string,
    reconciliation?: ExternalActionProviderReconciliation,
  ): Promise<GovernedExternalAction> {
    action = await this.transition(context, action, 'VERIFYING', {
      execution: redact(execution) as ExternalActionProviderExecution,
      providerReference: execution.providerReference,
      evidence: [
        ...action.evidence,
        this.evidence(evidenceType, {
          execution,
          ...(reconciliation ? { reconciliation } : {}),
        }),
      ],
    });
    const verification = await this.provider.verify(context, action, execution);
    const next = verification.status === 'VERIFIED' ? 'VERIFIED' : 'ROLLBACK_REQUIRED';
    return this.transition(context, action, next, {
      verification: redact(verification) as ExternalActionProviderVerification,
      evidence: [...action.evidence, this.evidence('PROVIDER_VERIFICATION', verification)],
    });
  }

  private async reconcileUnknownExecution(
    context: TenantContext,
    action: GovernedExternalAction,
  ): Promise<ExternalActionProviderReconciliation> {
    if (!this.provider.reconcileUnknownExecution) {
      return { status: 'INCONCLUSIVE', reasons: ['PROVIDER_RECONCILIATION_UNAVAILABLE'] };
    }
    try {
      return await this.provider.reconcileUnknownExecution(context, action);
    } catch {
      return { status: 'INCONCLUSIVE', reasons: ['PROVIDER_RECONCILIATION_FAILED'] };
    }
  }

  private evidence(type: string, payload: unknown): ExternalActionEvidence {
    return { id: this.createId(), type, occurredAt: this.now(), payload: redact(payload) as Record<string, unknown> };
  }
}

function makeSimulation(
  proposal: ExternalMarketingActionProposal,
  provider: ExternalActionProviderSimulation,
  now: () => string,
): ExternalActionSimulation {
  const proposed = numericPayload(proposal.requestedPayload);
  const current = provider.currentValue;
  const absoluteDelta = current !== undefined && proposed !== undefined ? proposed - current : undefined;
  const percentageDelta = current && absoluteDelta !== undefined ? (absoluteDelta / current) * 100 : undefined;
  const spendDelta = proposal.actionType === 'UPDATE_CAMPAIGN_BUDGET' ? absoluteDelta : undefined;
  const assessment: ExternalActionAssessment =
    proposed === undefined || current === undefined ? 'WARN' : 'ALLOW';
  return {
    assessment,
    reasons: assessment === 'WARN' ? ['NUMERIC_DELTA_UNAVAILABLE'] : [],
    ...(current !== undefined ? { currentValue: current } : {}),
    ...(proposed !== undefined ? { proposedValue: proposed } : {}),
    ...(absoluteDelta !== undefined ? { absoluteDelta } : {}),
    ...(percentageDelta !== undefined ? { percentageDelta } : {}),
    ...(spendDelta !== undefined ? { estimatedDailySpendDelta: spendDelta, estimatedMonthlySpendDelta: spendDelta * 30 } : {}),
    ...(provider.expectedKpiImpact ? { expectedKpiImpact: clone(provider.expectedKpiImpact) } : {}),
    confidence: proposal.confidence,
    assumptions: [...(provider.assumptions ?? []), 'Simulation is an estimate, not a prediction of future performance.'],
    providerState: redact(provider.currentState) as Record<string, unknown>,
    simulatedAt: now(),
  };
}

function numericPayload(payload: Record<string, unknown>): number | undefined {
  for (const key of ['dailyBudget', 'budget', 'targetCpa', 'targetRoas']) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function deny(reasons: string[], evaluatedAt: string): ExternalActionPolicyDecision {
  return { outcome: 'DENY', reasons, evaluatedAt, dryRunOnly: false };
}

function isAllowedHour(timestamp: string, range: { start: number; end: number }): boolean {
  const hour = new Date(timestamp).getUTCHours();
  return range.start <= range.end ? hour >= range.start && hour < range.end : hour >= range.start || hour < range.end;
}

function assertActionTenant(context: TenantContext, action: GovernedExternalAction): void {
  if (!context.tenantId || action.tenantId !== context.tenantId || action.proposal.tenantId !== context.tenantId) {
    throw new Error('TENANT_SCOPE_DENIED');
  }
}

function targetKey(action: GovernedExternalAction): string {
  // PostgreSQL text/varchar rejects U+0000. Hash a typed tuple so the durable
  // partial-unique target lock remains collision-resistant and transport-safe.
  return createHash('sha256')
    .update(JSON.stringify([
      action.tenantId,
      action.proposal.provider,
      action.proposal.accountId,
      action.proposal.campaignId ?? action.proposal.accountId,
    ]))
    .digest('hex');
}

function isActive(status: ExternalMarketingActionStatus): boolean {
  // An uncertain original action must not itself retain the target lock: the
  // approved rollback proposal needs to acquire that same durable lock. The
  // rollback proposal then blocks any further mutation for the target.
  return !['VERIFIED', 'ACKNOWLEDGED', 'FAILED', 'REJECTED', 'CANCELLED', 'ROLLBACK_REQUIRED', 'ROLLED_BACK'].includes(status);
}

function key(tenantId: string, actionId: string): string {
  return `${tenantId}\u0000${actionId}`;
}

function rollbackIdentityFor(original: GovernedExternalAction): string {
  // A rollback replay is the same logical operation. Keep both the action ID
  // and idempotency key stable so the in-memory and durable stores converge on
  // one proposal even when two callers request the rollback concurrently.
  return createHash('sha256')
    .update(JSON.stringify([
      original.tenantId,
      original.proposal.provider,
      original.id,
      original.idempotencyKey,
    ]))
    .digest('hex');
}

function assertRollbackDerivation(value: ExternalActionRollbackDerivation): void {
  if (
    !value ||
    typeof value.actionType !== 'string' ||
    !value.actionType.trim() ||
    !value.requestedPayload ||
    typeof value.requestedPayload !== 'object' ||
    Array.isArray(value.requestedPayload)
  ) {
    throw new Error('EXTERNAL_ACTION_ROLLBACK_DERIVATION_INVALID');
  }
}

function isExpired(expiresAt: string | undefined, now: string): boolean {
  return expiresAt !== undefined && Date.parse(expiresAt) <= Date.parse(now);
}

function providerErrorDetails(error: unknown): { code: string; message?: string; retryable?: boolean; unknownOutcome?: boolean } {
  if (error && typeof error === 'object') {
    const details = error as { name?: unknown; message?: unknown; code?: unknown; retryable?: unknown; unknownOutcome?: unknown };
    return {
      code: typeof details.code === 'string' ? details.code : typeof details.name === 'string' ? details.name : 'UNKNOWN',
      ...(typeof details.message === 'string' ? { message: details.message } : {}),
      ...(typeof details.retryable === 'boolean' ? { retryable: details.retryable } : {}),
      ...(typeof details.unknownOutcome === 'boolean' ? { unknownOutcome: details.unknownOutcome } : {}),
    };
  }
  return { code: 'UNKNOWN' };
}

const SENSITIVE_KEY = /secret|password|token|credential|authorization|api[_-]?key|private[_-]?key/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(nested)]),
    );
  }
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
