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
  HumanApprovalWorkflowGate,
} from './human-approval-workflow-gate.js';

import {
  HandoffRuntimeIntegration,
} from './handoff-runtime-integration.js';

import {
  AcceptedArtifactHandoffService,
} from './accepted-artifact-handoff.js';

import {
  InMemoryWorkflowRuntime,
  type TransitionMetadata,
} from '@platform/workflow-runtime';

function context(
  tenantId = 'tenant-e2e',
): TenantContext {
  return {
    tenantId,
    roles: [
      'tenant_admin',
      'reviewer',
    ],
    permissions: [
      'workflow:execute',
      'workflow:read',
      'artifact:read',
      'artifact:write',
      'approval:decide',
    ],
    locale:
      'en-US',
  };
}

function metadata(
  key: string,
): TransitionMetadata {
  return {
    actor:
      'e2e-system',
    reason:
      key,
    timestamp:
      '2026-01-01T00:00:00.000Z',
    idempotencyKey:
      key,
  };
}

const definition:
  ParsedAgentDefinition = {
  agentId:
    'e2e-agent-001',

  name:
    'E2E Workflow Agent',

  description:
    'Deterministic agent used for full workflow integration tests.',

  identity:
    'E2E deterministic workflow agent.',

  mission: [
    'Produce a proposed workflow artifact.',
  ],

  criticalRules: [
    'Never self-approve.',
    'Never cross tenant boundaries.',
  ],

  deliverables: [
    'A proposed workflow artifact.',
  ],

  successMetrics: [
    'Return a valid draft artifact for the correct workflow task.',
  ],

  needsInput: [],

  sourcePath:
    'test/e2e-agent-001.md',

  sourceRevision:
    'e2e-revision-001',

  version:
    '1',
};

