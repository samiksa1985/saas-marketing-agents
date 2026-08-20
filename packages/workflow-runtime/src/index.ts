import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AgentDefinition,
  ArtifactReference,
  DependencyKind,
  Locale,
  TenantContext,
  WorkstreamDefinition,
  WorkflowGraphSnapshot as RegistryGraphSnapshot,
} from '@platform/contracts';
import {
  DependencyGraphLoader,
  DependencyGraphValidator,
  RegistryLoader,
} from '@platform/registry';

export type WorkflowState =
  | 'created'
  | 'ready'
  | 'running'
  | 'paused'
  | 'awaiting_validation'
  | 'awaiting_human'
  | 'accepted'
  | 'blocked'
  | 'repair_required'
  | 'retryable_failure'
  | 'failed'
  | 'cancelled'
  | 'superseded';
export type TaskState =
  | 'created'
  | 'ready'
  | 'claimed'
  | 'running'
  | 'awaiting_validation'
  | 'awaiting_human'
  | 'accepted'
  | 'blocked'
  | 'repair_required'
  | 'retryable_failure'
  | 'failed'
  | 'cancelled';
export interface TransitionMetadata {
  actor: string;
  reason: string;
  timestamp: string;
  idempotencyKey: string;
}
export interface WorkflowAuditEvent extends TransitionMetadata {
  id: string;
  tenantId: string;
  entityType: 'workflow' | 'task' | 'handoff' | 'artifact';
  entityId: string;
  from: string;
  to: string;
  type: 'state_transition' | 'created' | 'lease_acquired' | 'lease_released';
}
export interface GateDefinition {
  gateId: string;
  workstreamId: string;
  approvalRequirements: string[];
  acceptanceCriteria: string[];
}
export interface WorkflowGraphSnapshot extends RegistryGraphSnapshot {
  workstreamDefinitions: WorkstreamDefinition[];
  gateDefinitions: GateDefinition[];
}
export interface Workflow {
  id: string;
  tenantId: string;
  engagementId: string;
  locale: Locale;
  selectedWorkstreamIds: string[];
  graphSnapshot: WorkflowGraphSnapshot;
  status: WorkflowState;
  createdAt: string;
  updatedAt: string;
  creationIdempotencyKey: string;
}
export interface WorkflowRun {
  id: string;
  workflowId: string;
  tenantId: string;
  status: WorkflowState;
  startedAt?: string;
  finishedAt?: string;
}
export interface TaskDependency {
  taskId: string;
  dependsOnTaskId: string;
  kind: DependencyKind;
  satisfied: boolean;
}
export interface TaskAttempt {
  id: string;
  taskId: string;
  tenantId: string;
  attemptNumber: number;
  status: TaskState;
  createdAt: string;
  finishedAt?: string;
}
export interface ExecutionLease {
  taskId: string;
  tenantId: string;
  workerId: string;
  idempotencyKey: string;
  acquiredAt: string;
  expiresAt: string;
}
export interface Task {
  id: string;
  tenantId: string;
  workflowId: string;
  workstreamId: string;
  status: TaskState;
  inputArtifactReferences: ArtifactReference[];
  dependencyReferences: TaskDependency[];
  attempts: TaskAttempt[];
  createdAt: string;
  updatedAt: string;
  requiredApprovalIds: string[];
  acceptedApprovalIds: string[];
  unresolvedInputs: string[];
}
export interface ProposedArtifact extends ArtifactReference {
  workflowId: string;
  taskId: string;
  workstreamId: string;
  payload: { kind: 'mock-proposal'; content: string; locale: Locale };
  autoApproved: false;
}
export interface ValidationResult {
  valid: boolean;
  issues: string[];
}
export interface ReadinessResult {
  ready: boolean;
  issues: string[];
}
export interface HandoffDefect {
  code: string;
  message: string;
  field?: string;
}
export interface Handoff {
  id: string;
  tenantId: string;
  workflowId: string;
  fromWorkstreamId: string;
  toWorkstreamId: string;
  artifactIds: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
  defects: HandoffDefect[];
  createdAt: string;
  updatedAt: string;
}
export interface CreateWorkflowInput {
  tenantId: string;
  engagementId: string;
  locale: Locale;
  selectedWorkstreamIds: string[];
  idempotencyKey: string;
}

