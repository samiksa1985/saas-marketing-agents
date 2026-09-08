import type { TenantContext } from '@platform/contracts';
import {
  isGovernedExternalActionDispatch,
  type GovernedExternalActionDispatch,
} from '@platform/marketing-os-core';
import type {
  ExternalActionProviderExecution,
  ExternalActionProviderReconciliation,
  ExternalActionProviderSimulation,
  ExternalActionProviderVerification,
  ExternalMarketingActionProposal,
  ExternalMarketingProviderGateway,
  GovernedExternalAction,
} from '@platform/marketing-os-core';

export type GoogleAdsExecutionMode = 'DISABLED' | 'DRY_RUN' | 'MOCK' | 'REAL';

/** Metadata is ready for the future NAWA provider trust registry. */
export const GOOGLE_ADS_TRUST_METADATA = {
  provider: 'google-ads',
  publisher: 'Google',
  toolName: 'campaign-mutation',
  version: '1',
  permissions: ['campaign.read', 'campaign.write'],
  classification: 'WRITE' as const,
  credentialRequirement: 'REQUIRED' as const,
  dataDestination: 'Google Ads API',
  riskClassification: 'HIGH' as const,
};

export interface GoogleAdsCredentials {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
}

/**
 * Provider-specific secret boundary. It keeps Google credential semantics in
 * Growth Intelligence while allowing a future NAWA Core secret adapter to be
 * supplied without leaking secret material into actions, policy, or evidence.
 */
export interface GoogleAdsCredentialResolver {
  validate(): { valid: boolean; missing: string[] };
  resolve(): GoogleAdsCredentials;
}

export class EnvironmentGoogleAdsCredentialResolver implements GoogleAdsCredentialResolver {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  validate(): { valid: boolean; missing: string[] } {
    const required = [
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_CLIENT_ID',
      'GOOGLE_ADS_CLIENT_SECRET',
      'GOOGLE_ADS_REFRESH_TOKEN',
      'GOOGLE_ADS_CUSTOMER_ID',
    ];
    const missing = required.filter((key) => !this.env[key]?.trim());
    return { valid: missing.length === 0, missing };
  }

  /** Internal-only; callers must never add this object to payloads or evidence. */
  resolve(): GoogleAdsCredentials {
    const result = this.validate();
    if (!result.valid) throw new GoogleAdsProviderError('GOOGLE_ADS_CREDENTIALS_MISSING', false);
    return {
      developerToken: this.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      clientId: this.env.GOOGLE_ADS_CLIENT_ID!,
      clientSecret: this.env.GOOGLE_ADS_CLIENT_SECRET!,
      refreshToken: this.env.GOOGLE_ADS_REFRESH_TOKEN!,
      customerId: this.env.GOOGLE_ADS_CUSTOMER_ID!,
      ...(this.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { loginCustomerId: this.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID } : {}),
    };
  }
}

export class GoogleAdsProviderError extends Error {
  constructor(readonly code: string, readonly retryable: boolean, readonly unknownOutcome = false) {
    super(code);
    this.name = 'GoogleAdsProviderError';
  }
}

export interface GoogleAdsCampaign {
  accountId: string;
  campaignId: string;
  enabled: boolean;
  dailyBudget?: number;
  targetCpa?: number;
  targetRoas?: number;
}

export interface GoogleAdsProvider {
  validateConnection(): Promise<void>;
  getCampaign(context: TenantContext, accountId: string, campaignId: string): Promise<GoogleAdsCampaign>;
  mutate(
    context: TenantContext,
    dispatch: GovernedExternalActionDispatch,
  ): Promise<ExternalActionProviderExecution>;
  findMutationByIdempotency?(
    context: TenantContext,
    idempotencyKey: string,
  ): Promise<ExternalActionProviderExecution | undefined>;
}

/** Deterministic test provider; it is never an implicit production fallback. */
export class MockGoogleAdsProvider implements GoogleAdsProvider {
  private readonly campaigns = new Map<string, GoogleAdsCampaign>();
  private readonly mutations = new Map<string, ExternalActionProviderExecution>();
  private failure: GoogleAdsProviderError | undefined;
  private timeoutAfterMutation = false;
  private mutationCountValue = 0;