class FakeE2EAgentExecutor
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
        `e2e-artifact-${this.calls}`,

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
          'E2E proposed recommendation',

        locale:
          request.locale,
      },

      autoApproved:
        false,
    };

    return {
      executionId:
        `e2e-execution-${this.calls}`,

      proposedArtifact:
        artifact,

      usage: {
        inputTokens:
          20,

        outputTokens:
          40,

        totalTokens:
          60,

        estimatedCost:
          0.02,

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
  executor:
    FakeE2EAgentExecutor,
): AgentWorkflowRunner {
  const orchestrator =
    new AgentExecutionOrchestrator({
      executor,

      definitionLoader: {
        async load() {
          return definition;
        },
      },
    });

  return new AgentWorkflowRunner({
    runtime,

    agentOrchestrator:
      orchestrator,

    requestBuilder:
      (workflowContext) => ({
        tenantContext:
          workflowContext.tenantContext,

        workflowId:
          workflowContext.workflow.id,

        taskId:
          workflowContext.task.id,

        workstreamId:
          workflowContext.task.workstreamId,

        agentId:
          'e2e-agent-001',

        agentSourcePath:
          'test/e2e-agent-001.md',

        locale:
          workflowContext.workflow.locale,

        input: {
          workflowId:
            workflowContext.workflow.id,

          taskId:
            workflowContext.task.id,
        },

        inputArtifactReferences:
          workflowContext.inputArtifacts,

        approvedSystemInstructions:
          'Execute the approved workflow agent definition.',

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
          `e2e-agent:${workflowContext.workflow.id}:${workflowContext.task.id}`,
      }),
  });
}

async function createE2EScenario() {
  const runtime =
    new InMemoryWorkflowRuntime();

  const workflow =
    await runtime.createWorkflow({
      tenantId:
        'tenant-e2e',

      engagementId:
        'engagement-e2e',

      locale:
        'en-US',

      selectedWorkstreamIds: [
        '01',
        '02',
      ],

      idempotencyKey:
        'full-e2e-workflow',
    });

  const tasks =
    runtime.getTasks(
      workflow.id,
      context(),
    );

  const upstreamTask =
    tasks.find(
      (task) =>
        task.workstreamId ===
        '01',
    );

  const downstreamTask =
    tasks.find(
      (task) =>
        task.workstreamId ===
        '02',
    );

  assert.ok(
    upstreamTask,
    'Expected upstream workstream 01 task.',
  );

  assert.ok(
    downstreamTask,
    'Expected downstream workstream 02 task.',
  );

  upstreamTask!.unresolvedInputs =
    [];

  downstreamTask!.unresolvedInputs =
    [];

  for (
    const dependency of
      downstreamTask!.dependencyReferences
  ) {
    dependency.satisfied =
      true;
  }

  const blockingDependency =
    downstreamTask!.dependencyReferences.find(
      (dependency) =>
        dependency.kind ===
        'blocking',
    );

  assert.ok(
    blockingDependency,
    'Expected blocking dependency between workstreams.',
  );

  blockingDependency!.satisfied =
    false;

  const executor =
    new FakeE2EAgentExecutor();

  const runner =
    createRunner(
      runtime,
      executor,
    );

  const approvalGate =
    new HumanApprovalWorkflowGate(
      runtime,
    );

  const handoffIntegration =
    new HandoffRuntimeIntegration(
      runtime,
    );

  const handoffService =
    new AcceptedArtifactHandoffService(
      handoffIntegration,
    );

  return {
    runtime,
    workflow,
    upstreamTask:
      upstreamTask!,
    downstreamTask:
      downstreamTask!,
    executor,
    runner,
    approvalGate,
    handoffService,
  };
}

test(
  'full E2E workflow runs from agent execution to downstream task readiness',
  async () => {
    const {
      workflow,
      upstreamTask,
      downstreamTask,
      executor,
      runner,
      approvalGate,
      handoffService,
    } =
      await createE2EScenario();

    const execution =
      await runner.runNextReadyTask({
        workflowId:
          workflow.id,

        tenantContext:
          context(),

        metadata:
          metadata(
            'e2e-agent-execution',
          ),
      });

    assert.equal(
      execution.stopReason,
      'executed',
    );

    assert.ok(
      execution.execution,
    );

    assert.ok(
      execution.completedArtifact,
    );

    assert.equal(
      execution.task?.status,
      'awaiting_validation',
    );

    assert.equal(
      executor.calls,
      1,
    );

    const submitted =
      approvalGate.submitForApproval({
        workflowId:
          workflow.id,

        taskId:
          upstreamTask.id,

        tenantContext:
          context(),

        artifact:
          execution.execution!.artifact,

        metadata:
          metadata(
            'e2e-submit-approval',
          ),
      });

    assert.equal(
      submitted.task.status,
      'awaiting_human',
    );

    const approved =
      approvalGate.decide({
        approvalId:
          submitted.approval.id,

        tenantContext:
          context(),

        actor: {
          type:
            'user',

          id:
            'reviewer-e2e',
        },

        decision:
          'approved',

        metadata:
          metadata(
            'e2e-human-approved',
          ),
      });

    assert.equal(
      approved.task.status,
      'accepted',
    );

    assert.ok(
      approved.artifact,
    );

    assert.equal(
      approved.artifact!.accepted,
      true,
    );

    const handoff =
      handoffService.create({
        tenantContext:
          context(),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          upstreamTask.workstreamId,

        toWorkstreamId:
          downstreamTask.workstreamId,

        artifact:
          approved.artifact!,
      });

    assert.equal(
      handoff.status,
      'pending',
    );

    assert.equal(
      handoff.downstreamReadiness.ready,
      false,
    );

    const acceptedHandoff =
      handoffService.accept({
        tenantContext:
          context(),

        handoffId:
          handoff.handoffId,

        actorId:
          'reviewer-e2e',

        metadata:
          metadata(
            'e2e-handoff-accepted',
          ),
      });

    assert.equal(
      acceptedHandoff.status,
      'accepted',
    );

    assert.equal(
      acceptedHandoff.downstreamReadiness.ready,
      true,
    );

    assert.equal(
      acceptedHandoff.downstreamTaskId,
      downstreamTask.id,
    );
  },
);

test(
  'full E2E workflow never lets an agent self-approve',
  async () => {
    const {
      workflow,
      upstreamTask,
      runner,
      approvalGate,
    } =
      await createE2EScenario();

    const execution =
      await runner.runNextReadyTask({
        workflowId:
          workflow.id,

        tenantContext:
          context(),

        metadata:
          metadata(
            'e2e-self-approval',
          ),
      });

    assert.ok(
      execution.execution,
    );

    const submitted =
      approvalGate.submitForApproval({
        workflowId:
          workflow.id,

        taskId:
          upstreamTask.id,

        tenantContext:
          context(),

        artifact:
          execution.execution!.artifact,

        metadata:
          metadata(
            'e2e-self-approval-submit',
          ),
      });

    await assert.rejects(
      async () =>
        approvalGate.decide({
          approvalId:
            submitted.approval.id,

          tenantContext:
            context(),

          actor: {
            type:
              'agent',

            id:
              'e2e-agent-001',
          },

          decision:
            'approved',

          metadata:
            metadata(
              'e2e-agent-self-approval',
            ),
        }),
      (
        error,
      ) => {
        assert.ok(
          error instanceof Error,
        );

        assert.match(
          error.message,
          /Only a human user can make an approval decision/i,
        );

        return true;
      },
    );

    assert.equal(
      submitted.task.status,
      'awaiting_human',
    );
  },
);

test(
  'full E2E workflow preserves tenant isolation across approval and handoff',
  async () => {
    const {
      workflow,
      upstreamTask,
      runner,
      approvalGate,
    } =
      await createE2EScenario();

    const execution =
      await runner.runNextReadyTask({
        workflowId:
          workflow.id,

        tenantContext:
          context(),

        metadata:
          metadata(
            'e2e-tenant-isolation',
          ),
      });

    assert.ok(
      execution.execution,
    );

    await assert.rejects(
      async () =>
        approvalGate.submitForApproval({
          workflowId:
            workflow.id,

          taskId:
            upstreamTask.id,

          tenantContext:
            context(
              'tenant-attacker',
            ),

          artifact:
            execution.execution!.artifact,

          metadata:
            metadata(
              'e2e-cross-tenant-approval',
            ),
        }),
      /Cross-tenant|tenant/i,
    );
  },
);