export class WorkflowRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowRuntimeError';
  }
}
export class InvalidTransitionError extends WorkflowRuntimeError {}
export class TenantIsolationError extends WorkflowRuntimeError {}
export class LeaseConflictError extends WorkflowRuntimeError {}

const workflowTransitions: Record<WorkflowState, WorkflowState[]> = {
  created: ['ready', 'blocked', 'cancelled', 'superseded'],
  ready: ['running', 'blocked', 'cancelled', 'superseded'],
  running: [
    'paused',
    'awaiting_validation',
    'awaiting_human',
    'accepted',
    'blocked',
    'repair_required',
    'retryable_failure',
    'failed',
    'cancelled',
  ],
  paused: ['ready', 'cancelled', 'superseded'],
  awaiting_validation: ['accepted', 'repair_required', 'blocked', 'failed'],
  awaiting_human: ['accepted', 'blocked', 'repair_required', 'failed'],
  accepted: ['superseded'],
  blocked: ['ready', 'repair_required', 'cancelled', 'superseded'],
  repair_required: ['ready', 'running', 'cancelled', 'superseded'],
  retryable_failure: ['ready', 'running', 'failed', 'cancelled'],
  failed: ['retryable_failure', 'superseded'],
  cancelled: ['superseded'],
  superseded: [],
};
const taskTransitions: Record<TaskState, TaskState[]> = {
  created: ['ready', 'blocked', 'cancelled'],
  ready: ['claimed', 'blocked', 'cancelled'],
  claimed: ['running', 'ready', 'blocked', 'cancelled'],
  running: [
    'awaiting_validation',
    'awaiting_human',
    'accepted',
    'blocked',
    'repair_required',
    'retryable_failure',
    'failed',
    'cancelled',
  ],
  awaiting_validation: ['accepted', 'repair_required', 'blocked', 'failed'],
  awaiting_human: ['accepted', 'repair_required', 'blocked', 'failed'],
  accepted: [],
  blocked: ['ready', 'repair_required', 'cancelled'],
  repair_required: ['ready', 'running', 'cancelled'],
  retryable_failure: ['ready', 'running', 'failed', 'cancelled'],
  failed: ['retryable_failure', 'cancelled'],
  cancelled: [],
};
function deterministicId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}
function now(): string {
  return new Date().toISOString();
}
function findRepositoryRoot(start: string): string {
  let current = start;
  while (current !== dirname(current)) {
    if (existsSync(join(current, 'strategy', 'workstreams'))) return current;
    current = dirname(current);
  }
  return start;
}
function requireTenant(context: TenantContext | undefined): TenantContext {
  if (!context?.tenantId) throw new TenantIsolationError('Tenant context is required');
  return context;
}
function assertTenant(expected: string, context: TenantContext | undefined): TenantContext {
  const valid = requireTenant(context);
  if (valid.tenantId !== expected) throw new TenantIsolationError('Cross-tenant access denied');
  return valid;
}
type AuditEntity = Pick<WorkflowAuditEvent, 'tenantId' | 'entityType' | 'entityId'>;
function transition<T extends string>(
  entity: { status: T },
  transitions: Record<T, T[]>,
  target: T,
  metadata: TransitionMetadata,
  emit: (event: WorkflowAuditEvent) => void,
  eventBase: AuditEntity,
): void {
  if (entity.status === target) return;
  if (!transitions[entity.status].includes(target))
    throw new InvalidTransitionError(`Invalid transition: ${entity.status} -> ${target}`);
  const from = entity.status;
  entity.status = target;
  emit({
    ...eventBase,
    ...metadata,
    from,
    to: target,
    type: 'state_transition',
    id: deterministicId('audit', `${eventBase.entityId}:${metadata.idempotencyKey}`),
  });
}
export class WorkflowStateMachine {
  constructor(private readonly emit: (event: WorkflowAuditEvent) => void) {}
  transition(workflow: Workflow, target: WorkflowState, metadata: TransitionMetadata): void {
    transition(workflow, workflowTransitions, target, metadata, this.emit, {
      tenantId: workflow.tenantId,
      entityType: 'workflow',
      entityId: workflow.id,
    });
    workflow.updatedAt = metadata.timestamp;
  }
}
export class TaskStateMachine {
  constructor(private readonly emit: (event: WorkflowAuditEvent) => void) {}
  transition(task: Task, target: TaskState, metadata: TransitionMetadata): void {
    transition(task, taskTransitions, target, metadata, this.emit, {
      tenantId: task.tenantId,
      entityType: 'task',
      entityId: task.id,
    });
    task.updatedAt = metadata.timestamp;
  }
}

