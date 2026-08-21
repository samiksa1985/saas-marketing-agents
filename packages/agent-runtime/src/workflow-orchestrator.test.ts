import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import type {
  ProposedArtifact,
  Task,
  TransitionMetadata,
} from '@platform/workflow-runtime';

import {
  InMemoryWorkflowRuntime,
} from '@platform/workflow-runtime';

import {
  WorkflowOrchestrator,
  type WorkflowTaskExecutionContext,
  type WorkflowTaskExecutionResult,
  type WorkflowTaskExecutor,
} from './workflow-orchestrator.js';

function createContext(
  tenantId = 'tenant-a',
): TenantContext {
  return {
    tenantId,
    roles: [
      'tenant_admin',
    ],
    permissions: [
      'workflow:execute',
      'workflow:read',
      'artifact:read',
      'artifact:write',
    ],
    locale: 'en',
  };
}

function metadata(
  key: string,
): TransitionMetadata {
  return {
    actor: 'workflow-test',
    reason: key,
    timestamp:
      '2026-01-01T00:00:00.000Z',
    idempotencyKey: key,
  };
}

class DeterministicTaskExecutor
  implements WorkflowTaskExecutor {
  public calls: string[] = [];

  async execute(
    context: WorkflowTaskExecutionContext,
  ): Promise<WorkflowTaskExecutionResult> {
    this.calls.push(
      context.task.id,
    );

    const artifact: ProposedArtifact = {
      artifactId:
        `artifact-${context.task.id}`,

      version: '1',

      tenantId:
        context.task.tenantId,

      status: 'draft',

      accepted: false,

      workflowId:
        context.workflow.id,

      taskId:
        context.task.id,

      workstreamId:
        context.task.workstreamId,

      payload: {
        kind:
          'mock-proposal',

        content:
          `Proposal for ${context.task.workstreamId}`,

        locale:
          context.workflow.locale,
      },

      autoApproved:
        false,
    };

    return {
      artifact,
    };
  }
}

async function createWorkflow(
  selectedWorkstreamIds = [
    '01',
  ],
) {
  const runtime =
    new InMemoryWorkflowRuntime();

  const workflow =
    await runtime.createWorkflow({
      tenantId: 'tenant-a',

      engagementId:
        'engagement-a',

      locale: 'en',

      selectedWorkstreamIds,

      idempotencyKey:
        `workflow-${selectedWorkstreamIds.join('-')}`,
    });

  return {
    runtime,
    workflow,
  };
}

function makeTasksRunnable(
  tasks: Task[],
): void {
  for (const task of tasks) {
    task.unresolvedInputs = [];

    for (
      const dependency of
        task.dependencyReferences
    ) {
      dependency.satisfied = true;
    }
  }
}

test(
  'workflow orchestrator executes the next ready task',
  async () => {
    const {
      runtime,
      workflow,
    } =
      await createWorkflow(
        ['01'],
      );

    const tasks =
      runtime.getTasks(
        workflow.id,
        createContext(),
      );

    makeTasksRunnable(
      tasks,
    );

    const executor =
      new DeterministicTaskExecutor();

    const orchestrator =
      new WorkflowOrchestrator(
        runtime,
        executor,
      );

    const result =
      await orchestrator.run({
        workflowId:
          workflow.id,

        tenantContext:
          createContext(),

        metadata:
          metadata('run-001'),
      });

    assert.equal(
      result.executedTasks.length,
      1,
    );

    assert.equal(
      executor.calls.length,
      1,
    );

    assert.equal(
      result.executedTasks[0]!
        .workstreamId,
      '01',
    );

    assert.equal(
      result.executedTasks[0]!
        .artifact.accepted,
      false,
    );

    assert.equal(
      result.executedTasks[0]!
        .artifact.autoApproved,
      false,
    );
  },
);

test(
  'workflow orchestrator stops at awaiting validation',
  async () => {
    const {
      runtime,
      workflow,
    } =
      await createWorkflow([
        '01',
        '02',
      ]);

    const tasks =
      runtime.getTasks(
        workflow.id,
        createContext(),
      );

    makeTasksRunnable(
      tasks,
    );

    const executor =
      new DeterministicTaskExecutor();

    const orchestrator =
      new WorkflowOrchestrator(
        runtime,
        executor,
      );

    const result =
      await orchestrator.run({
        workflowId:
          workflow.id,

        tenantContext:
          createContext(),

        metadata:
          metadata('run-002'),
      });

    assert.equal(
      result.executedTasks.length,
      1,
    );

    assert.equal(
      result.stopReason,
      'awaiting_validation',
    );

    assert.equal(
      executor.calls.length,
      1,
    );

    const refreshedTasks =
      runtime.getTasks(
        workflow.id,
        createContext(),
      );

    const awaiting =
      refreshedTasks.find(
        (task) =>
          task.status ===
          'awaiting_validation',
      );

    assert.ok(
      awaiting,
    );
  },
);