  get mutationCount(): number {
    return this.mutationCountValue;
  }

  seed(campaign: GoogleAdsCampaign): void {
    this.campaigns.set(this.key(campaign.accountId, campaign.campaignId), { ...campaign });
  }

  failNext(code: string, retryable: boolean): void {
    this.failure = new GoogleAdsProviderError(code, retryable);
  }

  /** Simulates the ambiguous case where Google applied a mutation before a timeout. */
  timeoutAfterMutationOnce(): void {
    this.timeoutAfterMutation = true;
  }

  async validateConnection(): Promise<void> {}

  async getCampaign(_context: TenantContext, accountId: string, campaignId: string): Promise<GoogleAdsCampaign> {
    const campaign = this.campaigns.get(this.key(accountId, campaignId));
    if (!campaign) throw new GoogleAdsProviderError('GOOGLE_ADS_CAMPAIGN_NOT_FOUND', false);
    return { ...campaign };
  }

  async mutate(
    context: TenantContext,
    dispatch: GovernedExternalActionDispatch,
  ): Promise<ExternalActionProviderExecution> {
    if (!isGovernedExternalActionDispatch(dispatch)) {
      throw new GoogleAdsProviderError('GOVERNED_DISPATCH_REQUIRED', false);
    }
    const { proposal, idempotencyKey } = dispatch.action;
    if (!context.tenantId || context.tenantId !== proposal.tenantId) throw new GoogleAdsProviderError('TENANT_SCOPE_DENIED', false);
    const existing = this.mutations.get(idempotencyKey);
    if (existing) return { ...existing };
    if (this.failure) {
      const failure = this.failure;
      this.failure = undefined;
      throw failure;
    }
    if (!proposal.campaignId) throw new GoogleAdsProviderError('GOOGLE_ADS_CAMPAIGN_ID_REQUIRED', false);
    const campaign = await this.getCampaign(context, proposal.accountId, proposal.campaignId);
    const next = { ...campaign };
    switch (proposal.actionType) {
      case 'PAUSE_CAMPAIGN': next.enabled = false; break;
      case 'ENABLE_CAMPAIGN': next.enabled = true; break;
      case 'UPDATE_CAMPAIGN_BUDGET': next.dailyBudget = numberPayload(proposal, 'dailyBudget', 'budget'); break;
      case 'UPDATE_TARGET_CPA': next.targetCpa = numberPayload(proposal, 'targetCpa'); break;
      case 'UPDATE_TARGET_ROAS': next.targetRoas = numberPayload(proposal, 'targetRoas'); break;
      default: throw new GoogleAdsProviderError('GOOGLE_ADS_ACTION_UNSUPPORTED', false);
    }
    this.campaigns.set(this.key(next.accountId, next.campaignId), next);
    const result = { providerReference: `mock-google-ads:${proposal.actionId}`, observedState: next };
    this.mutations.set(idempotencyKey, result);
    this.mutationCountValue += 1;
    if (this.timeoutAfterMutation) {
      this.timeoutAfterMutation = false;
      throw new GoogleAdsProviderError('GOOGLE_ADS_TIMEOUT_AFTER_MUTATION', true, true);
    }
    return { ...result, observedState: { ...next } };
  }

  async findMutationByIdempotency(
    _context: TenantContext,
    idempotencyKey: string,
  ): Promise<ExternalActionProviderExecution | undefined> {
    const result = this.mutations.get(idempotencyKey);
    return result ? { ...result, observedState: { ...(result.observedState ?? {}) } } : undefined;
  }

  private key(accountId: string, campaignId: string): string {
    return `${accountId}\u0000${campaignId}`;
  }
}

/** Real mode validates secrets inside this boundary, then fails closed until a transport is wired. */
export class GoogleAdsApiAdapter implements GoogleAdsProvider {
  constructor(private readonly credentials: GoogleAdsCredentialResolver) {}

  async validateConnection(): Promise<void> {
    this.credentials.resolve();
    throw new GoogleAdsProviderError('GOOGLE_ADS_TRANSPORT_NOT_CONFIGURED', false);
  }

  async getCampaign(_context: TenantContext, _accountId: string, _campaignId: string): Promise<GoogleAdsCampaign> {
    await this.validateConnection();
    throw new GoogleAdsProviderError('GOOGLE_ADS_TRANSPORT_NOT_CONFIGURED', false);
  }

