import assert from 'node:assert/strict';
import test from 'node:test';
import type { TenantContext } from '@platform/contracts';
import { GoogleAdsProviderError } from './google-ads.js';
import {
  GoogleAdsConnectionService,
  type GoogleAdsConnectionRecord,
  type GoogleAdsConnectionStore,
  type GoogleAdsAccountMappingRecord,
} from './google-ads-connection.js';
import {
  GoogleAdsQuotaLimiter,
  assertSafeRedispatch,
  classifyGoogleAdsRetry,
  dispatchFingerprint,
  googleAdsBackoffDelays,
  reconcileGoogleAdsOutcome,
  withGoogleAdsRetry,
} from './google-ads-reconciliation.js';

const context = (tenantId: string): TenantContext => ({
  tenantId,
  userId: 'user-1',
  roles: ['tenant_admin'],
  permissions: ['integration:admin'],
  locale: 'en',
});

interface PendingRow {
  id: string;
  tenantId: string;
  stateHash: string;
  expiresAt: Date;
  status: string;
  idempotencyKey: string;
  credentialRef?: string | undefined;
}

class MemoryStore implements GoogleAdsConnectionStore {
  readonly pending = new Map<string, PendingRow>();
  readonly mappings = new Map<string, GoogleAdsAccountMappingRecord[]>();
  private sequence = 0;

  async createPending(ctx: TenantContext, input: { idempotencyKey: string; oauthStateHash: string; oauthStateExpiresAt: Date }) {
    const existing = [...this.pending.values()].find(
      (row) => row.tenantId === ctx.tenantId && row.idempotencyKey === input.idempotencyKey && row.status !== 'DISCONNECTED',
    );
    if (existing) return this.toRecord(existing);
    const row: PendingRow = {
      id: `conn-${(this.sequence += 1)}`,
      tenantId: ctx.tenantId,
      stateHash: input.oauthStateHash,
      expiresAt: input.oauthStateExpiresAt,
      status: 'PENDING',
      idempotencyKey: input.idempotencyKey,
    };
    this.pending.set(row.id, row);
    return this.toRecord(row);
  }

  async findByStateHash(ctx: TenantContext, stateHash: string) {
    const row = [...this.pending.values()].find(
      (item) => item.tenantId === ctx.tenantId && item.stateHash === stateHash && item.expiresAt > new Date(),
    );
    return row ? this.toRecord(row) : undefined;
  }

  async findById(ctx: TenantContext, connectionId: string) {
    const row = this.pending.get(connectionId);
    return row && row.tenantId === ctx.tenantId ? this.toRecord(row) : undefined;
  }

  async markConnected(ctx: TenantContext, connectionId: string, input: { principalRef: string; credentialRef: string; scopes: string[] }) {
    const row = this.pending.get(connectionId);
    if (!row || row.tenantId !== ctx.tenantId || row.status !== 'PENDING') {
      throw new GoogleAdsProviderError('GOOGLE_ADS_CONNECTION_NOT_FOUND', false);
    }
    row.status = 'CONNECTED';
    row.credentialRef = input.credentialRef;
    return this.toRecord(row);
  }

  async markVerified(ctx: TenantContext, connectionId: string) {
    const row = this.pending.get(connectionId);
    if (row && row.tenantId === ctx.tenantId && row.status === 'CONNECTED') row.status = 'VERIFIED';
  }

  async markFailed(ctx: TenantContext, connectionId: string) {
    const row = this.pending.get(connectionId);
    if (row && row.tenantId === ctx.tenantId) row.status = 'FAILED';
  }

  async markDisconnected(ctx: TenantContext, connectionId: string) {
    const row = this.pending.get(connectionId);
    if (!row || row.tenantId !== ctx.tenantId) throw new GoogleAdsProviderError('GOOGLE_ADS_CONNECTION_NOT_FOUND', false);
    row.status = 'DISCONNECTED';
    row.credentialRef = undefined;
  }

