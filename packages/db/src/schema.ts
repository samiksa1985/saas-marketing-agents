import {
  boolean,
  integer,
  real,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
  index,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').defaultRandom().primaryKey();
/** Canonical pgvector contract for durable knowledge chunks. */
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536;
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

export const executionRuns = pgTable(
  'execution_runs',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id),
    status: varchar('status', { length: 40 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    correlationId: varchar('correlation_id', { length: 200 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...times,
  },
  (table) => [
    uniqueIndex('execution_runs_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    index('execution_runs_workflow_idx').on(table.tenantId, table.workflowId),
  ],
);
export const executionSteps = pgTable(
  'execution_steps',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    executionRunId: uuid('execution_run_id')
      .notNull()
      .references(() => executionRuns.id),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    executionId: varchar('execution_id', { length: 200 }).notNull(),
    status: varchar('status', { length: 40 }).notNull(),
    attemptNumber: integer('attempt_number').notNull().default(1),
    correlationId: varchar('correlation_id', { length: 200 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...times,
  },
  (table) => [
    uniqueIndex('execution_steps_execution_unique').on(table.tenantId, table.executionId),
    index('execution_steps_task_idx').on(table.tenantId, table.taskId),
  ],
);
export const providerCalls = pgTable(
  'provider_calls',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    executionId: varchar('execution_id', { length: 200 }).notNull(),
    provider: varchar('provider', { length: 80 }).notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    status: varchar('status', { length: 40 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    correlationId: varchar('correlation_id', { length: 200 }).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('provider_calls_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    index('provider_calls_execution_idx').on(table.tenantId, table.executionId),
  ],
);
export const providerUsage = pgTable(
  'provider_usage',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    providerCallId: uuid('provider_call_id')
      .notNull()
      .references(() => providerCalls.id),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    estimatedCost: text('estimated_cost').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('provider_usage_tenant_idx').on(table.tenantId, table.providerCallId)],
);
export const retryAttempts = pgTable(
  'retry_attempts',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    executionStepId: uuid('execution_step_id')
      .notNull()
      .references(() => executionSteps.id),
    attemptNumber: integer('attempt_number').notNull(),
    reason: text('reason').notNull(),
    retryable: boolean('retryable').notNull(),
    createdAt: times.createdAt,
  },
  (table) => [
    uniqueIndex('retry_attempts_unique').on(table.executionStepId, table.attemptNumber),
    index('retry_attempts_tenant_idx').on(table.tenantId),
  ],
);
export const workflowEvents = pgTable(
  'workflow_events',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id),
    taskId: uuid('task_id').references(() => tasks.id),
    executionId: varchar('execution_id', { length: 200 }),
    eventType: varchar('event_type', { length: 120 }).notNull(),
    correlationId: varchar('correlation_id', { length: 200 }).notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('workflow_events_tenant_workflow_idx').on(
      table.tenantId,
      table.workflowId,
      table.occurredAt,
    ),
    index('workflow_events_execution_idx').on(table.tenantId, table.executionId),
  ],
);
export const executionErrors = pgTable(
  'execution_errors',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    executionId: varchar('execution_id', { length: 200 }).notNull(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id),
    taskId: uuid('task_id').references(() => tasks.id),
    code: varchar('code', { length: 80 }).notNull(),
    message: text('message').notNull(),
    retryable: boolean('retryable').notNull(),
    correlationId: varchar('correlation_id', { length: 200 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('execution_errors_tenant_execution_idx').on(table.tenantId, table.executionId)],
);

export const documentSourceTypeEnum = pgEnum('document_source_type', ['file', 'url', 'inline']);

export const documentStatusEnum = pgEnum('document_status', [
  'uploaded',
  'processing',
  'ready',
  'failed',
  'archived',
]);

export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    storagePath: text('storage_path').notNull(),
    sourceType: documentSourceTypeEnum('source_type').notNull().default('file'),
    status: documentStatusEnum('status').notNull().default('uploaded'),
    sizeBytes: integer('size_bytes'),
    checksum: text('checksum'),
    metadata: jsonb('metadata').notNull().default({}),
    sourceUrl: text('source_url'),
    pageCount: integer('page_count'),
    wordCount: integer('word_count'),
    errorMessage: text('error_message'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    ...times,
  },
  (table) => [
    index('knowledge_documents_tenant_status_idx').on(table.tenantId, table.status),
    index('knowledge_documents_tenant_source_idx').on(table.tenantId, table.sourceType),
    index('knowledge_documents_tenant_checksum_idx').on(table.tenantId, table.checksum),
    uniqueIndex('knowledge_documents_tenant_id_id_uidx').on(table.tenantId, table.id),
  ],
);

export const knowledgeDocumentChunks = pgTable(
  'knowledge_document_chunks',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    text: text('text').notNull(),
    embedding: jsonb('embedding'),
    embeddingVector: vector('embedding_vector', { dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS }),
    embeddingProvider: varchar('embedding_provider', { length: 64 }),
    embeddingModel: varchar('embedding_model', { length: 255 }),
    embeddingVersion: varchar('embedding_version', { length: 255 }),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),
    pageNumber: integer('page_number'),
    slideNumber: integer('slide_number'),
    sheetName: text('sheet_name'),
    sourceRef: text('source_ref'),
    tokenCount: integer('token_count'),
    metadata: jsonb('metadata').notNull().default({}),
    ...times,
  },
  (table) => [
    index('knowledge_chunks_tenant_idx').on(table.tenantId),
    index('knowledge_chunks_document_idx').on(table.documentId, table.chunkIndex),
    index('knowledge_chunks_document_page_idx').on(table.documentId, table.pageNumber),
    index('knowledge_chunks_tenant_embedding_provenance_idx').on(
      table.tenantId,
      table.embeddingProvider,
      table.embeddingModel,
      table.embeddingVersion,
    ),
  ],
);

export const knowledgeDocumentCitations = pgTable(
  'knowledge_document_citations',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
    chunkId: uuid('chunk_id').references(() => knowledgeDocumentChunks.id, {
      onDelete: 'set null',
    }),
    agentRunId: uuid('agent_run_id'),
    workflowRunId: uuid('workflow_run_id'),
    query: text('query').notNull(),
    excerpt: text('excerpt').notNull(),
    relevanceScore: real('relevance_score').notNull(),
    sourceRef: text('source_ref'),
    ...times,
  },
  (table) => [
    index('knowledge_citations_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('knowledge_citations_agent_run_idx').on(table.agentRunId),
    index('knowledge_citations_workflow_run_idx').on(table.workflowRunId),
  ],
);
export const marketingMemoryRecords = pgTable(
  'marketing_memory_records',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    scope: varchar('scope', { length: 40 }).notNull(),
    scopeId: uuid('scope_id').notNull(),
    statement: text('statement').notNull(),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence'),
    ...times,
  },
  (table) => [
    index('marketing_memory_tenant_scope_idx').on(table.tenantId, table.scope, table.scopeId),
    index('marketing_memory_tenant_updated_idx').on(table.tenantId, table.updatedAt),
  ],
);
export const marketingOsPlanSnapshots = pgTable(
  'marketing_os_plan_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    // Commander plan IDs are application-level deterministic identifiers, not UUIDs.
    planId: varchar('plan_id', { length: 255 }).notNull(),
    goal: text('goal').notNull(),
    objective: varchar('objective', { length: 80 }).notNull(),
    plan: jsonb('plan').notNull(),
    context: jsonb('context').notNull(),
    acquisition: jsonb('acquisition').notNull().default({}),
    readiness: jsonb('readiness').notNull(),
    ...times,
  },
  (table) => [
    uniqueIndex('marketing_os_plan_tenant_plan_uidx').on(table.tenantId, table.planId),
    index('marketing_os_plan_tenant_updated_idx').on(table.tenantId, table.updatedAt),
  ],
);
export const marketingOsExecutionRecords = pgTable(
  'marketing_os_execution_records',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    planId: varchar('plan_id', { length: 255 }).notNull(),
    engagementId: varchar('engagement_id', { length: 255 }).notNull(),
    locale: varchar('locale', { length: 16 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    workflowId: varchar('workflow_id', { length: 255 }),
    approvalId: varchar('approval_id', { length: 255 }),
    status: varchar('status', { length: 32 }).notNull(),
    approved: boolean('approved').notNull().default(false),
    reasons: jsonb('reasons').notNull().default([]),
    ...times,
  },
  (table) => [
    uniqueIndex('marketing_os_execution_tenant_plan_uidx').on(table.tenantId, table.planId),
    uniqueIndex('marketing_os_execution_tenant_idempotency_uidx').on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index('marketing_os_execution_tenant_updated_idx').on(table.tenantId, table.updatedAt),
  ],
);
/** Durable backing store for the canonical ApprovalApiService. */
export const marketingOsApprovalRecords = pgTable(
  'marketing_os_approval_records',
  {
    // API approval identifiers are deterministic strings, not UUIDs.
    id: varchar('id', { length: 255 }).primaryKey(),
    tenantId: tenant(() => tenants.id),
    artifactId: varchar('artifact_id', { length: 255 }).notNull(),
    planId: varchar('plan_id', { length: 255 }),
    workflowId: varchar('workflow_id', { length: 255 }),
    executionBindingId: uuid('execution_binding_id').references(
      () => marketingOsExecutionRecords.id,
      { onDelete: 'set null' },
    ),
    requestedByUserId: varchar('requested_by_user_id', { length: 255 }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('PENDING'),
    decision: varchar('decision', { length: 32 }),
    approverUserId: varchar('approver_user_id', { length: 255 }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    conditions: jsonb('conditions').notNull().default([]),
    reason: text('reason'),
    policyReference: varchar('policy_reference', { length: 255 }),
    riskLevel: varchar('risk_level', { length: 64 }),
    actionSummary: text('action_summary'),
    creationIdempotencyKey: varchar('creation_idempotency_key', { length: 255 }).notNull(),
    decisionIdempotencyKey: varchar('decision_idempotency_key', { length: 255 }),
    ...times,
  },
  (table) => [
    uniqueIndex('marketing_os_approval_tenant_creation_idempotency_uidx').on(
      table.tenantId,
      table.creationIdempotencyKey,
    ),
    index('marketing_os_approval_tenant_plan_idx').on(table.tenantId, table.planId),
    index('marketing_os_approval_tenant_workflow_idx').on(table.tenantId, table.workflowId),
    index('marketing_os_approval_tenant_status_idx').on(table.tenantId, table.status),
  ],
);
export const marketingOutcomeEvents = pgTable(
  'marketing_outcome_events',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    type: varchar('type', { length: 60 }).notNull(),
    metric: varchar('metric', { length: 120 }).notNull(),
    value: integer('value').notNull(),
    sourceEntityId: uuid('source_entity_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    attributes: jsonb('attributes').notNull(),
    ...times,
  },
  (table) => [
    index('marketing_outcomes_tenant_occurred_idx').on(table.tenantId, table.occurredAt),
    index('marketing_outcomes_source_idx').on(table.tenantId, table.sourceEntityId),
  ],
);

export const leadScoreTemperatureEnum = pgEnum('lead_score_temperature', ['HOT', 'WARM', 'COLD']);

export const proposalArtifactStatusEnum = pgEnum('proposal_artifact_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
]);

export const salesForecastPeriodEnum = pgEnum('sales_forecast_period', [
  'WEEK',
  'MONTH',
  'QUARTER',
]);

export const leadScoreSnapshots = pgTable(
  'lead_score_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    leadId: uuid('lead_id').notNull(),
    score: integer('score').notNull(),
    temperature: leadScoreTemperatureEnum('temperature').notNull(),
    fit: integer('fit').notNull(),
    intent: integer('intent').notNull(),
    engagement: integer('engagement').notNull(),
    timing: integer('timing').notNull(),
    factors: jsonb('factors').notNull().default({}),
    recommendations: jsonb('recommendations').notNull().default([]),
    model: varchar('model', { length: 120 }).notNull(),
    ...times,
  },
  (table) => [
    index('lead_score_snapshots_tenant_lead_idx').on(table.tenantId, table.leadId, table.createdAt),
    index('lead_score_snapshots_tenant_score_idx').on(table.tenantId, table.score),
  ],
);

export const salesForecastSnapshots = pgTable(
  'sales_forecast_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    period: salesForecastPeriodEnum('period').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    opportunityCount: integer('opportunity_count').notNull(),
    pipelineAmount: real('pipeline_amount').notNull(),
    weightedAmount: real('weighted_amount').notNull(),
    winProbability: integer('win_probability').notNull(),
    confidence: integer('confidence').notNull(),
    opportunityIds: jsonb('opportunity_ids').notNull().default([]),
    ...times,
  },
  (table) => [
    index('sales_forecast_snapshots_tenant_period_idx').on(
      table.tenantId,
      table.period,
      table.periodStart,
      table.periodEnd,
    ),
    index('sales_forecast_snapshots_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

export const proposalArtifacts = pgTable(
  'proposal_artifacts',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    opportunityId: uuid('opportunity_id').notNull(),
    title: text('title').notNull(),
    amount: real('amount'),
    currency: varchar('currency', { length: 3 }),
    status: proposalArtifactStatusEnum('status').notNull().default('DRAFT'),
    content: jsonb('content').notNull().default({}),
    requiresApproval: boolean('requires_approval').notNull().default(true),
    approvalId: uuid('approval_id'),
    workflowId: uuid('workflow_id').references(() => workflows.id, {
      onDelete: 'set null',
    }),
    ...times,
  },
  (table) => [
    index('proposal_artifacts_tenant_opportunity_idx').on(table.tenantId, table.opportunityId),
    index('proposal_artifacts_tenant_status_idx').on(table.tenantId, table.status, table.createdAt),
    index('proposal_artifacts_approval_idx').on(table.tenantId, table.approvalId),
  ],
);

export const companyIntelligenceProfiles = pgTable(
  'company_intelligence_profiles',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    companyName: text('company_name').notNull(),
    website: text('website'),
    industry: text('industry'),
    subIndustry: text('sub_industry'),
    headquarters: text('headquarters'),
    geographies: jsonb('geographies').notNull().default([]),
    employeeBand: text('employee_band'),
    revenueBand: text('revenue_band'),
    businessModel: text('business_model'),
    products: jsonb('products').notNull().default([]),
    services: jsonb('services').notNull().default([]),
    technologies: jsonb('technologies').notNull().default([]),
    competitors: jsonb('competitors').notNull().default([]),
    customers: jsonb('customers').notNull().default([]),
    painPoints: jsonb('pain_points').notNull().default([]),
    strategicPriorities: jsonb('strategic_priorities').notNull().default([]),
    buyingSignals: jsonb('buying_signals').notNull().default([]),
    risks: jsonb('risks').notNull().default([]),
    opportunities: jsonb('opportunities').notNull().default([]),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    ...times,
  },
  (table) => [index('company_intelligence_tenant_updated_idx').on(table.tenantId, table.updatedAt)],
);

export const marketingIcpProfiles = pgTable(
  'marketing_icp_profiles',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    name: text('name').notNull(),
    industries: jsonb('industries').notNull().default([]),
    companySizes: jsonb('company_sizes').notNull().default([]),
    geographies: jsonb('geographies').notNull().default([]),
    buyingTriggers: jsonb('buying_triggers').notNull().default([]),
    painPoints: jsonb('pain_points').notNull().default([]),
    desiredOutcomes: jsonb('desired_outcomes').notNull().default([]),
    exclusions: jsonb('exclusions').notNull().default([]),
    confidence: integer('confidence'),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    status: text('status').notNull().default('draft'),
    ...times,
  },
  (table) => [index('marketing_icp_tenant_status_idx').on(table.tenantId, table.status)],
);