export interface MockAgentExecutionContext {
  tenantId: string;
  workflowId: string;
  taskId: string;
  workstreamId: string;
  locale: Locale;
  agent?: AgentDefinition;
}
export class MockAgentExecutor {
  execute(context: MockAgentExecutionContext): ProposedArtifact {
    return {
      artifactId: deterministicId(
        'artifact',
        `${context.tenantId}:${context.workflowId}:${context.taskId}`,
      ),
      version: '1',
      tenantId: context.tenantId,
      status: 'draft',
      accepted: false,
      workflowId: context.workflowId,
      taskId: context.taskId,
      workstreamId: context.workstreamId,
      payload: {
        kind: 'mock-proposal',
        content: `Deterministic proposal for ${context.workstreamId}`,
        locale: context.locale,
      },
      autoApproved: false,
    };
  }
}
export interface WorkflowRuntime {
  createWorkflow(input: CreateWorkflowInput): Promise<Workflow>;
  start(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow>;
  pause(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow>;
  resume(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow>;
  cancel(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow>;
}

export class ReadinessResolver {
  resolve(
    task: Task,
    workflow: Workflow,
    handoffs: Handoff[],
    approvals: Set<string>,
    context?: TenantContext,
  ): ReadinessResult {
    const issues: string[] = [];
    if (!context?.tenantId || context.tenantId !== task.tenantId)
      issues.push('Tenant context is invalid');
    if (
      workflow.status === 'paused' ||
      workflow.status === 'cancelled' ||
      workflow.status === 'superseded'
    )
      issues.push('Workflow is not runnable');
    if (task.status === 'accepted') issues.push('Task has already been accepted');
    for (const dependency of task.dependencyReferences) {
      if (dependency.kind === 'blocking' && !dependency.satisfied)
        issues.push(`Blocking dependency is unsatisfied: ${dependency.dependsOnTaskId}`);
      if (dependency.kind === 'unresolved')
        issues.push('Unresolved [NEEDS INPUT] dependency remains');
    }
    for (const artifact of task.inputArtifactReferences)
      if (!artifact.accepted || artifact.tenantId !== task.tenantId)
        issues.push(`Required artifact is unavailable: ${artifact.artifactId}`);
    for (const approval of task.requiredApprovalIds)
      if (!approvals.has(approval)) issues.push(`Required approval is missing: ${approval}`);
    if (task.unresolvedInputs.length > 0) issues.push('Unresolved [NEEDS INPUT] remains');
    const downstreamHandoffs = handoffs.filter(
      (handoff) => handoff.toWorkstreamId === task.workstreamId,
    );
    if (
      downstreamHandoffs.some(
        (handoff) => handoff.status === 'rejected' || handoff.status === 'blocked',
      ) &&
      !downstreamHandoffs.some((handoff) => handoff.status === 'accepted')
    )
      issues.push('Required handoff is not accepted');
    return {
      ready:
        issues.length === 0 &&
        ['created', 'ready', 'repair_required', 'retryable_failure'].includes(task.status),
      issues,
    };
  }
}
export class WorkflowValidator {
  validate(
    workflow: Workflow,
    task: Task,
    context: TenantContext | undefined,
    approvals: Set<string>,
  ): ValidationResult {
    const issues: string[] = [];
    if (
      !context?.tenantId ||
      context.tenantId !== workflow.tenantId ||
      task.tenantId !== workflow.tenantId
    )
      issues.push('Tenant validation failed');
    if (!workflow.graphSnapshot.workstreamIds.includes(task.workstreamId))
      issues.push('Task workstream is not in graph snapshot');
    if (task.inputArtifactReferences.some((artifact) => artifact.tenantId !== task.tenantId))
      issues.push('Artifact tenant validation failed');
    if (task.requiredApprovalIds.some((approval) => !approvals.has(approval)))
      issues.push('Required approval validation failed');
    if (task.unresolvedInputs.length > 0) issues.push('Unresolved [NEEDS INPUT] remains');
    return { valid: issues.length === 0, issues };
  }
}

export class InMemoryWorkflowRuntime implements WorkflowRuntime {
  private readonly workflows = new Map<string, Workflow>();
  private readonly runs = new Map<string, WorkflowRun>();
  private readonly tasks = new Map<string, Task>();
  private readonly leases = new Map<string, ExecutionLease>();
  private readonly artifacts = new Map<string, ProposedArtifact>();
  private readonly handoffs = new Map<string, Handoff>();
  private readonly approvals = new Map<string, Set<string>>();
  private readonly audits: WorkflowAuditEvent[] = [];
  private readonly graphLoader: DependencyGraphLoader;
  private readonly registryLoader: RegistryLoader;
  private readonly workflowState = new WorkflowStateMachine((event) => this.audits.push(event));
  private readonly taskState = new TaskStateMachine((event) => this.audits.push(event));
  private readonly readiness = new ReadinessResolver();
  private readonly validator = new WorkflowValidator();
  private readonly executor = new MockAgentExecutor();
  constructor(repositoryRoot = findRepositoryRoot(process.cwd())) {
    this.graphLoader = new DependencyGraphLoader(repositoryRoot, new DependencyGraphValidator());
    this.registryLoader = new RegistryLoader(repositoryRoot);
  }
  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    requireTenant({ tenantId: input.tenantId, roles: [], permissions: [], locale: input.locale });
    const existing = [...this.workflows.values()].find(
      (workflow) =>
        workflow.tenantId === input.tenantId &&
        workflow.creationIdempotencyKey === input.idempotencyKey,
    );
    if (existing) return existing;
    const graph = await this.graphLoader.load('repository');
    const registry = await this.registryLoader.loadWorkstreams();
    const selected = [...new Set(input.selectedWorkstreamIds)].sort();
    if (selected.some((id) => !graph.workstreamIds.includes(id)))
      throw new WorkflowRuntimeError('Selected workstream is not in graph');
    const definitions = selected.map((id) => registry.get(id));
    const snapshot: WorkflowGraphSnapshot = {
      ...graph,
      workstreamDefinitions: definitions,
      gateDefinitions: definitions.map((definition) => ({
        gateId: deterministicId('gate', `${graph.version}:${definition.workstreamId}`),
        workstreamId: definition.workstreamId,
        approvalRequirements: definition.approvalGates,
        acceptanceCriteria: definition.acceptanceCriteria,
      })),
    };
    const timestamp = now();
    const workflow: Workflow = {
      id: deterministicId(
        'workflow',
        `${input.tenantId}:${input.engagementId}:${input.idempotencyKey}`,
      ),
      tenantId: input.tenantId,
      engagementId: input.engagementId,
      locale: input.locale,
      selectedWorkstreamIds: selected,
      graphSnapshot: snapshot,
      status: 'created',
      createdAt: timestamp,
      updatedAt: timestamp,
      creationIdempotencyKey: input.idempotencyKey,
    };
    this.workflows.set(workflow.id, workflow);
    this.runs.set(deterministicId('run', workflow.id), {
      id: deterministicId('run', workflow.id),
      workflowId: workflow.id,
      tenantId: workflow.tenantId,
      status: 'created',
    });
    this.approvals.set(workflow.id, new Set());
    this.generateTasks(workflow);
    this.audits.push({
      id: deterministicId('audit', `${workflow.id}:created`),
      tenantId: workflow.tenantId,
      entityType: 'workflow',
      entityId: workflow.id,
      type: 'created',
      from: 'none',
      to: 'created',
      actor: 'system',
      reason: 'Workflow created',
      timestamp,
      idempotencyKey: input.idempotencyKey,
    });
    return workflow;
  }
  private generateTasks(workflow: Workflow): void {
    const taskByWorkstream = new Map(
      workflow.selectedWorkstreamIds.map((workstreamId) => [
        workstreamId,
        deterministicId('task', `${workflow.id}:${workstreamId}`),
      ]),
    );
    for (const workstreamId of workflow.selectedWorkstreamIds) {
      const definition = workflow.graphSnapshot.workstreamDefinitions.find(
        (item) => item.workstreamId === workstreamId,
      );
      const dependencyReferences = workflow.graphSnapshot.edges
        .filter(
          (edge) =>
            edge.toWorkstreamId === workstreamId &&
            workflow.selectedWorkstreamIds.includes(edge.fromWorkstreamId),
        )
        .map((edge) => ({
          taskId: deterministicId('task', `${workflow.id}:${workstreamId}`),
          dependsOnTaskId: taskByWorkstream.get(edge.fromWorkstreamId) ?? edge.fromWorkstreamId,
          kind: edge.kind,
          satisfied: false,
        }));
      const unresolvedInputs = workflow.graphSnapshot.edges
        .filter((edge) => edge.toWorkstreamId === workstreamId && edge.kind === 'unresolved')
        .map((edge) => edge.source);
      const taskId = taskByWorkstream.get(workstreamId) as string;
      this.tasks.set(taskId, {
        id: taskId,
        tenantId: workflow.tenantId,
        workflowId: workflow.id,
        workstreamId,
        status: 'created',
        inputArtifactReferences: [],
        dependencyReferences,
        attempts: [],
        createdAt: workflow.createdAt,
        updatedAt: workflow.createdAt,
        requiredApprovalIds: [],
        acceptedApprovalIds: [],
        unresolvedInputs: [...unresolvedInputs, ...(definition?.unresolvedInputs ?? [])],
      });
    }
  }
  getWorkflow(workflowId: string, context?: TenantContext): Workflow {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new WorkflowRuntimeError('Workflow not found');
    assertTenant(workflow.tenantId, context);
    return workflow;
  }
  getTasks(workflowId: string, context?: TenantContext): Task[] {
    const workflow = this.getWorkflow(workflowId, context);
    return [...this.tasks.values()].filter((task) => task.workflowId === workflow.id);
  }
  getArtifacts(workflowId: string, context?: TenantContext): ProposedArtifact[] {
    const workflow = this.getWorkflow(workflowId, context);
    return [...this.artifacts.values()].filter((artifact) => artifact.workflowId === workflow.id);
  }
  getHandoffs(workflowId: string, context?: TenantContext): Handoff[] {
    const workflow = this.getWorkflow(workflowId, context);
    return [...this.handoffs.values()].filter((handoff) => handoff.workflowId === workflow.id);
  }
  getAudits(context: TenantContext): WorkflowAuditEvent[] {
    requireTenant(context);
    return this.audits.filter((event) => event.tenantId === context.tenantId);
  }
  async start(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    const workflow = this.getWorkflow(workflowId, context);
    if (workflow.status === 'created') this.workflowState.transition(workflow, 'ready', metadata);
    if (workflow.status === 'ready')
      this.workflowState.transition(workflow, 'running', {
        ...metadata,
        idempotencyKey: `${metadata.idempotencyKey}:running`,
      });
    this.runs.get(deterministicId('run', workflow.id))!.status = workflow.status;
    return workflow;
  }
  async pause(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    const workflow = this.getWorkflow(workflowId, context);
    this.workflowState.transition(workflow, 'paused', metadata);
    return workflow;
  }
  async resume(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    const workflow = this.getWorkflow(workflowId, context);
    this.workflowState.transition(workflow, 'ready', metadata);
    return workflow;
  }
  async cancel(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    const workflow = this.getWorkflow(workflowId, context);
    this.workflowState.transition(workflow, 'cancelled', metadata);
    for (const task of this.getTasks(workflowId, context))
      if (task.status !== 'accepted' && task.status !== 'cancelled')
        this.taskState.transition(task, 'cancelled', {
          ...metadata,
          idempotencyKey: `${metadata.idempotencyKey}:${task.id}`,
        });
    return workflow;
  }
  isTaskReady(taskId: string, context: TenantContext): ReadinessResult {
    const task = this.tasks.get(taskId);
    if (!task) throw new WorkflowRuntimeError('Task not found');
    const workflow = this.getWorkflow(task.workflowId, context);
    const handoffs = this.getHandoffs(workflow.id, context);
    for (const handoff of handoffs.filter(
      (item) => item.status === 'accepted' && item.toWorkstreamId === task.workstreamId,
    ))
      for (const dependency of task.dependencyReferences)
        if (dependency.kind === 'blocking') dependency.satisfied = true;
    return this.readiness.resolve(
      task,
      workflow,
      handoffs,
      this.approvals.get(workflow.id) ?? new Set(),
      context,
    );
  }
  async claimTask(
    taskId: string,
    workerId: string,
    idempotencyKey: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<ExecutionLease> {
    const task = this.tasks.get(taskId);
    if (!task) throw new WorkflowRuntimeError('Task not found');
    assertTenant(task.tenantId, context);
    const existing = this.leases.get(taskId);
    const timestamp = new Date(metadata.timestamp).getTime();
    if (existing && new Date(existing.expiresAt).getTime() > timestamp) {
      if (existing.idempotencyKey === idempotencyKey && existing.workerId === workerId)
        return existing;
      throw new LeaseConflictError('Task lease is held by another worker');
    }
    if (existing && task.status === 'claimed')
      this.taskState.transition(task, 'ready', {
        ...metadata,
        idempotencyKey: `${idempotencyKey}:expired`,
      });
    const readiness = this.isTaskReady(taskId, context);
    if (!readiness.ready)
      throw new WorkflowRuntimeError(`Task is not ready: ${readiness.issues.join('; ')}`);
    if (task.status === 'created')
      this.taskState.transition(task, 'ready', {
        ...metadata,
        idempotencyKey: `${idempotencyKey}:ready`,
      });
    const lease: ExecutionLease = {
      taskId,
      tenantId: task.tenantId,
      workerId,
      idempotencyKey,
      acquiredAt: metadata.timestamp,
      expiresAt: new Date(timestamp + 30000).toISOString(),
    };
    this.leases.set(taskId, lease);
    this.taskState.transition(task, 'claimed', metadata);
    this.audits.push({
      id: deterministicId('audit', `${task.id}:lease:${idempotencyKey}`),
      tenantId: task.tenantId,
      entityType: 'task',
      entityId: task.id,
      type: 'lease_acquired',
      from: 'ready',
      to: 'claimed',
      actor: metadata.actor,
      reason: metadata.reason,
      timestamp: metadata.timestamp,
      idempotencyKey,
    });
    return lease;
  }
  async executeTask(
    taskId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<ProposedArtifact> {
    const task = this.tasks.get(taskId);
    if (!task) throw new WorkflowRuntimeError('Task not found');
    const workflow = this.getWorkflow(task.workflowId, context);
    assertTenant(task.tenantId, context);
    this.taskState.transition(task, 'running', metadata);
    const artifact = this.executor.execute({
      tenantId: task.tenantId,
      workflowId: workflow.id,
      taskId: task.id,
      workstreamId: task.workstreamId,
      locale: workflow.locale,
    });
    this.artifacts.set(artifact.artifactId, artifact);
    this.taskState.transition(task, 'awaiting_validation', {
      ...metadata,
      idempotencyKey: `${metadata.idempotencyKey}:validation`,
    });
    return artifact;
  }
  validateTask(taskId: string, context: TenantContext): ValidationResult {
    const task = this.tasks.get(taskId);
    if (!task) throw new WorkflowRuntimeError('Task not found');
    const workflow = this.getWorkflow(task.workflowId, context);
    return new WorkflowValidator().validate(
      workflow,
      task,
      context,
      this.approvals.get(workflow.id) ?? new Set(),
    );
  }
  failValidation(
    taskId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): ValidationResult {
    const task = this.tasks.get(taskId);
    if (!task) throw new WorkflowRuntimeError('Task not found');
    const result = this.validateTask(taskId, context);
    if (!result.valid) this.taskState.transition(task, 'repair_required', metadata);
    return result;
  }
  async retryTask(
    taskId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) throw new WorkflowRuntimeError('Task not found');
    assertTenant(task.tenantId, context);
    this.taskState.transition(task, 'retryable_failure', metadata);
    this.taskState.transition(task, 'ready', {
      ...metadata,
      idempotencyKey: `${metadata.idempotencyKey}:ready`,
    });
    return task;
  }
  async repairTask(
    taskId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) throw new WorkflowRuntimeError('Task not found');
    assertTenant(task.tenantId, context);
    this.taskState.transition(task, 'repair_required', metadata);
    this.taskState.transition(task, 'ready', {
      ...metadata,
      idempotencyKey: `${metadata.idempotencyKey}:ready`,
    });
    return task;
  }
  async cancelTask(
    taskId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) throw new WorkflowRuntimeError('Task not found');
    assertTenant(task.tenantId, context);
    this.taskState.transition(task, 'cancelled', metadata);
    return task;
  }
  createHandoff(
    input: Omit<Handoff, 'id' | 'status' | 'defects' | 'createdAt' | 'updatedAt'>,
  ): Handoff {
    const timestamp = now();
    const id = deterministicId(
      'handoff',
      `${input.workflowId}:${input.fromWorkstreamId}:${input.toWorkstreamId}:${input.artifactIds.join(',')}`,
    );
    const existing = this.handoffs.get(id);
    if (existing) return existing;
    const handoff: Handoff = {
      ...input,
      id,
      status: 'pending',
      defects: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.handoffs.set(id, handoff);
    return handoff;
  }
  acceptHandoff(handoffId: string, context: TenantContext, metadata: TransitionMetadata): Handoff {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) throw new WorkflowRuntimeError('Handoff not found');
    assertTenant(handoff.tenantId, context);
    if (handoff.status === 'accepted') return handoff;
    if (handoff.status !== 'pending')
      throw new WorkflowRuntimeError('Only pending handoffs can be accepted');
    handoff.status = 'accepted';
    handoff.updatedAt = metadata.timestamp;
    return handoff;
  }
  rejectHandoff(
    handoffId: string,
    defects: HandoffDefect[],
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Handoff {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) throw new WorkflowRuntimeError('Handoff not found');
    assertTenant(handoff.tenantId, context);
    if (defects.length === 0)
      throw new WorkflowRuntimeError('Rejected handoff requires structured defects');
    handoff.status = 'rejected';
    handoff.defects = defects;
    handoff.updatedAt = metadata.timestamp;
    return handoff;
  }
  blockHandoff(
    handoffId: string,
    defect: HandoffDefect,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Handoff {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) throw new WorkflowRuntimeError('Handoff not found');
    assertTenant(handoff.tenantId, context);
    handoff.status = 'blocked';
    handoff.defects = [defect];
    handoff.updatedAt = metadata.timestamp;
    return handoff;
  }
}

export class LocalWorkflowExecutor implements WorkflowRuntime {
  constructor(private readonly runtime: InMemoryWorkflowRuntime) {}
  createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    return this.runtime.createWorkflow(input);
  }
  start(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    return this.runtime.start(workflowId, context, metadata);
  }
  pause(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    return this.runtime.pause(workflowId, context, metadata);
  }
  resume(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    return this.runtime.resume(workflowId, context, metadata);
  }
  cancel(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<Workflow> {
    return this.runtime.cancel(workflowId, context, metadata);
  }
  async run(
    workflowId: string,
    context: TenantContext,
    metadata: TransitionMetadata,
  ): Promise<void> {
    const workflow = this.runtime.getWorkflow(workflowId, context);
    if (workflow.status === 'created' || workflow.status === 'ready')
      await this.runtime.start(workflowId, context, metadata);
    for (const task of this.runtime.getTasks(workflowId, context)) {
      const readiness = this.runtime.isTaskReady(task.id, context);
      if (!readiness.ready) continue;
      await this.runtime.claimTask(
        task.id,
        'local-executor',
        `${metadata.idempotencyKey}:${task.id}`,
        context,
        metadata,
      );
      await this.runtime.executeTask(task.id, context, metadata);
    }
  }
}

export * from './temporal.js';
