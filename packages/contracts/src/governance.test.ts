import assert from 'node:assert/strict';
import test from 'node:test';

import { CANONICAL_PERMISSIONS, CANONICAL_ROLES } from './index.js';

test('canonical roles remain compatible while governance role profiles are added', () => {
  for (const role of [
    'tenant_admin',
    'engagement_owner',
    'workstream_operator',
    'reviewer',
    'sales_operator',
    'finance_operator',
    'auditor',
  ] as const) {
    assert.ok(CANONICAL_ROLES.includes(role));
  }

  assert.ok(CANONICAL_ROLES.includes('marketing_manager'));
  assert.ok(CANONICAL_ROLES.includes('viewer'));
  assert.ok(CANONICAL_PERMISSIONS.includes('data_deletion:manage'));
  assert.ok(CANONICAL_PERMISSIONS.includes('security_policy:manage'));
});