export const marketingAccounts = pgTable(
  'marketing_accounts',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    name: text('name').notNull(),
    website: text('website'),
    industry: text('industry'),
    geography: text('geography'),
    employeeBand: text('employee_band'),
    icpFit: integer('icp_fit'),
    status: text('status').notNull().default('draft'),
    ...times,
  },
  (table) => [index('marketing_accounts_tenant_status_idx').on(table.tenantId, table.status)],
);

export const icpAssessmentSnapshots = pgTable(
  'icp_assessment_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    accountId: uuid('account_id').notNull(),
    icpId: uuid('icp_id').notNull(),
    score: integer('score').notNull(),
    tier: text('tier').notNull(),
    matchedIndustries: jsonb('matched_industries').notNull().default([]),
    matchedGeographies: jsonb('matched_geographies').notNull().default([]),
    matchedTriggers: jsonb('matched_triggers').notNull().default([]),
    matchedPainPoints: jsonb('matched_pain_points').notNull().default([]),
    exclusions: jsonb('exclusions').notNull().default([]),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    reasons: jsonb('reasons').notNull().default([]),
    model: text('model').notNull(),
    ...times,
  },
  (table) => [
    index('icp_assessment_tenant_account_idx').on(table.tenantId, table.accountId, table.createdAt),
  ],
);

