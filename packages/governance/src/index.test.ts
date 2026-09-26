import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Approval,
  GovernanceAuditEvent,
  GovernanceDataDeletionRequest,
  GovernanceDataExportRequest,
  GovernanceFeatureFlag,
  GovernanceOrganizationOverride,
  GovernanceRetentionPolicy,
  GovernanceSummary,
  Permission,
  TenantContext,
} from '@platform/contracts';

import type { GovernanceStorePort } from '@platform/marketing-os-persistence';

import {
  GovernanceAuthorizationError,
  GovernanceService,
  evaluateGovernancePolicy,
} from './index.js';

class InMemoryGovernanceStore implements GovernanceStorePort {
  public readonly auditEvents: GovernanceAuditEvent[] = [];
  private readonly flags = new Map<string, GovernanceFeatureFlag>();
  private readonly exports = new Map<string, GovernanceDataExportRequest>();
  private readonly deletions = new Map<string, GovernanceDataDeletionRequest>();
  private readonly policies = new Map<string, GovernanceRetentionPolicy>();
  private readonly overrides = new Map<string, GovernanceOrganizationOverride>();

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  private assertScope(context: TenantContext, tenantId: string): void {
    if (!context.tenantId || context.tenantId !== tenantId) {
      throw new Error('Cross-tenant governance access denied');
    }
  }

  async saveFeatureFlag(context: TenantContext, flag: GovernanceFeatureFlag): Promise<void> {
    this.assertScope(context, flag.tenantId);
    this.flags.set(this.key(flag.tenantId, flag.key), flag);
  }

  async getFeatureFlag(context: TenantContext, key: string): Promise<GovernanceFeatureFlag | null> {
    return this.flags.get(this.key(context.tenantId, key)) ?? null;
  }

  async listFeatureFlags(context: TenantContext): Promise<GovernanceFeatureFlag[]> {
    return [...this.flags.values()].filter((value) => value.tenantId === context.tenantId);
  }

  async updateFeatureFlag(context: TenantContext, flag: GovernanceFeatureFlag): Promise<void> {
    await this.saveFeatureFlag(context, flag);
  }

  async saveDataExportRequest(
    context: TenantContext,
    request: GovernanceDataExportRequest,
  ): Promise<void> {
    this.assertScope(context, request.tenantId);
    this.exports.set(this.key(request.tenantId, request.id), request);
  }

  async getDataExportRequest(
    context: TenantContext,
    requestId: string,
  ): Promise<GovernanceDataExportRequest | null> {
    return this.exports.get(this.key(context.tenantId, requestId)) ?? null;
  }

  async listDataExportRequests(context: TenantContext): Promise<GovernanceDataExportRequest[]> {
    return [...this.exports.values()].filter((value) => value.tenantId === context.tenantId);
  }

  async updateDataExportRequest(
    context: TenantContext,
    request: GovernanceDataExportRequest,
  ): Promise<void> {
    await this.saveDataExportRequest(context, request);
  }

  async saveDataDeletionRequest(
    context: TenantContext,
    request: GovernanceDataDeletionRequest,
  ): Promise<void> {
    this.assertScope(context, request.tenantId);
    this.deletions.set(this.key(request.tenantId, request.id), request);
  }

  async getDataDeletionRequest(
    context: TenantContext,
    requestId: string,
  ): Promise<GovernanceDataDeletionRequest | null> {
    return this.deletions.get(this.key(context.tenantId, requestId)) ?? null;
  }

  async listDataDeletionRequests(context: TenantContext): Promise<GovernanceDataDeletionRequest[]> {
    return [...this.deletions.values()].filter((value) => value.tenantId === context.tenantId);
  }

  async updateDataDeletionRequest(
    context: TenantContext,
    request: GovernanceDataDeletionRequest,
  ): Promise<void> {
    await this.saveDataDeletionRequest(context, request);
  }

  async saveRetentionPolicy(
    context: TenantContext,
    policy: GovernanceRetentionPolicy,
  ): Promise<void> {
    this.assertScope(context, policy.tenantId);
    this.policies.set(this.key(policy.tenantId, policy.resourceType), policy);
  }

  async getRetentionPolicy(
    context: TenantContext,
    resourceType: string,
  ): Promise<GovernanceRetentionPolicy | null> {
    return this.policies.get(this.key(context.tenantId, resourceType)) ?? null;
  }

  async listRetentionPolicies(context: TenantContext): Promise<GovernanceRetentionPolicy[]> {
    return [...this.policies.values()].filter((value) => value.tenantId === context.tenantId);
  }

  async updateRetentionPolicy(
    context: TenantContext,
    policy: GovernanceRetentionPolicy,
  ): Promise<void> {
    await this.saveRetentionPolicy(context, policy);
  }

  async saveOrganizationOverride(
    context: TenantContext,
    override: GovernanceOrganizationOverride,
  ): Promise<void> {
    this.assertScope(context, override.tenantId);
    this.overrides.set(this.key(override.tenantId, override.key), override);
  }

