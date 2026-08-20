import type { Locale } from '@platform/i18n';
export type { Locale } from '@platform/i18n';

export type Id = string;
export type Version = string;
export type AgentStatus = 'active' | 'inactive' | 'archived';
export type DependencyKind = 'blocking' | 'optional' | 'informational' | 'unresolved';
export type ReadinessState = 'ready' | 'blocked' | 'invalid';
export type ValidationState = 'valid' | 'invalid' | 'unresolved';
export type TaskStatus =
  | 'created'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'awaiting_validation'
  | 'awaiting_human'
  | 'accepted'
  | 'repair_required'
  | 'failed'
  | 'cancelled';
export type EntityStatus = 'active' | 'inactive' | 'blocked' | 'archived';
export type ArtifactStatus =
  | 'draft'
  | 'directional'
  | 'hypothesis'
  | 'blocked'
  | 'approved'
  | 'approved_with_conditions'
  | 'expired'
  | 'superseded';
export type ApprovalDecision = 'approved' | 'approved_with_conditions' | 'rejected' | 'expired';

export interface Tenant {
  id: Id;
  name: string;
  defaultLocale: Locale;
  status: EntityStatus;
}
export interface User {
  id: Id;
  tenantId: Id;
  subject: string;
  displayName: string;
  preferredLocale: Locale;
  status: EntityStatus;
}
export type Role =
  | 'tenant_admin'
  | 'engagement_owner'
  | 'workstream_operator'
  | 'reviewer'
  | 'sales_operator'
  | 'finance_operator'
  | 'auditor';
export type Permission =
  | 'tenant:read'
  | 'tenant:manage'
  | 'workflow:read'
  | 'workflow:execute'
  | 'artifact:read'
  | 'artifact:write'
  | 'approval:decide'
  | 'audit:read';
export interface AgentDefinition {
  agentId: string;
  name: string;
  specialty: string;
  category: string;
  sourcePath: string;
  sourceRevision: string;
  inputContractSummary: string;
  outputContractSummary: string;
  approvalRequirements: string[];
  active: boolean;
  version: Version;
}
export interface AgentVersion extends AgentDefinition {
  versionId: Id;
  agentId: string;
}
export interface WorkstreamDefinition {
  workstreamId: string;
  name: string;
  sourcePath: string;
  sourceRevision: string;
  objective: string;
  upstreamDependencies: string[];
  downstreamConsumers: string[];
  outputs: string[];
  acceptanceCriteria: string[];
  blockingDependencies: string[];
  optionalDependencies: string[];
  approvalGates: string[];
  unresolvedInputs: string[];
  version: Version;
}
export interface WorkstreamVersion extends WorkstreamDefinition {
  versionId: Id;
  workstreamId: string;
}
export interface DependencyEdge {
  id: Id;
  graphVersion: Version;
  fromWorkstreamId: string;
  toWorkstreamId: string;
  kind: DependencyKind;
  source: string;
  unresolvedReason?: string;
}
export interface WorkflowGraphSnapshot {
  version: Version;
  sourcePath: string;
  sourceRevision: string;
  workstreamIds: string[];
  edges: DependencyEdge[];
  hasCycles: boolean;
}
export interface Task {
  id: Id;
  tenantId: Id;
  workflowId: Id;
  workstreamId: string;
  status: TaskStatus;
}
export interface TaskDependency {
  taskId: Id;
  dependsOnTaskId: Id;
  kind: DependencyKind;
  satisfied: boolean;
}
export interface ArtifactReference {
  artifactId: Id;
  version: Version;
  tenantId: Id;
  status: ArtifactStatus;
  accepted: boolean;
}
export interface ReadinessResult {
  state: ReadinessState;
  reasons: string[];
  satisfiedDependencies: string[];
  unresolvedDependencies: string[];
}
export interface ValidationResult {
  state: ValidationState;
  reasons: string[];
}
export interface TenantContext {
  tenantId: Id;
  userId?: Id;
  roles: Role[];
  permissions: Permission[];
  locale: Locale;
}
export interface Engagement {
  id: Id;
  tenantId: Id;
  name: string;
  locale: Locale;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'stopped';
}
export interface Workflow {
  id: Id;
  tenantId: Id;
  engagementId: Id;
  graphVersion: string;
  locale: Locale;
  status: 'created' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
}
export interface Workstream {
  id: string;
  name: string;
  sourcePath: string;
  version: string;
}
export interface Agent {
  id: string;
  name: string;
  sourcePath: string;
  version: string;
}
export interface Task {
  id: Id;
  tenantId: Id;
  workflowId: Id;
  workstreamId: string;
  status:
    | 'created'
    | 'ready'
    | 'running'
    | 'blocked'
    | 'awaiting_validation'
    | 'awaiting_human'
    | 'accepted'
    | 'repair_required'
    | 'failed'
    | 'cancelled';
}
export interface TranslationGroup {
  id: Id;
  tenantId: Id;
  canonicalArtifactId?: Id;
}
export interface Artifact {
  id: Id;
  tenantId: Id;
  engagementId: Id;
  translationGroupId?: Id;
  language: 'en' | 'ar';
  locale: Locale;
  status: ArtifactStatus;
  version: number;
  contentRef: string;
}
export interface Handoff {
  id: Id;
  tenantId: Id;
  workflowId: Id;
  fromWorkstreamId: string;
  toWorkstreamId: string;
  artifactIds: Id[];
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
}
export interface Approval {
  id: Id;
  tenantId: Id;
  artifactId: Id;
  approverUserId?: Id;
  decision?: ApprovalDecision;
  conditions?: string[];
  expiresAt?: string;
}
export interface AuditEvent {
  id: Id;
  tenantId: Id;
  type: string;
  actorType: 'user' | 'agent' | 'system' | 'tool';
  actorId?: Id;
  correlationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}
