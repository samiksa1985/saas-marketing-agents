import assert from 'node:assert/strict';
import test from 'node:test';
import type { TenantContext } from '@platform/contracts';
import {
  InMemoryWorkflowRuntime,
  InvalidTransitionError,
  LeaseConflictError,
  LocalWorkflowExecutor,
  ReadinessResolver,
  TaskStateMachine,
  WorkflowStateMachine,
  type Task,
  type TransitionMetadata,
  type Workflow,
} from './index.js';

const context = (tenantId: string, locale: TenantContext['locale'] = 'en'): TenantContext => ({
  tenantId,
  roles: ['tenant_admin'],
  permissions: ['workflow:execute', 'workflow:read'],
  locale,
});
const metadata = (key: string, timestamp = '2026-01-01T00:00:00.000Z'): TransitionMetadata => ({
  actor: 'test-user',
  reason: key,
  timestamp,
  idempotencyKey: key,
});
async function runtime() {
  return new InMemoryWorkflowRuntime();
}
async function workflowWithTasks(selectedWorkstreamIds = ['01', '02']) {
  const engine = await runtime();
  const workflow = await engine.createWorkflow({
    tenantId: 'tenant-a',
    engagementId: 'engagement-a',
    locale: 'en',
    selectedWorkstreamIds,
    idempotencyKey: 'create-1',
  });
  return { engine, workflow, tasks: engine.getTasks(workflow.id, context('tenant-a')) };
}
function makeReady(task: Task): void {
  task.unresolvedInputs = [];
  for (const dependency of task.dependencyReferences) dependency.satisfied = true;
}

test('workflow creation creates immutable graph snapshot', async () => {
  const { workflow } = await workflowWithTasks(['01']);
  assert.equal(workflow.status, 'created');
  assert.equal(workflow.graphSnapshot.workstreamDefinitions.length, 1);
  assert.ok(workflow.graphSnapshot.sourceRevision);
});

test('deterministic task generation and duplicate workflow creation are idempotent', async () => {
  const engine = await runtime();
  const input = {
    tenantId: 'tenant-a',
    engagementId: 'engagement-a',
    locale: 'en' as const,
    selectedWorkstreamIds: ['02', '01'],
    idempotencyKey: 'same-command',
  };
  const first = await engine.createWorkflow(input);
  const second = await engine.createWorkflow(input);
  assert.equal(first.id, second.id);
  assert.deepEqual(
    engine.getTasks(first.id, context('tenant-a')).map((task) => task.workstreamId),
    ['01', '02'],
  );
});

test('blocking dependency prevents readiness and accepted dependency enables readiness', async () => {
  const { engine, tasks } = await workflowWithTasks();
  makeReady(tasks[0]!);
  makeReady(tasks[1]!);
  tasks[1]!.dependencyReferences[0]!.satisfied = false;
  assert.equal(engine.isTaskReady(tasks[1]!.id, context('tenant-a')).ready, false);
  tasks[1]!.dependencyReferences[0]!.satisfied = true;
  assert.equal(engine.isTaskReady(tasks[1]!.id, context('tenant-a')).ready, true);
});

test('optional dependency does not block readiness', () => {
  const task = {
    id: 'task',
    tenantId: 'tenant-a',
    workflowId: 'workflow',
    workstreamId: '01',
    status: 'ready',
    inputArtifactReferences: [],
    dependencyReferences: [
      { taskId: 'task', dependsOnTaskId: 'optional', kind: 'optional', satisfied: false },
    ],
    attempts: [],
    createdAt: '',
    updatedAt: '',
    requiredApprovalIds: [],
    acceptedApprovalIds: [],
    unresolvedInputs: [],
  } as Task;
  const workflow: Workflow = {
    id: 'workflow',
    tenantId: 'tenant-a',
    engagementId: 'engagement',
    locale: 'en',
    selectedWorkstreamIds: ['01'],
    graphSnapshot: {
      version: 'v1',
      sourcePath: '',
      sourceRevision: '',
      workstreamIds: ['01'],
      edges: [],
      hasCycles: false,
      workstreamDefinitions: [],
      gateDefinitions: [],
    },
    status: 'running',
    createdAt: '',
    updatedAt: '',
    creationIdempotencyKey: '',
  };
  assert.equal(
    new ReadinessResolver().resolve(task, workflow, [], new Set(), context('tenant-a')).ready,
    true,
  );
});

test('[NEEDS INPUT] blocks correctly', async () => {
  const { engine, tasks } = await workflowWithTasks(['06']);
  assert.equal(engine.isTaskReady(tasks[0]!.id, context('tenant-a')).ready, false);
  assert.match(
    engine.isTaskReady(tasks[0]!.id, context('tenant-a')).issues.join(' '),
    /NEEDS INPUT/,
  );
});

test('invalid state transition rejected and valid transition audits', () => {
  const events: unknown[] = [];
  const machine = new WorkflowStateMachine((event) => events.push(event));
  const workflow = {
    status: 'created',
    id: 'workflow',
    tenantId: 'tenant-a',
    updatedAt: '',
  } as Workflow;
  machine.transition(workflow, 'ready', metadata('start'));
  assert.equal(workflow.status, 'ready');
  assert.equal(events.length, 1);
  assert.throws(
    () => machine.transition(workflow, 'accepted', metadata('invalid')),
    InvalidTransitionError,
  );
});

