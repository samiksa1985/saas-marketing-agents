import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import type {
  ProposedArtifact,
} from '@platform/workflow-runtime';

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
  WorkflowOrchestrator,
  type WorkflowTaskExecutionContext,
  type WorkflowTaskExecutionResult,
  type WorkflowTaskExecutor,
} from './workflow-orchestrator.js';

import {
  AgentWorkflowCompleter,
} from './agent-workflow-completer.js';

import {
  InMemoryWorkflowRuntime,
} from '@platform/workflow-runtime';

function context(
  tenantId = 'tenant-unified',
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

    locale:
      'en',
  };
}

function metadata(
  key: string,
) {
  return {
    actor:
      'unified-path-test',

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
    'unified-agent-001',

  name:
    'Unified Agent',

  description:
    'Unified execution path test agent.',

  identity:
    'Deterministic unified-path agent.',

  mission: [
    'Produce a valid proposed artifact.',
  ],

  criticalRules: [
    'Never self-approve.',
  ],

  deliverables: [
    'Proposed artifact.',
  ],

  successMetrics: [
    'Valid workflow-scoped draft artifact.',
  ],

  needsInput: [],

  sourcePath:
    'test/unified-agent.md',

  sourceRevision:
    'unified-revision-001',

  version:
    '1',
};

class FakeProvider
  implements AgentExecutor {
  public calls = 0;

  async execute(
    request: Parameters<
      AgentExecutor['execute']
    >[0],
  ): Promise<AgentExecutionResult> {
    this.calls += 1;

    const proposedArtifact:
      ProposedAgentArtifact = {
      artifactId:
        `unified-artifact-${this.calls}`,

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
          'Unified real agent result',

        locale:
          request.locale,
      },

      autoApproved:
        false,
    };

    return {
      executionId:
        `unified-execution-${this.calls}`,

      proposedArtifact,

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

class RealAgentTaskExecutor
  implements WorkflowTaskExecutor {
  private readonly orchestrator:
    AgentExecutionOrchestrator;

  constructor(
    provider:
      FakeProvider,
  ) {
    this.orchestrator =
      new AgentExecutionOrchestrator({
        executor:
          provider,

        definitionLoader: {
          async load() {
            return definition;
          },
        },
      });
  }

  async execute(
    context:
      WorkflowTaskExecutionContext,
  ): Promise<WorkflowTaskExecutionResult> {
    const result =
      await this.orchestrator.execute({
        tenantContext:
          context.tenantContext,

        workflowId:
          context.workflow.id,

        taskId:
          context.task.id,

        workstreamId:
          context.task.workstreamId,

        agentId:
          definition.agentId,

        agentSourcePath:
          definition.sourcePath,

        locale:
          context.workflow.locale,

        input: {
          workflowId:
            context.workflow.id,

          taskId:
            context.task.id,
        },

        inputArtifactReferences:
          context.inputArtifacts,

        approvedSystemInstructions:
          'Execute the unified agent path.',

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
          `unified:${context.workflow.id}:${context.task.id}`,
      });

    const workflowArtifact =
      result.proposedArtifact as unknown as ProposedArtifact;

    return {
      artifact:
        workflowArtifact,
    };
  }
}

test(
  'workflow orchestrator uses real agent executor and agent completion without a second runtime execution',
  async () => {
    const runtime =
      new InMemoryWorkflowRuntime();

    const workflow =
      await runtime.createWorkflow({
        tenantId:
          'tenant-unified',

        engagementId:
          'engagement-unified',

        locale:
          'en',

        selectedWorkstreamIds:
          ['01'],

        idempotencyKey:
          'unified-orchestrator-workflow',
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

    const provider =
      new FakeProvider();

    const executor =
      new RealAgentTaskExecutor(
        provider,
      );

    const completer =
      new AgentWorkflowCompleter(
        runtime,
      );

    const orchestrator =
      new WorkflowOrchestrator(
        runtime,
        executor,
        completer,
      );

    const result =
      await orchestrator.run({
        workflowId:
          workflow.id,

        tenantContext:
          context(),

        metadata:
          metadata(
            'unified-run',
          ),
      });

    assert.equal(
      provider.calls,
      1,
    );

    assert.equal(
      result.executedTasks.length,
      1,
    );

    assert.equal(
      result.stopReason,
      'awaiting_validation',
    );

    const refreshedTasks =
      runtime.getTasks(
        workflow.id,
        context(),
      );

    assert.equal(
      refreshedTasks[0]!.status,
      'awaiting_validation',
    );
  },
);