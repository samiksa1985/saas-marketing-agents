import assert from 'node:assert/strict';
import test from 'node:test';

import type { TenantContext } from '@platform/contracts';

import {
  CanonicalExternalActionBudgetAuthority,
  ExternalActionPolicyEngine,
  GovernedExternalActionExecutor,
  InMemoryExternalActionStore,
  type ExternalActionApprovalGateway,
  type ExternalActionApprovalRecord,
  type ExternalActionPolicy,
  type ExternalActionMutationSafetyGate,
  type ExternalMarketingActionProposal,
  type ExternalMarketingProviderGateway,
  type GovernedExternalAction,
  type GovernedExternalActionDispatch,
} from './index.js';

const context = (tenantId = 'tenant-a'): TenantContext => ({
  tenantId,
  userId: 'user-a',
  roles: ['marketing_manager'],
  permissions: ['workflow:execute', 'approval:decide', 'marketing:admin', 'integration:admin'],
  locale: 'en',
});

const policy: ExternalActionPolicy = {
  tenantId: 'tenant-a',
  providerAllowlist: ['GOOGLE_ADS'],
  actionTypeAllowlist: ['UPDATE_CAMPAIGN_BUDGET'],
  accountAllowlist: ['account-a'],
  maxAbsoluteBudgetDelta: 1_000,
  maxPercentageBudgetDelta: 100,
  minimumConfidence: 0.8,
  requiredEvidence: true,
  requiredApprovalLevel: 'HUMAN',
  killSwitch: false,
  dryRunOnly: false,
};

function proposal(overrides: Partial<ExternalMarketingActionProposal> = {}): ExternalMarketingActionProposal {
  return {
    actionId: 'action-1',
    tenantId: 'tenant-a',
    organizationId: 'org-a',
    actor: 'user-a',
    agentIdentity: 'campaign-agent',
    workflowRunId: 'workflow-a',
    recommendationId: 'recommendation-a',
    provider: 'GOOGLE_ADS',
    accountId: 'account-a',
    campaignId: 'campaign-a',
    actionType: 'UPDATE_CAMPAIGN_BUDGET',
    requestedPayload: { dailyBudget: 2_500 },
    reason: 'Budget-constrained campaign has sustained performance evidence.',
    expectedOutcome: 'More qualified conversions within approved budget limits.',
    estimatedImpact: { roas: 5.1 },
    estimatedCost: 500,
    currency: 'SAR',
    riskLevel: 'MEDIUM',
    policyContext: { source: 'test' },
    approvalRequirement: 'REQUIRED',
    idempotencyKey: 'idempotency-1',
    requestedAt: '2026-09-08T00:00:00.000Z',
    metadata: { safe: true },
    evidence: [{ id: 'evidence-1', source: 'analytics', summary: 'ROAS above threshold for seven days.' }],
    confidence: 0.9,
    rollback: { strategy: 'Restore the previous daily budget.', before: { dailyBudget: 2_000 } },
    ...overrides,
  };
}

class Approvals implements ExternalActionApprovalGateway {
  readonly records = new Map<string, ExternalActionApprovalRecord>();

  async create(ctx: TenantContext, input: { artifactId: string; idempotencyKey: string }): Promise<ExternalActionApprovalRecord> {
    const record = { id: `approval:${input.artifactId}`, tenantId: ctx.tenantId };
    this.records.set(record.id, record);
    return record;
  }

  async get(id: string, ctx: TenantContext): Promise<ExternalActionApprovalRecord> {
    const record = this.records.get(id);
    if (!record || record.tenantId !== ctx.tenantId) throw new Error('APPROVAL_NOT_FOUND');
    return record;
  }

  approve(id: string): void {
    const record = this.records.get(id);
    if (!record) throw new Error('APPROVAL_NOT_FOUND');
    this.records.set(id, { ...record, decision: 'approved' });
  }

  reject(id: string): void {
    const record = this.records.get(id);
    if (!record) throw new Error('APPROVAL_NOT_FOUND');
    this.records.set(id, { ...record, decision: 'rejected' });
  }
}

class Provider implements ExternalMarketingProviderGateway {
  executions = 0;
  verificationStatus: 'VERIFIED' | 'MISMATCH' = 'VERIFIED';
  private failure: Error | undefined;

  failNext(code: string, retryable: boolean): void {
    const failure = new Error(code) as Error & { code: string; retryable: boolean };
    failure.code = code;
    failure.retryable = retryable;
    this.failure = failure;
  }

