import type { TenantContext } from '@platform/contracts';
import {
  isGovernedExternalActionDispatch,
  type ExternalActionProviderExecution,
  type ExternalActionProviderReconciliation,
  type ExternalActionProviderSimulation,
  type ExternalActionProviderVerification,
  type ExternalActionRollbackDerivation,
  type ExternalMarketingActionProposal,
  type ExternalMarketingProviderGateway,
  type GovernedExternalAction,
  type GovernedExternalActionDispatch,
} from '@platform/marketing-os-core';

export type MetaAdsExecutionMode = 'DISABLED' | 'DRY_RUN' | 'MOCK' | 'REAL';

export const META_ADS_TRUST_METADATA = {
  provider: 'meta-ads',
  publisher: 'Meta',
  toolName: 'campaign-mutation',
  version: '1',
  permissions: ['ads_read', 'ads_management'],
  classification: 'WRITE' as const,
  credentialRequirement: 'REQUIRED' as const,
  dataDestination: 'Meta Marketing API',
  riskClassification: 'HIGH' as const,
};

export interface MetaAdsCredentials {
  accessToken: string;
  adAccountId: string;
  businessId?: string;
}

/** Secret-provider boundary. Diagnostics expose names only, never values. */
export interface MetaAdsCredentialResolver {
  validate(): { valid: boolean; missing: string[] };
  resolve(): MetaAdsCredentials;
}

export class EnvironmentMetaAdsCredentialResolver implements MetaAdsCredentialResolver {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  validate(): { valid: boolean; missing: string[] } {
    const required = ['META_ADS_ACCESS_TOKEN', 'META_ADS_AD_ACCOUNT_ID'];
    const missing = required.filter((key) => !this.env[key]?.trim());
    return { valid: missing.length === 0, missing };
  }

  resolve(): MetaAdsCredentials {
    const result = this.validate();
    if (!result.valid) throw new MetaAdsProviderError('META_ADS_CREDENTIALS_MISSING', false, false, 'CONFIGURATION');
    return {
      accessToken: this.env.META_ADS_ACCESS_TOKEN!,
      adAccountId: normalizeMetaAdAccountId(this.env.META_ADS_AD_ACCOUNT_ID!, 'META_ADS_ACCOUNT_ID_INVALID'),
      ...(this.env.META_ADS_BUSINESS_ID?.trim() ? { businessId: this.env.META_ADS_BUSINESS_ID.trim() } : {}),
    };
  }
}

export type MetaAdsProviderErrorClass =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'ACCOUNT_ACCESS'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_NOT_ALLOWED'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNKNOWN_PROVIDER_ERROR'
  | 'CONFIGURATION'
  | 'GOVERNANCE';

/** A stable error envelope: no Graph payload, token, or response body escapes. */
export class MetaAdsProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly unknownOutcome = false,
    readonly errorClass: MetaAdsProviderErrorClass = 'CONFIGURATION',
    readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = 'MetaAdsProviderError';
  }
}

export interface MetaAdsAccount {
  accountId: string;
  name?: string;
  currency?: string;
}

export interface MetaAdsCampaign {
  accountId: string;
  campaignId: string;
  enabled: boolean;
  status: 'ACTIVE' | 'PAUSED' | string;
  /** Meta Graph API represents campaign daily budgets in account minor units. */
  dailyBudget?: number;
}

export interface MetaAdsProvider {
  validateConnection(): Promise<void>;
  getAccount(context: TenantContext, accountId: string): Promise<MetaAdsAccount>;
  getCampaign(context: TenantContext, accountId: string, campaignId: string): Promise<MetaAdsCampaign>;
  mutate(context: TenantContext, dispatch: GovernedExternalActionDispatch): Promise<ExternalActionProviderExecution>;
  findMutationByIdempotency?(
    context: TenantContext,
    idempotencyKey: string,
  ): Promise<ExternalActionProviderExecution | undefined>;
}

