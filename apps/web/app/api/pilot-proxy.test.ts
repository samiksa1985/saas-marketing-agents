import assert from 'node:assert/strict';
import test from 'node:test';

const testToken = 'test-only-pilot-token';
const testEnvironment = process.env as Record<string, string | undefined>;
testEnvironment.NODE_ENV = 'test';
process.env.PILOT_API_TOKEN = testToken;
process.env.LOCAL_ACCEPTANCE_AUTH_ENABLED = 'true';

const proxyPromise = import('./pilot/[...path]/route.js');

function request(path: string, search = '') {
  return { nextUrl: new URL(`http://pilot.test/api/pilot${path}${search}`) } as never;
}

function params(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

async function body(response: Response) {
  return response.json() as Promise<unknown>;
}

test('allows only an explicit canonical GET path and injects authorization server-side', async () => {
  const proxy = await proxyPromise;
  const originalFetch = globalThis.fetch;
  let received: { url?: string; init?: RequestInit | undefined } = {};
  globalThis.fetch = (async (url, init) => {
    received = { url: String(url), init };
    return Response.json([{ id: 'approval-1' }]);
  }) as typeof fetch;
  try {
    const response = await proxy.GET(request('/approvals', '?period=30D'), params('approvals'));
    assert.equal(response.status, 200);
    assert.deepEqual(await body(response), [{ id: 'approval-1' }]);
    assert.equal(received.url, 'http://127.0.0.1:4000/approvals?period=30D');
    assert.equal((received.init?.headers as Record<string, string>).authorization, `Bearer ${testToken}`);
    assert.equal((received.init?.headers as Record<string, string>)['x-tenant-id'], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects non-allowlisted and traversal-shaped paths before an upstream request', async () => {
  const proxy = await proxyPromise;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return Response.json({}); }) as typeof fetch;
  try {
    for (const path of [['campaigns', 'unified'], ['..', 'approvals'], ['%2e%2e', 'approvals']]) {
      const response = await proxy.GET(request(`/${path.join('/')}`), params(...path));
      assert.equal(response.status, 404);
      assert.deepEqual(await body(response), { error: 'Pilot read endpoint not allowed' });
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('has no mutation handler and never returns the server-side token', async () => {
  const proxy = await proxyPromise;
  assert.equal('POST' in proxy, false);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ ok: true })) as typeof fetch;
  try {
    const response = await proxy.GET(request('/leads'), params('leads'));
    assert.doesNotMatch(await response.text(), new RegExp(testToken));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fails closed when local acceptance mode is not enabled', async () => {
  const proxy = await proxyPromise;
  const originalEnabled = testEnvironment.LOCAL_ACCEPTANCE_AUTH_ENABLED;
  try {
    delete testEnvironment.LOCAL_ACCEPTANCE_AUTH_ENABLED;
    const missing = await proxy.GET(request('/approvals'), params('approvals'));
    assert.equal(missing.status, 404);

    testEnvironment.LOCAL_ACCEPTANCE_AUTH_ENABLED = 'false';
    const disabled = await proxy.GET(request('/approvals'), params('approvals'));
    assert.equal(disabled.status, 404);
  } finally {
    testEnvironment.LOCAL_ACCEPTANCE_AUTH_ENABLED = originalEnabled;
  }
});

test('fails closed for upstream failure without fabricating success', async () => {
  const proxy = await proxyPromise;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new Error('upstream down'); }) as typeof fetch;
    const failure = await proxy.GET(request('/approvals'), params('approvals'));
    assert.equal(failure.status, 502);
    assert.deepEqual(await body(failure), { error: 'Upstream request failed' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preserves an upstream non-success status rather than reporting a successful result', async () => {
  const proxy = await proxyPromise;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ error: 'denied' }, { status: 403 })) as typeof fetch;
  try {
    const response = await proxy.GET(request('/approvals'), params('approvals'));
    assert.equal(response.status, 403);
    assert.deepEqual(await body(response), { error: 'denied' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