export const marketIntelligenceSnapshots = pgTable(
  'market_intelligence_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    researchQuestion: text('research_question').notNull(),
    marketSummary: text('market_summary').notNull(),
    customerSignals: jsonb('customer_signals').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    ...times,
  },
  (table) => [index('market_intelligence_tenant_created_idx').on(table.tenantId, table.createdAt)],
);

export const marketCompetitorProfiles = pgTable(
  'market_competitor_profiles',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => marketIntelligenceSnapshots.id, {
        onDelete: 'cascade',
      }),
    name: text('name').notNull(),
    website: text('website'),
    category: text('category'),
    positioning: text('positioning'),
    products: jsonb('products').notNull().default([]),
    strengths: jsonb('strengths').notNull().default([]),
    weaknesses: jsonb('weaknesses').notNull().default([]),
    differentiators: jsonb('differentiators').notNull().default([]),
    targetSegments: jsonb('target_segments').notNull().default([]),
    channels: jsonb('channels').notNull().default([]),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    ...times,
  },
  (table) => [index('market_competitors_tenant_snapshot_idx').on(table.tenantId, table.snapshotId)],
);

export const marketTrendSnapshots = pgTable(
  'market_trend_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => marketIntelligenceSnapshots.id, {
        onDelete: 'cascade',
      }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    direction: text('direction').notNull(),
    relevance: integer('relevance').notNull(),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    ...times,
  },
  (table) => [index('market_trends_tenant_snapshot_idx').on(table.tenantId, table.snapshotId)],
);

