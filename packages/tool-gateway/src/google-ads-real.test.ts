import assert from 'node:assert/strict';
import test from 'node:test';

import type { TenantContext } from '@platform/contracts';
import type { ExternalMarketingActionProposal } from '@platform/marketing-os-core';
import {
  EnvironmentGoogleAdsCredentialResolver,
  GoogleAdsApiAdapter,
  GoogleAdsProviderError,
  GoogleAdsProviderGateway,
  GoogleAdsRestTransport,
  type GoogleAdsApiTransport,
  type GoogleAdsCampaign,
  type GoogleAdsCredentialResolver,
  type GoogleAdsCredentials,
  type GoogleAdsFetch,
  type GoogleAdsFetchResponse,
} from './index.js';

const context: TenantContext = {
  tenantId: 'tenant-real',
  userId: 'user-real',
  roles: ['marketing_manager'],
  permissions: ['marketing:admin', 'integration:admin'],
  locale: 'en',
};

const credentials: GoogleAdsCredentials = {
  developerToken: 'test-developer-token',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  refreshToken: 'test-refresh-token',
  customerId: '1234567890',
  loginCustomerId: '0987654321',
};

const proposal: ExternalMarketingActionProposal = {
  actionId: 'real-action',
  tenantId: context.tenantId,
  organizationId: 'org-real',
  actor: context.userId ?? 'user-real',
  agentIdentity: 'agent-real',
  workflowRunId: 'workflow-real',
  recommendationId: 'recommendation-real',
  provider: 'GOOGLE_ADS',
  accountId: credentials.customerId,
  campaignId: '2222222222',
  actionType: 'PAUSE_CAMPAIGN',
  requestedPayload: {},
  reason: 'deterministic transport test',
  expectedOutcome: 'campaign state changes through governed transport',
  estimatedImpact: {},
  estimatedCost: 0,
  currency: 'SAR',
  riskLevel: 'MEDIUM',
  policyContext: {},
  approvalRequirement: 'REQUIRED',
  idempotencyKey: 'real-transport-key',
  requestedAt: '2026-09-09T00:00:00.000Z',
  metadata: {},
  evidence: [{ id: 'evidence-real', source: 'test', summary: 'test' }],
  confidence: 0.9,
  rollback: { strategy: 'restore', before: { enabled: true } },
};

class StaticCredentials implements GoogleAdsCredentialResolver {
  constructor(private readonly value: GoogleAdsCredentials = credentials) {}

  validate(): { valid: boolean; missing: string[] } {
    return { valid: true, missing: [] };
  }

  resolve(): GoogleAdsCredentials {
    return { ...this.value };
  }
}

function response(status: number, body: unknown, requestId = 'request-id-test'): GoogleAdsFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'request-id' ? requestId : null },
    async text() { return JSON.stringify(body); },
  };
}

function restFetch(calls: Array<{ url: string; body?: Record<string, unknown> }>): GoogleAdsFetch {
  return async (url, request) => {
    const body = request.body && !url.includes('oauth2') ? JSON.parse(request.body) as Record<string, unknown> : undefined;
    calls.push({ url, ...(body ? { body } : {}) });
    if (url.includes('oauth2')) return response(200, { access_token: 'ephemeral-test-access-token' });
    if (url.includes('listAccessibleCustomers')) return response(200, { resourceNames: ['customers/1234567890'] });
    if (url.includes('googleAds:searchStream')) {
      const query = String(body?.query ?? '');
      if (query.includes('FROM customer')) {
        return response(200, [{ results: [{ customer: { id: '1234567890', descriptiveName: 'Sandbox account', currencyCode: 'SAR' } }] }]);
      }
      return response(200, [{
        results: [{
          campaign: {
            id: '2222222222',
            status: 'ENABLED',
            campaignBudget: 'customers/1234567890/campaignBudgets/3333333333',
            targetCpa: { targetCpaMicros: '1250000' },
            targetRoas: { targetRoas: 3.25 },
          },
          campaignBudget: { amountMicros: '2000000' },
        }],
      }]);
    }
    return response(200, { results: [{ resourceName: 'customers/1234567890/campaigns/2222222222' }] });
  };
}