  async replaceAccountMappings(ctx: TenantContext, connectionId: string, mappings: Array<{ customerId: string; loginCustomerId?: string; descriptiveName?: string; currencyCode?: string; isManager: boolean }>) {
    this.mappings.set(
      connectionId,
      mappings.map((mapping, index) => ({
        id: `${connectionId}-${index}`,
        connectionId,
        customerId: mapping.customerId,
        ...(mapping.loginCustomerId ? { loginCustomerId: mapping.loginCustomerId } : {}),
        ...(mapping.descriptiveName ? { descriptiveName: mapping.descriptiveName } : {}),
        ...(mapping.currencyCode ? { currencyCode: mapping.currencyCode } : {}),
        isManager: mapping.isManager,
        accessible: true,
        selected: false,
      })),
    );
  }

  async listAccountMappings(ctx: TenantContext, connectionId: string) {
    const row = this.pending.get(connectionId);
    if (!row || row.tenantId !== ctx.tenantId) return [];
    return this.mappings.get(connectionId) ?? [];
  }

  async selectAccount(ctx: TenantContext, connectionId: string, customerId: string, loginCustomerId?: string) {
    const mappings = await this.listAccountMappings(ctx, connectionId);
    const target = mappings.find((mapping) => mapping.customerId === customerId && mapping.accessible);
    if (!target) throw new GoogleAdsProviderError('GOOGLE_ADS_ACCOUNT_NOT_ACCESSIBLE', false);
    for (const mapping of mappings) mapping.selected = mapping.customerId === customerId;
    if (loginCustomerId) target.loginCustomerId = loginCustomerId;
  }

  async listConnections(ctx: TenantContext) {
    return [...this.pending.values()].filter((row) => row.tenantId === ctx.tenantId).map((row) => this.toRecord(row));
  }

  private toRecord(row: PendingRow): GoogleAdsConnectionRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      status: row.status as GoogleAdsConnectionRecord['status'],
      ...(row.credentialRef ? { credentialRef: row.credentialRef } : {}),
      scopes: [],
      idempotencyKey: row.idempotencyKey,
    };
  }
}

class MemoryVault {
  readonly stored = new Map<string, string>();
  async storeRefreshToken(connectionId: string, refreshToken: string): Promise<string> {
    const reference = `vault://google-ads/${connectionId}`;
    this.stored.set(reference, refreshToken);
    return reference;
  }
  async deleteRefreshToken(credentialRef: string): Promise<void> {
    this.stored.delete(credentialRef);
  }
}

const oauthConfig = {
  clientId: 'client-123',
  clientSecret: 'synthetic-client-secret',
  redirectUri: 'https://app.example.com/callback',
};

function oauthTransportOk(refreshToken = 'refresh-1') {
  return {
    async postForm() {
      return {
        ok: true,
        status: 200,
        body: {
          access_token: 'access-1',
          refresh_token: refreshToken,
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/adwords',
        },
      };
    },
  };
}

function discovery(customers: Array<{ customerId: string; isManager?: boolean }>) {
  return {
    async listAccessibleCustomers() {
      return {
        requestId: 'req-discovery-1',
        customers: customers.map((customer) => ({
          customerId: customer.customerId,
          isManager: customer.isManager ?? false,
          descriptiveName: `Account ${customer.customerId}`,
        })),
      };
    },
  };
}