export const marketOpportunitySnapshots = pgTable(
  'market_opportunity_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => marketIntelligenceSnapshots.id, {
        onDelete: 'cascade',
      }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    type: text('type').notNull(),
    impact: text('impact').notNull(),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    ...times,
  },
  (table) => [
    index('market_opportunities_tenant_snapshot_idx').on(table.tenantId, table.snapshotId),
  ],
);

export const marketThreatSnapshots = pgTable(
  'market_threat_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => marketIntelligenceSnapshots.id, {
        onDelete: 'cascade',
      }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    type: text('type').notNull(),
    severity: text('severity').notNull(),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    ...times,
  },
  (table) => [index('market_threats_tenant_snapshot_idx').on(table.tenantId, table.snapshotId)],
);

export const marketEvidenceRecords = pgTable(
  'market_evidence_records',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => marketIntelligenceSnapshots.id, {
        onDelete: 'cascade',
      }),
    type: text('type').notNull(),
    claim: text('claim').notNull(),
    sourceRef: text('source_ref').notNull(),
    sourceDate: timestamp('source_date', { withTimezone: true }),
    confidence: integer('confidence').notNull().default(0),
    ...times,
  },
  (table) => [
    index('market_evidence_tenant_snapshot_idx').on(table.tenantId, table.snapshotId),
    index('market_evidence_source_idx').on(table.tenantId, table.sourceRef),
  ],
);

export const marketingStrategyStatusEnum = pgEnum('marketing_strategy_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SUPERSEDED',
  'ARCHIVED',
]);