function restFetchWithFailure(
  match: (url: string) => boolean,
  failure: { status: number; body: unknown } | 'NETWORK',
): GoogleAdsFetch {
  const fallback = restFetch([]);
  return async (url, request) => {
    if (!match(url)) return fallback(url, request);
    if (failure === 'NETWORK') throw new Error('deterministic network failure');
    return response(failure.status, failure.body);
  };
}

test('REST transport authenticates, reads sandbox account/campaign metadata, and exposes no raw credentials', async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const transport = new GoogleAdsRestTransport({ fetcher: restFetch(calls) });
  await transport.validateConnection(credentials);
  const account = await transport.getAccount(credentials, '123-456-7890');
  const campaign = await transport.getCampaign(credentials, credentials.customerId, proposal.campaignId!);

  assert.deepEqual(account, { accountId: '1234567890', descriptiveName: 'Sandbox account', currencyCode: 'SAR' });
  assert.equal(campaign.dailyBudget, 2);
  assert.equal(campaign.targetCpa, 1.25);
  assert.equal(campaign.targetRoas, 3.25);
  assert.equal(calls.some((call) => call.url.includes('customers/1234567890/googleAds:searchStream')), true);
});

test('REST transport accepts an accessible login-customer manager, then requires the scoped customer read', async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const base = restFetch(calls);
  const transport = new GoogleAdsRestTransport({
    fetcher: async (url, request) => {
      if (url.includes('listAccessibleCustomers')) {
        return response(200, { resourceNames: [`customers/${credentials.loginCustomerId}`] });
      }
      return base(url, request);
    },
  });

  await transport.validateConnection(credentials);
  const campaign = await transport.getCampaign(
    credentials,
    credentials.customerId,
    proposal.campaignId!,
  );

  assert.equal(campaign.accountId, credentials.customerId);
  assert.equal(campaign.campaignId, proposal.campaignId);
  assert.equal(
    calls.some((call) => call.url.includes('customers/1234567890/googleAds:searchStream')),
    true,
  );
});

test('REST transport maps each supported governed mutation to one narrow Google Ads REST update', async () => {
  const cases: Array<{ actionType: ExternalMarketingActionProposal['actionType']; requestedPayload: Record<string, unknown>; path: string; mask: string }> = [
    { actionType: 'PAUSE_CAMPAIGN', requestedPayload: {}, path: 'campaigns:mutate', mask: 'status' },
    { actionType: 'ENABLE_CAMPAIGN', requestedPayload: {}, path: 'campaigns:mutate', mask: 'status' },
    { actionType: 'UPDATE_CAMPAIGN_BUDGET', requestedPayload: { dailyBudget: 5 }, path: 'campaignBudgets:mutate', mask: 'amount_micros' },
    { actionType: 'UPDATE_TARGET_CPA', requestedPayload: { targetCpa: 1.5 }, path: 'campaigns:mutate', mask: 'target_cpa.target_cpa_micros' },
    { actionType: 'UPDATE_TARGET_ROAS', requestedPayload: { targetRoas: 3.5 }, path: 'campaigns:mutate', mask: 'target_roas.target_roas' },
  ];

  for (const expected of cases) {
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
    const transport = new GoogleAdsRestTransport({ fetcher: restFetch(calls) });
    const result = await transport.executeAction(credentials, { ...proposal, ...expected });
    const mutation = calls.find((call) => call.url.includes(expected.path));
    assert.ok(mutation, `${expected.actionType} must use ${expected.path}`);
    const operations = mutation.body?.operations;
    assert.ok(Array.isArray(operations) && operations.length === 1);
    assert.equal((operations[0] as { updateMask?: unknown }).updateMask, expected.mask);
    assert.match(result.providerReference, /^google-ads:/);
  }
});