test(
  'workflow orchestrator skips blocked tasks',
  async () => {
    const {
      runtime,
      workflow,
    } =
      await createWorkflow([
        '01',
        '02',
      ]);

    const tasks =
      runtime.getTasks(
        workflow.id,
        createContext(),
      );

    makeTasksRunnable(
      tasks,
    );

    const downstream =
      tasks.find(
        (task) =>
          task.workstreamId ===
          '02',
      );

    assert.ok(
      downstream,
    );

    const blockingDependency =
      downstream!.dependencyReferences.find(
        (dependency) =>
          dependency.kind ===
          'blocking',
      );

    assert.ok(
      blockingDependency,
    );

    blockingDependency.satisfied =
      false;

    const executor =
      new DeterministicTaskExecutor();

    const orchestrator =
      new WorkflowOrchestrator(
        runtime,
        executor,
      );

    const result =
      await orchestrator.run({
        workflowId:
          workflow.id,

        tenantContext:
          createContext(),

        metadata:
          metadata('run-003'),
      });

    assert.equal(
      result.executedTasks.length,
      1,
    );

    assert.equal(
      result.executedTasks[0]!
        .workstreamId,
      '01',
    );

    assert.equal(
      executor.calls.length,
      1,
    );
  },
);

test(
  'workflow orchestrator stops when no task is ready',
  async () => {
    const {
      runtime,
      workflow,
    } =
      await createWorkflow([
        '01',
      ]);

    const tasks =
      runtime.getTasks(
        workflow.id,
        createContext(),
      );

    for (const task of tasks) {
      task.unresolvedInputs = [
        '[NEEDS INPUT]',
      ];
    }

    const executor =
      new DeterministicTaskExecutor();

    const orchestrator =
      new WorkflowOrchestrator(
        runtime,
        executor,
      );

    const result =
      await orchestrator.run({
        workflowId:
          workflow.id,

        tenantContext:
          createContext(),

        metadata:
          metadata('run-004'),
      });

    assert.equal(
      result.executedTasks.length,
      0,
    );

    assert.equal(
      result.stopReason,
      'no_ready_tasks',
    );

    assert.equal(
      executor.calls.length,
      0,
    );
  },
);

test(
  'workflow orchestrator respects maxTasks when no validation gate interrupts execution',
  async () => {
    const {
      runtime,
      workflow,
    } =
      await createWorkflow([
        '01',
      ]);

    const tasks =
      runtime.getTasks(
        workflow.id,
        createContext(),
      );

    makeTasksRunnable(
      tasks,
    );

    const executor =
      new DeterministicTaskExecutor();

    const orchestrator =
      new WorkflowOrchestrator(
        runtime,
        executor,
      );

    const result =
      await orchestrator.run({
        workflowId:
          workflow.id,

        tenantContext:
          createContext(),

        metadata:
          metadata('run-005'),

        maxTasks: 1,
      });

    assert.equal(
      result.executedTasks.length,
      1,
    );

    assert.equal(
      result.stopReason,
      'awaiting_validation',
    );
  },
);

test(
  'workflow orchestrator preserves tenant isolation',
  async () => {
    const {
      workflow,
      runtime,
    } =
      await createWorkflow(
        ['01'],
      );

    const executor =
      new DeterministicTaskExecutor();

    const orchestrator =
      new WorkflowOrchestrator(
        runtime,
        executor,
      );

    await assert.rejects(
      () =>
        orchestrator.run({
          workflowId:
            workflow.id,

          tenantContext:
            createContext(
              'tenant-b',
            ),

          metadata:
            metadata('run-006'),
        }),
      /Cross-tenant access denied/i,
    );
  },
);

test(
  'workflow orchestrator is deterministic for the same task order',
  async () => {
    const {
      runtime,
      workflow,
    } =
      await createWorkflow([
        '02',
        '01',
      ]);

    const tasks =
      runtime.getTasks(
        workflow.id,
        createContext(),
      );

    makeTasksRunnable(
      tasks,
    );

    const executor =
      new DeterministicTaskExecutor();

    const orchestrator =
      new WorkflowOrchestrator(
        runtime,
        executor,
      );

    const result =
      await orchestrator.run({
        workflowId:
          workflow.id,

        tenantContext:
          createContext(),

        metadata:
          metadata('run-007'),
      });

    assert.equal(
      result.executedTasks.length,
      1,
    );

    assert.equal(
      result.executedTasks[0]!
        .workstreamId,
      '01',
    );
  },
);