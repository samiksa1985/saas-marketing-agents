import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  index,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').defaultRandom().primaryKey();
const times = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
const tenant = (references: () => typeof tenants.id) =>
  uuid('tenant_id').notNull().references(references);

export const localeEnum = pgEnum('locale', ['en', 'ar', 'en-US', 'ar-SA']);
export const entityStatusEnum = pgEnum('entity_status', [
  'active',
  'inactive',
  'blocked',
  'archived',
]);
export const workflowStatusEnum = pgEnum('workflow_status', [
  'created',
  'ready',
  'running',
  'awaiting_validation',
  'awaiting_human',
  'accepted',
  'blocked',
  'repair_required',
  'retryable_failure',
  'paused',
  'failed',
  'cancelled',
  'superseded',
]);
export const taskStatusEnum = pgEnum('task_status', [
  'created',
  'ready',
  'claimed',
  'running',
  'blocked',
  'awaiting_validation',
  'awaiting_human',
  'accepted',
  'repair_required',
  'retryable_failure',
  'failed',
  'cancelled',
]);
export const dependencyKindEnum = pgEnum('dependency_kind', [
  'blocking',
  'optional',
  'informational',
  'unresolved',
]);
export const artifactStatusEnum = pgEnum('artifact_status', [
  'draft',
  'directional',
  'hypothesis',
  'blocked',
  'approved',
  'approved_with_conditions',
  'expired',
  'superseded',
]);
export const handoffStatusEnum = pgEnum('handoff_status', [
  'pending',
  'accepted',
  'rejected',
  'blocked',
]);
export const approvalDecisionEnum = pgEnum('approval_decision', [
  'approved',
  'approved_with_conditions',
  'rejected',
  'expired',
]);

export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  defaultLocale: localeEnum('default_locale').notNull().default('en'),
  status: entityStatusEnum('status').notNull().default('active'),
  ...times,
});
export const users = pgTable(
  'users',
  {
    id: id(),
    subject: text('subject').notNull(),
    displayName: text('display_name').notNull(),
    ...times,
  },
  (table) => [uniqueIndex('users_subject_unique').on(table.subject)],
);
export const roles = pgTable(
  'roles',
  {
    id: id(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    ...times,
  },
  (table) => [uniqueIndex('roles_name_unique').on(table.name)],
);
export const permissions = pgTable(
  'permissions',
  {
    id: id(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    ...times,
  },
  (table) => [uniqueIndex('permissions_name_unique').on(table.name)],
);
export const tenantMembers = pgTable(
  'tenant_members',
  {
    tenantId: tenant(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    status: entityStatusEnum('status').notNull().default('active'),
    ...times,
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    index('tenant_members_user_idx').on(table.userId),
  ],
);
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const engagements = pgTable(
  'engagements',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    name: text('name').notNull(),
    locale: localeEnum('locale').notNull().default('en'),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    ...times,
  },
  (table) => [index('engagements_tenant_idx').on(table.tenantId)],
);
export const workflows = pgTable(
  'workflows',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id),
    graphSnapshotId: uuid('graph_snapshot_id'),
    locale: localeEnum('locale').notNull().default('en'),
    status: workflowStatusEnum('status').notNull().default('created'),
    ...times,
  },
  (table) => [index('workflows_tenant_status_idx').on(table.tenantId, table.status)],
);
export const workflowGraphSnapshots = pgTable(
  'workflow_graph_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    version: varchar('version', { length: 80 }).notNull(),
    sourcePath: text('source_path').notNull(),
    sourceRevision: varchar('source_revision', { length: 128 }).notNull(),
    graph: jsonb('graph').notNull(),
    hasCycles: boolean('has_cycles').notNull().default(false),
    ...times,
  },
  (table) => [
    uniqueIndex('graph_snapshots_tenant_version_unique').on(table.tenantId, table.version),
    index('graph_snapshots_tenant_idx').on(table.tenantId),
  ],
);