test('REST transport rejects unsupported campaign creation and sanitizes provider authentication failures', async () => {
  const unsupported = new GoogleAdsRestTransport({ fetcher: restFetch([]) });
  await assert.rejects(
    () => unsupported.executeAction(credentials, { ...proposal, actionType: 'CREATE_CAMPAIGN' }),
    (error: unknown) => error instanceof GoogleAdsProviderError && error.code === 'GOOGLE_ADS_ACTION_UNSUPPORTED',
  );

  const failing = new GoogleAdsRestTransport({
    fetcher: async () => response(401, { error: { message: 'provider returned sensitive material' } }),
  });
  await assert.rejects(
    () => failing.validateConnection(credentials),
    (error: unknown) => error instanceof GoogleAdsProviderError
      && error.code === 'GOOGLE_ADS_AUTHENTICATION_FAILED'
      && !error.message.includes('sensitive'),
  );

  const revoked = new GoogleAdsRestTransport({
    fetcher: async () => response(400, { error: { message: 'invalid_grant' } }),
  });
  await assert.rejects(
    () => revoked.validateConnection(credentials),
    (error: unknown) => error instanceof GoogleAdsProviderError
      && error.code === 'GOOGLE_ADS_CREDENTIAL_REVOKED'
      && !error.message.includes('invalid_grant'),
  );
});

test('REST transport maps sanitized quota, access, campaign, policy, invalid-mutation, and timeout failures', async () => {
  const quota = new GoogleAdsRestTransport({
    fetcher: restFetchWithFailure((url) => url.includes('listAccessibleCustomers'), { status: 429, body: { error: { message: 'quota exhausted' } } }),
  });
  await assert.rejects(
    () => quota.validateConnection(credentials),
    (error: unknown) => error instanceof GoogleAdsProviderError && error.code === 'GOOGLE_ADS_QUOTA_RATE_LIMITED' && error.retryable,
  );

  const accountAccess = new GoogleAdsRestTransport({
    fetcher: restFetchWithFailure((url) => url.includes('listAccessibleCustomers'), { status: 403, body: { error: { message: 'customer access denied' } } }),
  });
  await assert.rejects(
    () => accountAccess.validateConnection(credentials),
    (error: unknown) => error instanceof GoogleAdsProviderError && error.code === 'GOOGLE_ADS_ACCOUNT_INACCESSIBLE',
  );

  const campaignMissing = new GoogleAdsRestTransport({
    fetcher: restFetchWithFailure((url) => url.includes('googleAds:searchStream'), { status: 404, body: { error: {} } }),
  });
  await assert.rejects(
    () => campaignMissing.getCampaign(credentials, credentials.customerId, proposal.campaignId!),
    (error: unknown) => error instanceof GoogleAdsProviderError && error.code === 'GOOGLE_ADS_CAMPAIGN_NOT_FOUND',
  );

  const policyRejected = new GoogleAdsRestTransport({
    fetcher: restFetchWithFailure((url) => url.includes('campaigns:mutate'), { status: 400, body: { error: { message: 'policy violation' } } }),
  });
  await assert.rejects(
    () => policyRejected.executeAction(credentials, proposal),
    (error: unknown) => error instanceof GoogleAdsProviderError && error.code === 'GOOGLE_ADS_POLICY_REJECTED',
  );

  const invalidMutation = new GoogleAdsRestTransport({
    fetcher: restFetchWithFailure((url) => url.includes('campaigns:mutate'), { status: 400, body: { error: { message: 'invalid field' } } }),
  });
  await assert.rejects(
    () => invalidMutation.executeAction(credentials, proposal),
    (error: unknown) => error instanceof GoogleAdsProviderError && error.code === 'GOOGLE_ADS_INVALID_MUTATION',
  );

  const timeout = new GoogleAdsRestTransport({
    fetcher: restFetchWithFailure((url) => url.includes('campaigns:mutate'), 'NETWORK'),
  });
  await assert.rejects(
    () => timeout.executeAction(credentials, proposal),
    (error: unknown) => error instanceof GoogleAdsProviderError
      && error.code === 'GOOGLE_ADS_NETWORK_UNCERTAINTY'
      && error.unknownOutcome,
  );
});

