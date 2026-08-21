import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import type {
  AgentExecutor,
  AgentExecutionResult,
  ProposedAgentArtifact,
} from './index.js';

import type {
  ParsedAgentDefinition,
} from './definition-loader.js';

import {
  AgentExecutionOrchestrator,
} from './execution-orchestrator.js';

import {
  AgentWorkflowRunner,
} from './agent-workflow-runner.js';

import {
  InMemoryWorkflowRuntime,
} from '@platform/workflow-runtime';

function context(
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
  idempotencyKey: string,
) {
  return {
    actor:
      'agent-workflow-test',

    reason:
      'Run agent workflow task',

    timestamp:
      '2026-01-01T00:00:00.000Z',

    idempotencyKey,
  };
}

const definition:
  ParsedAgentDefinition = {
  agentId:
    'agent-001',

  name:
    'Runner Test Agent',

  description:
    'Agent used by workflow runner tests',

  identity:
    'Deterministic test agent',

  mission: [
    'Execute the requested workflow task.',
  ],

  criticalRules: [
    'Never self-approve.',
  ],

  deliverables: [
    'Produce a proposed artifact.',
  ],

  successMetrics: [
    'Return a valid proposed artifact.',
  ],

  needsInput: [],

  sourcePath:
    'test/agent-001.md',

  sourceRevision:
    'revision-001',

  version:
    '1',
};

class FakeAgentExecutor
  implements AgentExecutor {
  public calls = 0;

  async execute(
    request: Parameters<
      AgentExecutor['execute']
    >[0],
  ): Promise<AgentExecutionResult> {
    this.calls += 1;

    const artifact:
      ProposedAgentArtifact = {
      artifactId:
        `agent-artifact-${this.calls}`,

      tenantId:
        request.tenantContext.tenantId,

      workflowId:
        request.workflowId,

      taskId:
        request.taskId,

      workstreamId:
        request.workstreamId,

      version:
        '1',

      status:
        'draft',

      accepted:
        false,

      payload: {
        kind:
          'agent-proposal',

        content:
          'real workflow agent result',

        locale:
          request.locale,
      },

      autoApproved:
        false,
    };

    return {
      executionId:
        `execution-${this.calls}`,

      proposedArtifact:
        artifact,

      usage: {
        inputTokens:
          10,

        outputTokens:
          20,

        totalTokens:
          30,

        estimatedCost:
          0.01,

        currency:
          'USD',
      },

      provider:
        'mock-provider',

      model:
        'deterministic-v1',

      durationMs:
        5,

      warnings: [],

      errors: [],
    };
  }
}

function createRunner(
  runtime:
    InMemoryWorkflowRuntime,
  fakeExecutor:
    FakeAgentExecutor,
): AgentWorkflowRunner {
  const agentOrchestrator =
    new AgentExecutionOrchestrator({
      executor:
        fakeExecutor,

      definitionLoader: {
        async load() {
          return definition;
        },
      },
    });

  return new AgentWorkflowRunner({
    runtime,

    agentOrchestrator,

    requestBuilder:
      (
        workflowContext,
      ) => ({
        tenantContext:
          workflowContext.tenantContext,

        workflowId:
          workflowContext.workflow.id,

        taskId:
          workflowContext.task.id,

        workstreamId:
          workflowContext.task.workstreamId,

        agentId:
          'agent-001',

        agentSourcePath:
          'test/agent-001.md',

        locale:
          workflowContext.workflow.locale,

        input: {
          workflowId:
            workflowContext.workflow.id,

          taskId:
            workflowContext.task.id,

          workstreamId:
            workflowContext.task.workstreamId,
        },

        inputArtifactReferences:
          workflowContext.inputArtifacts,

        approvedSystemInstructions:
          'Execute the approved agent instructions.',

        executionPolicy: {
          provider:
            'mock',

          model:
            'deterministic-v1',

          timeoutMs:
            10000,

          maxRetries:
            1,

          retryableErrors: [
            'rate_limited',
            'timeout',
          ],

          maxInputTokens:
            4000,

          maxOutputTokens:
            2000,

          costLimit:
            1,

          requiredCapabilities: [
            'text-generation',
          ],
        },

        idempotencyKey:
          `agent:${workflowContext.workflow.id}:${workflowContext.task.id}`,
      }),
  });
}

async function createWorkflowScenario() {
  const runtime =
    new InMemoryWorkflowRuntime();

  const workflow =
    await runtime.createWorkflow({
      tenantId:
        'tenant-a',

      engagementId:
        'engagement-a',

      locale:
        'en',

      selectedWorkstreamIds:
        ['01'],

      idempotencyKey:
        'agent-runner-workflow',
    });

  const tasks =
    runtime.getTasks(
      workflow.id,
      context(),
    );

  for (
    const task of tasks
  ) {
    task.unresolvedInputs =
      [];

    for (
      const dependency of
        task.dependencyReferences
    ) {
      dependency.satisfied =
        true;
    }
  }

  return {
    runtime,

    workflow,

    task:
      tasks[0]!,
  };
}

