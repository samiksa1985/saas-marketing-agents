import { sql } from 'drizzle-orm';

import type {
  GovernanceAuditEvent,
  GovernanceDataDeletionRequest,
  GovernanceDataExportRequest,
  GovernanceFeatureFlag,
  GovernanceOrganizationOverride,
  GovernanceRetentionPolicy,
  GovernanceSummary,
  TenantContext,
} from '@platform/contracts';

interface ExecuteResult {
  rows?: unknown[];
  [key: string]: unknown;
}

export interface GovernancePersistenceDatabase {
  execute(query: unknown): Promise<ExecuteResult | unknown[]>;
}

export class GovernanceStoreError extends Error {}

export interface GovernanceStorePort {
  saveFeatureFlag(context: TenantContext, flag: GovernanceFeatureFlag): Promise<void>;
  getFeatureFlag(context: TenantContext, key: string): Promise<GovernanceFeatureFlag | null>;
  listFeatureFlags(context: TenantContext): Promise<GovernanceFeatureFlag[]>;
  updateFeatureFlag(context: TenantContext, flag: GovernanceFeatureFlag): Promise<void>;
  saveDataExportRequest(
    context: TenantContext,
    request: GovernanceDataExportRequest,
  ): Promise<void>;
  getDataExportRequest(
    context: TenantContext,
    requestId: string,
  ): Promise<GovernanceDataExportRequest | null>;
  listDataExportRequests(context: TenantContext): Promise<GovernanceDataExportRequest[]>;
  updateDataExportRequest(
    context: TenantContext,
    request: GovernanceDataExportRequest,
  ): Promise<void>;
  saveDataDeletionRequest(
    context: TenantContext,
    request: GovernanceDataDeletionRequest,
  ): Promise<void>;
  getDataDeletionRequest(
    context: TenantContext,
    requestId: string,
  ): Promise<GovernanceDataDeletionRequest | null>;
  listDataDeletionRequests(context: TenantContext): Promise<GovernanceDataDeletionRequest[]>;
  updateDataDeletionRequest(
    context: TenantContext,
    request: GovernanceDataDeletionRequest,
  ): Promise<void>;
  saveRetentionPolicy(context: TenantContext, policy: GovernanceRetentionPolicy): Promise<void>;
  getRetentionPolicy(
    context: TenantContext,
    resourceType: string,
  ): Promise<GovernanceRetentionPolicy | null>;
  listRetentionPolicies(context: TenantContext): Promise<GovernanceRetentionPolicy[]>;
  updateRetentionPolicy(context: TenantContext, policy: GovernanceRetentionPolicy): Promise<void>;
  saveOrganizationOverride(
    context: TenantContext,
    override: GovernanceOrganizationOverride,
  ): Promise<void>;
  getOrganizationOverride(
    context: TenantContext,
    key: string,
  ): Promise<GovernanceOrganizationOverride | null>;
  listOrganizationOverrides(context: TenantContext): Promise<GovernanceOrganizationOverride[]>;
  updateOrganizationOverride(
    context: TenantContext,
    override: GovernanceOrganizationOverride,
  ): Promise<void>;
  appendAuditEvent(context: TenantContext, event: GovernanceAuditEvent): Promise<void>;
  listAuditEvents(context: TenantContext): Promise<GovernanceAuditEvent[]>;
  getSummary(context: TenantContext): Promise<GovernanceSummary>;
}

function rowsOf(result: ExecuteResult | unknown[]): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }

  if (result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }

  return [];
}

