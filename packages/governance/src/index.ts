import { randomUUID } from 'node:crypto';

import { isApprovalTerminal } from '@platform/approvals';

import type {
  Approval,
  EntitlementDecision,
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
  evaluateGovernancePolicy,
  type GovernanceApprovalRequirement,
  type GovernanceEntityScope,
  type GovernancePolicyDecision,
  type GovernancePolicyInput,
} from './policy.js';

export * from './policy.js';

export class GovernanceAuthorizationError extends Error {}

export interface GovernanceServiceOptions {
  now?: () => string;
  createId?: () => string;
}

export interface CreateDataExportRequestInput {
  resourceTypes: string[];
  filters?: Record<string, unknown>;
}

export interface CreateDataDeletionRequestInput {
  resourceTypes: string[];
  selectors?: Record<string, unknown>;
  reason: string;
}

export interface RecordGovernanceAuditInput {
  type: string;
  correlationId: string;
  payload: Record<string, unknown>;
  requiredPermission?: Permission;
}

export interface RetentionPolicyEvaluation {
  policy: GovernanceRetentionPolicy | null;
  retentionDue: boolean;
}

const SENSITIVE_AUDIT_KEY =
  /secret|password|token|credential|authorization|api[_-]?key|private[_-]?key/i;

function requireUser(context: TenantContext): string {
  if (!context.userId) {
    throw new GovernanceAuthorizationError('Authenticated user context is required');
  }

  return context.userId;
}

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_AUDIT_KEY.test(key))
        .map(([key, nestedValue]) => [key, sanitizeAuditValue(nestedValue)]),
    );
  }

  return value;
}

function approvalSatisfied(approval: Approval): boolean {
  return (
    isApprovalTerminal(approval.decision) &&
    (approval.decision === 'approved' || approval.decision === 'approved_with_conditions')
  );
}

/**
 * Canonical Admin & Governance service.  It composes the existing tenant
 * guard, RBAC permissions, approval model, entitlement decisions, persistence,
 * and audit log; it never performs customer-data deletion itself.
 */
export class GovernanceService {
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(
    private readonly store: GovernanceStorePort,
    options: GovernanceServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? randomUUID;
  }

  evaluateAuthorization(input: GovernancePolicyInput): GovernancePolicyDecision {
    return evaluateGovernancePolicy(input);
  }

  private authorize(input: GovernancePolicyInput): void {
    const decision = this.evaluateAuthorization(input);
    if (!decision.allowed) {
      throw new GovernanceAuthorizationError(
        `Governance authorization denied: ${decision.reasons.join(',')}`,
      );
    }
  }

  async isFeatureEnabled(
    context: TenantContext,
    key: string,
    requiredPermission: Permission,
    entitlement?: EntitlementDecision,
    entityScope?: GovernanceEntityScope,
    approval?: GovernanceApprovalRequirement,
  ): Promise<boolean> {
    this.authorize({
      context,
      tenantId: context.tenantId,
      permission: requiredPermission,
      ...(entitlement ? { entitlement } : {}),
      ...(entityScope ? { entityScope } : {}),
      ...(approval ? { approval } : {}),
    });
    const flag = await this.store.getFeatureFlag(context, key);
    return flag?.enabled === true;
  }