  async mutate(
    _context: TenantContext,
    dispatch: GovernedExternalActionDispatch,
  ): Promise<ExternalActionProviderExecution> {
    if (!isGovernedExternalActionDispatch(dispatch)) {
      throw new GoogleAdsProviderError('GOVERNED_DISPATCH_REQUIRED', false);
    }
    await this.validateConnection();
    throw new GoogleAdsProviderError('GOOGLE_ADS_TRANSPORT_NOT_CONFIGURED', false);
  }

  async findMutationByIdempotency(
    _context: TenantContext,
    _idempotencyKey: string,
  ): Promise<ExternalActionProviderExecution | undefined> {
    await this.validateConnection();
    return undefined;
  }
}

/** The sole Google Ads-facing dependency allowed into the governed executor. */
export class GoogleAdsProviderGateway implements ExternalMarketingProviderGateway {
  readonly executionMode: 'DRY_RUN' | 'LIVE';

  constructor(
    private readonly provider: GoogleAdsProvider,
    private readonly mode: GoogleAdsExecutionMode,
    private readonly executionEnabled: boolean,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.executionMode = mode === 'DRY_RUN' ? 'DRY_RUN' : 'LIVE';
  }

  async simulate(context: TenantContext, proposal: ExternalMarketingActionProposal): Promise<ExternalActionProviderSimulation> {
    this.assertTenant(context, proposal);
    this.assertGoogleProposal(proposal);
    if (this.mode === 'DISABLED') throw new GoogleAdsProviderError('GOOGLE_ADS_PROVIDER_DISABLED', false);
    await this.provider.validateConnection();
    const campaign = await this.provider.getCampaign(context, proposal.accountId, proposal.campaignId!);
    const value = currentValue(campaign, proposal.actionType);
    return {
      ...(value !== undefined ? { currentValue: value } : {}),
      currentState: { ...campaign },
      expectedKpiImpact: { statement: 'Provider state is used for deterministic delta calculation only.' },
      assumptions: ['Google Ads state was read at simulation time.', 'No future performance is guaranteed.'],
    };
  }

  async execute(
    context: TenantContext,
    dispatch: GovernedExternalActionDispatch,
  ): Promise<ExternalActionProviderExecution> {
    if (!isGovernedExternalActionDispatch(dispatch)) {
      throw new GoogleAdsProviderError('GOVERNED_DISPATCH_REQUIRED', false);
    }
    const action = dispatch.action;
    this.assertTenant(context, action.proposal);
    this.assertGoogleProposal(action.proposal);
    if (action.status !== 'EXECUTING') throw new GoogleAdsProviderError('GOVERNED_EXECUTION_STATE_REQUIRED', false);
    if (!action.approvalId && action.proposal.approvalRequirement !== 'OPTIONAL') throw new GoogleAdsProviderError('DURABLE_APPROVAL_REQUIRED', false);
    if (this.mode === 'DISABLED') throw new GoogleAdsProviderError('GOOGLE_ADS_PROVIDER_DISABLED', false);
    if (this.mode === 'REAL' && !this.executionEnabled) throw new GoogleAdsProviderError('GOOGLE_ADS_REAL_EXECUTION_DISABLED', false);
    if (this.mode === 'DRY_RUN') {
      return { providerReference: `dry-run:${action.id}`, observedState: { dryRun: true, requestedPayload: action.proposal.requestedPayload } };
    }
    await this.provider.validateConnection();
    return this.provider.mutate(context, dispatch);
  }

  async verify(
    context: TenantContext,
    action: GovernedExternalAction,
    execution: ExternalActionProviderExecution,
  ): Promise<ExternalActionProviderVerification> {
    this.assertTenant(context, action.proposal);
    if (this.mode === 'DRY_RUN') {
      return { status: 'VERIFIED', observedState: { dryRun: true, providerReference: execution.providerReference }, reasons: ['DRY_RUN_NO_LIVE_MUTATION'], verifiedAt: this.now() };
    }
    const campaign = await this.provider.getCampaign(context, action.proposal.accountId, action.proposal.campaignId!);
    const expected = expectedMatches(campaign, action.proposal);
    return {
      status: expected ? 'VERIFIED' : 'MISMATCH',
      observedState: { ...campaign },
      reasons: expected ? [] : ['PROVIDER_STATE_DOES_NOT_MATCH_REQUESTED_MUTATION'],
      verifiedAt: this.now(),
    };
  }