export const marketingStrategies = pgTable(
  'marketing_strategies',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    title: text('title').notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    status: marketingStrategyStatusEnum('status').notNull().default('DRAFT'),
    ...times,
  },
  (table) => [
    index('marketing_strategies_tenant_status_idx').on(
      table.tenantId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const marketingStrategyVersions = pgTable(
  'marketing_strategy_versions',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    strategyId: uuid('strategy_id')
      .notNull()
      .references(() => marketingStrategies.id, {
        onDelete: 'cascade',
      }),
    version: integer('version').notNull(),
    executiveSummary: text('executive_summary').notNull(),
    objectiveIds: jsonb('objective_ids').notNull().default([]),
    objectives: jsonb('objectives').notNull().default([]),
    icpIds: jsonb('icp_ids').notNull().default([]),
    positioning: text('positioning').notNull(),
    messaging: jsonb('messaging').notNull().default([]),
    channels: jsonb('channels').notNull().default([]),
    offers: jsonb('offers').notNull().default([]),
    campaigns: jsonb('campaigns').notNull().default([]),
    contentPillars: jsonb('content_pillars').notNull().default([]),
    kpis: jsonb('kpis').notNull().default([]),
    roadmap: jsonb('roadmap').notNull().default([]),
    priorities: jsonb('priorities').notNull().default([]),
    assumptions: jsonb('assumptions').notNull().default([]),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    requiresApproval: boolean('requires_approval').notNull().default(true),
    approvalId: uuid('approval_id'),
    status: marketingStrategyStatusEnum('status').notNull().default('DRAFT'),
    ...times,
  },
  (table) => [
    index('marketing_strategy_versions_tenant_strategy_idx').on(
      table.tenantId,
      table.strategyId,
      table.version,
    ),
    index('marketing_strategy_versions_status_idx').on(
      table.tenantId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const customerHealthStatusEnum = pgEnum('customer_health_status', [
  'HEALTHY',
  'WATCH',
  'AT_RISK',
  'CRITICAL',
]);

export const customerChurnRiskEnum = pgEnum('customer_churn_risk', [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const customerHealthAssessments = pgTable(
  'customer_health_assessments',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    customerId: text('customer_id').notNull(),
    accountId: text('account_id'),
    score: integer('score').notNull(),
    status: customerHealthStatusEnum('status').notNull(),
    churnRisk: customerChurnRiskEnum('churn_risk').notNull(),
    causes: jsonb('causes').notNull().default([]),
    actions: jsonb('actions').notNull().default([]),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    model: text('model').notNull(),
    assessedAt: timestamp('assessed_at', {
      withTimezone: true,
    }).notNull(),
    ...times,
  },
  (table) => [
    index('customer_health_tenant_customer_idx').on(
      table.tenantId,
      table.customerId,
      table.assessedAt,
    ),
  ],
);

export const customerRenewalRecommendations = pgTable(
  'customer_renewal_recommendations',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    customerId: text('customer_id').notNull(),
    accountId: text('account_id'),
    healthAssessmentId: text('health_assessment_id').notNull(),
    daysToRenewal: integer('days_to_renewal'),
    recommendation: text('recommendation').notNull(),
    rationale: jsonb('rationale').notNull().default([]),
    actions: jsonb('actions').notNull().default([]),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    requiresApproval: boolean('requires_approval').notNull().default(true),
    ...times,
  },
  (table) => [
    index('customer_renewal_tenant_customer_idx').on(
      table.tenantId,
      table.customerId,
      table.createdAt,
    ),
  ],
);

export const customerExpansionAssessments = pgTable(
  'customer_expansion_assessments',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    customerId: text('customer_id').notNull(),
    accountId: text('account_id'),
    healthAssessmentId: text('health_assessment_id').notNull(),
    eligible: boolean('eligible').notNull(),
    score: integer('score').notNull(),
    rationale: jsonb('rationale').notNull().default([]),
    recommendedActions: jsonb('recommended_actions').notNull().default([]),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    confidence: integer('confidence').notNull().default(0),
    requiresApproval: boolean('requires_approval').notNull().default(true),
    ...times,
  },
  (table) => [
    index('customer_expansion_tenant_customer_idx').on(
      table.tenantId,
      table.customerId,
      table.createdAt,
    ),
  ],
);

export const financialStatusEnum = pgEnum('financial_status', ['ACTUAL', 'ESTIMATED', 'MODELED']);

export const cfoRecommendationPriorityEnum = pgEnum('cfo_recommendation_priority', [
  'HIGH',
  'MEDIUM',
  'LOW',
]);

export const cfoRecommendationTypeEnum = pgEnum('cfo_recommendation_type', [
  'MARGIN',
  'COST',
  'PRICING',
  'FORECAST',
  'RETENTION',
  'GROWTH',
]);

export const clientProfitabilityAssessments = pgTable('client_profitability_assessments', {
  id: uuid('id').defaultRandom().primaryKey(),

  tenantId: tenant(() => tenants.id),

  customerId: text('customer_id').notNull(),

  accountId: text('account_id'),

  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),

  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),

  revenue: jsonb('revenue').notNull(),

  directCost: jsonb('direct_cost').notNull(),

  grossContribution: jsonb('gross_contribution').notNull(),

  grossMarginPct: jsonb('gross_margin_pct').notNull(),

  operatingExpense: jsonb('operating_expense'),

  operatingContribution: jsonb('operating_contribution'),

  evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull(),

  model: text('model').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const financialScenarioSnapshots = pgTable('financial_scenario_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),

  tenantId: tenant(() => tenants.id),

  customerId: text('customer_id'),

  projectedRevenue: jsonb('projected_revenue').notNull(),

  projectedVariableCost: jsonb('projected_variable_cost').notNull(),

  projectedFixedCost: jsonb('projected_fixed_cost').notNull(),

  projectedContribution: jsonb('projected_contribution').notNull(),

  projectedMarginPct: jsonb('projected_margin_pct').notNull(),

  breakEvenRevenue: jsonb('break_even_revenue'),

  evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull(),

  model: text('model').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * CFO pipeline forecasts are persisted separately from modeled financial
 * scenarios so their recorded opportunity and actual-revenue provenance remains
 * auditable.
 */
export const financialForecastSnapshots = pgTable(
  'financial_forecast_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    tenantId: tenant(() => tenants.id),

    customerId: text('customer_id'),

    period: salesForecastPeriodEnum('period').notNull(),

    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),

    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),

    actualRevenue: jsonb('actual_revenue').notNull(),

    pipelineAmount: jsonb('pipeline_amount').notNull(),

    weightedPipelineAmount: jsonb('weighted_pipeline_amount').notNull(),

    forecastRevenue: jsonb('forecast_revenue').notNull(),

    opportunityCount: integer('opportunity_count').notNull(),

    stageSummaries: jsonb('stage_summaries').notNull(),

    confidence: integer('confidence').notNull(),

    evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull(),

    model: text('model').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('financial_forecast_tenant_period_idx').on(
      table.tenantId,
      table.period,
      table.periodStart,
      table.periodEnd,
    ),
    index('financial_forecast_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

export const cfoRecommendations = pgTable('cfo_recommendations', {
  id: text('id').primaryKey(),

  tenantId: tenant(() => tenants.id),

  customerId: text('customer_id'),

  type: cfoRecommendationTypeEnum('type').notNull(),

  priority: cfoRecommendationPriorityEnum('priority').notNull(),

  title: text('title').notNull(),

  rationale: text('rationale').notNull(),

  action: text('action').notNull(),

  confidence: real('confidence').notNull(),

  evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull(),

  requiresApproval: boolean('requires_approval').default(true).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const marketingExperimentStatusEnum = pgEnum('marketing_experiment_status', [
  'planned',
  'running',
  'won',
  'lost',
  'inconclusive',
]);

export const marketingAttributionModelEnum = pgEnum('marketing_attribution_model', [
  'FIRST_TOUCH',
  'LAST_TOUCH',
  'LINEAR',
  'TIME_DECAY',
  'POSITION_BASED',
]);

export const marketingExperiments = pgTable(
  'marketing_experiments',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    campaignId: uuid('campaign_id'),
    contentId: uuid('content_id'),
    name: varchar('name', {
      length: 240,
    }).notNull(),
    hypothesis: text('hypothesis').notNull(),
    metric: varchar('metric', {
      length: 120,
    }).notNull(),
    status: marketingExperimentStatusEnum('status').notNull().default('planned'),
    winningVariantId: uuid('winning_variant_id'),
    evaluation: jsonb('evaluation'),
    ...times,
  },
  (table) => [
    index('marketing_experiments_tenant_status_idx').on(table.tenantId, table.status),
    index('marketing_experiments_tenant_updated_idx').on(table.tenantId, table.updatedAt),
  ],
);

export const marketingExperimentVariants = pgTable(
  'marketing_experiment_variants',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => marketingExperiments.id, {
        onDelete: 'cascade',
      }),
    name: varchar('name', {
      length: 160,
    }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    sampleSize: integer('sample_size'),
    metricValue: real('metric_value'),
    ...times,
  },
  (table) => [
    index('marketing_experiment_variants_tenant_experiment_idx').on(
      table.tenantId,
      table.experimentId,
    ),
  ],
);

export const marketingAttributionSnapshots = pgTable(
  'marketing_attribution_snapshots',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    sourceEntityId: uuid('source_entity_id').notNull(),
    revenueOutcomeId: uuid('revenue_outcome_id').references(() => marketingOutcomeEvents.id, {
      onDelete: 'set null',
    }),
    model: marketingAttributionModelEnum('model').notNull(),
    totalAmount: real('total_amount').notNull(),
    currency: varchar('currency', {
      length: 12,
    }),
    allocations: jsonb('allocations').notNull(),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    calculatedAt: timestamp('calculated_at', {
      withTimezone: true,
    }).notNull(),
    ...times,
  },
  (table) => [
    index('marketing_attribution_tenant_source_idx').on(table.tenantId, table.sourceEntityId),
    index('marketing_attribution_tenant_calculated_idx').on(table.tenantId, table.calculatedAt),
  ],
);

export const billingSubscriptionStatusEnum = pgEnum('billing_subscription_status', [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
]);

export const billingCycleEnum = pgEnum('billing_cycle', ['MONTHLY', 'YEARLY', 'CUSTOM']);

export const billingInvoiceStatusEnum = pgEnum('billing_invoice_status', [
  'DRAFT',
  'OPEN',
  'PAID',
  'VOID',
  'UNCOLLECTIBLE',
]);

export const billingPaymentStatusEnum = pgEnum('billing_payment_status', [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
]);

export const billingPlans = pgTable(
  'billing_plans',
  {
    id: id(),
    code: varchar('code', {
      length: 80,
    }).notNull(),
    name: varchar('name', {
      length: 160,
    }).notNull(),
    description: text('description'),
    currency: varchar('currency', {
      length: 12,
    }).notNull(),
    priceMonthlyMinor: integer('price_monthly_minor'),
    priceYearlyMinor: integer('price_yearly_minor'),
    active: boolean('active').notNull().default(true),
    ...times,
  },
  (table) => [uniqueIndex('billing_plans_code_uidx').on(table.code)],
);

export const billingPlanEntitlements = pgTable(
  'billing_plan_entitlements',
  {
    id: id(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => billingPlans.id, {
        onDelete: 'cascade',
      }),
    key: varchar('key', {
      length: 180,
    }).notNull(),
    value: jsonb('value').notNull(),
    ...times,
  },
  (table) => [uniqueIndex('billing_plan_entitlements_plan_key_uidx').on(table.planId, table.key)],
);

export const billingSubscriptions = pgTable(
  'billing_subscriptions',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => billingPlans.id),
    status: billingSubscriptionStatusEnum('status').notNull(),
    billingCycle: billingCycleEnum('billing_cycle').notNull(),
    startedAt: timestamp('started_at', {
      withTimezone: true,
    }).notNull(),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true,
    }).notNull(),
    trialEndsAt: timestamp('trial_ends_at', {
      withTimezone: true,
    }),
    cancelledAt: timestamp('cancelled_at', {
      withTimezone: true,
    }),
    provider: varchar('provider', {
      length: 80,
    }),
    providerSubscriptionId: varchar('provider_subscription_id', {
      length: 240,
    }),
    ...times,
  },
  (table) => [
    index('billing_subscriptions_tenant_status_idx').on(table.tenantId, table.status),
    index('billing_subscriptions_tenant_period_idx').on(table.tenantId, table.currentPeriodEnd),
  ],
);