export interface MetaAdsApiTransport {
  validateConnection(credentials: MetaAdsCredentials): Promise<void>;
  getAccount(credentials: MetaAdsCredentials, accountId: string): Promise<MetaAdsAccount>;
  getCampaign(credentials: MetaAdsCredentials, accountId: string, campaignId: string): Promise<MetaAdsCampaign>;
  executeAction(credentials: MetaAdsCredentials, proposal: ExternalMarketingActionProposal): Promise<ExternalActionProviderExecution>;
}

export interface MetaAdsFetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface MetaAdsFetchRequest {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type MetaAdsFetch = (url: string, request: MetaAdsFetchRequest) => Promise<MetaAdsFetchResponse>;

export interface MetaAdsRestTransportOptions {
  apiVersion?: string;
  timeoutMs?: number;
  fetcher?: MetaAdsFetch;
}

/** Deterministic fake used only through the same governed gateway as real Meta. */
export class MockMetaAdsProvider implements MetaAdsProvider {
  private readonly campaigns = new Map<string, MetaAdsCampaign>();
  private readonly mutations = new Map<string, ExternalActionProviderExecution>();
  private failure: MetaAdsProviderError | undefined;
  private timeoutAfterMutation = false;
  private mutationCountValue = 0;

  get mutationCount(): number { return this.mutationCountValue; }

  seed(campaign: MetaAdsCampaign): void {
    this.campaigns.set(this.key(campaign.accountId, campaign.campaignId), { ...campaign });
  }

  failNext(code: string, retryable: boolean, errorClass: MetaAdsProviderErrorClass = 'PROVIDER_UNAVAILABLE'): void {
    this.failure = new MetaAdsProviderError(code, retryable, false, errorClass);
  }

  timeoutAfterMutationOnce(): void { this.timeoutAfterMutation = true; }

  async validateConnection(): Promise<void> {}

  async getAccount(_context: TenantContext, accountId: string): Promise<MetaAdsAccount> {
    const normalized = normalizeMetaAdAccountId(accountId, 'META_ADS_ACCOUNT_ID_INVALID');
    if (![...this.campaigns.values()].some((campaign) => campaign.accountId === normalized)) {
      throw new MetaAdsProviderError('META_ADS_ACCOUNT_INACCESSIBLE', false, false, 'ACCOUNT_ACCESS');
    }
    return { accountId: normalized };
  }

  async getCampaign(_context: TenantContext, accountId: string, campaignId: string): Promise<MetaAdsCampaign> {
    const campaign = this.campaigns.get(this.key(accountId, campaignId));
    if (!campaign) throw new MetaAdsProviderError('META_ADS_CAMPAIGN_NOT_FOUND', false, false, 'RESOURCE_NOT_FOUND');
    return { ...campaign };
  }

  async mutate(context: TenantContext, dispatch: GovernedExternalActionDispatch): Promise<ExternalActionProviderExecution> {
    if (!isGovernedExternalActionDispatch(dispatch)) {
      throw new MetaAdsProviderError('GOVERNED_DISPATCH_REQUIRED', false, false, 'GOVERNANCE');
    }
    const { proposal, idempotencyKey } = dispatch.action;
    if (!context.tenantId || context.tenantId !== proposal.tenantId) {
      throw new MetaAdsProviderError('TENANT_SCOPE_DENIED', false, false, 'GOVERNANCE');
    }
    const existing = this.mutations.get(idempotencyKey);
    if (existing) return cloneExecution(existing);
    if (this.failure) {
      const failure = this.failure;
      this.failure = undefined;
      throw failure;
    }
    if (!proposal.campaignId) throw new MetaAdsProviderError('META_ADS_CAMPAIGN_ID_REQUIRED', false, false, 'INVALID_REQUEST');
    const campaign = await this.getCampaign(context, proposal.accountId, proposal.campaignId);
    const next = applyRequestedState(campaign, proposal);
    this.campaigns.set(this.key(next.accountId, next.campaignId), next);
    const result = { providerReference: `mock-meta-ads:${proposal.actionId}`, observedState: { ...next } };
    this.mutations.set(idempotencyKey, result);
    this.mutationCountValue += 1;
    if (this.timeoutAfterMutation) {
      this.timeoutAfterMutation = false;
      throw new MetaAdsProviderError('META_ADS_TIMEOUT_AFTER_MUTATION', true, true, 'TIMEOUT');
    }
    return cloneExecution(result);
  }