  async reconcileUnknownExecution(
    context: TenantContext,
    action: GovernedExternalAction,
  ): Promise<ExternalActionProviderReconciliation> {
    this.assertTenant(context, action.proposal);
    if (this.mode === 'DISABLED') {
      return { status: 'INCONCLUSIVE', reasons: ['GOOGLE_ADS_PROVIDER_DISABLED'] };
    }
    if (this.mode === 'DRY_RUN') {
      return {
        status: 'APPLIED',
        execution: { providerReference: `dry-run:${action.id}`, observedState: { dryRun: true } },
        observedState: { dryRun: true },
        reasons: ['DRY_RUN_RECONCILIATION'],
      };
    }
    const known = await this.provider.findMutationByIdempotency?.(context, action.idempotencyKey);
    if (known) {
      return {
        status: 'APPLIED',
        execution: known,
        ...(known.observedState ? { observedState: known.observedState } : {}),
        reasons: ['PROVIDER_IDEMPOTENCY_RECORD_FOUND'],
      };
    }
    try {
      const campaign = await this.provider.getCampaign(context, action.proposal.accountId, action.proposal.campaignId!);
      if (expectedMatches(campaign, action.proposal)) {
        return {
          status: 'APPLIED',
          execution: { providerReference: `google-ads-reconciled:${action.id}`, observedState: { ...campaign } },
          observedState: { ...campaign },
          reasons: ['READ_BACK_MATCHES_REQUESTED_STATE'],
        };
      }
      return { status: 'NOT_APPLIED', observedState: { ...campaign }, reasons: ['READ_BACK_DOES_NOT_MATCH_REQUESTED_STATE'] };
    } catch {
      return { status: 'INCONCLUSIVE', reasons: ['GOOGLE_ADS_READ_BACK_UNAVAILABLE'] };
    }
  }

  private assertTenant(context: TenantContext, proposal: ExternalMarketingActionProposal): void {
    if (!context.tenantId || context.tenantId !== proposal.tenantId) throw new GoogleAdsProviderError('TENANT_SCOPE_DENIED', false);
  }

  private assertGoogleProposal(proposal: ExternalMarketingActionProposal): void {
    if (proposal.provider !== 'GOOGLE_ADS' || !proposal.campaignId) throw new GoogleAdsProviderError('GOOGLE_ADS_PROVIDER_OR_CAMPAIGN_REQUIRED', false);
  }
}

function currentValue(campaign: GoogleAdsCampaign, actionType: string): number | undefined {
  if (actionType === 'UPDATE_CAMPAIGN_BUDGET') return campaign.dailyBudget;
  if (actionType === 'UPDATE_TARGET_CPA') return campaign.targetCpa;
  if (actionType === 'UPDATE_TARGET_ROAS') return campaign.targetRoas;
  return undefined;
}

function numberPayload(proposal: ExternalMarketingActionProposal, ...keys: string[]): number {
  for (const key of keys) {
    const value = proposal.requestedPayload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  throw new GoogleAdsProviderError('GOOGLE_ADS_NUMERIC_PAYLOAD_REQUIRED', false);
}

function expectedMatches(campaign: GoogleAdsCampaign, proposal: ExternalMarketingActionProposal): boolean {
  if (proposal.actionType === 'PAUSE_CAMPAIGN') return campaign.enabled === false;
  if (proposal.actionType === 'ENABLE_CAMPAIGN') return campaign.enabled === true;
  if (proposal.actionType === 'UPDATE_CAMPAIGN_BUDGET') return campaign.dailyBudget === numberPayload(proposal, 'dailyBudget', 'budget');
  if (proposal.actionType === 'UPDATE_TARGET_CPA') return campaign.targetCpa === numberPayload(proposal, 'targetCpa');
  if (proposal.actionType === 'UPDATE_TARGET_ROAS') return campaign.targetRoas === numberPayload(proposal, 'targetRoas');
  return false;
}