class RecordingTransport implements GoogleAdsApiTransport {
  readonly campaign: GoogleAdsCampaign = {
    accountId: credentials.customerId,
    campaignId: proposal.campaignId!,
    enabled: true,
    dailyBudget: 2,
    targetCpa: 1.25,
    targetRoas: 3.25,
    budgetResourceName: 'customers/1234567890/campaignBudgets/3333333333',
  };
  validated = 0;
  mutations = 0;

  async validateConnection(): Promise<void> { this.validated += 1; }
  async getAccount(_credentials: GoogleAdsCredentials, accountId: string) { return { accountId }; }
  async getCampaign(): Promise<GoogleAdsCampaign> { return { ...this.campaign }; }
  async executeAction(_credentials: GoogleAdsCredentials, input: ExternalMarketingActionProposal) {
    this.mutations += 1;
    if (input.actionType === 'PAUSE_CAMPAIGN') this.campaign.enabled = false;
    if (input.actionType === 'ENABLE_CAMPAIGN') this.campaign.enabled = true;
    if (input.actionType === 'UPDATE_CAMPAIGN_BUDGET') this.campaign.dailyBudget = Number(input.requestedPayload.dailyBudget);
    if (input.actionType === 'UPDATE_TARGET_CPA') this.campaign.targetCpa = Number(input.requestedPayload.targetCpa);
    if (input.actionType === 'UPDATE_TARGET_ROAS') this.campaign.targetRoas = Number(input.requestedPayload.targetRoas);
    return { providerReference: `recording:${input.actionId}`, observedState: { ...this.campaign } };
  }
}

test('REAL read-only transport requires explicit sandbox account configuration but not mutation enablement', async () => {
  const transport = new RecordingTransport();
  const events: unknown[] = [];
  const gateway = new GoogleAdsProviderGateway(
    new GoogleAdsApiAdapter(new StaticCredentials(), transport),
    'REAL',
    false,
    () => '2026-09-09T00:00:00.000Z',
    {
      approvedCustomerId: credentials.customerId,
      sandboxCustomerIds: [credentials.customerId],
      telemetry: { record: (event) => events.push(event) },
    },
  );
  const account = await gateway.readAccount(context, '123-456-7890');
  const campaign = await gateway.readCampaign(context, proposal);
  assert.equal(account.accountId, credentials.customerId);
  assert.equal(campaign.campaignId, proposal.campaignId);
  assert.equal(transport.mutations, 0);
  assert.equal(events.some((event) => (event as { operation?: unknown }).operation === 'READ_ACCOUNT'), true);
  assert.doesNotMatch(JSON.stringify(events), /token|secret|authorization|credential/i);
});

test('REAL gateway blocks an account outside the explicit sandbox allowlist before provider access', async () => {
  const transport = new RecordingTransport();
  const gateway = new GoogleAdsProviderGateway(
    new GoogleAdsApiAdapter(new StaticCredentials(), transport),
    'REAL',
    true,
    undefined,
    { approvedCustomerId: credentials.customerId, sandboxCustomerIds: ['1111111111'] },
  );
  await assert.rejects(
    () => gateway.simulate(context, proposal),
    (error: unknown) => error instanceof GoogleAdsProviderError && error.code === 'GOOGLE_ADS_PRODUCTION_ACCOUNT_BLOCKED',
  );
  assert.equal(transport.validated, 0);
  assert.equal(transport.mutations, 0);
});

test('credential resolver fails closed and never includes values in diagnostics', () => {
  const resolver = new EnvironmentGoogleAdsCredentialResolver({
    GOOGLE_ADS_CLIENT_SECRET: 'test-only-value',
  });
  assert.deepEqual(resolver.validate().missing.sort(), [
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CUSTOMER_ID',
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_REFRESH_TOKEN',
  ]);
  assert.throws(
    () => resolver.resolve(),
    (error: unknown) => error instanceof GoogleAdsProviderError
      && error.code === 'GOOGLE_ADS_CREDENTIALS_MISSING'
      && !error.message.includes('test-only-value'),
  );
});