  async findMutationByIdempotency(
    _context: TenantContext,
    idempotencyKey: string,
  ): Promise<ExternalActionProviderExecution | undefined> {
    const result = this.mutations.get(idempotencyKey);
    return result ? cloneExecution(result) : undefined;
  }

  private key(accountId: string, campaignId: string): string {
    return `${normalizeMetaAdAccountId(accountId, 'META_ADS_ACCOUNT_ID_INVALID')}\u0000${campaignId}`;
  }
}

/**
 * Production-capable Graph API transport. Credentials are accepted only by
 * this transport and placed in an authorization header, never a durable URL,
 * action payload, evidence record, or diagnostic message.
 */
export class MetaAdsRestTransport implements MetaAdsApiTransport {
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly fetcher: MetaAdsFetch;

  constructor(options: MetaAdsRestTransportOptions = {}) {
    this.apiVersion = options.apiVersion ?? 'v21.0';
    if (!/^v\d+\.\d+$/.test(this.apiVersion)) {
      throw new MetaAdsProviderError('META_ADS_API_VERSION_INVALID', false, false, 'CONFIGURATION');
    }
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetcher = options.fetcher ?? (globalThis.fetch as unknown as MetaAdsFetch);
    if (!this.fetcher) throw new MetaAdsProviderError('META_ADS_FETCH_UNAVAILABLE', false, false, 'CONFIGURATION');
  }

  async validateConnection(credentials: MetaAdsCredentials): Promise<void> {
    await this.getAccount(credentials, credentials.adAccountId);
  }

  async getAccount(credentials: MetaAdsCredentials, accountId: string): Promise<MetaAdsAccount> {
    const normalized = normalizeMetaAdAccountId(accountId, 'META_ADS_ACCOUNT_ID_INVALID');
    const body = await this.graphRequest(credentials, normalized, {
      method: 'GET',
      fields: ['id', 'account_id', 'name', 'currency'],
    }, false);
    const observed = normalizeMetaAdAccountId(stringOf(recordOf(body).id) ?? '', 'META_ADS_ACCOUNT_ID_INVALID');
    if (observed !== normalized) throw new MetaAdsProviderError('META_ADS_ACCOUNT_SCOPE_MISMATCH', false, false, 'ACCOUNT_ACCESS');
    const account: MetaAdsAccount = { accountId: observed };
    const name = stringOf(recordOf(body).name);
    const currency = stringOf(recordOf(body).currency);
    if (name) account.name = name;
    if (currency) account.currency = currency;
    return account;
  }

  async getCampaign(credentials: MetaAdsCredentials, accountId: string, campaignId: string): Promise<MetaAdsCampaign> {
    const normalizedAccountId = normalizeMetaAdAccountId(accountId, 'META_ADS_ACCOUNT_ID_INVALID');
    const normalizedCampaignId = normalizeMetaCampaignId(campaignId);
    const body = recordOf(await this.graphRequest(credentials, normalizedCampaignId, {
      method: 'GET',
      fields: ['id', 'account_id', 'status', 'effective_status', 'daily_budget'],
    }, false));
    const observedAccount = normalizeMetaAdAccountId(stringOf(body.account_id) ?? '', 'META_ADS_CAMPAIGN_ACCOUNT_INVALID');
    if (observedAccount !== normalizedAccountId) {
      throw new MetaAdsProviderError('META_ADS_RESOURCE_NOT_ALLOWED', false, false, 'RESOURCE_NOT_ALLOWED');
    }
    const status = stringOf(body.effective_status) ?? stringOf(body.status);
    if (!status) throw new MetaAdsProviderError('META_ADS_CAMPAIGN_NOT_FOUND', false, false, 'RESOURCE_NOT_FOUND');
    const campaign: MetaAdsCampaign = {
      accountId: observedAccount,
      campaignId: normalizeMetaCampaignId(stringOf(body.id) ?? normalizedCampaignId),
      status,
      enabled: status === 'ACTIVE',
    };
    const dailyBudget = integerOf(body.daily_budget);
    if (dailyBudget !== undefined) campaign.dailyBudget = dailyBudget;
    return campaign;
  }

