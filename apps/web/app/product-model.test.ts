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

test('the unified navigation maps every declared product surface to one canonical route', () => {
  const navigationIds = productNavigation.flatMap((group) => group.views);

  assert.equal(productViews.length, 23);
  assert.equal(new Set(navigationIds).size, productViews.length);
  assert.equal(new Set(productViews.map((view) => view.route)).size, productViews.length);
  assert.deepEqual(new Set(navigationIds), new Set(productViews.map((view) => view.id)));
  assert.equal(getProductView('admin-governance')?.route, '/admin-governance');
  assert.equal(getProductView('not-a-route'), undefined);
});

test('Arabic and English use the canonical i18n direction with localized labels', () => {
  const admin = getProductView('admin-governance')!;

  assert.equal(directionFor('en-US'), 'ltr');
  assert.equal(directionFor('ar-SA'), 'rtl');
  assert.equal(copy(admin.label, 'en-US'), 'Admin & Governance');
  assert.equal(copy(admin.label, 'ar-SA'), 'الإدارة والحوكمة');
});

test('permission and entitlement guards derive access from a tenant context, never a feature flag', () => {
  const approvals = getProductView('approvals')!;
  const admin = getProductView('admin-governance')!;
  const billing = getProductView('billing-usage')!;

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
    assessProductAccess(admin, {
      tenantContext: 'available',
      permissions: ['organization:manage'],
      entitlements: [],
    }),
    'available',
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
  assert.equal(admin.approvalSensitivity, 'decision-required');
  assert.equal(
    admin.sections[1]!.items.some((item) =>
      item.en.includes('Feature flags never imply authorization'),
    ),
    true,
  );
});

test('unavailable composition data remains explicit and does not become fabricated business state', () => {
  const finance = getProductView('finance-cfo')!;
  const state = unavailableState(finance);

  assert.equal(state.kind, 'unavailable');
  assert.equal(state.compositionEndpoint, '/product-surfaces/finance-cfo');
  assert.match(state.message.en, /not available/i);
});