export const agentDefinitions = pgTable(
  'agent_definitions',
  {
    id: id(),
    agentId: varchar('agent_id', { length: 160 }).notNull(),
    name: text('name').notNull(),
    specialty: text('specialty').notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    sourcePath: text('source_path').notNull(),
    active: boolean('active').notNull().default(true),
    ...times,
  },
  (table) => [uniqueIndex('agent_definitions_agent_id_unique').on(table.agentId)],
);
export const agentVersions = pgTable(
  'agent_versions',
  {
    id: id(),
    agentDefinitionId: uuid('agent_definition_id')
      .notNull()
      .references(() => agentDefinitions.id),
    version: varchar('version', { length: 80 }).notNull(),
    sourceRevision: varchar('source_revision', { length: 128 }).notNull(),
    inputContract: text('input_contract').notNull(),
    outputContract: text('output_contract').notNull(),
    approvalRequirements: jsonb('approval_requirements').notNull(),
    createdAt: times.createdAt,
  },
  (table) => [uniqueIndex('agent_versions_unique').on(table.agentDefinitionId, table.version)],
);
export const agentCapabilities = pgTable(
  'agent_capabilities',
  {
    agentVersionId: uuid('agent_version_id')
      .notNull()
      .references(() => agentVersions.id),
    capability: varchar('capability', { length: 160 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentVersionId, table.capability] })],
);
export const workstreamDefinitions = pgTable(
  'workstream_definitions',
  {
    id: id(),
    workstreamId: varchar('workstream_id', { length: 20 }).notNull(),
    name: text('name').notNull(),
    sourcePath: text('source_path').notNull(),
    active: boolean('active').notNull().default(true),
    ...times,
  },
  (table) => [uniqueIndex('workstream_definitions_id_unique').on(table.workstreamId)],
);
export const workstreamVersions = pgTable(
  'workstream_versions',
  {
    id: id(),
    workstreamDefinitionId: uuid('workstream_definition_id')
      .notNull()
      .references(() => workstreamDefinitions.id),
    version: varchar('version', { length: 80 }).notNull(),
    sourceRevision: varchar('source_revision', { length: 128 }).notNull(),
    contract: jsonb('contract').notNull(),
    createdAt: times.createdAt,
  },
  (table) => [
    uniqueIndex('workstream_versions_unique').on(table.workstreamDefinitionId, table.version),
  ],
);
export const dependencyEdges = pgTable(
  'dependency_edges',
  {
    id: id(),
    graphSnapshotId: uuid('graph_snapshot_id')
      .notNull()
      .references(() => workflowGraphSnapshots.id),
    fromWorkstreamId: varchar('from_workstream_id', { length: 20 }).notNull(),
    toWorkstreamId: varchar('to_workstream_id', { length: 20 }).notNull(),
    kind: dependencyKindEnum('kind').notNull(),
    source: text('source').notNull(),
    unresolvedReason: text('unresolved_reason'),
  },
  (table) => [
    index('dependency_edges_graph_idx').on(table.graphSnapshotId),
    uniqueIndex('dependency_edges_unique').on(
      table.graphSnapshotId,
      table.fromWorkstreamId,
      table.toWorkstreamId,
      table.kind,
    ),
  ],
);
export const gateDefinitions = pgTable('gate_definitions', {
  id: id(),
  workstreamVersionId: uuid('workstream_version_id')
    .notNull()
    .references(() => workstreamVersions.id),
  name: text('name').notNull(),
  approvalRequirements: jsonb('approval_requirements').notNull(),
  acceptanceCriteria: jsonb('acceptance_criteria').notNull(),
  ...times,
});

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id),
    workstreamId: varchar('workstream_id', { length: 20 }).notNull(),
    agentVersionId: uuid('agent_version_id').references(() => agentVersions.id),
    status: taskStatusEnum('status').notNull().default('created'),
    ...times,
  },
  (table) => [
    index('tasks_tenant_status_idx').on(table.tenantId, table.status),
    index('tasks_workflow_idx').on(table.workflowId),
  ],
);
export const taskAttempts = pgTable(
  'task_attempts',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    attemptNumber: integer('attempt_number').notNull(),
    status: varchar('status', { length: 40 }).notNull(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...times,
  },
  (table) => [
    uniqueIndex('task_attempts_unique').on(table.taskId, table.attemptNumber),
    index('task_attempts_tenant_idx').on(table.tenantId),
  ],
);
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    dependsOnTaskId: uuid('depends_on_task_id')
      .notNull()
      .references(() => tasks.id),
    kind: dependencyKindEnum('kind').notNull(),
    satisfied: boolean('satisfied').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.dependsOnTaskId] })],
);
export const executionLeases = pgTable(
  'execution_leases',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    holder: text('holder').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...times,
  },
  (table) => [
    uniqueIndex('execution_leases_task_unique').on(table.taskId),
    index('execution_leases_tenant_idx').on(table.tenantId),
  ],
);