  async executeAction(credentials: MetaAdsCredentials, proposal: ExternalMarketingActionProposal): Promise<ExternalActionProviderExecution> {
    if (!proposal.campaignId) throw new MetaAdsProviderError('META_ADS_CAMPAIGN_ID_REQUIRED', false, false, 'INVALID_REQUEST');
    const accountId = normalizeMetaAdAccountId(proposal.accountId, 'META_ADS_ACCOUNT_ID_INVALID');
    const campaignId = normalizeMetaCampaignId(proposal.campaignId);
    const before = await this.getCampaign(credentials, accountId, campaignId);
    let body: Record<string, string>;
    switch (proposal.actionType) {
      case 'PAUSE_CAMPAIGN': body = { status: 'PAUSED' }; break;
      case 'ENABLE_CAMPAIGN': body = { status: 'ACTIVE' }; break;
      case 'UPDATE_CAMPAIGN_BUDGET': body = { daily_budget: String(metaBudgetPayload(proposal)) }; break;
      default: throw new MetaAdsProviderError('META_ADS_ACTION_UNSUPPORTED', false, false, 'INVALID_REQUEST');
    }
    await this.graphRequest(credentials, campaignId, { method: 'POST', form: body }, true);
    return {
      providerReference: `meta-ads:${campaignId}`,
      observedState: { ...applyRequestedState(before, proposal) },
    };
  }

