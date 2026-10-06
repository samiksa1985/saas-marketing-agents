import assert from 'node:assert/strict';
import test from 'node:test';
import { GoogleAdsProviderError } from './google-ads.js';
import {
  GOOGLE_ADS_OAUTH_SCOPE,
  buildGoogleAdsAuthorizationUrl,
  exchangeGoogleAdsAuthorizationCode,
  hashOauthState,
  newOauthState,
  refreshGoogleAdsAccessToken,
  revokeGoogleAdsToken,
  type GoogleAdsOAuthTransport,
} from './google-ads-oauth.js';

const config = {
  clientId: 'client-123',
  clientSecret: 'synthetic-client-secret',
  redirectUri: 'https://app.example.com/provider-connections/google-ads/callback',
};

function transport(handler: (form: Record<string, string>, url: string) => { ok: boolean; status: number; body: unknown }): GoogleAdsOAuthTransport {
  return { postForm: async (url, form) => handler(form, url) };
}

test('authorization URL uses offline access, adwords scope, exact redirect, and 256-bit state', () => {
  const { state, stateHash } = newOauthState();
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashOauthState(state).length, 64);
  const url = new URL(buildGoogleAdsAuthorizationUrl(config, state));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'), GOOGLE_ADS_OAUTH_SCOPE);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('state'), state);
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(url.searchParams.get('response_type'), 'code');
});

test('authorization URL rejects malformed state', () => {
  assert.throws(() => buildGoogleAdsAuthorizationUrl(config, 'short'), GoogleAdsProviderError);
});

test('token exchange requires refresh token and adwords scope; secrets never leave the boundary', async () => {
  const seen: Record<string, string>[] = [];
  const tokens = await exchangeGoogleAdsAuthorizationCode(
    transport((form, url) => {
      seen.push(form);
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      return {
        ok: true,
        status: 200,
        body: { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: GOOGLE_ADS_OAUTH_SCOPE },
      };
    }),
    config,
    'valid-code',
  );
  assert.equal(tokens.accessToken, 'access-1');
  assert.equal(tokens.refreshToken, 'refresh-1');
  assert.equal(seen[0]?.grant_type, 'authorization_code');
  assert.equal(seen[0]?.client_secret, config.clientSecret);

  await assert.rejects(
    () =>
      exchangeGoogleAdsAuthorizationCode(
        transport(() => ({ ok: true, status: 200, body: { access_token: 'a', scope: GOOGLE_ADS_OAUTH_SCOPE } })),
        config,
        'valid-code',
      ),
    /REFRESH_TOKEN_MISSING/,
  );
  await assert.rejects(
    () =>
      exchangeGoogleAdsAuthorizationCode(
        transport(() => ({ ok: true, status: 200, body: { access_token: 'a', refresh_token: 'r', scope: 'openid' } })),
        config,
        'valid-code',
      ),
    /SCOPE_MISSING/,
  );
  await assert.rejects(
    () => exchangeGoogleAdsAuthorizationCode(transport(() => ({ ok: false, status: 400, body: { error: 'access_denied' } })), config, 'denied'),
    /TOKEN_REJECTED/,
  );
  await assert.rejects(
    () => exchangeGoogleAdsAuthorizationCode(transport(() => ({ ok: true, status: 200, body: {} })), config, 'code with spaces'),
    /CODE_INVALID/,
  );
});

test('refresh distinguishes revocation from transient failure', async () => {
  const ok = await refreshGoogleAdsAccessToken(
    transport(() => ({ ok: true, status: 200, body: { access_token: 'fresh', expires_in: 3600, scope: GOOGLE_ADS_OAUTH_SCOPE } })),
    config,
    'refresh-1',
  );
  assert.equal(ok.accessToken, 'fresh');
  assert.equal(ok.refreshToken, undefined);
  await assert.rejects(
    () => refreshGoogleAdsAccessToken(transport(() => ({ ok: false, status: 400, body: { error: 'invalid_grant' } })), config, 'revoked'),
    /REFRESH_REVOKED/,
  );
  await assert.rejects(
    () => refreshGoogleAdsAccessToken(transport(() => ({ ok: false, status: 503, body: {} })), config, 'r'),
    /REFRESH_FAILED/,
  );
});

test('revocation tolerates unknown-token responses but fails closed on server errors', async () => {
  await revokeGoogleAdsToken(transport(() => ({ ok: true, status: 200, body: {} })), 'token');
  await revokeGoogleAdsToken(transport(() => ({ ok: false, status: 400, body: {} })), 'unknown');
  await assert.rejects(
    () => revokeGoogleAdsToken(transport(() => ({ ok: false, status: 500, body: {} })), 'token'),
    /REVOKE_FAILED/,
  );
});
