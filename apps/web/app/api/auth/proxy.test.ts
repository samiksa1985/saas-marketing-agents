import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { forwardAuthRequest } from './proxy.js';

const SESSION_ID = 'abcdefghijklmnopqrstuvwxyzABCDEFG_123456789';
const TX_ID = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg_123456789';

test('login proxy forwards no browser credentials and preserves the transaction cookie', async () => {
  const originalBase = process.env.API_BASE_URL;
  const originalFetch = globalThis.fetch;
  process.env.API_BASE_URL = 'http://api.example.test:4000';
  let upstreamUrl = '';
  let upstreamHeaders: Headers | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    upstreamUrl = String(input);
    upstreamHeaders = new Headers(init?.headers);
    return new Response(null, {
      status: 302,
      headers: {
        location: 'https://identity.example.test/authorize?state=opaque',
        'set-cookie': `codecore_oidc_tx=${TX_ID}; Path=/; HttpOnly; SameSite=Lax`,
      },
    });
  }) as typeof fetch;
  try {
    const request = new NextRequest(
      'https://app.example.test/api/auth/login?returnTo=%2Fgrowth',
      {
        headers: {
          authorization: 'Bearer must-not-forward',
          cookie: `codecore_session=${SESSION_ID}; codecore_oidc_tx=${TX_ID}`,
        },
      },
    );
    const response = await forwardAuthRequest(request, '/browser-auth/login', {
      redirect: 'identity-provider',
    });
    assert.equal(upstreamUrl, 'http://api.example.test:4000/browser-auth/login?returnTo=%2Fgrowth');
    assert.equal(upstreamHeaders?.has('authorization'), false);
    assert.equal(upstreamHeaders?.has('cookie'), false);
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('location'),
      'https://identity.example.test/authorize?state=opaque',
    );
    assert.match(response.headers.get('set-cookie') ?? '', /codecore_oidc_tx=/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = originalBase;
  }
});

test('callback proxy forwards only the transaction cookie and rejects cross-origin return redirects', async () => {
  const originalBase = process.env.API_BASE_URL;
  const originalFetch = globalThis.fetch;
  process.env.API_BASE_URL = 'http://api.example.test:4000';
  let upstreamHeaders: Headers | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    upstreamHeaders = new Headers(init?.headers);
    return new Response(null, { status: 303, headers: { location: '/growth?view=overview' } });
  }) as typeof fetch;
  try {
    const request = new NextRequest(
      'https://app.example.test/api/auth/callback?code=one-time&state=one-time',
      {
        headers: {
          authorization: 'Bearer must-not-forward',
          cookie: `codecore_session=${SESSION_ID}; codecore_oidc_tx=${TX_ID}`,
        },
      },
    );
    const response = await forwardAuthRequest(request, '/browser-auth/callback', {
      cookie: 'transaction',
      redirect: 'same-origin',
    });
    assert.equal(upstreamHeaders?.get('cookie'), `codecore_oidc_tx=${TX_ID}`);
    assert.equal(upstreamHeaders?.has('authorization'), false);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'https://app.example.test/growth?view=overview');

    globalThis.fetch = (async () =>
      new Response(null, { status: 303, headers: { location: 'https://attacker.example/steal' } })) as typeof fetch;
    const rejected = await forwardAuthRequest(request, '/browser-auth/callback', {
      cookie: 'transaction',
      redirect: 'same-origin',
    });
    assert.equal(rejected.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = originalBase;
  }
});
