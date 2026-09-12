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
  ExternalActionRollbackDerivation,
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

export type GoogleAdsProviderErrorClass =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'ACCOUNT_ACCESS'
  | 'CAMPAIGN_NOT_FOUND'
  | 'POLICY'
  | 'INVALID_MUTATION'
  | 'QUOTA'
  | 'TIMEOUT'
  | 'NETWORK_UNCERTAINTY'
  | 'VERIFICATION'
  | 'CONFIGURATION'
  | 'GOVERNANCE';

/**
 * This error is deliberately a safe diagnostic envelope. The message is a
 * stable classification code, never a provider response, credential, header,
 * OAuth payload, or request body.
 */
export class GoogleAdsProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly unknownOutcome = false,
    readonly errorClass: GoogleAdsProviderErrorClass = 'CONFIGURATION',
  ) {
    super(code);
    this.name = 'GoogleAdsProviderError';
  }
}

export interface GoogleAdsAccount {
  accountId: string;
  descriptiveName?: string;
  currencyCode?: string;
}

export interface GoogleAdsCampaign {
  accountId: string;
  campaignId: string;
  enabled: boolean;
  dailyBudget?: number;
  targetCpa?: number;
  targetRoas?: number;
  /** Internal Google resource name needed only for a governed budget update. */
  budgetResourceName?: string;
}

export interface GoogleAdsProvider {
  validateConnection(): Promise<void>;
  getAccount(context: TenantContext, accountId: string): Promise<GoogleAdsAccount>;
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

/**
 * Narrow transport port. Production uses the REST implementation below;
 * deterministic tests inject this boundary instead of making HTTP calls.
 */
export interface GoogleAdsApiTransport {
  validateConnection(credentials: GoogleAdsCredentials): Promise<void>;
  getAccount(credentials: GoogleAdsCredentials, accountId: string): Promise<GoogleAdsAccount>;
  getCampaign(credentials: GoogleAdsCredentials, accountId: string, campaignId: string): Promise<GoogleAdsCampaign>;
  executeAction(
    credentials: GoogleAdsCredentials,
    proposal: ExternalMarketingActionProposal,
  ): Promise<ExternalActionProviderExecution>;
}

export interface GoogleAdsFetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface GoogleAdsFetchRequest {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type GoogleAdsFetch = (url: string, request: GoogleAdsFetchRequest) => Promise<GoogleAdsFetchResponse>;

export interface GoogleAdsRestTransportOptions {
  apiVersion?: string;
  timeoutMs?: number;
  fetcher?: GoogleAdsFetch;
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

  async getAccount(_context: TenantContext, accountId: string): Promise<GoogleAdsAccount> {
    const matchingCampaign = [...this.campaigns.values()].find((campaign) => campaign.accountId === accountId);
    if (!matchingCampaign) throw new GoogleAdsProviderError('GOOGLE_ADS_ACCOUNT_INACCESSIBLE', false, false, 'ACCOUNT_ACCESS');
    return { accountId };
  }

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

/**
 * Production-capable Google Ads REST transport. It is intentionally isolated
 * from the executor and API surface: this class receives credentials only at
 * the provider boundary and emits only sanitized provider classifications.
 */
export class GoogleAdsRestTransport implements GoogleAdsApiTransport {
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly fetcher: GoogleAdsFetch;

  constructor(options: GoogleAdsRestTransportOptions = {}) {
    this.apiVersion = options.apiVersion ?? 'v25';
    if (!/^v\d+$/.test(this.apiVersion)) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_API_VERSION_INVALID', false, false, 'CONFIGURATION');
    }
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetcher = options.fetcher ?? (globalThis.fetch as unknown as GoogleAdsFetch);
    if (!this.fetcher) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_FETCH_UNAVAILABLE', false, false, 'CONFIGURATION');
    }
  }