test('connection start/callback/verify/discovery/select/disconnect lifecycle is tenant-scoped and secret-safe', async () => {
  const store = new MemoryStore();
  const vault = new MemoryVault();
  const service = new GoogleAdsConnectionService({
    oauth: oauthConfig,
    oauthTransport: oauthTransportOk(),
    store,
    vault,
    discovery: discovery([{ customerId: '1234567890' }, { customerId: '5555555555', isManager: true }]),
  });
  const ctx = context('tenant-a');

  const start = await service.startConnection(ctx, 'connect-1');
  assert.ok(start.authorizationUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
  assert.equal(JSON.stringify(start).includes('refresh'), false, 'no token material in connect response');

  const state = new URL(start.authorizationUrl).searchParams.get('state')!;
  const completed = await service.completeConnection(ctx, { state, code: 'code-1', principalRef: 'user-1' });
  assert.equal(completed.verified, true);
  const stored = await store.findById(ctx, completed.connectionId);
  assert.equal(stored?.status, 'VERIFIED');
  assert.ok(stored?.credentialRef?.startsWith('vault://'), 'durable row stores only a vault reference');
  assert.equal(vault.stored.get(stored!.credentialRef!), 'refresh-1');

  const accounts = await service.listAccounts(ctx, completed.connectionId);
  assert.deepEqual(accounts.map((a) => a.customerId).sort(), ['1234567890', '5555555555']);

  await service.selectAccount(ctx, completed.connectionId, '123-456-7890', '555-555-5555');
  const selected = await service.listAccounts(ctx, completed.connectionId);
  assert.equal(selected.find((a) => a.selected)?.customerId, '1234567890');
  assert.equal(selected.find((a) => a.selected)?.loginCustomerId, '5555555555');

  await service.disconnect(ctx, completed.connectionId);
  assert.equal((await store.findById(ctx, completed.connectionId))?.status, 'DISCONNECTED');
  assert.equal(vault.stored.size, 0, 'disconnect deletes the vaulted credential');
});

test('OAuth callback rejects unknown/expired/mismatched state and tenant confusion', async () => {
  const store = new MemoryStore();
  const service = new GoogleAdsConnectionService({
    oauth: oauthConfig,
    oauthTransport: oauthTransportOk(),
    store,
    vault: new MemoryVault(),
  });
  const ctx = context('tenant-a');
  const start = await service.startConnection(ctx, 'connect-2');
  const state = new URL(start.authorizationUrl).searchParams.get('state')!;

  await assert.rejects(
    () => service.completeConnection(context('tenant-b'), { state, code: 'code-1', principalRef: 'user-2' }),
    /STATE_UNKNOWN/,
  );
  await assert.rejects(
    () => service.completeConnection(ctx, { state: 'wrong-state', code: 'code-1', principalRef: 'user-1' }),
    GoogleAdsProviderError,
  );
});

test('connection fails closed without an approved credential vault instead of persisting tokens', async () => {
  const store = new MemoryStore();
  const service = new GoogleAdsConnectionService({
    oauth: oauthConfig,
    oauthTransport: oauthTransportOk(),
    store,
  });
  const ctx = context('tenant-a');
  const start = await service.startConnection(ctx, 'connect-3');
  const state = new URL(start.authorizationUrl).searchParams.get('state')!;
  await assert.rejects(
    () => service.completeConnection(ctx, { state, code: 'code-1', principalRef: 'user-1' }),
    /CREDENTIAL_VAULT_REQUIRED/,
  );
  const record = await store.findById(ctx, start.connectionId);
  assert.equal(record?.status, 'FAILED');
  assert.equal(record?.credentialRef, undefined);
});

test('account selection rejects inaccessible and non-manager login customers', async () => {
  const store = new MemoryStore();
  const service = new GoogleAdsConnectionService({
    oauth: oauthConfig,
    oauthTransport: oauthTransportOk(),
    store,
    vault: new MemoryVault(),
    discovery: discovery([{ customerId: '1234567890' }]),
  });
  const ctx = context('tenant-a');
  const start = await service.startConnection(ctx, 'connect-4');
  const completed = await service.completeConnection(ctx, {
    state: new URL(start.authorizationUrl).searchParams.get('state')!,
    code: 'code-1',
    principalRef: 'user-1',
  });
  await assert.rejects(
    () => service.selectAccount(ctx, completed.connectionId, '9999999999'),
    /ACCOUNT_NOT_ACCESSIBLE|NOT_FOUND/,
  );
  await assert.rejects(
    () => service.selectAccount(ctx, completed.connectionId, '1234567890', '5555555555'),
    /LOGIN_CUSTOMER_INVALID/,
  );
});

test('retry classification: transient retry, governance fail, ambiguous manual review', () => {
  assert.equal(classifyGoogleAdsRetry(new GoogleAdsProviderError('X', true, false, 'QUOTA')), 'RETRY');
  assert.equal(classifyGoogleAdsRetry(new GoogleAdsProviderError('X', true, false, 'TIMEOUT')), 'RETRY');
  assert.equal(classifyGoogleAdsRetry(new GoogleAdsProviderError('X', false, false, 'AUTHORIZATION')), 'FAIL');
  assert.equal(classifyGoogleAdsRetry(new GoogleAdsProviderError('X', true, true, 'NETWORK_UNCERTAINTY')), 'MANUAL_REVIEW');
});

test('backoff is bounded, exponential, and jittered; retry stops after the cap', async () => {
  const delays = googleAdsBackoffDelays({ baseMs: 100, maxAttempts: 3, random: () => 0.5 });
  assert.equal(delays.length, 3);
  assert.ok(delays[0]! >= 100 && delays[0]! <= 130);
  assert.ok(delays[1]! > delays[0]!);
  assert.ok(delays[2]! > delays[1]!);

  let attempts = 0;
  await assert.rejects(
    () =>
      withGoogleAdsRetry(
        async () => {
          attempts += 1;
          throw new GoogleAdsProviderError('QUOTA', true, false, 'QUOTA');
        },
        { baseMs: 1, maxAttempts: 2 },
      ),
  );
  assert.equal(attempts, 3, '1 initial + 2 retries');

  attempts = 0;
  await assert.rejects(() =>
    withGoogleAdsRetry(async () => {
      attempts += 1;
      throw new GoogleAdsProviderError('AUTH', false, false, 'AUTHORIZATION');
    }, { baseMs: 1 }),
  );
  assert.equal(attempts, 1, 'authorization failures are never retried');
});

test('quota limiter bounds concurrency per connection', async () => {
  const limiter = new GoogleAdsQuotaLimiter(1);
  let release: () => void = () => undefined;
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const first = limiter.run(() => blocker);
  await assert.rejects(() => limiter.run(async () => undefined), /QUOTA_CONCURRENCY_LIMIT/);
  release();
  await first;
});

test('ambiguous dispatch never redispatches without reconciliation', () => {
  assert.throws(() => assertSafeRedispatch('PROVIDER_UNKNOWN'), /RECONCILIATION/);
  assert.doesNotThrow(() => assertSafeRedispatch('PROVIDER_ACCEPTED'));
});

test('reconciliation matches, mismatches, and escalates ambiguous outcomes', async () => {
  const matched = await reconcileGoogleAdsOutcome({
    intent: { status: 'ENABLED' },
    readActual: async () => ({ status: 'ENABLED' }),
    compare: (actual) => actual.status === 'ENABLED',
  });
  assert.equal(matched.outcome, 'MATCHED');

  const mismatched = await reconcileGoogleAdsOutcome({
    intent: { status: 'ENABLED' },
    readActual: async () => ({ status: 'PAUSED' }),
    compare: (actual) => actual.status === 'ENABLED',
  });
  assert.equal(mismatched.outcome, 'MISMATCHED');

  let reads = 0;
  const ambiguous = await reconcileGoogleAdsOutcome({
    intent: { status: 'ENABLED' },
    readActual: async () => {
      reads += 1;
      return undefined;
    },
    compare: () => false,
    maxReadAttempts: 2,
    readDelayMs: 1,
    ambiguousDispatch: true,
  });
  assert.equal(ambiguous.outcome, 'MANUAL_REVIEW');
  assert.equal(reads, 2, 'bounded read-back window');

  let recoveredReads = 0;
  const eventually = await reconcileGoogleAdsOutcome({
    intent: { status: 'ENABLED' },
    readActual: async () => {
      recoveredReads += 1;
      return recoveredReads < 2 ? undefined : { status: 'ENABLED' };
    },
    compare: (actual) => actual.status === 'ENABLED',
    maxReadAttempts: 3,
    readDelayMs: 1,
  });
  assert.equal(eventually.outcome, 'MATCHED', 'eventual consistency tolerated within bounds');
});

test('dispatch fingerprint is stable and change-sensitive', () => {
  const first = dispatchFingerprint({ status: 'ENABLED', budget: 10 });
  assert.equal(first, dispatchFingerprint({ budget: 10, status: 'ENABLED' }));
  assert.notEqual(first, dispatchFingerprint({ status: 'PAUSED', budget: 10 }));
});
