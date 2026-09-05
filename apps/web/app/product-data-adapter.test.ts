import test from 'node:test';
import assert from 'node:assert/strict';
import { CanonicalApiClient } from './canonical-api.js';
import { loadProductSurface } from './product-data-adapter.js';
import { productSurfaceEndpoint, productViews } from './product-model.js';

const access = { tenantContext: 'available' as const, permissions: ['tenant:read'], entitlements: [] };

test('every product surface has one canonical typed backend route', () => {
  assert.deepEqual(
    productViews.map((view) => productSurfaceEndpoint(view.id)),
    productViews.map((view) => `/product-surfaces/${view.id}`),
  );
});

test('surface adapter preserves an empty canonical response without inventing metrics', async () => {
  const client = new CanonicalApiClient(
    { baseUrl: 'https://canonical.example', accessToken: 'token' },
    (async () => new Response(JSON.stringify({ surface: 'home', state: 'empty', source: 'canonical', reason: 'No records' }), { status: 200 })) as typeof fetch,
  );
  const state = await loadProductSurface(client, productViews[0]!, access);
  assert.equal(state.kind, 'empty');
  assert.equal(state.message.en, 'No records');
});