export const artifacts = pgTable(
  'artifacts',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => engagements.id),
    artifactType: varchar('artifact_type', { length: 80 }).notNull(),
    status: artifactStatusEnum('status').notNull().default('draft'),
    ...times,
  },
  (table) => [index('artifacts_tenant_status_idx').on(table.tenantId, table.status)],
);
export const artifactVersions = pgTable(
  'artifact_versions',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id),
    version: integer('version').notNull(),
    evidenceStatus: varchar('evidence_status', { length: 40 }).notNull(),
    contentPointer: text('content_pointer').notNull(),
    sourceRevision: varchar('source_revision', { length: 128 }),
    createdAt: times.createdAt,
  },
  (table) => [
    uniqueIndex('artifact_versions_unique').on(table.artifactId, table.version),
    index('artifact_versions_tenant_idx').on(table.tenantId),
  ],
);
export const artifactDependencies = pgTable(
  'artifact_dependencies',
  {
    artifactVersionId: uuid('artifact_version_id')
      .notNull()
      .references(() => artifactVersions.id),
    dependsOnArtifactVersionId: uuid('depends_on_artifact_version_id')
      .notNull()
      .references(() => artifactVersions.id),
    kind: dependencyKindEnum('kind').notNull(),
    satisfied: boolean('satisfied').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.artifactVersionId, table.dependsOnArtifactVersionId] })],
);
export const artifactValidations = pgTable(
  'artifact_validations',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    artifactVersionId: uuid('artifact_version_id')
      .notNull()
      .references(() => artifactVersions.id),
    validator: text('validator').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    details: jsonb('details').notNull(),
    ...times,
  },
  (table) => [index('artifact_validations_tenant_idx').on(table.tenantId)],
);

export const handoffs = pgTable(
  'handoffs',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id),
    fromWorkstreamId: varchar('from_workstream_id', { length: 20 }).notNull(),
    toWorkstreamId: varchar('to_workstream_id', { length: 20 }).notNull(),
    status: handoffStatusEnum('status').notNull().default('pending'),
    ...times,
  },
  (table) => [index('handoffs_tenant_status_idx').on(table.tenantId, table.status)],
);
export const handoffDecisions = pgTable(
  'handoff_decisions',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    handoffId: uuid('handoff_id')
      .notNull()
      .references(() => handoffs.id),
    decision: handoffStatusEnum('decision').notNull(),
    reason: text('reason'),
    decidedBy: uuid('decided_by').references(() => users.id),
    ...times,
  },
  (table) => [index('handoff_decisions_tenant_idx').on(table.tenantId)],
);
export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id),
    artifactVersionId: uuid('artifact_version_id').references(() => artifactVersions.id),
    gateId: uuid('gate_id').references(() => gateDefinitions.id),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    ...times,
  },
  (table) => [index('approval_requests_tenant_idx').on(table.tenantId)],
);
export const approvalDecisions = pgTable(
  'approval_decisions',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    approvalRequestId: uuid('approval_request_id')
      .notNull()
      .references(() => approvalRequests.id),
    decision: approvalDecisionEnum('decision').notNull(),
    conditions: jsonb('conditions'),
    decidedBy: uuid('decided_by')
      .notNull()
      .references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
    ...times,
  },
  (table) => [index('approval_decisions_tenant_idx').on(table.tenantId)],
);
export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    type: text('type').notNull(),
    actorType: varchar('actor_type', { length: 32 }).notNull(),
    actorId: uuid('actor_id'),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    ...times,
  },
  (table) => [index('audit_events_tenant_occurred_idx').on(table.tenantId, table.occurredAt)],
);