  private async graphRequest(
    credentials: MetaAdsCredentials,
    path: string,
    request: { method: 'GET'; fields: string[] } | { method: 'POST'; form: Record<string, string> },
    mutation: boolean,
  ): Promise<unknown> {
    const query = request.method === 'GET' ? `?fields=${encodeURIComponent(request.fields.join(','))}` : '';
    return this.request(`https://graph.facebook.com/${this.apiVersion}/${path}${query}`, {
      method: request.method,
      headers: {
        authorization: `Bearer ${credentials.accessToken}`,
        ...(request.method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(request.method === 'POST' ? { body: new URLSearchParams(request.form).toString() } : {}),
    }, mutation);
  }

  private async request(url: string, request: MetaAdsFetchRequest, mutation: boolean): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: MetaAdsFetchResponse;
    try {
      response = await this.fetcher(url, { ...request, signal: controller.signal });
    } catch {
      throw new MetaAdsProviderError(
        mutation ? 'META_ADS_TIMEOUT_OR_NETWORK_UNCERTAINTY' : 'META_ADS_PROVIDER_UNAVAILABLE',
        true,
        mutation,
        mutation ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
    const body = await safeJson(response);
    if (!response.ok) throw mapMetaAdsHttpError(response.status, body, mutation, response.headers.get('retry-after'));
    return body;
  }
}

/** Real adapter: binds Graph credentials to the transport and nothing else. */
export class MetaAdsApiAdapter implements MetaAdsProvider {
  constructor(
    private readonly credentials: MetaAdsCredentialResolver,
    private readonly transport: MetaAdsApiTransport = new MetaAdsRestTransport(),
  ) {}

  async validateConnection(): Promise<void> { await this.transport.validateConnection(this.credentials.resolve()); }

  async getAccount(context: TenantContext, accountId: string): Promise<MetaAdsAccount> {
    assertProviderTenant(context);
    return this.transport.getAccount(this.resolveForAccount(accountId), normalizeMetaAdAccountId(accountId, 'META_ADS_ACCOUNT_ID_INVALID'));
  }

  async getCampaign(context: TenantContext, accountId: string, campaignId: string): Promise<MetaAdsCampaign> {
    assertProviderTenant(context);
    return this.transport.getCampaign(
      this.resolveForAccount(accountId),
      normalizeMetaAdAccountId(accountId, 'META_ADS_ACCOUNT_ID_INVALID'),
      normalizeMetaCampaignId(campaignId),
    );
  }

  async mutate(context: TenantContext, dispatch: GovernedExternalActionDispatch): Promise<ExternalActionProviderExecution> {
    if (!isGovernedExternalActionDispatch(dispatch)) throw new MetaAdsProviderError('GOVERNED_DISPATCH_REQUIRED', false, false, 'GOVERNANCE');
    assertProviderTenant(context);
    if (dispatch.action.proposal.tenantId !== context.tenantId) throw new MetaAdsProviderError('TENANT_SCOPE_DENIED', false, false, 'GOVERNANCE');
    return this.transport.executeAction(this.resolveForAccount(dispatch.action.proposal.accountId), dispatch.action.proposal);
  }

  async findMutationByIdempotency(): Promise<ExternalActionProviderExecution | undefined> {
    // Graph has no durable client-idempotency lookup for these mutations. The
    // gateway independently reads the resource before a retry can be considered.
    return undefined;
  }

  private resolveForAccount(accountId: string): MetaAdsCredentials {
    const credentials = this.credentials.resolve();
    if (credentials.adAccountId !== normalizeMetaAdAccountId(accountId, 'META_ADS_ACCOUNT_ID_INVALID')) {
      throw new MetaAdsProviderError('META_ADS_ACCOUNT_NOT_CONFIGURED', false, false, 'ACCOUNT_ACCESS');
    }
    return credentials;
  }
}

export interface MetaAdsGatewaySafetyOptions {
  approvedAdAccountId?: string;
  sandboxAdAccountIds?: readonly string[];
}

/** The only Meta-facing dependency permitted to enter the governed executor. */
export class MetaAdsProviderGateway implements ExternalMarketingProviderGateway {
  readonly executionMode: 'DRY_RUN' | 'LIVE';
  private readonly approvedAdAccountId: string | undefined;
  private readonly sandboxAdAccountIds: ReadonlySet<string>;

  constructor(
    private readonly provider: MetaAdsProvider,
    private readonly mode: MetaAdsExecutionMode,
    private readonly executionEnabled: boolean,
    private readonly now: () => string = () => new Date().toISOString(),
    options: MetaAdsGatewaySafetyOptions = {},
  ) {
    this.executionMode = mode === 'DRY_RUN' ? 'DRY_RUN' : 'LIVE';
    this.approvedAdAccountId = options.approvedAdAccountId
      ? normalizeMetaAdAccountId(options.approvedAdAccountId, 'META_ADS_APPROVED_ACCOUNT_ID_INVALID')
      : undefined;
    this.sandboxAdAccountIds = new Set((options.sandboxAdAccountIds ?? [])
      .map((accountId) => normalizeMetaAdAccountId(accountId, 'META_ADS_SANDBOX_ACCOUNT_ID_INVALID')));
  }

  async readAccount(context: TenantContext, accountId: string): Promise<MetaAdsAccount> {
    if (!context.tenantId) throw new MetaAdsProviderError('TENANT_CONTEXT_REQUIRED', false, false, 'GOVERNANCE');
    if (this.mode === 'DISABLED') throw new MetaAdsProviderError('META_ADS_PROVIDER_DISABLED', false, false, 'CONFIGURATION');
    this.assertRealAccountAllowed(accountId);
    return this.provider.getAccount(context, accountId);
  }

  async readCampaign(context: TenantContext, proposal: ExternalMarketingActionProposal): Promise<MetaAdsCampaign> {
    this.assertTenant(context, proposal);
    this.assertMetaProposal(proposal);
    if (this.mode === 'DISABLED') throw new MetaAdsProviderError('META_ADS_PROVIDER_DISABLED', false, false, 'CONFIGURATION');
    this.assertRealAccountAllowed(proposal.accountId);
    await this.provider.validateConnection();
    return this.provider.getCampaign(context, proposal.accountId, proposal.campaignId!);
  }

  async simulate(context: TenantContext, proposal: ExternalMarketingActionProposal): Promise<ExternalActionProviderSimulation> {
    const campaign = await this.readCampaign(context, proposal);
    return {
      ...(proposal.actionType === 'UPDATE_CAMPAIGN_BUDGET' && campaign.dailyBudget !== undefined
        ? { currentValue: campaign.dailyBudget }
        : {}),
      currentState: { ...campaign },
      expectedKpiImpact: { statement: 'Meta campaign state is read at simulation time; future performance is not guaranteed.' },
      assumptions: ['Meta campaign resource belongs to the explicitly scoped ad account.'],
    };
  }

  async deriveRollbackProposal(
    context: TenantContext,
    original: GovernedExternalAction,
  ): Promise<ExternalActionRollbackDerivation> {
    this.assertTenant(context, original.proposal);
    this.assertMetaProposal(original.proposal);
    const before = original.proposal.rollback.before;
    switch (original.proposal.actionType) {
      case 'ENABLE_CAMPAIGN':
        if (before.enabled === false) return { actionType: 'PAUSE_CAMPAIGN', requestedPayload: { enabled: false } };
        break;
      case 'PAUSE_CAMPAIGN':
        if (before.enabled === true) return { actionType: 'ENABLE_CAMPAIGN', requestedPayload: { enabled: true } };
        break;
      case 'UPDATE_CAMPAIGN_BUDGET':
        return { actionType: 'UPDATE_CAMPAIGN_BUDGET', requestedPayload: { dailyBudget: rollbackBudget(before) } };
      default:
        break;
    }
    throw new MetaAdsProviderError('META_ADS_ROLLBACK_BEFORE_STATE_INVALID', false, false, 'GOVERNANCE');
  }

  async execute(context: TenantContext, dispatch: GovernedExternalActionDispatch): Promise<ExternalActionProviderExecution> {
    if (!isGovernedExternalActionDispatch(dispatch)) throw new MetaAdsProviderError('GOVERNED_DISPATCH_REQUIRED', false, false, 'GOVERNANCE');
    const action = dispatch.action;
    this.assertTenant(context, action.proposal);
    this.assertMetaProposal(action.proposal);
    if (action.status !== 'EXECUTING') throw new MetaAdsProviderError('GOVERNED_EXECUTION_STATE_REQUIRED', false, false, 'GOVERNANCE');
    if (!action.approvalId && action.proposal.approvalRequirement !== 'OPTIONAL') throw new MetaAdsProviderError('DURABLE_APPROVAL_REQUIRED', false, false, 'GOVERNANCE');
    if (this.mode === 'DISABLED') throw new MetaAdsProviderError('META_ADS_PROVIDER_DISABLED', false, false, 'CONFIGURATION');
    if (this.mode === 'REAL' && !this.executionEnabled) throw new MetaAdsProviderError('META_ADS_REAL_EXECUTION_DISABLED', false, false, 'CONFIGURATION');
    this.assertRealAccountAllowed(action.proposal.accountId);
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
    this.assertMetaProposal(action.proposal);
    if (this.mode === 'DRY_RUN') {
      return { status: 'VERIFIED', observedState: { dryRun: true, providerReference: execution.providerReference }, reasons: ['DRY_RUN_NO_LIVE_MUTATION'], verifiedAt: this.now() };
    }
    this.assertRealAccountAllowed(action.proposal.accountId);
    const campaign = await this.provider.getCampaign(context, action.proposal.accountId, action.proposal.campaignId!);
    const expected = expectedMatches(campaign, action.proposal);
    return {
      status: expected ? 'VERIFIED' : 'MISMATCH',
      observedState: { ...campaign },
      reasons: expected ? [] : ['PROVIDER_STATE_DOES_NOT_MATCH_REQUESTED_MUTATION'],
      verifiedAt: this.now(),
    };
  }

  async reconcileUnknownExecution(context: TenantContext, action: GovernedExternalAction): Promise<ExternalActionProviderReconciliation> {
    this.assertTenant(context, action.proposal);
    if (this.mode === 'DISABLED') return { status: 'INCONCLUSIVE', reasons: ['META_ADS_PROVIDER_DISABLED'] };
    if (this.mode === 'DRY_RUN') {
      return {
        status: 'APPLIED',
        execution: { providerReference: `dry-run:${action.id}`, observedState: { dryRun: true } },
        observedState: { dryRun: true },
        reasons: ['DRY_RUN_RECONCILIATION'],
      };
    }
    this.assertRealAccountAllowed(action.proposal.accountId);
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
          execution: { providerReference: `meta-ads-reconciled:${action.id}`, observedState: { ...campaign } },
          observedState: { ...campaign },
          reasons: ['READ_BACK_MATCHES_REQUESTED_STATE'],
        };
      }
      return { status: 'NOT_APPLIED', observedState: { ...campaign }, reasons: ['READ_BACK_DOES_NOT_MATCH_REQUESTED_STATE'] };
    } catch {
      return { status: 'INCONCLUSIVE', reasons: ['META_ADS_READ_BACK_UNAVAILABLE'] };
    }
  }

