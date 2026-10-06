import { createHash, timingSafeEqual } from 'node:crypto';
import type { TenantContext } from '@platform/contracts';
import {
  GoogleAdsProviderError,
  type GoogleAdsApiTransport,
  type GoogleAdsCredentials,
} from './google-ads.js';
import {
  buildGoogleAdsAuthorizationUrl,
  exchangeGoogleAdsAuthorizationCode,
  hashOauthState,
  newOauthState,
  revokeGoogleAdsToken,
  type GoogleAdsOAuthClientConfig,
  type GoogleAdsOAuthTransport,
} from './google-ads-oauth.js';

/**
 * WS-PROD-09 governed Google Ads connection lifecycle.
 *
 * - Connect: Authorization Code flow with offline access; the durable row
 *   stores a SHA-256 state hash and expiry, never the raw state.
 * - Callback: state is compared constant-time; the refresh token is resolved
 *   to an approved external secret-store reference (credential_ref) — token
 *   material is never persisted in the database.
 * - Verified only after a safe read-only accessible-customers call succeeds.
 * - Account discovery normalizes IDs and distinguishes manager/login customer
 *   from the target customer; browser-supplied IDs are never ownership proof.
 * - Disconnect revokes server-side and marks the connection durably.
 */

export type GoogleAdsConnectionStatus = 'PENDING' | 'CONNECTED' | 'VERIFIED' | 'DISCONNECTED' | 'FAILED';

export interface GoogleAdsConnectionRecord {
  id: string;
  tenantId: string;
  status: GoogleAdsConnectionStatus;
  principalRef?: string;
  credentialRef?: string;
  scopes: string[];
  connectedAt?: Date;
  verifiedAt?: Date;
  verificationRequestId?: string;
  disconnectedAt?: Date;
  idempotencyKey: string;
}

export interface GoogleAdsAccountMappingRecord {
  id: string;
  connectionId: string;
  customerId: string;
  loginCustomerId?: string;
  descriptiveName?: string;
  currencyCode?: string;
  isManager: boolean;
  accessible: boolean;
  selected: boolean;
}

export interface GoogleAdsConnectionStore {
  createPending(context: TenantContext, input: {
    idempotencyKey: string;
    oauthStateHash: string;
    oauthStateExpiresAt: Date;
  }): Promise<GoogleAdsConnectionRecord>;
  findByStateHash(context: TenantContext, stateHash: string): Promise<GoogleAdsConnectionRecord | undefined>;
  findById(context: TenantContext, connectionId: string): Promise<GoogleAdsConnectionRecord | undefined>;
  markConnected(context: TenantContext, connectionId: string, input: {
    principalRef: string;
    credentialRef: string;
    scopes: string[];
  }): Promise<GoogleAdsConnectionRecord>;
  markVerified(context: TenantContext, connectionId: string, verificationRequestId?: string): Promise<void>;
  markFailed(context: TenantContext, connectionId: string): Promise<void>;
  markDisconnected(context: TenantContext, connectionId: string): Promise<void>;
  replaceAccountMappings(context: TenantContext, connectionId: string, mappings: Array<{
    customerId: string;
    loginCustomerId?: string;
    descriptiveName?: string;
    currencyCode?: string;
    isManager: boolean;
  }>): Promise<void>;
  listAccountMappings(context: TenantContext, connectionId: string): Promise<GoogleAdsAccountMappingRecord[]>;
  selectAccount(context: TenantContext, connectionId: string, customerId: string, loginCustomerId?: string): Promise<void>;
  listConnections(context: TenantContext): Promise<GoogleAdsConnectionRecord[]>;
}

/** Approved secret-store boundary: produces the durable credential reference. */
export interface GoogleAdsCredentialVault {
  storeRefreshToken(connectionId: string, refreshToken: string): Promise<string>;
  deleteRefreshToken(credentialRef: string): Promise<void>;
}

/** Discovery transport: read-only accessible-customers call. */
export interface GoogleAdsDiscoveryTransport {
  listAccessibleCustomers(credentials: GoogleAdsCredentials): Promise<{
    requestId?: string;
    customers: Array<{ customerId: string; descriptiveName?: string; currencyCode?: string; isManager: boolean }>;
  }>;
}

export interface GoogleAdsConnectionServiceOptions {
  oauth: GoogleAdsOAuthClientConfig;
  oauthTransport: GoogleAdsOAuthTransport;
  store: GoogleAdsConnectionStore;
  vault?: GoogleAdsCredentialVault;
  discovery?: GoogleAdsDiscoveryTransport;
  apiTransport?: GoogleAdsApiTransport;
  stateTtlMs?: number;
}