  async getOrganizationOverride(
    context: TenantContext,
    key: string,
  ): Promise<GovernanceOrganizationOverride | null> {
    return this.overrides.get(this.key(context.tenantId, key)) ?? null;
  }

  async listOrganizationOverrides(
    context: TenantContext,
  ): Promise<GovernanceOrganizationOverride[]> {
    return [...this.overrides.values()].filter((value) => value.tenantId === context.tenantId);
  }

  async updateOrganizationOverride(
    context: TenantContext,
    override: GovernanceOrganizationOverride,
  ): Promise<void> {
    await this.saveOrganizationOverride(context, override);
  }

  async appendAuditEvent(context: TenantContext, event: GovernanceAuditEvent): Promise<void> {
    this.assertScope(context, event.tenantId);
    if (!this.auditEvents.some((existing) => existing.id === event.id)) {
      this.auditEvents.push(event);
    }
  }

  async listAuditEvents(context: TenantContext): Promise<GovernanceAuditEvent[]> {
    return this.auditEvents.filter((event) => event.tenantId === context.tenantId);
  }

  async getSummary(context: TenantContext): Promise<GovernanceSummary> {
    const [flags, exports, deletions, policies, overrides, auditEvents] = await Promise.all([
      this.listFeatureFlags(context),
      this.listDataExportRequests(context),
      this.listDataDeletionRequests(context),
      this.listRetentionPolicies(context),
      this.listOrganizationOverrides(context),
      this.listAuditEvents(context),
    ]);
    return {
      tenantId: context.tenantId,
      featureFlagCount: flags.length,
      dataExportRequestCount: exports.length,
      dataDeletionRequestCount: deletions.length,
      retentionPolicyCount: policies.length,
      organizationOverrideCount: overrides.length,
      auditEventCount: auditEvents.length,
    };
  }
}

function context(permissions: Permission[], tenantId = 'tenant-a'): TenantContext {
  return {
    tenantId,
    userId: `${tenantId}-user`,
    roles: ['tenant_admin'],
    permissions,
    locale: 'en',
  };
}

function service(store: InMemoryGovernanceStore): GovernanceService {
  let nextId = 0;
  return new GovernanceService(store, {
    now: () => '2026-09-03T00:00:00.000Z',
    createId: () => `id-${++nextId}`,
  });
}

test('policy allows an explicitly permitted tenant-scoped operation', () => {
  const decision = evaluateGovernancePolicy({
    context: context(['organization:read']),
    tenantId: 'tenant-a',
    permission: 'organization:read',
    requiredRoles: ['tenant_admin'],
  });
  assert.equal(decision.allowed, true);
});

test('policy denies a missing permission and a cross-tenant request', () => {
  assert.equal(
    evaluateGovernancePolicy({
      context: context(['organization:read']),
      tenantId: 'tenant-a',
      permission: 'organization:manage',
    }).allowed,
    false,
  );

  assert.equal(
    evaluateGovernancePolicy({
      context: context(['organization:read']),
      tenantId: 'tenant-b',
      permission: 'organization:read',
    }).allowed,
    false,
  );
});

test('policy evaluates supplied entitlement, entity scope, and approval requirements', () => {
  const permitted = context(['organization:manage']);
  const base = {
    context: permitted,
    tenantId: 'tenant-a',
    permission: 'organization:manage' as const,
  };

  assert.deepEqual(
    evaluateGovernancePolicy({
      ...base,
      entitlement: {
        tenantId: 'tenant-a',
        key: 'governance',
        allowed: false,
        source: 'PLAN',
        reason: 'disabled',
      },
    }).reasons,
    ['ENTITLEMENT_DENIED'],
  );
  assert.deepEqual(
    evaluateGovernancePolicy({
      ...base,
      entityScope: { tenantId: 'tenant-a', ownerUserId: 'another-user' },
    }).reasons,
    ['ENTITY_SCOPE_DENIED'],
  );
  assert.deepEqual(
    evaluateGovernancePolicy({
      ...base,
      approval: { tenantId: 'tenant-a', required: true, approved: false },
    }).reasons,
    ['APPROVAL_REQUIRED'],
  );
  assert.equal(
    evaluateGovernancePolicy({
      ...base,
      entitlement: {
        tenantId: 'tenant-a',
        key: 'governance',
        allowed: true,
        source: 'PLAN',
        reason: 'enabled',
      },
      entityScope: { tenantId: 'tenant-a', ownerUserId: 'tenant-a-user' },
      approval: { tenantId: 'tenant-a', required: true, approved: true },
    }).allowed,
    true,
  );
});

test('feature flags cannot grant a permission or bypass authorization', async () => {
  const store = new InMemoryGovernanceStore();
  const governance = service(store);
  const manager = context(['feature_flag:manage']);
  await governance.setFeatureFlag(manager, { key: 'exports', enabled: true });

  await assert.rejects(
    () => governance.isFeatureEnabled(manager, 'exports', 'data_export:request'),
    GovernanceAuthorizationError,
  );
});