  private assertTenant(context: TenantContext, proposal: ExternalMarketingActionProposal): void {
    if (!context.tenantId || context.tenantId !== proposal.tenantId) throw new MetaAdsProviderError('TENANT_SCOPE_DENIED', false, false, 'GOVERNANCE');
  }

  private assertMetaProposal(proposal: ExternalMarketingActionProposal): void {
    if (proposal.provider !== 'META_ADS' || !proposal.campaignId || !['PAUSE_CAMPAIGN', 'ENABLE_CAMPAIGN', 'UPDATE_CAMPAIGN_BUDGET'].includes(proposal.actionType)) {
      throw new MetaAdsProviderError('META_ADS_PROVIDER_OR_ACTION_REQUIRED', false, false, 'GOVERNANCE');
    }
  }

  private assertRealAccountAllowed(accountId: string): void {
    if (this.mode !== 'REAL') return;
    const normalized = normalizeMetaAdAccountId(accountId, 'META_ADS_ACCOUNT_ID_INVALID');
    if (!this.approvedAdAccountId) throw new MetaAdsProviderError('META_ADS_APPROVED_ACCOUNT_REQUIRED', false, false, 'CONFIGURATION');
    if (normalized !== this.approvedAdAccountId) throw new MetaAdsProviderError('META_ADS_APPROVED_ACCOUNT_MISMATCH', false, false, 'ACCOUNT_ACCESS');
    if (this.sandboxAdAccountIds.size === 0) throw new MetaAdsProviderError('META_ADS_SANDBOX_ALLOWLIST_REQUIRED', false, false, 'CONFIGURATION');
    if (!this.sandboxAdAccountIds.has(normalized)) throw new MetaAdsProviderError('META_ADS_PRODUCTION_ACCOUNT_BLOCKED', false, false, 'ACCOUNT_ACCESS');
  }
}

function assertProviderTenant(context: TenantContext): void {
  if (!context.tenantId) throw new MetaAdsProviderError('TENANT_CONTEXT_REQUIRED', false, false, 'GOVERNANCE');
}

function normalizeMetaAdAccountId(value: string, code: string): string {
  const digits = value.trim().replace(/^act_/i, '');
  if (!/^\d{1,20}$/.test(digits)) throw new MetaAdsProviderError(code, false, false, 'CONFIGURATION');
  return `act_${digits}`;
}

function normalizeMetaCampaignId(value: string): string {
  const normalized = value.trim();
  if (!/^\d{1,20}$/.test(normalized)) throw new MetaAdsProviderError('META_ADS_CAMPAIGN_ID_INVALID', false, false, 'INVALID_REQUEST');
  return normalized;
}

function metaBudgetPayload(proposal: ExternalMarketingActionProposal): number {
  const value = proposal.requestedPayload.dailyBudget;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new MetaAdsProviderError('META_ADS_DAILY_BUDGET_MINOR_INVALID', false, false, 'INVALID_REQUEST');
  }
  return value;
}