test(
  'agent workflow runner executes the next ready task with the real agent orchestration path',
  async () => {
    const {
      runtime,
      workflow,
      task,
    } =
      await createWorkflowScenario();

    const fakeExecutor =
      new FakeAgentExecutor();

    const runner =
      createRunner(
        runtime,
        fakeExecutor,
      );

    const result =
      await runner.runNextReadyTask({
        workflowId:
          workflow.id,

        tenantContext:
          context(),

        metadata:
          metadata(
            'run-agent-task-001',
          ),
      });

    assert.equal(
      result.stopReason,
      'executed',
    );

    assert.ok(
      result.task,
    );

    assert.equal(
      result.task!.id,
      task.id,
    );

    assert.ok(
      result.lease,
    );

    assert.ok(
      result.execution,
    );

    assert.ok(
      result.completedArtifact,
    );

    assert.equal(
      result.execution!.artifact
        .payload.kind,
      'agent-proposal',
    );

    assert.equal(
      result.completedArtifact!
        .artifactId,
      result.execution!.artifact
        .artifactId,
    );

    assert.equal(
      result.completedArtifact!
        .workflowId,
      workflow.id,
    );

    assert.equal(
      result.completedArtifact!
        .taskId,
      task.id,
    );

    assert.equal(
      result.completedArtifact!
        .accepted,
      false,
    );

    assert.equal(
      fakeExecutor.calls,
      1,
    );

    assert.equal(
      result.task!.status,
      'awaiting_validation',
    );
  },
);

test(
  'agent workflow runner completes the task after agent execution',
  async () => {
    const {
      runtime,
      workflow,
      task,
    } =
      await createWorkflowScenario();

    const fakeExecutor =
      new FakeAgentExecutor();

    const runner =
      createRunner(
        runtime,
        fakeExecutor,
      );

    const result =
      await runner.runNextReadyTask({
        workflowId:
          workflow.id,

        tenantContext:
          context(),

        metadata:
          metadata(
            'run-agent-task-002',
          ),
      });

    assert.ok(
      result.completedArtifact,
    );

    assert.equal(
      result.task!.status,
      'awaiting_validation',
    );

    const refreshed =
      runtime.getTasks(
        workflow.id,
        context(),
      );

    const refreshedTask =
      refreshed.find(
        (item) =>
          item.id ===
          task.id,
      );

    assert.ok(
      refreshedTask,
    );

    assert.equal(
      refreshedTask!.status,
      'awaiting_validation',
    );

    assert.equal(
      fakeExecutor.calls,
      1,
    );
  },
);

test(
  'agent workflow runner does not execute a task already awaiting validation',
  async () => {
    const {
      runtime,
      workflow,
      task,
    } =
      await createWorkflowScenario();

    task.status =
      'awaiting_validation';

    const fakeExecutor =
      new FakeAgentExecutor();

    const runner =
      createRunner(
        runtime,
        fakeExecutor,
      );

    const result =
      await runner.runNextReadyTask({
        workflowId:
          workflow.id,

        tenantContext:
          context(),

        metadata:
          metadata(
            'run-agent-task-003',
          ),
      });

    assert.equal(
      result.stopReason,
      'awaiting_existing_validation',
    );

    assert.equal(
      fakeExecutor.calls,
      0,
    );
  },
);

test(
  'agent workflow runner preserves tenant isolation',
  async () => {
    const {
      runtime,
      workflow,
    } =
      await createWorkflowScenario();

    const fakeExecutor =
      new FakeAgentExecutor();

    const runner =
      createRunner(
        runtime,
        fakeExecutor,
      );

    await assert.rejects(
      () =>
        runner.runNextReadyTask({
          workflowId:
            workflow.id,

          tenantContext:
            context(
              'tenant-b',
            ),

          metadata:
            metadata(
              'cross-tenant-run',
            ),
        }),
      /Cross-tenant access denied/i,
    );

    assert.equal(
      fakeExecutor.calls,
      0,
    );
  },
);

test(
  'agent workflow runner reports blocked when no task is ready',
  async () => {
    const {
      runtime,
      workflow,
    } =
      await createWorkflowScenario();

    const tasks =
      runtime.getTasks(
        workflow.id,
        context(),
      );

    for (
      const task of tasks
    ) {
      task.unresolvedInputs = [
        '[NEEDS INPUT]',
      ];
    }

    const fakeExecutor =
      new FakeAgentExecutor();

    const runner =
      createRunner(
        runtime,
        fakeExecutor,
      );

    const result =
      await runner.runNextReadyTask({
        workflowId:
          workflow.id,

        tenantContext:
          context(),

        metadata:
          metadata(
            'no-ready-task',
          ),
      });

    assert.equal(
      result.stopReason,
      'blocked',
    );

    assert.equal(
      fakeExecutor.calls,
      0,
    );
  },
);