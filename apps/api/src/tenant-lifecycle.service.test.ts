import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  TENANT_LIFECYCLE_TRANSITIONS,
  TenantLifecycleError,
  TenantLifecycleService,
  buildAcceptancePack,
  type TenantLifecycleStatus,
} from './tenant-lifecycle.service.js';

test('lifecycle state machine permits only the explicit transitions', () => {
  assert.deepEqual(TENANT_LIFECYCLE_TRANSITIONS.REQUESTED, ['QUALIFIED']);
  assert.deepEqual(TENANT_LIFECYCLE_TRANSITIONS.OFFBOARDED, []);
  assert.equal(TENANT_LIFECYCLE_TRANSITIONS.ACTIVE_CONTROLLED.includes('SUSPENDED'), true);
  assert.equal(TENANT_LIFECYCLE_TRANSITIONS.ACTIVE_CONTROLLED.includes('OFFBOARDING'), true);
  assert.equal(TENANT_LIFECYCLE_TRANSITIONS.SUSPENDED.includes('ACTIVE_CONTROLLED'), true);
  assert.equal(TENANT_LIFECYCLE_TRANSITIONS.REQUESTED.includes('ACTIVE_CONTROLLED'), false, 'no shortcut to ACTIVE');
});

test('request validation fails closed on slugs, limits, and missing identity', async () => {
  const service = new TenantLifecycleService({ unsafe: async () => [], begin: async (fn) => fn({ unsafe: async () => [] } as never) });
  const base = {
    slug: 'acme-partner',
    displayName: 'Acme Design Partner',
    designPartnerRef: 'DP-001',
    adminSubject: 'oidc-subject-1',
    adminDisplayName: 'Admin One',
    requestedBy: 'operator-1',
    idempotencyKey: 'req-1',
  };
  await assert.rejects(() => service.createRequest({ ...base, slug: 'Admin' }), /SLUG_INVALID/);
  await assert.rejects(() => service.createRequest({ ...base, slug: '!!bad' }), /SLUG_INVALID/);
  await assert.rejects(() => service.createRequest({ ...base, adminSubject: '' }), /ADMIN_INVALID/);
  await assert.rejects(() => service.createRequest({ ...base, idempotencyKey: '' }), /IDEMPOTENCY_INVALID/);
  await assert.rejects(() => service.createRequest({ ...base, maxMembers: 0 }), /LIMIT_INVALID/);
  await assert.rejects(() => service.createRequest({ ...base, dispatchConcurrency: 0 }), /LIMIT_INVALID/);
  await assert.rejects(() => service.createRequest({ ...base, maxProviderConnections: 100 }), /LIMIT_INVALID/);
});

test('acceptance pack requires ready lifecycle, limits, and live mutation off', () => {
  const limits = {
    maxActiveWorkflows: 10,
    maxMembers: 25,
    maxProviderConnections: 2,
    dispatchConcurrency: 2,
    providerConnectionAllowed: true,
    providerReadOnlyAllowed: true,
    providerValidateOnlyAllowed: false,
    providerLiveMutationAllowed: false,
  };
  const ready: TenantLifecycleStatus = {
    tenantId: randomUUID(),
    lifecycle: 'READY',
    limits,
    recentEvents: [{ to: 'READY', actor: 'operator-1', occurredAt: new Date('2026-10-07T00:00:00Z') }],
  };
  const pack = buildAcceptancePack(ready, 'req-1');
  assert.equal(pack.result, 'READY');
  assert.equal(pack.providerGates.liveMutationAllowed, false);
  assert.equal(pack.killSwitch, 'ARMED');
  assert.equal(pack.schemaVersion, 1);
  assert.equal(JSON.stringify(pack).includes('password'), false);

  const notReady = buildAcceptancePack({ ...ready, lifecycle: 'PROVISIONED' }, 'req-1');
  assert.equal(notReady.result, 'NOT_READY');
  assert.ok(notReady.failureReasons.includes('lifecycle-not-ready'));

  const noLimits = buildAcceptancePack({ ...ready, limits: null }, 'req-1');
  assert.ok(noLimits.failureReasons.includes('limits-missing'));
});

