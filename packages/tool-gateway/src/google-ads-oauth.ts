import { createHash, randomBytes } from 'node:crypto';
import { GoogleAdsProviderError } from './google-ads.js';

/**
 * WS-PROD-09 Google Ads OAuth 2.0 boundary (server-side only).
 *
 * Official contract (Google for Developers, Google Ads API OAuth):
 * - Authorization endpoint: https://accounts.google.com/o/oauth2/v2/auth
 * - Token endpoint: https://oauth2.googleapis.com/token
 * - Revocation endpoint: https://oauth2.googleapis.com/revoke
 * - Scope: https://www.googleapis.com/auth/adwords (only supported scope)
 * - access_type=offline + prompt=consent to obtain a refresh token
 * Product-login OIDC and Google provider OAuth are separate trust domains.
 */

export const GOOGLE_ADS_OAUTH_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_ADS_OAUTH_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const GOOGLE_ADS_OAUTH_SCOPE = 'https://www.googleapis.com/auth/adwords';

export interface GoogleAdsOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleAdsOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string;
}

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
}

export interface GoogleAdsOAuthTransport {
  postForm(url: string, form: Record<string, string>): Promise<{ ok: boolean; status: number; body: unknown }>;
}

export class GoogleAdsOAuthFetchTransport implements GoogleAdsOAuthTransport {
  async postForm(url: string, form: Record<string, string>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    return { ok: response.ok, status: response.status, body };
  }
}

export function newOauthState(): { state: string; stateHash: string } {
  const state = randomBytes(32).toString('base64url');
  return { state, stateHash: hashOauthState(state) };
}

export function hashOauthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export function buildGoogleAdsAuthorizationUrl(
  config: GoogleAdsOAuthClientConfig,
  state: string,
): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_STATE_INVALID', false);
  }
  const url = new URL(GOOGLE_ADS_OAUTH_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_ADS_OAUTH_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

function parseTokenResponse(body: unknown, requireRefresh: boolean): GoogleAdsOAuthTokens {
  const response = (body ?? {}) as TokenResponse;
  if (typeof response.error === 'string') {
    throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_TOKEN_REJECTED', false, false, 'AUTHENTICATION');
  }
  if (typeof response.access_token !== 'string' || response.access_token.length === 0) {
    throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_TOKEN_INVALID', false, false, 'AUTHENTICATION');
  }
  const expiresIn = typeof response.expires_in === 'number' && response.expires_in > 0 ? response.expires_in : 3600;
  const tokens: GoogleAdsOAuthTokens = {
    accessToken: response.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: typeof response.scope === 'string' ? response.scope : '',
  };
  if (typeof response.refresh_token === 'string' && response.refresh_token.length > 0) {
    tokens.refreshToken = response.refresh_token;
  }
  if (requireRefresh && !tokens.refreshToken) {
    throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_REFRESH_TOKEN_MISSING', false, false, 'AUTHENTICATION');
  }
  return tokens;
}

/** Exchange an authorization code; the refresh token is mandatory for offline use. */
export async function exchangeGoogleAdsAuthorizationCode(
  transport: GoogleAdsOAuthTransport,
  config: GoogleAdsOAuthClientConfig,
  code: string,
): Promise<GoogleAdsOAuthTokens> {
  if (typeof code !== 'string' || code.length === 0 || code.length > 4096 || /[\u0000-\u0020\u007f]/.test(code)) {
    throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_CODE_INVALID', false, false, 'AUTHENTICATION');
  }
  const response = await transport.postForm(GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT, {
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
  if (!response.ok) {
    throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_TOKEN_REJECTED', false, false, 'AUTHENTICATION');
  }
  const tokens = parseTokenResponse(response.body, true);
  if (!tokens.scope.split(/\s+/).includes(GOOGLE_ADS_OAUTH_SCOPE)) {
    throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_SCOPE_MISSING', false, false, 'AUTHENTICATION');
  }
  return tokens;
}

/** Refresh an access token server-side; never invoked from the browser. */
export async function refreshGoogleAdsAccessToken(
  transport: GoogleAdsOAuthTransport,
  config: GoogleAdsOAuthClientConfig,
  refreshToken: string,
): Promise<GoogleAdsOAuthTokens> {
  const response = await transport.postForm(GOOGLE_ADS_OAUTH_TOKEN_ENDPOINT, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  if (!response.ok) {
    const body = (response.body ?? {}) as TokenResponse;
    const revoked = response.status === 400 || response.status === 401 || body.error === 'invalid_grant';
    throw new GoogleAdsProviderError(
      revoked ? 'GOOGLE_ADS_OAUTH_REFRESH_REVOKED' : 'GOOGLE_ADS_OAUTH_REFRESH_FAILED',
      false,
      false,
      'AUTHENTICATION',
    );
  }
  return parseTokenResponse(response.body, false);
}

/** Revoke a token; revocation failure of an unknown token is not an error. */
export async function revokeGoogleAdsToken(
  transport: GoogleAdsOAuthTransport,
  token: string,
): Promise<void> {
  const response = await transport.postForm(GOOGLE_ADS_OAUTH_REVOKE_ENDPOINT, { token });
  if (!response.ok && response.status !== 400) {
    throw new GoogleAdsProviderError('GOOGLE_ADS_OAUTH_REVOKE_FAILED', true, false, 'AUTHENTICATION');
  }
}