  async simulate() {
    return {
      currentValue: 2_000,
      currentState: { dailyBudget: 2_000 },
      assumptions: ['Current budget is read from the provider.'],
    };
  }

  async deriveRollbackProposal(_context: TenantContext, original: GovernedExternalAction) {
    return {
      actionType: original.proposal.actionType,
      requestedPayload: { ...original.proposal.rollback.before },
    };
  }

  async execute(_context: TenantContext, dispatch: GovernedExternalActionDispatch) {
    const action = dispatch.action;
    this.executions += 1;
    if (this.failure) {
      const failure = this.failure;
      this.failure = undefined;
      throw failure;
    }
    return { providerReference: `provider:${action.id}`, observedState: { dailyBudget: 2_500 } };
  }

  async verify() {
    return {
      status: this.verificationStatus,
      observedState: { dailyBudget: 2_500 },
      reasons: [],
      verifiedAt: '2026-09-08T00:00:10.000Z',
    };
  }
}

function executor(overrides: {
  policy?: ExternalActionPolicy;
  entitlement?: boolean;
  mutationSafetyGate?: ExternalActionMutationSafetyGate;
} = {}) {
  const approvals = new Approvals();
  const provider = new Provider();
  const budget = new CanonicalExternalActionBudgetAuthority(
    {
      async authorize(tenantId) {
        return {
          tenantId,
          key: 'marketing.external_action.google_ads',
          allowed: overrides.entitlement ?? true,
          source: 'PLAN',
          reason: 'test',
        };
      },
    },
    { tenantId: 'tenant-a', hardDailySpendLimit: 1_000, hardMonthlySpendLimit: 30_000 },
    () => '2026-09-08T00:00:00.000Z',
  );
  return {
    approvals,
    provider,
    executor: new GovernedExternalActionExecutor(
      new InMemoryExternalActionStore(),
      provider,
      budget,
      new ExternalActionPolicyEngine(() => '2026-09-08T00:00:00.000Z'),
      overrides.policy ?? policy,
      approvals,
      {
        now: () => '2026-09-08T00:00:00.000Z',
        createId: (() => { let number = 0; return () => `evidence:${++number}`; })(),
        ...(overrides.mutationSafetyGate ? { mutationSafetyGate: overrides.mutationSafetyGate } : {}),
      },
    ),
  };
}

test('governed executor requires simulation, budget, policy, durable approval, execution, verification, and evidence', async () => {
  const setup = executor();
  const created = await setup.executor.propose(context(), proposal());
  assert.equal(created.status, 'PROPOSED');

  const awaiting = await setup.executor.requestApproval(context(), created.id);
  assert.equal(awaiting.status, 'AWAITING_APPROVAL');
  assert.equal(awaiting.simulation?.estimatedDailySpendDelta, 500);
  assert.equal(awaiting.simulation?.estimatedMonthlySpendDelta, 15_000);
  assert.equal(awaiting.budgetDecision?.assessment, 'ALLOW');
  assert.equal(awaiting.policyDecision?.outcome, 'REQUIRE_APPROVAL');
  assert.ok(awaiting.approvalId);
  assert.equal((await setup.executor.requestApproval(context(), created.id)).approvalId, awaiting.approvalId);

  setup.approvals.approve(awaiting.approvalId!);
  const completed = await setup.executor.execute(context(), created.id);
  assert.equal(completed.status, 'VERIFIED');
  assert.equal(completed.verification?.status, 'VERIFIED');
  assert.ok(completed.evidence.some((item) => item.type === 'PROVIDER_VERIFICATION'));
  assert.equal(setup.provider.executions, 1);
  assert.equal((await setup.executor.execute(context(), created.id)).status, 'VERIFIED');
  assert.equal(setup.provider.executions, 1, 'verified replay must not dispatch another provider mutation');
});