test('task lease conflict is rejected and expired lease can be reclaimed', async () => {
  const { engine, tasks } = await workflowWithTasks(['01']);
  makeReady(tasks[0]!);
  const first = await engine.claimTask(
    tasks[0]!.id,
    'worker-a',
    'claim-a',
    context('tenant-a'),
    metadata('claim-a', '2026-01-01T00:00:00.000Z'),
  );
  assert.equal(first.workerId, 'worker-a');
  await assert.rejects(
    () =>
      engine.claimTask(
        tasks[0]!.id,
        'worker-b',
        'claim-b',
        context('tenant-a'),
        metadata('claim-b', '2026-01-01T00:00:01.000Z'),
      ),
    LeaseConflictError,
  );
  const recovered = await engine.claimTask(
    tasks[0]!.id,
    'worker-b',
    'claim-b',
    context('tenant-a'),
    metadata('claim-b', '2026-01-01T00:01:00.000Z'),
  );
  assert.equal(recovered.workerId, 'worker-b');
});

test('mock agent produces a proposed artifact and cannot self-approve', async () => {
  const { engine, workflow, tasks } = await workflowWithTasks(['01']);
  makeReady(tasks[0]!);
  await engine.start(workflow.id, context('tenant-a'), metadata('start'));
  await engine.claimTask(tasks[0]!.id, 'worker-a', 'claim', context('tenant-a'), metadata('claim'));
  const artifact = await engine.executeTask(tasks[0]!.id, context('tenant-a'), metadata('execute'));
  assert.equal(artifact.autoApproved, false);
  assert.equal(artifact.accepted, false);
  assert.equal(engine.getArtifacts(workflow.id, context('tenant-a')).length, 1);
});

test('validation failure triggers repair_required', async () => {
  const { engine, workflow, tasks } = await workflowWithTasks(['01']);
  makeReady(tasks[0]!);
  await engine.start(workflow.id, context('tenant-a'), metadata('start'));
  await engine.claimTask(tasks[0]!.id, 'worker-a', 'claim', context('tenant-a'), metadata('claim'));
  await engine.executeTask(tasks[0]!.id, context('tenant-a'), metadata('execute'));
  tasks[0]!.unresolvedInputs = ['[NEEDS INPUT: defect]'];
  const validation = engine.failValidation(tasks[0]!.id, context('tenant-a'), metadata('repair'));
  assert.equal(validation.valid, false);
  assert.equal(tasks[0]!.status, 'repair_required');
});

test('accepted handoff unlocks downstream task and rejected handoff blocks it', async () => {
  const { engine, workflow, tasks } = await workflowWithTasks();
  makeReady(tasks[0]!);
  makeReady(tasks[1]!);
  tasks[1]!.dependencyReferences[0]!.satisfied = false;
  const handoff = engine.createHandoff({
    tenantId: 'tenant-a',
    workflowId: workflow.id,
    fromWorkstreamId: '01',
    toWorkstreamId: '02',
    artifactIds: [],
  });
  engine.rejectHandoff(
    handoff.id,
    [{ code: 'missing', message: 'Missing artifact' }],
    context('tenant-a'),
    metadata('reject'),
  );
  assert.equal(engine.isTaskReady(tasks[1]!.id, context('tenant-a')).ready, false);
  const accepted = engine.createHandoff({
    tenantId: 'tenant-a',
    workflowId: workflow.id,
    fromWorkstreamId: '01',
    toWorkstreamId: '02',
    artifactIds: ['artifact'],
  });
  engine.acceptHandoff(accepted.id, context('tenant-a'), metadata('accept'));
  assert.equal(engine.isTaskReady(tasks[1]!.id, context('tenant-a')).ready, true);
});

test('tenant isolation denies workflow access', async () => {
  const { engine, workflow } = await workflowWithTasks(['01']);
  assert.throws(() => engine.getWorkflow(workflow.id, context('tenant-b')), /Cross-tenant/);
});

test('Arabic and English execution contexts are preserved', async () => {
  const engine = await runtime();
  const arabic = await engine.createWorkflow({
    tenantId: 'tenant-ar',
    engagementId: 'engagement',
    locale: 'ar-SA',
    selectedWorkstreamIds: ['01'],
    idempotencyKey: 'ar',
  });
  const english = await engine.createWorkflow({
    tenantId: 'tenant-en',
    engagementId: 'engagement',
    locale: 'en-US',
    selectedWorkstreamIds: ['01'],
    idempotencyKey: 'en',
  });
  assert.equal(arabic.locale, 'ar-SA');
  assert.equal(english.locale, 'en-US');
});

test('local executor uses the same deterministic state machine', async () => {
  const { engine, workflow, tasks } = await workflowWithTasks(['01']);
  makeReady(tasks[0]!);
  await new LocalWorkflowExecutor(engine).run(workflow.id, context('tenant-a'), metadata('local'));
  assert.equal(engine.getWorkflow(workflow.id, context('tenant-a')).status, 'running');
  assert.equal(engine.getTasks(workflow.id, context('tenant-a'))[0]!.status, 'awaiting_validation');
});

test('task state machine rejects accepted to running', () => {
  const machine = new TaskStateMachine(() => undefined);
  const task = { status: 'accepted', updatedAt: '' } as never;
  assert.throws(() => machine.transition(task, 'running', metadata('bad')), InvalidTransitionError);
});
