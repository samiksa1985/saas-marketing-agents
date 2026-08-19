import test from 'node:test';
import assert from 'node:assert/strict';
import { requireTenantContext } from './index.js';

test('tenant context is mandatory', () => {
  assert.throws(() => requireTenantContext(undefined));
  assert.equal(
    requireTenantContext({ tenantId: 't1', roles: [], permissions: [], locale: 'en' }).tenantId,
    't1',
  );
});