test('rejected durable approvals, dry-run-only policy, and provider retries remain fail closed', async () => {
  const rejectedSetup = executor();
  const rejected = await rejectedSetup.executor.propose(context(), proposal());
  const rejectedAwaiting = await rejectedSetup.executor.requestApproval(context(), rejected.id);
  rejectedSetup.approvals.reject(rejectedAwaiting.approvalId!);
  assert.equal((await rejectedSetup.executor.execute(context(), rejected.id)).status, 'REJECTED');
  assert.equal(rejectedSetup.provider.executions, 0);

  const dryRunSetup = executor({ policy: { ...policy, dryRunOnly: true } });
  const dryRun = await dryRunSetup.executor.propose(context(), proposal());
  const dryRunAwaiting = await dryRunSetup.executor.requestApproval(context(), dryRun.id);
  dryRunSetup.approvals.approve(dryRunAwaiting.approvalId!);
  const blocked = await dryRunSetup.executor.execute(context(), dryRun.id);
  assert.equal(blocked.status, 'REJECTED');
  assert.equal(blocked.failureCode, 'POLICY_DRY_RUN_ONLY');
  assert.equal(dryRunSetup.provider.executions, 0);

  const retrySetup = executor();
  const retry = await retrySetup.executor.propose(context(), proposal());
  const retryAwaiting = await retrySetup.executor.requestApproval(context(), retry.id);
  retrySetup.approvals.approve(retryAwaiting.approvalId!);
  retrySetup.provider.failNext('PROVIDER_TIMEOUT', true);
  const failed = await retrySetup.executor.execute(context(), retry.id);
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.failureCode, 'PROVIDER_TIMEOUT');
  assert.equal((await retrySetup.executor.retry(context(), retry.id)).status, 'VERIFIED');
  assert.equal(retrySetup.provider.executions, 2);
});

test('provider health circuit gate blocks governed mutation without a provider bypass', async () => {
  let gateCalls = 0;
  const setup = executor({
    mutationSafetyGate: {
      async allowMutation() {
        gateCalls += 1;
        return { allowed: false, code: 'PROVIDER_HEALTH_COOLDOWN_ACTIVE' };
      },
    },
  });
  const action = await setup.executor.propose(context(), proposal());
  const awaiting = await setup.executor.requestApproval(context(), action.id);
  setup.approvals.approve(awaiting.approvalId!);
  const blocked = await setup.executor.execute(context(), action.id);
  assert.equal(blocked.status, 'REJECTED');
  assert.equal(blocked.failureCode, 'PROVIDER_HEALTH_COOLDOWN_ACTIVE');
  assert.equal(gateCalls, 1);
  assert.equal(setup.provider.executions, 0);
  assert.ok(blocked.evidence.some((item) => item.type === 'PROVIDER_HEALTH_MUTATION_BLOCKED'));
});

test('an inconclusive timeout blocks automated replay until read-back can reconcile it', async () => {
  class InconclusiveProvider implements ExternalMarketingProviderGateway {
    readonly executionMode = 'LIVE' as const;
    executions = 0;
    async simulate() { return { currentValue: 2_000, currentState: { dailyBudget: 2_000 } }; }
    async execute(): Promise<never> {
      this.executions += 1;
      const error = new Error('PROVIDER_TIMEOUT_AFTER_MUTATION') as Error & { code: string; unknownOutcome: boolean };
      error.code = 'PROVIDER_TIMEOUT_AFTER_MUTATION';
      error.unknownOutcome = true;
      throw error;
    }
    async verify() { return { status: 'VERIFIED' as const, observedState: {}, reasons: [], verifiedAt: '2026-09-08T00:00:00.000Z' }; }
    async reconcileUnknownExecution() { return { status: 'INCONCLUSIVE' as const, reasons: ['READ_BACK_UNAVAILABLE'] }; }
  }

  const approvals = new Approvals();
  const provider = new InconclusiveProvider();
  const governed = new GovernedExternalActionExecutor(
    new InMemoryExternalActionStore(),
    provider,
    new CanonicalExternalActionBudgetAuthority(
      { async authorize(tenantId) { return { tenantId, key: 'marketing.external_action.google_ads', allowed: true, source: 'PLAN', reason: 'test' }; } },
      { tenantId: 'tenant-a', hardDailySpendLimit: 1_000, hardMonthlySpendLimit: 30_000 },
    ),
    new ExternalActionPolicyEngine(),
    policy,
    approvals,
  );
  const created = await governed.propose(context(), proposal({ actionId: 'uncertain-action', idempotencyKey: 'uncertain-key' }));
  const awaiting = await governed.requestApproval(context(), created.id);
  approvals.approve(awaiting.approvalId!);
  const failed = await governed.execute(context(), created.id);
  assert.equal(failed.failureCode, 'PROVIDER_OUTCOME_UNCERTAIN');
  await assert.rejects(() => governed.retry(context(), created.id), /EXTERNAL_ACTION_RECOVERY_REQUIRED/);
  assert.equal(provider.executions, 1, 'inconclusive recovery must not send another provider mutation');
});

