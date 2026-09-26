import test from 'node:test';
import assert from 'node:assert/strict';
import type { TenantContext } from '@platform/contracts';
import { ProductSurfaceService } from './product-surface.controller.js';

const tenant: TenantContext = {
  tenantId: 'tenant-a', userId: 'user-a', roles: ['tenant_admin'],
  permissions: ['workflow:read', 'approval:decide', 'billing:admin'], locale: 'en',
};

test('product surface composition uses canonical registry data without fabricating agents', async () => {
  const service = new ProductSurfaceService(
    { agents: async () => [{ agentId: 'agent-a' }] } as never,
    { list: () => [] } as never,
  );
  const result = await service.get(tenant, 'ai-team');
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.data, [{ agentId: 'agent-a' }]);
});

test('product billing composition identifies the authoritative entitlement dependency', async () => {
  const service = new ProductSurfaceService(
    { agents: async () => [] } as never,
    { list: () => [] } as never,
  );
  const result = await service.get(tenant, 'billing-usage');
  assert.equal(result.state, 'unavailable');
  assert.equal(result.requiredEntitlement, 'billing-usage');
});

test('product surface composition enforces the canonical permission', async () => {
  const service = new ProductSurfaceService(
    { agents: async () => [] } as never,
    { list: () => [] } as never,
  );
  await assert.rejects(
    () => service.get({ ...tenant, permissions: [] }, 'ai-team'),
    /Missing permission/,
  );
});