  async validateConnection(credentials: GoogleAdsCredentials): Promise<void> {
    const accessToken = await this.accessToken(credentials);
    const response = await this.googleRequest(credentials, accessToken, 'customers:listAccessibleCustomers', { method: 'GET' }, false);
    const accessible = arrayOfStrings(recordOf(response.body).resourceNames)
      .map((resourceName) => resourceName.replace(/^customers\//, ''));
    const configuredCustomer = normalizeGoogleId(credentials.customerId, 'GOOGLE_ADS_CUSTOMER_ID_INVALID');
    // A delegated test client is often reachable through its configured
    // login-customer manager while only that manager appears in
    // listAccessibleCustomers. The subsequent scoped account/campaign read is
    // still required and fails closed if the configured customer is not
    // actually accessible through that manager.
    const configuredLoginCustomer = credentials.loginCustomerId
      ? normalizeGoogleId(credentials.loginCustomerId, 'GOOGLE_ADS_LOGIN_CUSTOMER_ID_INVALID')
      : undefined;
    if (
      !accessible.includes(configuredCustomer) &&
      (!configuredLoginCustomer || !accessible.includes(configuredLoginCustomer))
    ) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_ACCOUNT_INACCESSIBLE', false, false, 'ACCOUNT_ACCESS');
    }
  }

  async getAccount(credentials: GoogleAdsCredentials, accountId: string): Promise<GoogleAdsAccount> {
    const customerId = normalizeGoogleId(accountId, 'GOOGLE_ADS_ACCOUNT_ID_INVALID');
    const rows = await this.search(
      credentials,
      customerId,
      'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1',
    );
    const customer = recordOf(rows[0]?.customer);
    const observedAccountId = stringOf(customer.id);
    if (!observedAccountId) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_ACCOUNT_INACCESSIBLE', false, false, 'ACCOUNT_ACCESS');
    }
    const account: GoogleAdsAccount = {
      accountId: normalizeGoogleId(observedAccountId, 'GOOGLE_ADS_ACCOUNT_ID_INVALID'),
    };
    const descriptiveName = stringOf(customer.descriptiveName);
    const currencyCode = stringOf(customer.currencyCode);
    if (descriptiveName) account.descriptiveName = descriptiveName;
    if (currencyCode) account.currencyCode = currencyCode;
    return account;
  }

  async getCampaign(credentials: GoogleAdsCredentials, accountId: string, campaignId: string): Promise<GoogleAdsCampaign> {
    const customerId = normalizeGoogleId(accountId, 'GOOGLE_ADS_ACCOUNT_ID_INVALID');
    const normalizedCampaignId = normalizeGoogleId(campaignId, 'GOOGLE_ADS_CAMPAIGN_ID_INVALID');
    const rows = await this.search(
      credentials,
      customerId,
      [
        'SELECT campaign.id, campaign.status, campaign.campaign_budget,',
        'campaign.target_cpa.target_cpa_micros, campaign.target_roas.target_roas,',
        'campaign.maximize_conversions.target_cpa_micros,',
        'campaign.maximize_conversion_value.target_roas, campaign_budget.amount_micros',
        'FROM campaign',
        `WHERE campaign.id = ${normalizedCampaignId}`,
        'LIMIT 1',
      ].join(' '),
    );
    const row = recordOf(rows[0]);
    const campaign = recordOf(row.campaign);
    if (!stringOf(campaign.id)) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_CAMPAIGN_NOT_FOUND', false, false, 'CAMPAIGN_NOT_FOUND');
    }
    const campaignBudget = recordOf(row.campaignBudget);
    const targetCpa = recordOf(campaign.targetCpa);
    const maximizeConversions = recordOf(campaign.maximizeConversions);
    const targetRoas = recordOf(campaign.targetRoas);
    const maximizeConversionValue = recordOf(campaign.maximizeConversionValue);
    const dailyBudgetMicros = numberOf(campaignBudget.amountMicros);
    const targetCpaMicros = numberOf(targetCpa.targetCpaMicros) ?? numberOf(maximizeConversions.targetCpaMicros);
    const targetRoasValue = numberOf(targetRoas.targetRoas) ?? numberOf(maximizeConversionValue.targetRoas);
    const observedCampaign: GoogleAdsCampaign = {
      accountId: customerId,
      campaignId: normalizedCampaignId,
      enabled: stringOf(campaign.status) === 'ENABLED',
    };
    const budgetResourceName = stringOf(campaign.campaignBudget);
    if (dailyBudgetMicros !== undefined) observedCampaign.dailyBudget = dailyBudgetMicros / 1_000_000;
    if (targetCpaMicros !== undefined) observedCampaign.targetCpa = targetCpaMicros / 1_000_000;
    if (targetRoasValue !== undefined) observedCampaign.targetRoas = targetRoasValue;
    if (budgetResourceName) observedCampaign.budgetResourceName = budgetResourceName;
    return observedCampaign;
  }

