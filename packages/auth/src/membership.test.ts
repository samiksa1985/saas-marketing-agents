import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthenticationError, type AuthProvider } from './index.js';
import { TenantMembershipAuthProvider } from './membership.js';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

function identityProvider(context: {
  tenantId: string;
  userId: string;
  roles: string[];
  permissions: string[];
}): AuthProvider {
  return {
    async verifyAccessToken(token) {
      if (token === 'invalid') throw new AuthenticationError('bad token');
      return {
        tenantId: context.tenantId,
        userId: context.userId,
        roles: context.roles as never,
        permissions: context.permissions as never,
        locale: 'en',
      };
    },
  };
}

test('claims-only roles and permissions are discarded in favor of authoritative membership', async () => {
  const provider = new TenantMembershipAuthProvider(
    identityProvider({ tenantId: TENANT_A, userId: 'sub-1', roles: ['viewer'], permissions: [] }),
    {
      async resolve(subject, tenantId) {
        assert.equal(subject, 'sub-1');
        assert.equal(tenantId, TENANT_A);
        return { tenantId: TENANT_A, role: 'tenant_admin', permissions: ['approval:decide', 'workflow:execute'] as never };
      },
    },
  );
  const context = await provider.verifyAccessToken('valid');
  assert.deepEqual(context.roles, ['tenant_admin']);
  assert.deepEqual(context.permissions, ['approval:decide', 'workflow:execute']);
  assert.equal(context.tenantId, TENANT_A);
  assert.equal(context.userId, 'sub-1');
});

test('token claims alone cannot select a tenant without membership', async () => {
  const provider = new TenantMembershipAuthProvider(
    identityProvider({ tenantId: TENANT_B, userId: 'sub-1', roles: ['tenant_admin'], permissions: ['tenant:manage'] as never }),
    { async resolve() { return null; } },
  );
  await assert.rejects(() => provider.verifyAccessToken('valid'), /No active membership/);
});

test('a membership for a different tenant is rejected as tenant mismatch', async () => {
  const provider = new TenantMembershipAuthProvider(
    identityProvider({ tenantId: TENANT_A, userId: 'sub-1', roles: [], permissions: [] }),
    {
      async resolve() {
        return { tenantId: TENANT_B, role: 'tenant_admin', permissions: [] as never };
      },
    },
  );
  await assert.rejects(() => provider.verifyAccessToken('valid'), /not authorized/);
});

test('stale or forged tokens keep failing before membership is consulted', async () => {
  let consulted = false;
  const provider = new TenantMembershipAuthProvider(
    identityProvider({ tenantId: TENANT_A, userId: 'sub-1', roles: [], permissions: [] }),
    { async resolve() { consulted = true; return null; } },
  );
  await assert.rejects(() => provider.verifyAccessToken('invalid'), /bad token/);
  assert.equal(consulted, false, 'membership lookup must never run for unauthenticated requests');
});

test('resolver errors fail closed instead of granting access', async () => {
  const provider = new TenantMembershipAuthProvider(
    identityProvider({ tenantId: TENANT_A, userId: 'sub-1', roles: ['tenant_admin'], permissions: ['approval:decide'] as never }),
    { async resolve() { throw new Error('database unavailable'); } },
  );
  await assert.rejects(() => provider.verifyAccessToken('valid'));
});
