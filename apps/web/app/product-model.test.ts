import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessProductAccess,
  copy,
  directionFor,
  getProductView,
  productNavigation,
  productViews,
  unavailableState,
} from './product-model.js';

test('commercial navigation provides all nine named commercial surfaces and safe administration', () => {
  const primary = productNavigation.find((group) => group.id === 'primary')!;
  const administration = productNavigation.find((group) => group.id === 'administration')!;
  assert.deepEqual(primary.views, [
    'overview',
    'growth-workspace',
    'campaigns',
    'customers',
    'conversations',
    'journeys',
    'approvals',
    'analytics',
    'integrations',
    'reports',
    'admin',
  ]);
  assert.equal(administration.views.length, 5);
  assert.equal(productViews.length, 17);
  assert.equal(new Set(productViews.map((item) => item.route)).size, productViews.length);
  assert.equal(getProductView('growth-workspace')?.route, '/growth-workspace');
  assert.equal(getProductView('not-a-route'), undefined);
});

test('Arabic is first-class RTL copy for commercial navigation', () => {
  const integrations = getProductView('integrations')!;
  assert.equal(directionFor('en-US'), 'ltr');
  assert.equal(directionFor('ar-SA'), 'rtl');
  assert.equal(copy(integrations.label, 'en-US'), 'Integrations');
  assert.equal(copy(integrations.label, 'ar-SA'), 'التكاملات');
});

test('tenant permissions, not frontend visibility, control each product surface', () => {
  const approvals = getProductView('approvals')!;
  const billing = getProductView('billing-plan')!;
  assert.equal(
    assessProductAccess(approvals, {
      tenantContext: 'missing',
      permissions: ['approval:decide'],
      entitlements: [],
    }),
    'missing-context',
  );
  assert.equal(
    assessProductAccess(approvals, {
      tenantContext: 'available',
      permissions: [],
      entitlements: [],
    }),
    'permission-denied',
  );
  assert.equal(
    assessProductAccess(billing, {
      tenantContext: 'available',
      permissions: ['billing:admin'],
      entitlements: [],
    }),
    'entitlement-unavailable',
  );
  assert.equal(
    assessProductAccess(billing, {
      tenantContext: 'available',
      permissions: ['billing:admin'],
      entitlements: ['billing-usage'],
    }),
    'available',
  );
});

test('unknown is represented as unavailable instead of a fake zero or connection state', () => {
  const overview = getProductView('overview')!;
  const state = unavailableState(overview);
  assert.equal(state.kind, 'unavailable');
  assert.equal(state.compositionEndpoint, 'GET /revenue-intelligence');
  assert.match(state.message.en, /authoritative source/i);
});

test('commercial surfaces map to existing canonical API routes and never contain EPIC labels', () => {
  for (const item of productViews) {
    assert.ok(item.dataSources.length > 0);
    assert.equal(item.title.en.includes('EPIC'), false);
  }
  assert.match(
    getProductView('integrations')!
      .dataSources.map((item) => item.endpoint)
      .join('\n'),
    /provider-integrations/,
  );
  assert.match(
    getProductView('approvals')!.sections[0]!.description.en,
    /canonical backend approval authority/i,
  );
});
