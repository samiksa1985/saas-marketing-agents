import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RuntimeConfig } from '@platform/config';
import type { TenantContext } from '@platform/contracts';
import { AuthenticationError } from '@platform/auth';
import { TenantMembershipAuthProvider, type TenantMembershipResolver } from '@platform/auth/membership';
import { OidcAuthProvider } from '@platform/auth/oidc';
import { createStructuredLogger, platformMetrics } from '@platform/observability';
import { sql, type SQLWrapper } from 'drizzle-orm';

const logger = createStructuredLogger('api');
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const LOGIN_TRANSACTION_LIFETIME_SECONDS = 5 * 60;

interface BrowserAuthDatabase {
  execute(query: SQLWrapper): Promise<unknown>;
}

interface LoginTransaction {
  pkce_verifier: string;
  nonce: string;
  return_to: string;
}

interface StoredSession {
  subject: string;
  tenant_id: string;
  csrf_token: string;
  expires_at: Date | string;
}

interface TenantChoice {
  tenant_id: string;
  tenant_name: string;
}

interface NewSession {
  sessionHash: string;
  subject: string;
  tenantId: string;
  csrfToken: string;
}

export interface BrowserAuthStore {
  startLogin(input: {
    stateHash: string;
    bindingHash: string;
    verifier: string;
    nonce: string;
    returnTo: string;
  }): Promise<void>;
  consumeLogin(stateHash: string, bindingHash: string): Promise<LoginTransaction | undefined>;
  createSession(input: NewSession): Promise<boolean>;
  lookupSession(sessionHash: string): Promise<StoredSession | undefined>;
  revokeSession(sessionHash: string): Promise<void>;
  rotateSession(input: NewSession & { oldSessionHash: string }): Promise<boolean>;
  listTenants(sessionHash: string): Promise<TenantChoice[]>;
}

export interface BrowserSession {
  context: TenantContext;
  csrfToken: string;
}

export interface BrowserSessionAuthenticator {
  authenticateSession(sessionId: string): Promise<BrowserSession>;
  authenticateRequest(
    sessionId: string,
    method: string,
    origin: string | undefined,
    csrfToken: string | undefined,
  ): Promise<BrowserSession>;
}

export interface BrowserAuthSessionInfo {
  authenticated: boolean;
  tenantId?: string;
  csrfToken?: string;
  permissions?: string[];
  tenants?: Array<{ id: string; name: string }>;
}

export interface BrowserLoginStart {
  authorizationUrl: string;
  bindingCookie: string;
}

export interface BrowserLoginComplete {
  sessionId: string;
  returnTo: string;
}

function rows<T>(result: unknown): T[] {
  return Array.from(result as Iterable<T>);
}

export class DatabaseBrowserAuthStore implements BrowserAuthStore {
  constructor(private readonly database: BrowserAuthDatabase) {}

  async startLogin(input: {
    stateHash: string;
    bindingHash: string;
    verifier: string;
    nonce: string;
    returnTo: string;
  }): Promise<void> {
    await this.database.execute(sql`
      SELECT codecore_start_oidc_login(
        ${input.stateHash}::char(64), ${input.bindingHash}::char(64),
        ${input.verifier}, ${input.nonce}, ${input.returnTo}
      )
    `);
  }

  async consumeLogin(stateHash: string, bindingHash: string): Promise<LoginTransaction | undefined> {
    return rows<LoginTransaction>(await this.database.execute(sql`
      SELECT * FROM codecore_consume_oidc_login(${stateHash}::char(64), ${bindingHash}::char(64))
    `))[0];
  }

  async createSession(input: NewSession): Promise<boolean> {
    const result = rows<{ expires_at: Date | string | null }>(await this.database.execute(sql`
      SELECT codecore_create_web_session(
        ${input.sessionHash}::char(64), ${input.subject}, ${input.tenantId}::uuid, ${input.csrfToken}
      ) AS expires_at
    `))[0];
    return Boolean(result?.expires_at);
  }

  async lookupSession(sessionHash: string): Promise<StoredSession | undefined> {
    return rows<StoredSession>(await this.database.execute(sql`
      SELECT * FROM codecore_lookup_web_session(${sessionHash}::char(64))
    `))[0];
  }