  async executeAction(
    credentials: GoogleAdsCredentials,
    proposal: ExternalMarketingActionProposal,
  ): Promise<ExternalActionProviderExecution> {
    if (!['PAUSE_CAMPAIGN', 'ENABLE_CAMPAIGN', 'UPDATE_CAMPAIGN_BUDGET', 'UPDATE_TARGET_CPA', 'UPDATE_TARGET_ROAS'].includes(proposal.actionType)) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_ACTION_UNSUPPORTED', false, false, 'INVALID_MUTATION');
    }
    if (!proposal.campaignId) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_CAMPAIGN_ID_REQUIRED', false, false, 'INVALID_MUTATION');
    }
    const customerId = normalizeGoogleId(proposal.accountId, 'GOOGLE_ADS_ACCOUNT_ID_INVALID');
    const campaignId = normalizeGoogleId(proposal.campaignId, 'GOOGLE_ADS_CAMPAIGN_ID_INVALID');
    const before = await this.getCampaign(credentials, customerId, campaignId);
    const resourceName = `customers/${customerId}/campaigns/${campaignId}`;
    let path: string;
    let body: Record<string, unknown>;

    switch (proposal.actionType) {
      case 'PAUSE_CAMPAIGN':
      case 'ENABLE_CAMPAIGN':
        path = `customers/${customerId}/campaigns:mutate`;
        body = mutateBody({ resourceName, status: proposal.actionType === 'PAUSE_CAMPAIGN' ? 'PAUSED' : 'ENABLED' }, 'status');
        break;
      case 'UPDATE_CAMPAIGN_BUDGET': {
        if (!before.budgetResourceName) {
          throw new GoogleAdsProviderError('GOOGLE_ADS_CAMPAIGN_BUDGET_REQUIRED', false, false, 'INVALID_MUTATION');
        }
        path = `customers/${customerId}/campaignBudgets:mutate`;
        body = mutateBody(
          { resourceName: before.budgetResourceName, amountMicros: toMicros(numberPayload(proposal, 'dailyBudget', 'budget')) },
          'amount_micros',
        );
        break;
      }
      case 'UPDATE_TARGET_CPA':
        path = `customers/${customerId}/campaigns:mutate`;
        body = mutateBody(
          { resourceName, targetCpa: { targetCpaMicros: toMicros(numberPayload(proposal, 'targetCpa')) } },
          'target_cpa.target_cpa_micros',
        );
        break;
      case 'UPDATE_TARGET_ROAS':
        path = `customers/${customerId}/campaigns:mutate`;
        body = mutateBody(
          { resourceName, targetRoas: { targetRoas: numberPayload(proposal, 'targetRoas') } },
          'target_roas.target_roas',
        );
        break;
      default:
        throw new GoogleAdsProviderError('GOOGLE_ADS_ACTION_UNSUPPORTED', false, false, 'INVALID_MUTATION');
    }

    const accessToken = await this.accessToken(credentials);
    const response = await this.googleRequest(credentials, accessToken, path, {
      method: 'POST',
      body: JSON.stringify(body),
    }, true);
    const providerReference = response.requestId ?? resourceName;
    return {
      providerReference: `google-ads:${providerReference}`,
      observedState: { ...applyRequestedState(before, proposal) },
    };
  }

  private async search(credentials: GoogleAdsCredentials, accountId: string, query: string): Promise<Record<string, unknown>[]> {
    const accessToken = await this.accessToken(credentials);
    const response = await this.googleRequest(credentials, accessToken, `customers/${accountId}/googleAds:searchStream`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    }, false);
    return searchRows(response.body);
  }

  private async accessToken(credentials: GoogleAdsCredentials): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    }).toString();
    const response = await this.request('https://www.googleapis.com/oauth2/v3/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }, false, true);
    const token = stringOf(recordOf(response.body).access_token);
    if (!token) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_AUTHENTICATION_FAILED', false, false, 'AUTHENTICATION');
    }
    return token;
  }

  private async googleRequest(
    credentials: GoogleAdsCredentials,
    accessToken: string,
    path: string,
    request: Pick<GoogleAdsFetchRequest, 'method' | 'body'>,
    mutation: boolean,
  ): Promise<{ body: unknown; requestId?: string }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'developer-token': credentials.developerToken,
    };
    if (credentials.loginCustomerId) {
      headers['login-customer-id'] = normalizeGoogleId(credentials.loginCustomerId, 'GOOGLE_ADS_LOGIN_CUSTOMER_ID_INVALID');
    }
    return this.request(`https://googleads.googleapis.com/${this.apiVersion}/${path}`, { ...request, headers }, mutation, false);
  }

  private async request(
    url: string,
    request: GoogleAdsFetchRequest,
    mutation: boolean,
    authentication: boolean,
  ): Promise<{ body: unknown; requestId?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: GoogleAdsFetchResponse;
    try {
      response = await this.fetcher(url, { ...request, signal: controller.signal });
    } catch {
      throw new GoogleAdsProviderError(
        authentication ? 'GOOGLE_ADS_AUTHENTICATION_NETWORK_FAILURE' : 'GOOGLE_ADS_NETWORK_UNCERTAINTY',
        true,
        mutation,
        mutation ? 'NETWORK_UNCERTAINTY' : authentication ? 'AUTHENTICATION' : 'NETWORK_UNCERTAINTY',
      );
    } finally {
      clearTimeout(timeout);
    }
    const body = await safeJson(response);
    if (!response.ok) {
      throw mapGoogleAdsHttpError(response.status, body, mutation, authentication);
    }
    return {
      body,
      ...(response.headers.get('request-id') ? { requestId: response.headers.get('request-id')! } : {}),
    };
  }
}