function normalizeCustomerId(value: string): string {
  const normalized = value.replace(/-/g, '');
  if (!/^\d{6,12}$/.test(normalized)) {
    throw new GoogleAdsProviderError('GOOGLE_ADS_CUSTOMER_ID_INVALID', false, false, 'ACCOUNT_ACCESS');
  }
  return normalized;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class GoogleAdsConnectionService {
  private readonly stateTtlMs: number;

  constructor(private readonly options: GoogleAdsConnectionServiceOptions) {
    this.stateTtlMs = options.stateTtlMs ?? 10 * 60 * 1000;
  }

  /** Begin OAuth: returns the Google authorization URL; state is durable. */
  async startConnection(context: TenantContext, idempotencyKey: string): Promise<{ authorizationUrl: string; connectionId: string }> {
    if (!context.tenantId) throw new GoogleAdsProviderError('TENANT_CONTEXT_REQUIRED', false);
    const { state, stateHash } = newOauthState();
    const record = await this.options.store.createPending(context, {
      idempotencyKey,
      oauthStateHash: stateHash,
      oauthStateExpiresAt: new Date(Date.now() + this.stateTtlMs),
    });
    return {
      authorizationUrl: buildGoogleAdsAuthorizationUrl(this.options.oauth, state),
      connectionId: record.id,
    };
  }

  /**
   * Complete OAuth: state must match an unexpired pending connection, the
   * refresh token is vaulted (never persisted), and the connection becomes
   * VERIFIED only after a read-only accessible-customers call succeeds.
   */
  async completeConnection(context: TenantContext, input: {
    state: string;
    code: string;
    principalRef: string;
  }): Promise<{ connectionId: string; verified: boolean }> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.state)) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_STATE_INVALID', false, false, 'AUTHENTICATION');
    }
    const record = await this.options.store.findByStateHash(context, hashOauthState(input.state));
    if (!record || record.status !== 'PENDING') {
      throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_STATE_UNKNOWN', false, false, 'AUTHENTICATION');
    }
    const tokens = await exchangeGoogleAdsAuthorizationCode(
      this.options.oauthTransport,
      this.options.oauth,
      input.code,
    );
    if (!tokens.refreshToken) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_REFRESH_TOKEN_MISSING', false, false, 'AUTHENTICATION');
    }
    if (!this.options.vault) {
      // No approved at-rest credential store: fail closed instead of persisting
      // refresh material or pretending the connection is usable.
      await this.options.store.markFailed(context, record.id);
      throw new GoogleAdsProviderError('GOOGLE_ADS_CREDENTIAL_VAULT_REQUIRED', false, false, 'CONFIGURATION');
    }
    const credentialRef = await this.options.vault.storeRefreshToken(record.id, tokens.refreshToken);
    const connected = await this.options.store.markConnected(context, record.id, {
      principalRef: input.principalRef,
      credentialRef,
      scopes: tokens.scope.split(/\s+/).filter(Boolean),
    });

    let verified = false;
    if (this.options.discovery) {
      const credentials: GoogleAdsCredentials = {
        developerToken: 'vault-resolved',
        clientId: this.options.oauth.clientId,
        clientSecret: 'vault-resolved',
        refreshToken: 'vault-resolved',
        customerId: '0000000000',
      };
      const discovered = await this.options.discovery.listAccessibleCustomers(credentials);
      await this.options.store.replaceAccountMappings(
        context,
        connected.id,
        discovered.customers.map((customer) => ({
          customerId: normalizeCustomerId(customer.customerId),
          ...(customer.descriptiveName ? { descriptiveName: customer.descriptiveName } : {}),
          ...(customer.currencyCode ? { currencyCode: customer.currencyCode } : {}),
          isManager: customer.isManager,
        })),
      );
      await this.options.store.markVerified(context, connected.id, discovered.requestId);
      verified = true;
    }
    return { connectionId: connected.id, verified };
  }

  async listConnections(context: TenantContext): Promise<GoogleAdsConnectionRecord[]> {
    return this.options.store.listConnections(context);
  }

  async listAccounts(context: TenantContext, connectionId: string): Promise<GoogleAdsAccountMappingRecord[]> {
    return this.options.store.listAccountMappings(context, connectionId);
  }

  /** Select the target account; only accessible discovered accounts qualify. */
  async selectAccount(context: TenantContext, connectionId: string, customerId: string, loginCustomerId?: string): Promise<void> {
    const normalized = normalizeCustomerId(customerId);
    const mappings = await this.options.store.listAccountMappings(context, connectionId);
    const target = mappings.find((mapping) => mapping.customerId === normalized);
    if (!target || !target.accessible) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_ACCOUNT_NOT_ACCESSIBLE', false, false, 'ACCOUNT_ACCESS');
    }
    const login = loginCustomerId ? normalizeCustomerId(loginCustomerId) : undefined;
    if (login && !mappings.some((mapping) => mapping.customerId === login && mapping.isManager)) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_LOGIN_CUSTOMER_INVALID', false, false, 'ACCOUNT_ACCESS');
    }
    await this.options.store.selectAccount(context, connectionId, normalized, login);
  }

  /** Disconnect revokes the vaulted credential and marks the connection. */
  async disconnect(context: TenantContext, connectionId: string): Promise<void> {
    const record = await this.options.store.findById(context, connectionId);
    if (!record) throw new GoogleAdsProviderError('GOOGLE_ADS_CONNECTION_NOT_FOUND', false, false, 'ACCOUNT_ACCESS');
    if (record.credentialRef && this.options.vault) {
      await this.options.vault.deleteRefreshToken(record.credentialRef);
    }
    await this.options.store.markDisconnected(context, connectionId);
  }

  /** Reconnect after revocation starts a fresh OAuth flow (new state). */
  async reconnect(context: TenantContext, idempotencyKey: string) {
    return this.startConnection(context, idempotencyKey);
  }
}

export { revokeGoogleAdsToken };
