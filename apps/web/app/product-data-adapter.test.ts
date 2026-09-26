import assert from 'node:assert/strict';
import test from 'node:test';
import { CanonicalApiClient } from './canonical-api.js';
import { loadProductSurface } from './product-data-adapter.js';
import { getProductView } from './product-model.js';

const access = {
  tenantContext: 'available' as const,
  permissions: ['tenant:read'],
  entitlements: [],
};

test('a concrete commercial read uses its mapped canonical endpoint and preserves empty data', async () => {
  const calls: string[] = [];
  const client = new CanonicalApiClient(
    { baseUrl: 'https://canonical.example', accessToken: 'token' },
    (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch,
  );
  const state = await loadProductSurface(client, getProductView('overview')!, access);
  assert.equal(state.kind, 'empty');
  assert.deepEqual(calls, ['https://canonical.example/revenue-intelligence']);
});

test('an entity-key source stays explicitly unavailable instead of guessing a record', async () => {
  const client = new CanonicalApiClient({
    baseUrl: 'https://canonical.example',
    accessToken: 'token',
  });
  const campaigns = getProductView('campaigns')!;
  const campaignDetail = campaigns.dataSources.find((source) => source.endpoint.includes(':'));
  assert.ok(campaignDetail);
  const state = await loadProductSurface(client, { ...campaigns, dataSources: [campaignDetail] }, {
    tenantContext: 'available',
    permissions: ['artifact:read'],
    entitlements: [],
  });
  assert.equal(state.kind, 'unavailable');
  assert.match(state.compositionEndpoint, /:campaignId/);
});

test('API failures become an honest screen error rather than fake metrics', async () => {
  const client = new CanonicalApiClient(
    { baseUrl: 'https://canonical.example', accessToken: 'token' },
    (async () => new Response('no', { status: 503 })) as typeof fetch,
  );
  const state = await loadProductSurface(client, getProductView('overview')!, access);
  assert.equal(state.kind, 'error');
});