export const billingOrganizationEntitlements = pgTable(
  'billing_organization_entitlements',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    key: varchar('key', {
      length: 180,
    }).notNull(),
    value: jsonb('value').notNull(),
    reason: text('reason'),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    }),
    ...times,
  },
  (table) => [
    uniqueIndex('billing_org_entitlements_tenant_key_uidx').on(table.tenantId, table.key),
  ],
);

export const billingUsageCounters = pgTable(
  'billing_usage_counters',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    key: varchar('key', {
      length: 180,
    }).notNull(),
    periodStart: timestamp('period_start', {
      withTimezone: true,
    }).notNull(),
    periodEnd: timestamp('period_end', {
      withTimezone: true,
    }).notNull(),
    used: integer('used').notNull().default(0),
    limit: integer('limit'),
    ...times,
  },
  (table) => [
    uniqueIndex('billing_usage_tenant_key_period_uidx').on(
      table.tenantId,
      table.key,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const billingInvoices = pgTable(
  'billing_invoices',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    subscriptionId: uuid('subscription_id').references(() => billingSubscriptions.id, {
      onDelete: 'set null',
    }),
    externalInvoiceId: varchar('external_invoice_id', {
      length: 240,
    }),
    currency: varchar('currency', {
      length: 12,
    }).notNull(),
    amountDueMinor: integer('amount_due_minor').notNull(),
    amountPaidMinor: integer('amount_paid_minor').notNull().default(0),
    status: billingInvoiceStatusEnum('status').notNull(),
    issuedAt: timestamp('issued_at', {
      withTimezone: true,
    }).notNull(),
    dueAt: timestamp('due_at', {
      withTimezone: true,
    }),
    paidAt: timestamp('paid_at', {
      withTimezone: true,
    }),
    ...times,
  },
  (table) => [index('billing_invoices_tenant_status_idx').on(table.tenantId, table.status)],
);

export const billingPayments = pgTable(
  'billing_payments',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    invoiceId: uuid('invoice_id').references(() => billingInvoices.id, {
      onDelete: 'set null',
    }),
    externalPaymentId: varchar('external_payment_id', {
      length: 240,
    }),
    provider: varchar('provider', {
      length: 80,
    }),
    currency: varchar('currency', {
      length: 12,
    }).notNull(),
    amountMinor: integer('amount_minor').notNull(),
    status: billingPaymentStatusEnum('status').notNull(),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
    }).notNull(),
    ...times,
  },
  (table) => [index('billing_payments_tenant_status_idx').on(table.tenantId, table.status)],
);