class FakeLifecycleDb {
  requests = new Map<string, Record<string, unknown>>();
  tenants = new Map<string, { lifecycle: string }>();
  limits = new Map<string, Record<string, unknown>>();
  events: string[] = [];

  async unsafe(query: string, parameters: readonly unknown[] = []) {
    if (query.includes('FROM design_partner_requests WHERE idempotency_key = $1')) {
      return [...this.requests.values()].filter((r) => r.idempotency_key === parameters[0]);
    }
    if (query.includes('FROM design_partner_requests WHERE id = $1::uuid')) {
      return [...this.requests.values()].filter((r) => r.id === parameters[0]);
    }
    if (query.includes('INSERT INTO design_partner_requests')) {
      const id = randomUUID();
      const row = {
        id,
        tenant_id: null,
        status: 'REQUESTED',
        slug: parameters[0],
        display_name: parameters[1],
        design_partner_ref: parameters[2],
        admin_subject: parameters[3],
        admin_display_name: parameters[4],
        capabilities: JSON.parse(String(parameters[5])),
        provider_connection: parameters[6],
        provider_read_only: parameters[7],
        provider_validate_only: parameters[8],
        provider_live_mutation: false,
        max_active_workflows: parameters[9],
        max_members: parameters[10],
        max_provider_connections: parameters[11],
        dispatch_concurrency: parameters[12],
        requested_by: parameters[13],
        expires_at: parameters[14],
        idempotency_key: parameters[15],
        approval_id: null,
        request_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.requests.set(id, row);
      return query.includes('RETURNING') ? [row] : [];
    }
    if (query.includes('SELECT expires_at FROM design_partner_requests')) {
      const row = this.requests.get(String(parameters[0]));
      return row ? [{ expires_at: row.expires_at }] : [];
    }
    if (query.includes('UPDATE design_partner_requests') && query.includes('status = $2')) {
      const row = this.requests.get(String(parameters[0]));
      if (!row || row.status !== parameters[3]) return [];
      row.status = parameters[1];
      if (parameters[2]) row.approval_id = parameters[2];
      return [row];
    }
    if (query.includes('FROM tenants WHERE id')) {
      const tenant = this.tenants.get(String(parameters[0]));
      return tenant ? [{ id: parameters[0], lifecycle: tenant.lifecycle }] : [];
    }
    if (query.includes('FROM design_partner_limits')) {
      const limits = this.limits.get(String(parameters[0]));
      return limits ? [limits] : [];
    }
    if (query.includes('FROM design_partner_lifecycle_events')) {
      return [];
    }
    if (query.includes('UPDATE tenants SET lifecycle')) {
      const tenant = this.tenants.get(String(parameters[0]));
      if (tenant) tenant.lifecycle = String(parameters[1]);
      return [];
    }
    if (query.includes('INSERT INTO design_partner_lifecycle_events')) {
      if (this.events.includes(String(parameters[7]))) return [];
      this.events.push(String(parameters[7]));
      return [];
    }
    return [];
  }

  async begin<T>(operation: (transaction: this) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

const baseInput = {
  slug: 'acme-partner',
  displayName: 'Acme Design Partner',
  designPartnerRef: 'DP-001',
  adminSubject: 'oidc-subject-1',
  adminDisplayName: 'Admin One',
  requestedBy: 'operator-1',
  idempotencyKey: 'req-idem-1',
};

test('request creation is idempotent and never enables provider live mutation', async () => {
  const db = new FakeLifecycleDb();
  const service = new TenantLifecycleService(db as never);
  const first = await service.createRequest(baseInput);
  const second = await service.createRequest(baseInput);
  assert.equal(second.id, first.id);
  assert.equal(second.status, 'REQUESTED');
  assert.equal(second.providerLiveMutation, false);
  assert.deepEqual(db.events, ['request:req-idem-1']);
});

test('request transitions enforce order and approval reference', async () => {
  const db = new FakeLifecycleDb();
  const service = new TenantLifecycleService(db as never);
  const created = await service.createRequest(baseInput);
  await assert.rejects(() => service.approve(created.id, 'operator-1', 'approval-1'), /TRANSITION_INVALID/, 'approve requires QUALIFIED');
  await service.qualify(created.id, 'operator-1');
  await assert.rejects(() => service.approve(created.id, 'operator-1', ''), /APPROVAL_REQUIRED/);
  const approved = await service.approve(created.id, 'operator-1', 'approval-1');
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvalId, 'approval-1');
  const again = await service.approve(created.id, 'operator-1', 'approval-1');
  assert.equal(again.status, 'APPROVED', 're-approval with the same reference is idempotent');
  await assert.rejects(() => service.qualify(created.id, 'operator-1'), /TRANSITION_INVALID/);
});

test('suspend/resume/offboard are durable transitions with audit identity', async () => {
  const db = new FakeLifecycleDb();
  const tenantId = randomUUID();
  db.tenants.set(tenantId, { lifecycle: 'ACTIVE_CONTROLLED' });
  db.limits.set(tenantId, {
    max_active_workflows: 10,
    max_members: 25,
    max_provider_connections: 2,
    dispatch_concurrency: 2,
    provider_connection_allowed: true,
    provider_read_only_allowed: true,
    provider_validate_only_allowed: false,
    provider_live_mutation_allowed: false,
  });
  const service = new TenantLifecycleService(db as never);

  await service.assertDispatchAllowed(tenantId);
  await service.assertProviderConnectionAllowed(tenantId);

  const suspended = await service.suspend(tenantId, 'operator-1', 'investigation');
  assert.equal(suspended.lifecycle, 'SUSPENDED');
  await assert.rejects(() => service.assertDispatchAllowed(tenantId), /DISPATCH_BLOCKED/);
  await assert.rejects(() => service.assertProviderConnectionAllowed(tenantId), /PROVIDER_BLOCKED/);

  const suspendedAgain = await service.suspend(tenantId, 'operator-1', 'investigation');
  assert.equal(suspendedAgain.lifecycle, 'SUSPENDED', 'repeat suspension is idempotent');

  const resumed = await service.resume(tenantId, 'operator-1');
  assert.equal(resumed.lifecycle, 'ACTIVE_CONTROLLED');
  await service.assertDispatchAllowed(tenantId);

  const offboarded = await service.offboard(tenantId, 'operator-1', 'program complete');
  assert.equal(offboarded.lifecycle, 'OFFBOARDED');
  await assert.rejects(() => service.resume(tenantId, 'operator-1'), /TRANSITION_INVALID/, 'terminal offboard cannot reactivate');
  await assert.rejects(() => service.suspend(tenantId, 'operator-1', 'again'), /TRANSITION_INVALID/);
});

test('provider connection is denied without entitlement even when lifecycle is active', async () => {
  const db = new FakeLifecycleDb();
  const tenantId = randomUUID();
  db.tenants.set(tenantId, { lifecycle: 'ACTIVE_CONTROLLED' });
  db.limits.set(tenantId, {
    max_active_workflows: 10,
    max_members: 25,
    max_provider_connections: 0,
    dispatch_concurrency: 2,
    provider_connection_allowed: false,
    provider_read_only_allowed: false,
    provider_validate_only_allowed: false,
    provider_live_mutation_allowed: false,
  });
  const service = new TenantLifecycleService(db as never);
  await service.assertDispatchAllowed(tenantId);
  await assert.rejects(() => service.assertProviderConnectionAllowed(tenantId), /NOT_ENTITLED/);
});

test('expired requests cannot be approved', async () => {
  const db = new FakeLifecycleDb();
  const service = new TenantLifecycleService(db as never);
  const created = await service.createRequest({
    ...baseInput,
    idempotencyKey: 'req-expired',
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  await service.qualify(created.id, 'operator-1');
  await assert.rejects(() => service.approve(created.id, 'operator-1', 'approval-1'), /REQUEST_EXPIRED/);
});