/** Real provider adapter. It binds credentials and account identity to the REST transport only. */
export class GoogleAdsApiAdapter implements GoogleAdsProvider {
  constructor(
    private readonly credentials: GoogleAdsCredentialResolver,
    private readonly transport: GoogleAdsApiTransport = new GoogleAdsRestTransport(),
  ) {}

  async validateConnection(): Promise<void> {
    await this.transport.validateConnection(this.credentials.resolve());
  }

  async getAccount(context: TenantContext, accountId: string): Promise<GoogleAdsAccount> {
    assertProviderTenant(context);
    const credentials = this.resolveForAccount(accountId);
    return this.transport.getAccount(credentials, normalizeGoogleId(accountId, 'GOOGLE_ADS_ACCOUNT_ID_INVALID'));
  }

  async getCampaign(context: TenantContext, accountId: string, campaignId: string): Promise<GoogleAdsCampaign> {
    assertProviderTenant(context);
    const credentials = this.resolveForAccount(accountId);
    return this.transport.getCampaign(
      credentials,
      normalizeGoogleId(accountId, 'GOOGLE_ADS_ACCOUNT_ID_INVALID'),
      normalizeGoogleId(campaignId, 'GOOGLE_ADS_CAMPAIGN_ID_INVALID'),
    );
  }

  async mutate(
    context: TenantContext,
    dispatch: GovernedExternalActionDispatch,
  ): Promise<ExternalActionProviderExecution> {
    if (!isGovernedExternalActionDispatch(dispatch)) {
      throw new GoogleAdsProviderError('GOVERNED_DISPATCH_REQUIRED', false, false, 'GOVERNANCE');
    }
    assertProviderTenant(context);
    const proposal = dispatch.action.proposal;
    if (proposal.tenantId !== context.tenantId) {
      throw new GoogleAdsProviderError('TENANT_SCOPE_DENIED', false, false, 'GOVERNANCE');
    }
    return this.transport.executeAction(this.resolveForAccount(proposal.accountId), proposal);
  }

  async findMutationByIdempotency(
    _context: TenantContext,
    _idempotencyKey: string,
  ): Promise<ExternalActionProviderExecution | undefined> {
    // Google Ads exposes no durable client idempotency lookup. The governed
    // executor therefore reconciles ambiguous mutations with independent
    // campaign read-back before it ever considers a retry.
    return undefined;
  }

  private resolveForAccount(accountId: string): GoogleAdsCredentials {
    const credentials = this.credentials.resolve();
    if (normalizeGoogleId(credentials.customerId, 'GOOGLE_ADS_CUSTOMER_ID_INVALID') !== normalizeGoogleId(accountId, 'GOOGLE_ADS_ACCOUNT_ID_INVALID')) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_ACCOUNT_NOT_CONFIGURED', false, false, 'ACCOUNT_ACCESS');
    }
    return credentials;
  }
}

function assertProviderTenant(context: TenantContext): void {
  if (!context.tenantId) {
    throw new GoogleAdsProviderError('TENANT_CONTEXT_REQUIRED', false, false, 'GOVERNANCE');
  }
}