test('organization overrides resolve only for their tenant and while active', async () => {
  const store = new InMemoryGovernanceStore();
  const governance = service(store);
  const admin = context(['organization:manage', 'organization:read']);
  await governance.setOrganizationOverride(admin, {
    key: 'security.session',
    value: { maxAgeMinutes: 30 },
    active: true,
  });

  assert.deepEqual(
    (await governance.resolveOrganizationOverride(admin, 'security.session'))?.value,
    {
      maxAgeMinutes: 30,
    },
  );
  assert.equal(
    await governance.resolveOrganizationOverride(
      context(['organization:read'], 'tenant-b'),
      'security.session',
    ),
    null,
  );
});

test('data export requests require explicit export permission', async () => {
  const governance = service(new InMemoryGovernanceStore());
  await assert.rejects(
    () =>
      governance.requestDataExport(context(['organization:read']), { resourceTypes: ['contacts'] }),
    GovernanceAuthorizationError,
  );
});

test('data export request lifecycle is tenant scoped', async () => {
  const store = new InMemoryGovernanceStore();
  const governance = service(store);
  const requester = context(['data_export:request', 'data_export:read']);
  const request = await governance.requestDataExport(requester, {
    resourceTypes: ['contacts'],
    filters: { status: 'active' },
  });
  assert.equal(request.status, 'REQUESTED');
  assert.equal((await governance.listDataExportRequests(requester)).length, 1);
  assert.equal(
    (await governance.listDataExportRequests(context(['data_export:read'], 'tenant-b'))).length,
    0,
  );
});

test('data deletion requests require explicit deletion permission', async () => {
  const governance = service(new InMemoryGovernanceStore());
  await assert.rejects(
    () =>
      governance.requestDataDeletion(context(['organization:read']), {
        resourceTypes: ['contacts'],
        reason: 'customer request',
      }),
    GovernanceAuthorizationError,
  );
});

test('destructive deletion remains approval-gated and never executes data deletion', async () => {
  const store = new InMemoryGovernanceStore();
  const governance = service(store);
  const requester = context(['data_deletion:request']);
  const request = await governance.requestDataDeletion(requester, {
    resourceTypes: ['contacts'],
    reason: 'customer request',
  });
  const operator = context(['data_deletion:manage']);
  const denied = governance.evaluateDeletionExecution(operator, request, undefined);
  assert.equal(denied.allowed, false);
  assert.deepEqual(denied.reasons, ['APPROVAL_REQUIRED']);

  const approval: Approval = {
    id: 'approval-1',
    tenantId: 'tenant-a',
    artifactId: request.id,
    decision: 'approved',
  };
  const approved = await governance.approveDataDeletionRequest(operator, request, approval);
  assert.equal(approved.status, 'APPROVED');
  assert.equal(
    typeof (governance as unknown as { executeDataDeletion?: unknown }).executeDataDeletion,
    'undefined',
  );
});

test('retention policies are tenant isolated', async () => {
  const store = new InMemoryGovernanceStore();
  const governance = service(store);
  const admin = context(['retention_policy:manage', 'retention_policy:read']);
  await governance.setRetentionPolicy(admin, {
    resourceType: 'audit_events',
    retentionDays: 365,
    disposition: 'ARCHIVE',
    enabled: true,
  });
  assert.equal((await governance.getRetentionPolicy(admin, 'audit_events'))?.retentionDays, 365);
  assert.equal(
    (await governance.evaluateRetentionPolicy(admin, 'audit_events', '2025-09-02T00:00:00.000Z'))
      .retentionDue,
    true,
  );
  assert.equal(
    await governance.getRetentionPolicy(
      context(['retention_policy:read'], 'tenant-b'),
      'audit_events',
    ),
    null,
  );
});

test('audit events are append-only and redact secrets', async () => {
  const store = new InMemoryGovernanceStore();
  const governance = service(store);
  const admin = context(['organization:manage', 'audit:read']);
  await governance.recordAuditEvent(admin, {
    type: 'governance.security.updated',
    correlationId: 'change-1',
    payload: {
      change: 'session',
      providerCredential: 'must-not-persist',
      nested: { apiToken: 'never' },
    },
  });
  await governance.recordAuditEvent(admin, {
    type: 'governance.security.updated',
    correlationId: 'change-2',
    payload: { change: 'retention' },
  });
  const events = await governance.listAuditEvents(admin);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0]?.payload, { change: 'session', nested: {} });
  assert.equal('updateAuditEvent' in store, false);
  assert.equal('deleteAuditEvent' in store, false);
});

test('governance summaries are tenant isolated', async () => {
  const store = new InMemoryGovernanceStore();
  const governance = service(store);
  const tenantA = context(['feature_flag:manage', 'organization:read', 'audit:read']);
  await governance.setFeatureFlag(tenantA, { key: 'flag-a', enabled: true });
  const summaryA = await governance.getSummary(tenantA);
  const summaryB = await governance.getSummary(
    context(['organization:read', 'audit:read'], 'tenant-b'),
  );
  assert.equal(summaryA.featureFlagCount, 1);
  assert.equal(summaryA.auditEventCount, 1);
  assert.equal(summaryB.featureFlagCount, 0);
  assert.equal(summaryB.auditEventCount, 0);
});