test('governance fails closed for missing budget authority, entitlement denial, policy denial, and missing tenant', async () => {
  const missingAuthority = new GovernedExternalActionExecutor(
    new InMemoryExternalActionStore(),
    new Provider(),
    new CanonicalExternalActionBudgetAuthority(undefined, undefined),
    new ExternalActionPolicyEngine(),
    policy,
    new Approvals(),
  );
  const action = await missingAuthority.propose(context(), proposal());
  assert.equal((await missingAuthority.requestApproval(context(), action.id)).status, 'REJECTED');

  const denied = executor({ entitlement: false });
  const deniedAction = await denied.executor.propose(context(), proposal());
  assert.equal((await denied.executor.requestApproval(context(), deniedAction.id)).status, 'REJECTED');

  const killSwitch = executor({ policy: { ...policy, killSwitch: true } });
  const killAction = await killSwitch.executor.propose(context(), proposal());
  assert.equal((await killSwitch.executor.requestApproval(context(), killAction.id)).status, 'REJECTED');

  await assert.rejects(() => executor().executor.propose({ ...context(), tenantId: '' }, proposal()), /TENANT_SCOPE_DENIED/);
});

test('positive spend changes require explicit hard budget ceilings', async () => {
  const budget = new CanonicalExternalActionBudgetAuthority(
    { async authorize(tenantId) { return { tenantId, key: 'marketing.external_action.google_ads', allowed: true, source: 'PLAN', reason: 'test' }; } },
    { tenantId: 'tenant-a' },
  );
  const decision = await budget.evaluate(context(), proposal(), {
    assessment: 'ALLOW', reasons: [], confidence: 0.9, assumptions: [], providerState: {}, simulatedAt: '2026-09-08T00:00:00.000Z',
    estimatedDailySpendDelta: 500, estimatedMonthlySpendDelta: 15_000,
  });
  assert.equal(decision.assessment, 'BLOCK');
  assert.deepEqual(decision.reasons, ['BUDGET_HARD_LIMIT_UNAVAILABLE']);
});

test('actions are tenant isolated, idempotent, conflict controlled, and redact secrets from evidence', async () => {
  const setup = executor();
  const first = await setup.executor.propose(context(), proposal({ metadata: { refreshToken: 'must-not-persist' } }));
  const replay = await setup.executor.propose(context(), proposal());
  assert.equal(replay.id, first.id);
  const proposalEvidence = first.evidence[0]?.payload.proposal as Record<string, unknown>;
  assert.equal(
    (proposalEvidence.metadata as Record<string, unknown>).refreshToken,
    '[REDACTED]',
    'proposal evidence is redacted recursively',
  );
  await assert.rejects(() => setup.executor.get(context('tenant-b'), first.id), /NOT_FOUND_OR_ACCESS_DENIED/);
  await assert.rejects(
    () => setup.executor.propose(context(), proposal({ actionId: 'action-2', idempotencyKey: 'idempotency-2' })),
    /CONFLICTING_TARGET/,
  );
});

test('rollback is a new governed proposal rather than a privileged provider bypass', async () => {
  const setup = executor();
  const action = await setup.executor.propose(context(), proposal());
  const awaiting = await setup.executor.requestApproval(context(), action.id);
  setup.approvals.approve(awaiting.approvalId!);
  const verified = await setup.executor.execute(context(), action.id);
  const rollback = await setup.executor.proposeRollback(context(), verified.id);
  assert.equal(rollback.status, 'PROPOSED');
  assert.equal(rollback.proposal.metadata.rollbackOf, verified.id);
  assert.equal(rollback.proposal.actionType, verified.proposal.actionType);
  assert.equal(rollback.proposal.requestedPayload.dailyBudget, 2_000);

  const mismatchSetup = executor();
  mismatchSetup.provider.verificationStatus = 'MISMATCH';
  const mismatch = await mismatchSetup.executor.propose(context(), proposal());
  const mismatchAwaiting = await mismatchSetup.executor.requestApproval(context(), mismatch.id);
  mismatchSetup.approvals.approve(mismatchAwaiting.approvalId!);
  assert.equal((await mismatchSetup.executor.execute(context(), mismatch.id)).status, 'ROLLBACK_REQUIRED');
  assert.equal((await mismatchSetup.executor.proposeRollback(context(), mismatch.id)).status, 'PROPOSED');
});