function normalizeGoogleId(value: string, code: string): string {
  const normalized = value.replace(/-/g, '').trim();
  if (!/^\d{1,20}$/.test(normalized)) {
    throw new GoogleAdsProviderError(code, false, false, 'CONFIGURATION');
  }
  return normalized;
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberOf(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function searchRows(value: unknown): Record<string, unknown>[] {
  const pages = Array.isArray(value) ? value : [value];
  return pages.flatMap((page) => {
    const results = recordOf(page).results;
    return Array.isArray(results) ? results.map(recordOf) : [];
  });
}

function mutateBody(update: Record<string, unknown>, updateMask: string): Record<string, unknown> {
  return {
    partialFailure: false,
    responseContentType: 'MUTABLE_RESOURCE',
    operations: [{ update, updateMask }],
  };
}

function toMicros(value: number): string {
  const micros = Math.round(value * 1_000_000);
  if (!Number.isSafeInteger(micros) || micros < 0) {
    throw new GoogleAdsProviderError('GOOGLE_ADS_NUMERIC_PAYLOAD_INVALID', false, false, 'INVALID_MUTATION');
  }
  return String(micros);
}

function applyRequestedState(campaign: GoogleAdsCampaign, proposal: ExternalMarketingActionProposal): GoogleAdsCampaign {
  const next = { ...campaign };
  if (proposal.actionType === 'PAUSE_CAMPAIGN') next.enabled = false;
  if (proposal.actionType === 'ENABLE_CAMPAIGN') next.enabled = true;
  if (proposal.actionType === 'UPDATE_CAMPAIGN_BUDGET') next.dailyBudget = numberPayload(proposal, 'dailyBudget', 'budget');
  if (proposal.actionType === 'UPDATE_TARGET_CPA') next.targetCpa = numberPayload(proposal, 'targetCpa');
  if (proposal.actionType === 'UPDATE_TARGET_ROAS') next.targetRoas = numberPayload(proposal, 'targetRoas');
  return next;
}

async function safeJson(response: GoogleAdsFetchResponse): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function mapGoogleAdsHttpError(
  status: number,
  body: unknown,
  mutation: boolean,
  authentication: boolean,
): GoogleAdsProviderError {
  const signature = JSON.stringify(body).toUpperCase();
  if (authentication || status === 401) {
    return new GoogleAdsProviderError('GOOGLE_ADS_AUTHENTICATION_FAILED', false, false, 'AUTHENTICATION');
  }
  if (status === 429 || signature.includes('QUOTA')) {
    return new GoogleAdsProviderError('GOOGLE_ADS_QUOTA_RATE_LIMITED', true, false, 'QUOTA');
  }
  if (status === 404 || signature.includes('CAMPAIGN_NOT_FOUND')) {
    return new GoogleAdsProviderError('GOOGLE_ADS_CAMPAIGN_NOT_FOUND', false, false, 'CAMPAIGN_NOT_FOUND');
  }
  if (status === 403) {
    const accountFailure = signature.includes('CUSTOMER') || signature.includes('ACCOUNT') || signature.includes('USER_PERMISSION');
    return new GoogleAdsProviderError(
      accountFailure ? 'GOOGLE_ADS_ACCOUNT_INACCESSIBLE' : 'GOOGLE_ADS_AUTHORIZATION_FAILED',
      false,
      false,
      accountFailure ? 'ACCOUNT_ACCESS' : 'AUTHORIZATION',
    );
  }
  if (status === 408 || status >= 500) {
    return new GoogleAdsProviderError('GOOGLE_ADS_PROVIDER_TIMEOUT', true, mutation, mutation ? 'TIMEOUT' : 'NETWORK_UNCERTAINTY');
  }
  if (signature.includes('POLICY')) {
    return new GoogleAdsProviderError('GOOGLE_ADS_POLICY_REJECTED', false, false, 'POLICY');
  }
  return new GoogleAdsProviderError('GOOGLE_ADS_INVALID_MUTATION', false, false, 'INVALID_MUTATION');
}

export interface GoogleAdsGatewaySafetyOptions {
  /** The one configured customer this deployment is allowed to address. */
  approvedCustomerId?: string;
  /** Explicit numeric test-account IDs; names and labels are never trusted. */
  sandboxCustomerIds?: readonly string[];
  telemetry?: GoogleAdsTelemetry;
}

export interface GoogleAdsTelemetryEvent {
  provider: 'GOOGLE_ADS';
  operation: 'READ_ACCOUNT' | 'READ_CAMPAIGN' | 'SIMULATE' | 'EXECUTE' | 'VERIFY' | 'RECONCILE';
  tenantId: string;
  actionType?: string;
  actionId?: string;
  workflowRunId?: string;
  latencyMs: number;
  attempt?: number;
  verificationState?: string;
  rollbackState?: string;
  providerErrorClass?: GoogleAdsProviderErrorClass;
}

/** Safe, write-only operational telemetry boundary. It must never receive credentials or raw HTTP payloads. */
export interface GoogleAdsTelemetry {
  record(event: GoogleAdsTelemetryEvent): void;
}

/** The sole Google Ads-facing dependency allowed into the governed executor. */
export class GoogleAdsProviderGateway implements ExternalMarketingProviderGateway {
  readonly executionMode: 'DRY_RUN' | 'LIVE';
  private readonly approvedCustomerId: string | undefined;
  private readonly sandboxCustomerIds: ReadonlySet<string>;
  private readonly telemetry: GoogleAdsTelemetry | undefined;

  constructor(
    private readonly provider: GoogleAdsProvider,
    private readonly mode: GoogleAdsExecutionMode,
    private readonly executionEnabled: boolean,
    private readonly now: () => string = () => new Date().toISOString(),
    options: GoogleAdsGatewaySafetyOptions = {},
  ) {
    this.executionMode = mode === 'DRY_RUN' ? 'DRY_RUN' : 'LIVE';
    this.approvedCustomerId = options.approvedCustomerId
      ? normalizeGoogleId(options.approvedCustomerId, 'GOOGLE_ADS_APPROVED_CUSTOMER_ID_INVALID')
      : undefined;
    this.sandboxCustomerIds = new Set(
      (options.sandboxCustomerIds ?? []).map((accountId) => normalizeGoogleId(accountId, 'GOOGLE_ADS_SANDBOX_ACCOUNT_ID_INVALID')),
    );
    this.telemetry = options.telemetry;
  }

  /** Read-only transport entrypoint. It never requires mutation enablement or an approval. */
  async readAccount(context: TenantContext, accountId: string): Promise<GoogleAdsAccount> {
    if (!context.tenantId) throw new GoogleAdsProviderError('TENANT_CONTEXT_REQUIRED', false, false, 'GOVERNANCE');
    if (this.mode === 'DISABLED') throw new GoogleAdsProviderError('GOOGLE_ADS_PROVIDER_DISABLED', false, false, 'CONFIGURATION');
    this.assertRealReadAccountAllowed(accountId);
    return this.observed({ provider: 'GOOGLE_ADS', operation: 'READ_ACCOUNT', tenantId: context.tenantId }, () => this.provider.getAccount(context, accountId));
  }

  /** Read-only campaign inspection for future guarded API/read-model composition. */
  async readCampaign(context: TenantContext, proposal: ExternalMarketingActionProposal): Promise<GoogleAdsCampaign> {
    this.assertTenant(context, proposal);
    this.assertGoogleProposal(proposal);
    if (this.mode === 'DISABLED') throw new GoogleAdsProviderError('GOOGLE_ADS_PROVIDER_DISABLED', false, false, 'CONFIGURATION');
    this.assertRealReadAccountAllowed(proposal.accountId);
    return this.observed(this.telemetryFor('READ_CAMPAIGN', context, proposal), async () => {
      await this.provider.validateConnection();
      return this.provider.getCampaign(context, proposal.accountId, proposal.campaignId!);
    });
  }

  async simulate(context: TenantContext, proposal: ExternalMarketingActionProposal): Promise<ExternalActionProviderSimulation> {
    this.assertTenant(context, proposal);
    this.assertGoogleProposal(proposal);
    if (this.mode === 'DISABLED') throw new GoogleAdsProviderError('GOOGLE_ADS_PROVIDER_DISABLED', false, false, 'CONFIGURATION');
    this.assertRealReadAccountAllowed(proposal.accountId);
    return this.observed(this.telemetryFor('SIMULATE', context, proposal), async () => {
      await this.provider.validateConnection();
      const campaign = await this.provider.getCampaign(context, proposal.accountId, proposal.campaignId!);
      const value = currentValue(campaign, proposal.actionType);
      return {
        ...(value !== undefined ? { currentValue: value } : {}),
        currentState: { ...campaign },
        expectedKpiImpact: { statement: 'Provider state is used for deterministic delta calculation only.' },
        assumptions: ['Google Ads state was read at simulation time.', 'No future performance is guaranteed.'],
      };
    });
  }

  /**
   * Maps the durable before-state to an explicit Google Ads restoration
   * operation. This performs no remote read: the original durable before-state
   * is authoritative, and invalid state is rejected before a proposal exists.
   */
  async deriveRollbackProposal(
    context: TenantContext,
    original: GovernedExternalAction,
  ): Promise<ExternalActionRollbackDerivation> {
    this.assertTenant(context, original.proposal);
    this.assertGoogleProposal(original.proposal);
    const before = original.proposal.rollback.before;
    switch (original.proposal.actionType) {
      case 'ENABLE_CAMPAIGN':
        if (before.enabled !== false) break;
        return { actionType: 'PAUSE_CAMPAIGN', requestedPayload: { enabled: false } };
      case 'PAUSE_CAMPAIGN':
        if (before.enabled !== true) break;
        return { actionType: 'ENABLE_CAMPAIGN', requestedPayload: { enabled: true } };
      case 'UPDATE_CAMPAIGN_BUDGET':
        return { actionType: 'UPDATE_CAMPAIGN_BUDGET', requestedPayload: { dailyBudget: rollbackNumber(before, 'dailyBudget', 'budget') } };
      case 'UPDATE_TARGET_CPA':
        return { actionType: 'UPDATE_TARGET_CPA', requestedPayload: { targetCpa: rollbackNumber(before, 'targetCpa') } };
      case 'UPDATE_TARGET_ROAS':
        return { actionType: 'UPDATE_TARGET_ROAS', requestedPayload: { targetRoas: rollbackNumber(before, 'targetRoas') } };
      default:
        break;
    }
    throw new GoogleAdsProviderError('GOOGLE_ADS_ROLLBACK_BEFORE_STATE_INVALID', false, false, 'GOVERNANCE');
  }

  async execute(
    context: TenantContext,
    dispatch: GovernedExternalActionDispatch,
  ): Promise<ExternalActionProviderExecution> {
    if (!isGovernedExternalActionDispatch(dispatch)) {
      throw new GoogleAdsProviderError('GOVERNED_DISPATCH_REQUIRED', false, false, 'GOVERNANCE');
    }
    const action = dispatch.action;
    this.assertTenant(context, action.proposal);
    this.assertGoogleProposal(action.proposal);
    if (action.status !== 'EXECUTING') throw new GoogleAdsProviderError('GOVERNED_EXECUTION_STATE_REQUIRED', false, false, 'GOVERNANCE');
    if (!action.approvalId && action.proposal.approvalRequirement !== 'OPTIONAL') throw new GoogleAdsProviderError('DURABLE_APPROVAL_REQUIRED', false, false, 'GOVERNANCE');
    if (this.mode === 'DISABLED') throw new GoogleAdsProviderError('GOOGLE_ADS_PROVIDER_DISABLED', false, false, 'CONFIGURATION');
    if (this.mode === 'REAL' && !this.executionEnabled) throw new GoogleAdsProviderError('GOOGLE_ADS_REAL_EXECUTION_DISABLED', false, false, 'CONFIGURATION');
    this.assertRealMutationAccountAllowed(action.proposal.accountId);
    if (this.mode === 'DRY_RUN') {
      return { providerReference: `dry-run:${action.id}`, observedState: { dryRun: true, requestedPayload: action.proposal.requestedPayload } };
    }
    return this.observed(this.telemetryFor('EXECUTE', context, action.proposal, action), async () => {
      await this.provider.validateConnection();
      return this.provider.mutate(context, dispatch);
    });
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
    this.assertRealReadAccountAllowed(action.proposal.accountId);
    return this.observed(this.telemetryFor('VERIFY', context, action.proposal, action), async () => {
      const campaign = await this.provider.getCampaign(context, action.proposal.accountId, action.proposal.campaignId!);
      const expected = expectedMatches(campaign, action.proposal);
      return {
        status: expected ? 'VERIFIED' : 'MISMATCH',
        observedState: { ...campaign },
        reasons: expected ? [] : ['PROVIDER_STATE_DOES_NOT_MATCH_REQUESTED_MUTATION'],
        verifiedAt: this.now(),
      };
    });
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
    this.assertRealReadAccountAllowed(action.proposal.accountId);
    return this.observed(this.telemetryFor('RECONCILE', context, action.proposal, action), async () => {
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
    });
  }

  private assertTenant(context: TenantContext, proposal: ExternalMarketingActionProposal): void {
    if (!context.tenantId || context.tenantId !== proposal.tenantId) throw new GoogleAdsProviderError('TENANT_SCOPE_DENIED', false, false, 'GOVERNANCE');
  }

  private assertGoogleProposal(proposal: ExternalMarketingActionProposal): void {
    if (proposal.provider !== 'GOOGLE_ADS' || !proposal.campaignId) throw new GoogleAdsProviderError('GOOGLE_ADS_PROVIDER_OR_CAMPAIGN_REQUIRED', false, false, 'GOVERNANCE');
  }

  private assertRealReadAccountAllowed(accountId: string): void {
    if (this.mode !== 'REAL') return;
    this.assertSandboxAccount(accountId);
  }

  private assertRealMutationAccountAllowed(accountId: string): void {
    if (this.mode !== 'REAL') return;
    this.assertSandboxAccount(accountId);
  }

  private assertSandboxAccount(accountId: string): void {
    const normalizedAccountId = normalizeGoogleId(accountId, 'GOOGLE_ADS_ACCOUNT_ID_INVALID');
    if (!this.approvedCustomerId) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_APPROVED_CUSTOMER_ID_REQUIRED', false, false, 'CONFIGURATION');
    }
    if (normalizedAccountId !== this.approvedCustomerId) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_APPROVED_CUSTOMER_MISMATCH', false, false, 'ACCOUNT_ACCESS');
    }
    if (this.sandboxCustomerIds.size === 0) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_SANDBOX_ALLOWLIST_REQUIRED', false, false, 'CONFIGURATION');
    }
    if (!this.sandboxCustomerIds.has(normalizedAccountId)) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_PRODUCTION_ACCOUNT_BLOCKED', false, false, 'ACCOUNT_ACCESS');
    }
  }

  private telemetryFor(
    operation: GoogleAdsTelemetryEvent['operation'],
    context: TenantContext,
    proposal: ExternalMarketingActionProposal,
    action?: GovernedExternalAction,
  ): Omit<GoogleAdsTelemetryEvent, 'latencyMs' | 'providerErrorClass' | 'verificationState' | 'rollbackState'> {
    return {
      provider: 'GOOGLE_ADS',
      operation,
      tenantId: context.tenantId,
      actionType: proposal.actionType,
      actionId: action?.id ?? proposal.actionId,
      workflowRunId: proposal.workflowRunId,
      ...(action ? { attempt: action.version } : {}),
    };
  }

  private async observed<T>(
    details: Omit<GoogleAdsTelemetryEvent, 'latencyMs' | 'providerErrorClass' | 'verificationState' | 'rollbackState'>,
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await operation();
      const verification = isVerification(result) ? result.status : undefined;
      this.recordTelemetry({
        ...details,
        latencyMs: Date.now() - startedAt,
        ...(verification ? { verificationState: verification } : {}),
        ...(verification === 'MISMATCH' ? { rollbackState: 'ROLLBACK_REQUIRED' } : {}),
      });
      return result;
    } catch (error) {
      this.recordTelemetry({
        ...details,
        latencyMs: Date.now() - startedAt,
        ...(error instanceof GoogleAdsProviderError ? { providerErrorClass: error.errorClass } : { providerErrorClass: 'NETWORK_UNCERTAINTY' }),
      });
      throw error;
    }
  }

  private recordTelemetry(event: GoogleAdsTelemetryEvent): void {
    try {
      this.telemetry?.record(event);
    } catch {
      // Observability must not alter a governed decision or trigger a retry.
    }
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

function rollbackNumber(before: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = before[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  throw new GoogleAdsProviderError('GOOGLE_ADS_ROLLBACK_BEFORE_STATE_INVALID', false, false, 'GOVERNANCE');
}

function expectedMatches(campaign: GoogleAdsCampaign, proposal: ExternalMarketingActionProposal): boolean {
  if (proposal.actionType === 'PAUSE_CAMPAIGN') return campaign.enabled === false;
  if (proposal.actionType === 'ENABLE_CAMPAIGN') return campaign.enabled === true;
  if (proposal.actionType === 'UPDATE_CAMPAIGN_BUDGET') return campaign.dailyBudget === numberPayload(proposal, 'dailyBudget', 'budget');
  if (proposal.actionType === 'UPDATE_TARGET_CPA') return campaign.targetCpa === numberPayload(proposal, 'targetCpa');
  if (proposal.actionType === 'UPDATE_TARGET_ROAS') return campaign.targetRoas === numberPayload(proposal, 'targetRoas');
  return false;
}

function isVerification(value: unknown): value is ExternalActionProviderVerification {
  return Boolean(value) && typeof value === 'object' && typeof (value as { status?: unknown }).status === 'string';
}