  async getFeatureFlag(context: TenantContext, key: string): Promise<GovernanceFeatureFlag | null> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'feature_flag:read' });
    return this.store.getFeatureFlag(context, key);
  }

  async setFeatureFlag(
    context: TenantContext,
    input: Omit<GovernanceFeatureFlag, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    },
  ): Promise<GovernanceFeatureFlag> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'feature_flag:manage' });
    const timestamp = this.now();
    const flag: GovernanceFeatureFlag = {
      id: input.id ?? this.createId(),
      tenantId: context.tenantId,
      key: input.key,
      enabled: input.enabled,
      ...(input.description ? { description: input.description } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.updateFeatureFlag(context, flag);
    await this.recordPrivilegedAudit(context, 'governance.feature_flag.updated', flag.id, {
      key: flag.key,
      enabled: flag.enabled,
    });
    return flag;
  }

  async requestDataExport(
    context: TenantContext,
    input: CreateDataExportRequestInput,
  ): Promise<GovernanceDataExportRequest> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'data_export:request' });
    const timestamp = this.now();
    const request: GovernanceDataExportRequest = {
      id: this.createId(),
      tenantId: context.tenantId,
      requestedBy: requireUser(context),
      resourceTypes: [...input.resourceTypes],
      filters: input.filters ?? {},
      status: 'REQUESTED',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.saveDataExportRequest(context, request);
    await this.recordPrivilegedAudit(context, 'governance.data_export.requested', request.id, {
      resourceTypes: request.resourceTypes,
    });
    return request;
  }

  async listDataExportRequests(context: TenantContext): Promise<GovernanceDataExportRequest[]> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'data_export:read' });
    return this.store.listDataExportRequests(context);
  }

  async updateDataExportRequest(
    context: TenantContext,
    request: GovernanceDataExportRequest,
  ): Promise<void> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'data_export:manage' });
    if (request.tenantId !== context.tenantId) {
      throw new GovernanceAuthorizationError('Cross-tenant governance access denied');
    }
    await this.store.updateDataExportRequest(context, {
      ...request,
      updatedAt: this.now(),
    });
    await this.recordPrivilegedAudit(context, 'governance.data_export.updated', request.id, {
      status: request.status,
    });
  }

  async requestDataDeletion(
    context: TenantContext,
    input: CreateDataDeletionRequestInput,
  ): Promise<GovernanceDataDeletionRequest> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'data_deletion:request' });
    const timestamp = this.now();
    const request: GovernanceDataDeletionRequest = {
      id: this.createId(),
      tenantId: context.tenantId,
      requestedBy: requireUser(context),
      resourceTypes: [...input.resourceTypes],
      selectors: input.selectors ?? {},
      reason: input.reason,
      status: 'APPROVAL_REQUIRED',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.saveDataDeletionRequest(context, request);
    await this.recordPrivilegedAudit(context, 'governance.data_deletion.requested', request.id, {
      resourceTypes: request.resourceTypes,
      reason: request.reason,
      approvalRequired: true,
    });
    return request;
  }

  async listDataDeletionRequests(context: TenantContext): Promise<GovernanceDataDeletionRequest[]> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'data_deletion:read' });
    return this.store.listDataDeletionRequests(context);
  }

  evaluateDeletionExecution(
    context: TenantContext,
    request: GovernanceDataDeletionRequest,
    approval: Approval | undefined,
  ): GovernancePolicyDecision {
    return this.evaluateAuthorization({
      context,
      tenantId: request.tenantId,
      permission: 'data_deletion:manage',
      approval: {
        tenantId: approval?.tenantId ?? request.tenantId,
        required: true,
        approved: approval ? approvalSatisfied(approval) : false,
      },
    });
  }

  async approveDataDeletionRequest(
    context: TenantContext,
    request: GovernanceDataDeletionRequest,
    approval: Approval,
  ): Promise<GovernanceDataDeletionRequest> {
    const decision = this.evaluateDeletionExecution(context, request, approval);
    if (!decision.allowed) {
      throw new GovernanceAuthorizationError(
        `Governance authorization denied: ${decision.reasons.join(',')}`,
      );
    }
    const approvedRequest: GovernanceDataDeletionRequest = {
      ...request,
      status: 'APPROVED',
      approvalId: approval.id,
      updatedAt: this.now(),
    };
    await this.store.updateDataDeletionRequest(context, approvedRequest);
    await this.recordPrivilegedAudit(context, 'governance.data_deletion.approved', request.id, {
      approvalId: approval.id,
      executionMode: 'REQUEST_ONLY_NO_PHYSICAL_DELETION',
    });
    return approvedRequest;
  }

  async setRetentionPolicy(
    context: TenantContext,
    input: Omit<GovernanceRetentionPolicy, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    },
  ): Promise<GovernanceRetentionPolicy> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'retention_policy:manage' });
    if (!Number.isInteger(input.retentionDays) || input.retentionDays < 0) {
      throw new Error('Retention days must be a non-negative integer');
    }
    const timestamp = this.now();
    const policy: GovernanceRetentionPolicy = {
      id: input.id ?? this.createId(),
      tenantId: context.tenantId,
      resourceType: input.resourceType,
      retentionDays: input.retentionDays,
      disposition: input.disposition,
      enabled: input.enabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.updateRetentionPolicy(context, policy);
    await this.recordPrivilegedAudit(context, 'governance.retention_policy.updated', policy.id, {
      resourceType: policy.resourceType,
      retentionDays: policy.retentionDays,
      disposition: policy.disposition,
    });
    return policy;
  }

  async getRetentionPolicy(
    context: TenantContext,
    resourceType: string,
  ): Promise<GovernanceRetentionPolicy | null> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'retention_policy:read' });
    return this.store.getRetentionPolicy(context, resourceType);
  }

  async evaluateRetentionPolicy(
    context: TenantContext,
    resourceType: string,
    recordCreatedAt: string,
  ): Promise<RetentionPolicyEvaluation> {
    const policy = await this.getRetentionPolicy(context, resourceType);
    if (!policy || !policy.enabled) {
      return { policy: null, retentionDue: false };
    }

    const retentionAt = new Date(recordCreatedAt).getTime() + policy.retentionDays * 86_400_000;
    return {
      policy,
      retentionDue: retentionAt <= new Date(this.now()).getTime(),
    };
  }

  async setOrganizationOverride(
    context: TenantContext,
    input: Omit<GovernanceOrganizationOverride, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    },
  ): Promise<GovernanceOrganizationOverride> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'organization:manage' });
    const timestamp = this.now();
    const override: GovernanceOrganizationOverride = {
      id: input.id ?? this.createId(),
      tenantId: context.tenantId,
      key: input.key,
      value: { ...input.value },
      ...(input.reason ? { reason: input.reason } : {}),
      active: input.active,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.updateOrganizationOverride(context, override);
    await this.recordPrivilegedAudit(
      context,
      'governance.organization_override.updated',
      override.id,
      {
        key: override.key,
        active: override.active,
      },
    );
    return override;
  }

  async resolveOrganizationOverride(
    context: TenantContext,
    key: string,
  ): Promise<GovernanceOrganizationOverride | null> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'organization:read' });
    const override = await this.store.getOrganizationOverride(context, key);
    if (!override || !override.active) {
      return null;
    }
    if (
      override.expiresAt &&
      new Date(override.expiresAt).getTime() <= new Date(this.now()).getTime()
    ) {
      return null;
    }
    return override;
  }

  async recordAuditEvent(context: TenantContext, input: RecordGovernanceAuditInput): Promise<void> {
    this.authorize({
      context,
      tenantId: context.tenantId,
      permission: input.requiredPermission ?? 'organization:manage',
    });
    await this.recordPrivilegedAudit(context, input.type, input.correlationId, input.payload);
  }

  async listAuditEvents(context: TenantContext): Promise<GovernanceAuditEvent[]> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'audit:read' });
    return this.store.listAuditEvents(context);
  }

  async getSummary(context: TenantContext): Promise<GovernanceSummary> {
    this.authorize({ context, tenantId: context.tenantId, permission: 'organization:read' });
    this.authorize({ context, tenantId: context.tenantId, permission: 'audit:read' });
    return this.store.getSummary(context);
  }

  private async recordPrivilegedAudit(
    context: TenantContext,
    type: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: GovernanceAuditEvent = {
      id: this.createId(),
      tenantId: context.tenantId,
      type,
      actorType: 'user',
      ...(context.userId ? { actorId: context.userId } : {}),
      correlationId,
      occurredAt: this.now(),
      payload: sanitizeAuditValue(payload) as Record<string, unknown>,
    };
    await this.store.appendAuditEvent(context, event);
  }
}
