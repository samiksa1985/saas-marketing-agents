import assert from 'node:assert/strict';
import test from 'node:test';

import { CanonicalApiClient, CanonicalApiError } from './canonical-api.js';

test('the canonical API client reads existing endpoints with a bearer token and no spoofed tenant header', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify([
        {
          agentId: 'agent-1',
          name: 'Planner',
          specialty: 'strategy',
          category: 'planner',
          active: true,
        },
      ]),
      {
        headers: { 'content-type': 'application/json' },
        status: 200,
      },
    );
  }) as typeof fetch;
  const client = new CanonicalApiClient(
    { baseUrl: 'https://canonical.example/', accessToken: 'real-access-token' },
    fetcher,
  );

  const agents = await client.agents();

  assert.equal(agents[0]?.agentId, 'agent-1');
  assert.equal(calls[0]?.url, 'https://canonical.example/agents');
  assert.equal(calls[0]?.init?.method, 'GET');
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    'Bearer real-access-token',
  );
  assert.equal('x-tenant-id' in (calls[0]?.init?.headers as Record<string, string>), false);
});

test('a failed canonical request throws instead of reporting a fake external success', async () => {
  const fetcher = (async () => new Response('forbidden', { status: 403 })) as typeof fetch;
  const client = new CanonicalApiClient(
    { baseUrl: 'https://canonical.example', accessToken: 'real-access-token' },
    fetcher,
  );

  await assert.rejects(client.approvals(), (error: unknown) => {
    assert.ok(error instanceof CanonicalApiError);
    assert.equal(error.status, 403);
    return true;
  });
});