function rollbackBudget(before: Record<string, unknown>): number {
  const value = before.dailyBudget ?? before.budget;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new MetaAdsProviderError('META_ADS_ROLLBACK_BEFORE_STATE_INVALID', false, false, 'GOVERNANCE');
  }
  return value;
}

function expectedMatches(campaign: MetaAdsCampaign, proposal: ExternalMarketingActionProposal): boolean {
  switch (proposal.actionType) {
    case 'PAUSE_CAMPAIGN': return campaign.enabled === false;
    case 'ENABLE_CAMPAIGN': return campaign.enabled === true;
    case 'UPDATE_CAMPAIGN_BUDGET': return campaign.dailyBudget === metaBudgetPayload(proposal);
    default: return false;
  }
}

function applyRequestedState(campaign: MetaAdsCampaign, proposal: ExternalMarketingActionProposal): MetaAdsCampaign {
  const next = { ...campaign };
  if (proposal.actionType === 'PAUSE_CAMPAIGN') { next.enabled = false; next.status = 'PAUSED'; }
  if (proposal.actionType === 'ENABLE_CAMPAIGN') { next.enabled = true; next.status = 'ACTIVE'; }
  if (proposal.actionType === 'UPDATE_CAMPAIGN_BUDGET') next.dailyBudget = metaBudgetPayload(proposal);
  return next;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOf(value: unknown): string | undefined { return typeof value === 'string' && value.length > 0 ? value : undefined; }

function integerOf(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(numeric) ? numeric : undefined;
}

async function safeJson(response: MetaAdsFetchResponse): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function mapMetaAdsHttpError(status: number, body: unknown, mutation: boolean, retryAfterHeader: string | null): MetaAdsProviderError {
  const error = recordOf(recordOf(body).error);
  const signature = JSON.stringify(error).toUpperCase();
  const graphCode = integerOf(error.code);
  const retryAfterSeconds = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : undefined;
  const retryAfterMs = retryAfterSeconds === undefined ? undefined : retryAfterSeconds * 1_000;
  if (status === 401 || graphCode === 190) {
    if (signature.includes('EXPIRED')) return new MetaAdsProviderError('META_ADS_TOKEN_EXPIRED', false, false, 'AUTHENTICATION');
    if (signature.includes('REVOKED') || signature.includes('INVALID')) return new MetaAdsProviderError('META_ADS_TOKEN_REVOKED', false, false, 'AUTHENTICATION');
    return new MetaAdsProviderError('META_ADS_AUTHENTICATION_FAILED', false, false, 'AUTHENTICATION');
  }
  if (status === 429 || [4, 17, 32, 613].includes(graphCode ?? -1)) {
    return new MetaAdsProviderError('META_ADS_RATE_LIMITED', true, false, 'RATE_LIMITED', retryAfterMs);
  }
  if (status === 404) return new MetaAdsProviderError('META_ADS_RESOURCE_NOT_FOUND', false, false, 'RESOURCE_NOT_FOUND');
  if (status === 403 || [10, 200, 294].includes(graphCode ?? -1)) {
    return new MetaAdsProviderError('META_ADS_AUTHORIZATION_FAILED', false, false, 'AUTHORIZATION');
  }
  if (status === 400 || graphCode === 100) return new MetaAdsProviderError('META_ADS_INVALID_REQUEST', false, false, 'INVALID_REQUEST');
  if (status === 408 || status >= 500) {
    return new MetaAdsProviderError('META_ADS_PROVIDER_UNAVAILABLE', true, mutation, mutation ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE', retryAfterMs);
  }
  return new MetaAdsProviderError('META_ADS_UNKNOWN_PROVIDER_ERROR', false, false, 'UNKNOWN_PROVIDER_ERROR');
}

function cloneExecution(value: ExternalActionProviderExecution): ExternalActionProviderExecution {
  return { ...value, ...(value.observedState ? { observedState: { ...value.observedState } } : {}) };
}