function assertTenant(context: TenantContext, tenantId: string): void {
  if (!context?.tenantId) {
    throw new GovernanceStoreError('Tenant context is required');
  }

  if (context.tenantId !== tenantId) {
    throw new GovernanceStoreError('Cross-tenant governance access denied');
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === 'string' ? value : new Date(0).toISOString();
}

function stringValue(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function booleanValue(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true;
}

function featureFlagFromRow(row: Record<string, unknown>): GovernanceFeatureFlag {
  const description = stringValue(row, 'description');
  return {
    id: stringValue(row, 'id'),
    tenantId: stringValue(row, 'tenant_id'),
    key: stringValue(row, 'key'),
    enabled: booleanValue(row, 'enabled'),
    ...(description ? { description } : {}),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function dataExportFromRow(row: Record<string, unknown>): GovernanceDataExportRequest {
  const approvalId = stringValue(row, 'approval_id');
  return {
    id: stringValue(row, 'id'),
    tenantId: stringValue(row, 'tenant_id'),
    requestedBy: stringValue(row, 'requested_by'),
    resourceTypes: asStringArray(row.resource_types),
    filters: asRecord(row.filters),
    status: stringValue(row, 'status') as GovernanceDataExportRequest['status'],
    ...(approvalId ? { approvalId } : {}),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function dataDeletionFromRow(row: Record<string, unknown>): GovernanceDataDeletionRequest {
  const approvalId = stringValue(row, 'approval_id');
  return {
    id: stringValue(row, 'id'),
    tenantId: stringValue(row, 'tenant_id'),
    requestedBy: stringValue(row, 'requested_by'),
    resourceTypes: asStringArray(row.resource_types),
    selectors: asRecord(row.selectors),
    reason: stringValue(row, 'reason'),
    status: stringValue(row, 'status') as GovernanceDataDeletionRequest['status'],
    ...(approvalId ? { approvalId } : {}),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function retentionPolicyFromRow(row: Record<string, unknown>): GovernanceRetentionPolicy {
  return {
    id: stringValue(row, 'id'),
    tenantId: stringValue(row, 'tenant_id'),
    resourceType: stringValue(row, 'resource_type'),
    retentionDays: Number(row.retention_days ?? 0),
    disposition: stringValue(row, 'disposition') as GovernanceRetentionPolicy['disposition'],
    enabled: booleanValue(row, 'enabled'),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function organizationOverrideFromRow(row: Record<string, unknown>): GovernanceOrganizationOverride {
  const reason = stringValue(row, 'reason');
  const expiresAt = row.expires_at ? asIso(row.expires_at) : undefined;
  return {
    id: stringValue(row, 'id'),
    tenantId: stringValue(row, 'tenant_id'),
    key: stringValue(row, 'key'),
    value: asRecord(row.value),
    ...(reason ? { reason } : {}),
    active: booleanValue(row, 'active'),
    ...(expiresAt ? { expiresAt } : {}),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function auditEventFromRow(row: Record<string, unknown>): GovernanceAuditEvent {
  const actorId = stringValue(row, 'actor_id');
  return {
    id: stringValue(row, 'id'),
    tenantId: stringValue(row, 'tenant_id'),
    type: stringValue(row, 'type'),
    actorType: stringValue(row, 'actor_type') as GovernanceAuditEvent['actorType'],
    ...(actorId ? { actorId } : {}),
    correlationId: stringValue(row, 'correlation_id'),
    occurredAt: asIso(row.occurred_at),
    payload: asRecord(row.payload),
  };
}

export class GovernanceStore implements GovernanceStorePort {
  constructor(private readonly db: GovernancePersistenceDatabase) {}

  async saveFeatureFlag(context: TenantContext, flag: GovernanceFeatureFlag): Promise<void> {
    assertTenant(context, flag.tenantId);
    await this.db.execute(sql`
      INSERT INTO governance_feature_flags (id, tenant_id, key, enabled, description, created_at, updated_at)
      VALUES (${flag.id}::uuid, ${flag.tenantId}::uuid, ${flag.key}, ${flag.enabled}, ${flag.description ?? null}, ${flag.createdAt}::timestamptz, ${flag.updatedAt}::timestamptz)
      ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled, description = EXCLUDED.description, updated_at = EXCLUDED.updated_at
    `);
  }

  async getFeatureFlag(context: TenantContext, key: string): Promise<GovernanceFeatureFlag | null> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_feature_flags WHERE tenant_id = ${context.tenantId}::uuid AND key = ${key} LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? featureFlagFromRow(row) : null;
  }

  async listFeatureFlags(context: TenantContext): Promise<GovernanceFeatureFlag[]> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_feature_flags WHERE tenant_id = ${context.tenantId}::uuid ORDER BY key ASC
    `);
    return rowsOf(result).map(featureFlagFromRow);
  }

  async updateFeatureFlag(context: TenantContext, flag: GovernanceFeatureFlag): Promise<void> {
    await this.saveFeatureFlag(context, flag);
  }

  async saveDataExportRequest(
    context: TenantContext,
    request: GovernanceDataExportRequest,
  ): Promise<void> {
    assertTenant(context, request.tenantId);
    await this.db.execute(sql`
      INSERT INTO governance_data_export_requests (id, tenant_id, requested_by, resource_types, filters, status, approval_id, created_at, updated_at)
      VALUES (${request.id}::uuid, ${request.tenantId}::uuid, ${request.requestedBy}::uuid, ${JSON.stringify(request.resourceTypes)}::jsonb, ${JSON.stringify(request.filters)}::jsonb, ${request.status}, ${request.approvalId ?? null}::uuid, ${request.createdAt}::timestamptz, ${request.updatedAt}::timestamptz)
    `);
  }

  async getDataExportRequest(
    context: TenantContext,
    requestId: string,
  ): Promise<GovernanceDataExportRequest | null> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_data_export_requests WHERE tenant_id = ${context.tenantId}::uuid AND id = ${requestId}::uuid LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? dataExportFromRow(row) : null;
  }

  async listDataExportRequests(context: TenantContext): Promise<GovernanceDataExportRequest[]> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_data_export_requests WHERE tenant_id = ${context.tenantId}::uuid ORDER BY created_at DESC
    `);
    return rowsOf(result).map(dataExportFromRow);
  }

  async updateDataExportRequest(
    context: TenantContext,
    request: GovernanceDataExportRequest,
  ): Promise<void> {
    assertTenant(context, request.tenantId);
    await this.db.execute(sql`
      UPDATE governance_data_export_requests SET resource_types = ${JSON.stringify(request.resourceTypes)}::jsonb, filters = ${JSON.stringify(request.filters)}::jsonb, status = ${request.status}, approval_id = ${request.approvalId ?? null}::uuid, updated_at = ${request.updatedAt}::timestamptz
      WHERE tenant_id = ${request.tenantId}::uuid AND id = ${request.id}::uuid
    `);
  }

  async saveDataDeletionRequest(
    context: TenantContext,
    request: GovernanceDataDeletionRequest,
  ): Promise<void> {
    assertTenant(context, request.tenantId);
    await this.db.execute(sql`
      INSERT INTO governance_data_deletion_requests (id, tenant_id, requested_by, resource_types, selectors, reason, status, approval_id, created_at, updated_at)
      VALUES (${request.id}::uuid, ${request.tenantId}::uuid, ${request.requestedBy}::uuid, ${JSON.stringify(request.resourceTypes)}::jsonb, ${JSON.stringify(request.selectors)}::jsonb, ${request.reason}, ${request.status}, ${request.approvalId ?? null}::uuid, ${request.createdAt}::timestamptz, ${request.updatedAt}::timestamptz)
    `);
  }

  async getDataDeletionRequest(
    context: TenantContext,
    requestId: string,
  ): Promise<GovernanceDataDeletionRequest | null> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_data_deletion_requests WHERE tenant_id = ${context.tenantId}::uuid AND id = ${requestId}::uuid LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? dataDeletionFromRow(row) : null;
  }

  async listDataDeletionRequests(context: TenantContext): Promise<GovernanceDataDeletionRequest[]> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_data_deletion_requests WHERE tenant_id = ${context.tenantId}::uuid ORDER BY created_at DESC
    `);
    return rowsOf(result).map(dataDeletionFromRow);
  }

  async updateDataDeletionRequest(
    context: TenantContext,
    request: GovernanceDataDeletionRequest,
  ): Promise<void> {
    assertTenant(context, request.tenantId);
    await this.db.execute(sql`
      UPDATE governance_data_deletion_requests SET resource_types = ${JSON.stringify(request.resourceTypes)}::jsonb, selectors = ${JSON.stringify(request.selectors)}::jsonb, reason = ${request.reason}, status = ${request.status}, approval_id = ${request.approvalId ?? null}::uuid, updated_at = ${request.updatedAt}::timestamptz
      WHERE tenant_id = ${request.tenantId}::uuid AND id = ${request.id}::uuid
    `);
  }

  async saveRetentionPolicy(
    context: TenantContext,
    policy: GovernanceRetentionPolicy,
  ): Promise<void> {
    assertTenant(context, policy.tenantId);
    await this.db.execute(sql`
      INSERT INTO governance_retention_policies (id, tenant_id, resource_type, retention_days, disposition, enabled, created_at, updated_at)
      VALUES (${policy.id}::uuid, ${policy.tenantId}::uuid, ${policy.resourceType}, ${policy.retentionDays}, ${policy.disposition}, ${policy.enabled}, ${policy.createdAt}::timestamptz, ${policy.updatedAt}::timestamptz)
      ON CONFLICT (tenant_id, resource_type) DO UPDATE SET retention_days = EXCLUDED.retention_days, disposition = EXCLUDED.disposition, enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
    `);
  }

  async getRetentionPolicy(
    context: TenantContext,
    resourceType: string,
  ): Promise<GovernanceRetentionPolicy | null> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_retention_policies WHERE tenant_id = ${context.tenantId}::uuid AND resource_type = ${resourceType} LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? retentionPolicyFromRow(row) : null;
  }

  async listRetentionPolicies(context: TenantContext): Promise<GovernanceRetentionPolicy[]> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_retention_policies WHERE tenant_id = ${context.tenantId}::uuid ORDER BY resource_type ASC
    `);
    return rowsOf(result).map(retentionPolicyFromRow);
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
    assertTenant(context, override.tenantId);
    await this.db.execute(sql`
      INSERT INTO governance_organization_overrides (id, tenant_id, key, value, reason, active, expires_at, created_at, updated_at)
      VALUES (${override.id}::uuid, ${override.tenantId}::uuid, ${override.key}, ${JSON.stringify(override.value)}::jsonb, ${override.reason ?? null}, ${override.active}, ${override.expiresAt ?? null}::timestamptz, ${override.createdAt}::timestamptz, ${override.updatedAt}::timestamptz)
      ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, reason = EXCLUDED.reason, active = EXCLUDED.active, expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at
    `);
  }

  async getOrganizationOverride(
    context: TenantContext,
    key: string,
  ): Promise<GovernanceOrganizationOverride | null> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_organization_overrides WHERE tenant_id = ${context.tenantId}::uuid AND key = ${key} LIMIT 1
    `);
    const row = rowsOf(result)[0];
    return row ? organizationOverrideFromRow(row) : null;
  }

  async listOrganizationOverrides(
    context: TenantContext,
  ): Promise<GovernanceOrganizationOverride[]> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM governance_organization_overrides WHERE tenant_id = ${context.tenantId}::uuid ORDER BY key ASC
    `);
    return rowsOf(result).map(organizationOverrideFromRow);
  }

  async updateOrganizationOverride(
    context: TenantContext,
    override: GovernanceOrganizationOverride,
  ): Promise<void> {
    await this.saveOrganizationOverride(context, override);
  }

  async appendAuditEvent(context: TenantContext, event: GovernanceAuditEvent): Promise<void> {
    assertTenant(context, event.tenantId);
    await this.db.execute(sql`
      INSERT INTO audit_events (id, tenant_id, type, actor_type, actor_id, correlation_id, payload, occurred_at)
      VALUES (${event.id}::uuid, ${event.tenantId}::uuid, ${event.type}, ${event.actorType}, ${event.actorId ?? null}::uuid, ${event.correlationId}, ${JSON.stringify(event.payload)}::jsonb, ${event.occurredAt}::timestamptz)
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async listAuditEvents(context: TenantContext): Promise<GovernanceAuditEvent[]> {
    assertTenant(context, context.tenantId);
    const result = await this.db.execute(sql`
      SELECT * FROM audit_events WHERE tenant_id = ${context.tenantId}::uuid ORDER BY occurred_at DESC
    `);
    return rowsOf(result).map(auditEventFromRow);
  }

  async getSummary(context: TenantContext): Promise<GovernanceSummary> {
    assertTenant(context, context.tenantId);
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
