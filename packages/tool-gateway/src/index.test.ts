import test from 'node:test';
import assert from 'node:assert/strict';
import type { Permission, TenantContext } from '@platform/contracts';
import { InMemoryToolGateway } from './index.js';

function tenant(
  tenantId = 'tenant-a',
  permissions: Permission[] = ['artifact:read', 'artifact:write'],
): TenantContext {
  return {
    tenantId,
    roles: [],
    permissions,
    locale: 'en',
  };
}

test('tool gateway enforces tenant identity and idempotency', async () => {
  const gateway = new InMemoryToolGateway();
  let calls = 0;

  gateway.register({
    definition: {
      toolId: 'artifact.lookup',
      description: 'Lookup artifact data',
      risk: 'READ',
      permissions: ['artifact:read'],
      tenantScoped: true,
    },
    async execute() {
      calls += 1;
      return { ok: true, calls };
    },
  });

  const call = {
    toolId: 'artifact.lookup',
    tenantId: 'tenant-a',
    idempotencyKey: 'lookup-1',
    input: { artifactId: 'A1' },
  };

  const first = await gateway.execute(call, {
    tenant: tenant(),
    approvedApprovalIds: new Set<string>(),
  });

  const second = await gateway.execute(call, {
    tenant: tenant(),
    approvedApprovalIds: new Set<string>(),
  });

  assert.deepEqual(first, second);
  assert.equal(calls, 1);

  await assert.rejects(
    gateway.execute(
      { ...call, tenantId: 'tenant-b', idempotencyKey: 'lookup-2' },
      {
        tenant: tenant(),
        approvedApprovalIds: new Set<string>(),
      },
    ),
    /TENANT_CONTEXT_MISMATCH/,
  );
});

test('tool gateway enforces permissions', async () => {
  const gateway = new InMemoryToolGateway();

  gateway.register({
    definition: {
      toolId: 'artifact.write',
      description: 'Write artifact data',
      risk: 'WRITE',
      permissions: ['artifact:write'],
      tenantScoped: true,
    },
    async execute() {
      return { written: true };
    },
  });

  await assert.rejects(
    gateway.execute(
      {
        toolId: 'artifact.write',
        tenantId: 'tenant-a',
        idempotencyKey: 'write-1',
        input: {},
      },
      {
        tenant: tenant('tenant-a', ['artifact:read']),
        approvedApprovalIds: new Set<string>(),
      },
    ),
    /TOOL_PERMISSION_DENIED/,
  );
});

test('external side effects require an approved approval id', async () => {
  const gateway = new InMemoryToolGateway();

  gateway.register({
    definition: {
      toolId: 'artifact.publish',
      description: 'Publish artifact externally',
      risk: 'EXTERNAL_SIDE_EFFECT',
      permissions: ['artifact:write'],
      tenantScoped: true,
    },
    async execute() {
      return { published: true };
    },
  });

  const executionContext = {
    tenant: tenant(),
    approvedApprovalIds: new Set<string>(),
  };

  await assert.rejects(
    gateway.execute(
      {
        toolId: 'artifact.publish',
        tenantId: 'tenant-a',
        idempotencyKey: 'publish-1',
        input: {},
      },
      executionContext,
    ),
    /TOOL_APPROVAL_REQUIRED/,
  );

  const result = await gateway.execute(
    {
      toolId: 'artifact.publish',
      tenantId: 'tenant-a',
      idempotencyKey: 'publish-2',
      approvalId: 'approval-1',
      input: {},
    },
    {
      tenant: tenant(),
      approvedApprovalIds: new Set(['approval-1']),
    },
  );

  assert.deepEqual(result, { published: true });
});
