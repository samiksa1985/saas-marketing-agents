import type { AuditEvent, Id } from './index.js';

export type GovernanceDataExportStatus =
  'REQUESTED' | 'APPROVED' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';

export type GovernanceDataDeletionStatus =
  'REQUESTED' | 'APPROVAL_REQUIRED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface GovernanceFeatureFlag {
  id: Id;
  tenantId: Id;
  key: string;
  enabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceDataExportRequest {
  id: Id;
  tenantId: Id;
  requestedBy: Id;
  resourceTypes: string[];
  filters: Record<string, unknown>;
  status: GovernanceDataExportStatus;
  approvalId?: Id;
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceDataDeletionRequest {
  id: Id;
  tenantId: Id;
  requestedBy: Id;
  resourceTypes: string[];
  selectors: Record<string, unknown>;
  reason: string;
  status: GovernanceDataDeletionStatus;
  approvalId?: Id;
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceRetentionPolicy {
  id: Id;
  tenantId: Id;
  resourceType: string;
  retentionDays: number;
  disposition: 'ARCHIVE' | 'DELETE_REQUEST_REQUIRED';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceOrganizationOverride {
  id: Id;
  tenantId: Id;
  key: string;
  value: Record<string, unknown>;
  reason?: string;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Governance audit is stored in the canonical audit_events table rather than
 * duplicating an equivalent tenant-scoped historical record.
 */
export interface GovernanceAuditEvent extends AuditEvent {}

export interface GovernanceSummary {
  tenantId: Id;
  featureFlagCount: number;
  dataExportRequestCount: number;
  dataDeletionRequestCount: number;
  retentionPolicyCount: number;
  organizationOverrideCount: number;
  auditEventCount: number;
}