  async revokeSession(sessionHash: string): Promise<void> {
    await this.database.execute(sql`SELECT codecore_revoke_web_session(${sessionHash}::char(64))`);
  }

  async rotateSession(input: NewSession & { oldSessionHash: string }): Promise<boolean> {
    const result = rows<{ expires_at: Date | string | null }>(await this.database.execute(sql`
      SELECT codecore_rotate_web_session(
        ${input.oldSessionHash}::char(64), ${input.sessionHash}::char(64), ${input.subject},
        ${input.tenantId}::uuid, ${input.csrfToken}
      ) AS expires_at
    `))[0];
    return Boolean(result?.expires_at);
  }

  async listTenants(sessionHash: string): Promise<TenantChoice[]> {
    return rows<TenantChoice>(await this.database.execute(sql`
      SELECT * FROM codecore_list_user_tenants(${sessionHash}::char(64))
    `));
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

function equalTokens(left: string, right: string): boolean {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

function safeReturnTo(value: string | undefined, webUrl: string): string {
  if (!value) return '/';
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    /[\r\n]/.test(value)
  ) {
    throw new AuthenticationError('Invalid post-login destination');
  }
  const parsed = new URL(value, webUrl);
  if (parsed.origin !== webUrl || parsed.pathname.startsWith('/api/auth/')) {
    throw new AuthenticationError('Invalid post-login destination');
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function idTokenFromResponse(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id_token' in value) ||
    typeof value.id_token !== 'string' ||
    value.id_token.length > 32_768 ||
    value.id_token.split('.').length !== 3 ||
    !('access_token' in value) ||
    typeof value.access_token !== 'string' ||
    value.access_token.length === 0 ||
    value.access_token.length > 32_768 ||
    !('token_type' in value) ||
    typeof value.token_type !== 'string' ||
    value.token_type.toLowerCase() !== 'bearer'
  ) {
    throw new AuthenticationError('OIDC token response is invalid');
  }
  return value.id_token;
}

export function sessionCookieName(production: boolean): string {
  return production ? '__Host-codecore_session' : 'codecore_session';
}

export function transactionCookieName(production: boolean): string {
  return production ? '__Host-codecore_oidc_tx' : 'codecore_oidc_tx';
}

export function serializeSessionCookie(sessionId: string, production: boolean): string {
  return [
    `${sessionCookieName(production)}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_LIFETIME_SECONDS}`,
    ...(production ? ['Secure'] : []),
  ].join('; ');
}

export function serializeClearedSessionCookie(production: boolean): string {
  return [
    `${sessionCookieName(production)}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(production ? ['Secure'] : []),
  ].join('; ');
}

export function serializeTransactionCookie(binding: string, production: boolean): string {
  return [
    `${transactionCookieName(production)}=${binding}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${LOGIN_TRANSACTION_LIFETIME_SECONDS}`,
    ...(production ? ['Secure'] : []),
  ].join('; ');
}

export function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (typeof cookieHeader !== 'string' || !cookieHeader || cookieHeader.length > 8192) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
  }
  return undefined;
}

export function sessionIdFromCookie(cookieHeader: string | undefined, production: boolean): string | undefined {
  return cookieValue(cookieHeader, sessionCookieName(production));
}

export class BrowserAuthService implements BrowserSessionAuthenticator {
  private readonly production: boolean;

  private readonly callbackUrl: string;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly store: BrowserAuthStore,
    private readonly membershipResolver: TenantMembershipResolver,
  ) {
    this.production = config.nodeEnv === 'production';
    this.callbackUrl = new URL('/api/auth/callback', config.webUrl).toString();
  }

  isEnabled(): boolean {
    return Boolean(
      this.config.oidcIssuerUrl &&
      this.config.oidcClientId &&
      (!this.production || this.config.oidcClientSecret),
    );
  }

  get productionCookies(): boolean {
    return this.production;
  }

  async startLogin(returnTo: string | undefined): Promise<BrowserLoginStart> {
    const oidc = this.createOidcProvider();
    let endpoints: { authorizationEndpoint: string; tokenEndpoint: string };
    try {
      endpoints = await oidc.getAuthorizationEndpoints();
    } catch {
      platformMetrics.recordSignal('authentication', 'failed');
      logger.emit('error', 'browser_auth.discovery_failed');
      throw new AuthenticationError('OIDC provider is unavailable');
    }
    const state = randomToken();
    const verifier = randomToken();
    const nonce = randomToken();
    const binding = randomToken();
    const destination = safeReturnTo(returnTo, this.config.webUrl);
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    await this.store.startLogin({
      stateHash: sha256(state),
      bindingHash: sha256(binding),
      verifier,
      nonce,
      returnTo: destination,
    });

    const authorizationUrl = new URL(endpoints.authorizationEndpoint);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', this.config.oidcClientId!);
    authorizationUrl.searchParams.set('redirect_uri', this.callbackUrl);
    authorizationUrl.searchParams.set('scope', 'openid');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', challenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    platformMetrics.recordSignal('authentication', 'started');
    logger.emit('info', 'browser_auth.login_started');
    return { authorizationUrl: authorizationUrl.toString(), bindingCookie: binding };
  }

  async completeLogin(input: {
    code: string | undefined;
    state: string | undefined;
    binding: string | undefined;
    error: string | undefined;
    authorizationIssuer: string | undefined;
  }): Promise<BrowserLoginComplete> {
    if (
      typeof input.state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.state) ||
      typeof input.binding !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.binding)
    ) {
      throw new AuthenticationError('OIDC callback state is invalid');
    }
    const consumed = await this.store.consumeLogin(sha256(input.state), sha256(input.binding));
    if (!consumed) throw new AuthenticationError('OIDC callback state is invalid or expired');
    if (
      input.error ||
      typeof input.code !== 'string' ||
      input.code.length === 0 ||
      input.code.length > 4096 ||
      /[\u0000-\u0020\u007f]/.test(input.code)
    ) {
      throw new AuthenticationError('OIDC authorization was not completed');
    }
    if (input.authorizationIssuer && input.authorizationIssuer !== this.config.oidcIssuerUrl) {
      throw new AuthenticationError('OIDC authorization issuer did not match');
    }

    const identityProvider = this.createOidcProvider(consumed.nonce);
    let tokenEndpoint: string;
    try {
      tokenEndpoint = (await identityProvider.getAuthorizationEndpoints()).tokenEndpoint;
    } catch {
      platformMetrics.recordSignal('authentication', 'failed');
      logger.emit('error', 'browser_auth.discovery_failed');
      throw new AuthenticationError('OIDC provider is unavailable');
    }
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: this.callbackUrl,
      client_id: this.config.oidcClientId!,
      code_verifier: consumed.pkce_verifier,
    });
    if (this.config.oidcClientSecret) form.set('client_secret', this.config.oidcClientSecret);
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
    } catch {
      throw new AuthenticationError('OIDC token exchange failed');
    }
    if (!tokenResponse.ok) throw new AuthenticationError('OIDC token exchange failed');
    let responseText: string;
    try {
      responseText = await tokenResponse.text();
    } catch {
      throw new AuthenticationError('OIDC token response is invalid');
    }
    if (responseText.length > 65_536) throw new AuthenticationError('OIDC token response is invalid');
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText) as unknown;
    } catch {
      throw new AuthenticationError('OIDC token response is invalid');
    }
    const idToken = idTokenFromResponse(responseBody);
    const verifiedMembership = new TenantMembershipAuthProvider(identityProvider, this.membershipResolver);
    const context = await verifiedMembership.verifyAccessToken(idToken);
    if (!context.userId || context.userId.length > 512) {
      throw new AuthenticationError('Authenticated subject identifier is invalid');
    }
    const sessionId = randomToken();
    const csrfToken = randomToken();
    const created = await this.store.createSession({
      sessionHash: sha256(sessionId),
      subject: context.userId,
      tenantId: context.tenantId,
      csrfToken,
    });
    if (!created) throw new AuthenticationError('No active tenant membership for browser login');
    platformMetrics.recordSignal('authentication', 'accepted');
    logger.emit('info', 'browser_auth.login_succeeded');
    return { sessionId, returnTo: consumed.return_to };
  }

  async getSession(sessionId: string | undefined): Promise<BrowserAuthSessionInfo> {
    if (!sessionId) return { authenticated: false };
    const session = await this.lookup(sessionId);
    if (!session) return { authenticated: false };
    let context: TenantContext;
    try {
      context = await this.resolveMembership(session);
    } catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
      await this.store.revokeSession(sha256(sessionId));
      return { authenticated: false };
    }
    const choices = await this.store.listTenants(sha256(sessionId));
    return {
      authenticated: true,
      tenantId: context.tenantId,
      csrfToken: session.csrf_token,
      permissions: [...context.permissions],
      tenants: choices.map((choice) => ({ id: choice.tenant_id, name: choice.tenant_name })),
    };
  }

  async authenticateSession(sessionId: string): Promise<BrowserSession> {
    const session = await this.lookup(sessionId);
    if (!session) throw new AuthenticationError('Browser session is invalid or expired');
    return {
      context: await this.resolveMembership(session),
      csrfToken: session.csrf_token,
    };
  }

  async authenticateRequest(
    sessionId: string,
    method: string,
    origin: string | undefined,
    csrfToken: string | undefined,
  ): Promise<BrowserSession> {
    const session = await this.authenticateSession(sessionId);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
      this.requireCsrf(origin, csrfToken, session.csrfToken);
    }
    return session;
  }

  async switchTenant(input: {
    sessionId: string;
    tenantId: string;
    origin: string | undefined;
    csrfToken: string | undefined;
  }): Promise<string> {
    const session = await this.lookup(input.sessionId);
    if (!session) throw new AuthenticationError('Browser session is invalid or expired');
    this.requireCsrf(input.origin, input.csrfToken, session.csrf_token);
    if (typeof input.tenantId !== 'string') throw new AuthenticationError('Tenant selection is invalid');
    const tenantId = input.tenantId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new AuthenticationError('Tenant selection is invalid');
    }
    const membership = await this.membershipResolver.resolve(session.subject, tenantId);
    if (!membership) throw new AuthenticationError('Tenant selection is not authorized');
    const newSessionId = randomToken();
    const csrfToken = randomToken();
    const rotated = await this.store.rotateSession({
      oldSessionHash: sha256(input.sessionId),
      sessionHash: sha256(newSessionId),
      subject: session.subject,
      tenantId,
      csrfToken,
    });
    if (!rotated) throw new AuthenticationError('Browser session changed; sign in again');
    platformMetrics.recordSignal('authentication', 'accepted');
    logger.emit('info', 'browser_auth.tenant_changed');
    return newSessionId;
  }

  async logout(input: {
    sessionId: string | undefined;
    origin: string | undefined;
    csrfToken: string | undefined;
  }): Promise<void> {
    if (!input.sessionId) return;
    const session = await this.lookup(input.sessionId);
    if (session) this.requireCsrf(input.origin, input.csrfToken, session.csrf_token);
    await this.store.revokeSession(sha256(input.sessionId));
    platformMetrics.recordSignal('authentication', 'succeeded');
    logger.emit('info', 'browser_auth.logout_succeeded');
  }

  private async lookup(sessionId: string): Promise<StoredSession | undefined> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(sessionId)) return undefined;
    return this.store.lookupSession(sha256(sessionId));
  }

  private async resolveMembership(session: StoredSession): Promise<TenantContext> {
    const membership = await this.membershipResolver.resolve(session.subject, session.tenant_id);
    if (!membership) {
      platformMetrics.recordSignal('authentication', 'rejected');
      logger.emit('warn', 'browser_auth.membership_rejected');
      throw new AuthenticationError('No active membership for the browser session');
    }
    return {
      tenantId: membership.tenantId,
      userId: session.subject,
      roles: [membership.role],
      permissions: [...membership.permissions],
      locale: 'en',
    };
  }

  private requireCsrf(origin: string | undefined, provided: string | undefined, expected: string): void {
    if (origin !== this.config.webUrl || !provided || !equalTokens(provided, expected)) {
      platformMetrics.recordSignal('authentication', 'rejected');
      logger.emit('warn', 'browser_auth.csrf_rejected');
      throw new AuthenticationError('Browser request origin or CSRF token is invalid');
    }
  }

  private createOidcProvider(expectedNonce?: string): OidcAuthProvider {
    if (!this.config.oidcIssuerUrl || !this.config.oidcClientId) {
      throw new AuthenticationError('Browser OIDC is not configured');
    }
    return new OidcAuthProvider({
      issuerUrl: this.config.oidcIssuerUrl,
      audience: this.config.oidcClientId,
      ...(expectedNonce ? { expectedNonce } : {}),
      requireHttpsEndpoints: this.production,
    });
  }
}