export const billingUsageEvents = pgTable(
  'billing_usage_events',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    key: varchar('key', {
      length: 180,
    }).notNull(),
    amount: integer('amount').notNull(),
    idempotencyKey: varchar('idempotency_key', {
      length: 255,
    }).notNull(),
    source: varchar('source', {
      length: 100,
    }).notNull(),
    agentRunId: varchar('agent_run_id', {
      length: 255,
    }),
    workflowRunId: varchar('workflow_run_id', {
      length: 255,
    }),
    periodStart: timestamp('period_start', {
      withTimezone: true,
    }).notNull(),
    periodEnd: timestamp('period_end', {
      withTimezone: true,
    }).notNull(),
    ...times,
  },
  (table) => [
    uniqueIndex('billing_usage_events_tenant_idempotency_uidx').on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index('billing_usage_events_tenant_key_period_idx').on(
      table.tenantId,
      table.key,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const automationDefinitions = pgTable(
  'automation_definitions',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    name: varchar('name', { length: 200 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    triggerType: varchar('trigger_type', { length: 30 }).notNull(),
    triggerConfig: jsonb('trigger_config').notNull(),
    conditionMode: varchar('condition_mode', { length: 10 }).notNull(),
    conditions: jsonb('conditions').notNull(),
    workflowReference: varchar('workflow_reference', { length: 240 }).notNull(),
    locale: varchar('locale', { length: 12 }).notNull(),
    ...times,
  },
  (table) => [
    index('automation_definitions_tenant_enabled_idx').on(table.tenantId, table.enabled),
    index('automation_definitions_tenant_trigger_idx').on(table.tenantId, table.triggerType),
  ],
);

export const automationExecutions = pgTable(
  'automation_executions',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    automationId: uuid('automation_id')
      .notNull()
      .references(() => automationDefinitions.id, {
        onDelete: 'cascade',
      }),
    idempotencyKey: varchar('idempotency_key', { length: 240 }).notNull(),
    triggerType: varchar('trigger_type', { length: 30 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    workflowId: varchar('workflow_id', { length: 240 }),
    payload: jsonb('payload').notNull(),
    attempts: integer('attempts').notNull().default(1),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).defaultNow().notNull(),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    error: text('error'),
    ...times,
  },
  (table) => [
    uniqueIndex('automation_executions_tenant_idempotency_uidx').on(
      table.tenantId,
      table.automationId,
      table.idempotencyKey,
    ),
    index('automation_executions_tenant_status_idx').on(table.tenantId, table.status),
  ],
);

export const marketingExecutionArtifacts = pgTable(
  'marketing_execution_artifacts',
  {
    id: id(),

    tenantId: tenant(() => tenants.id),

    domain: varchar('domain', {
      length: 30,
    }).notNull(),

    capabilityId: varchar('capability_id', {
      length: 80,
    }).notNull(),

    workflowId: varchar('workflow_id', {
      length: 240,
    }).notNull(),

    taskId: varchar('task_id', {
      length: 240,
    }).notNull(),

    workstreamId: varchar('workstream_id', {
      length: 240,
    }).notNull(),

    status: varchar('status', {
      length: 40,
    }).notNull(),

    version: integer('version').notNull().default(1),

    output: jsonb('output').notNull(),

    evidenceIds: jsonb('evidence_ids').notNull(),

    approvalId: varchar('approval_id', {
      length: 240,
    }),

    approvedConditions: jsonb('approved_conditions'),

    ...times,
  },

  (table) => [
    index('marketing_execution_tenant_domain_idx').on(table.tenantId, table.domain),

    index('marketing_execution_tenant_workflow_idx').on(table.tenantId, table.workflowId),

    uniqueIndex('marketing_execution_tenant_artifact_version_uidx').on(
      table.tenantId,
      table.id,
      table.version,
    ),
  ],
);

export const marketingExecutionApprovalBindings = pgTable(
  'marketing_execution_approval_bindings',
  {
    id: id(),

    tenantId: tenant(() => tenants.id),

    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => marketingExecutionArtifacts.id, {
        onDelete: 'cascade',
      }),

    approvalId: varchar('approval_id', {
      length: 240,
    }).notNull(),

    status: varchar('status', {
      length: 40,
    }).notNull(),

    conditions: jsonb('conditions'),

    ...times,
  },

  (table) => [
    uniqueIndex('marketing_execution_approval_tenant_artifact_uidx').on(
      table.tenantId,
      table.artifactId,
    ),

    index('marketing_execution_approval_tenant_idx').on(table.tenantId),
  ],
);

export const marketingExecutionWorkflowBindings = pgTable(
  'marketing_execution_workflow_bindings',
  {
    id: id(),

    tenantId: tenant(() => tenants.id),

    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => marketingExecutionArtifacts.id, {
        onDelete: 'cascade',
      }),

    workflowId: varchar('workflow_id', {
      length: 240,
    }).notNull(),

    taskId: varchar('task_id', {
      length: 240,
    }).notNull(),

    workstreamId: varchar('workstream_id', {
      length: 240,
    }).notNull(),

    fromDomain: varchar('from_domain', {
      length: 30,
    }).notNull(),

    toDomain: varchar('to_domain', {
      length: 30,
    }),

    ...times,
  },

  (table) => [
    index('marketing_execution_binding_tenant_workflow_idx').on(table.tenantId, table.workflowId),

    uniqueIndex('marketing_execution_binding_tenant_artifact_uidx').on(
      table.tenantId,
      table.artifactId,
    ),
  ],
);

export const governanceFeatureFlags = pgTable(
  'governance_feature_flags',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    key: varchar('key', { length: 180 }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    description: text('description'),
    ...times,
  },
  (table) => [
    uniqueIndex('governance_feature_flags_tenant_key_uidx').on(table.tenantId, table.key),
    index('governance_feature_flags_tenant_enabled_idx').on(table.tenantId, table.enabled),
  ],
);

export const governanceDataExportRequests = pgTable(
  'governance_data_export_requests',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    resourceTypes: jsonb('resource_types').notNull().default([]),
    filters: jsonb('filters').notNull().default({}),
    status: varchar('status', { length: 40 }).notNull(),
    approvalId: uuid('approval_id'),
    ...times,
  },
  (table) => [
    index('governance_data_export_requests_tenant_status_idx').on(table.tenantId, table.status),
    index('governance_data_export_requests_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

export const governanceDataDeletionRequests = pgTable(
  'governance_data_deletion_requests',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    resourceTypes: jsonb('resource_types').notNull().default([]),
    selectors: jsonb('selectors').notNull().default({}),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 40 }).notNull(),
    approvalId: uuid('approval_id'),
    ...times,
  },
  (table) => [
    index('governance_data_deletion_requests_tenant_status_idx').on(table.tenantId, table.status),
    index('governance_data_deletion_requests_tenant_created_idx').on(
      table.tenantId,
      table.createdAt,
    ),
  ],
);

export const governanceRetentionPolicies = pgTable(
  'governance_retention_policies',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    resourceType: varchar('resource_type', { length: 180 }).notNull(),
    retentionDays: integer('retention_days').notNull(),
    disposition: varchar('disposition', { length: 40 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...times,
  },
  (table) => [
    uniqueIndex('governance_retention_policies_tenant_resource_uidx').on(
      table.tenantId,
      table.resourceType,
    ),
    index('governance_retention_policies_tenant_enabled_idx').on(table.tenantId, table.enabled),
  ],
);

export const governanceOrganizationOverrides = pgTable(
  'governance_organization_overrides',
  {
    id: id(),
    tenantId: tenant(() => tenants.id),
    key: varchar('key', { length: 180 }).notNull(),
    value: jsonb('value').notNull(),
    reason: text('reason'),
    active: boolean('active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...times,
  },
  (table) => [
    uniqueIndex('governance_organization_overrides_tenant_key_uidx').on(table.tenantId, table.key),
    index('governance_organization_overrides_tenant_active_idx').on(table.tenantId, table.active),
  ],
);

// Governance audit records use the established tenant-scoped audit_events table.
export const governanceAuditEvents = auditEvents;
