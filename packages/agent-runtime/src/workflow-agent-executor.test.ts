import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  ArtifactReference,
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
  type AgentOrchestrationRequest,
} from './execution-orchestrator.js';

import {
  WorkflowAgentExecutor,
  type WorkflowAgentExecutionRequest,
  type WorkflowAgentRequestBuilder,
} from './workflow-agent-executor.js';

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

function baseArtifact(): ProposedAgentArtifact {
  return {
    artifactId:
      'artifact-001',

    tenantId:
      'tenant-a',

    workflowId:
      'workflow-001',

    taskId:
      'task-001',

    workstreamId:
      '01',

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
        'deterministic output',

      locale:
        'en',
    },

    autoApproved:
      false,
  };
}

function malformedArtifact(
  overrides: {
    tenantId?: string;
    workflowId?: string;
    taskId?: string;
    workstreamId?: string;
    accepted?: boolean;
    autoApproved?: boolean;
  } = {},
): ProposedAgentArtifact {
  return {
    ...baseArtifact(),
    ...overrides,
  } as unknown as ProposedAgentArtifact;
}

const fakeDefinition: ParsedAgentDefinition = {
  agentId:
    'agent-001',

  name:
    'Test Agent',

  description:
    'Deterministic test agent',

  identity:
    'Test identity',

  mission: [
    'Execute the requested task deterministically.',
  ],

  criticalRules: [
    'Do not self-approve artifacts.',
  ],

  deliverables: [
    'Produce a proposed artifact.',
  ],

  successMetrics: [
    'Produce a valid proposal.',
  ],

  needsInput: [],

  sourcePath:
    'test/agent-001.md',

  sourceRevision:
    'test-revision',

  version:
    '1',
};

class FakeAgentExecutor
  implements AgentExecutor {
  public lastRequest:
    | Parameters<
        AgentExecutor['execute']
      >[0]
    | undefined;

  constructor(
    private readonly resultArtifact:
      ProposedAgentArtifact =
        baseArtifact(),
  ) {}

  async execute(
    request: Parameters<
      AgentExecutor['execute']
    >[0],
  ): Promise<AgentExecutionResult> {
    this.lastRequest =
      request;

    return {
      executionId:
        'execution-001',

      proposedArtifact:
        this.resultArtifact,

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
        'mock-model',

      durationMs:
        5,

      warnings: [],

      errors: [],
    };
  }
}

function createOrchestrator(
  executor: AgentExecutor,
): AgentExecutionOrchestrator {
  return new AgentExecutionOrchestrator({
    executor,

    definitionLoader: {
      async load(): Promise<ParsedAgentDefinition> {
        return fakeDefinition;
      },
    },
  });
}

function createRequestBuilder(
  overrides: Partial<
    AgentOrchestrationRequest
  > = {},
): WorkflowAgentRequestBuilder {
  return (
    workflowContext,
  ): AgentOrchestrationRequest => ({
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
      task:
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
        2,

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
      'workflow-agent-test',

    ...overrides,
  });
}

function createWorkflowContext():
  WorkflowAgentExecutionRequest {
  return {
    workflow: {
      id:
        'workflow-001',

      tenantId:
        'tenant-a',

      engagementId:
        'engagement-001',

      locale:
        'en',

      selectedWorkstreamIds:
        ['01'],

      graphSnapshot: {
        version:
          'v1',

        sourcePath:
          'test',

        sourceRevision:
          'test',

        workstreamIds:
          ['01'],

        edges:
          [],

        hasCycles:
          false,

        workstreamDefinitions:
          [],

        gateDefinitions:
          [],
      },

      status:
        'running',

      createdAt:
        '2026-01-01T00:00:00.000Z',

      updatedAt:
        '2026-01-01T00:00:00.000Z',

      creationIdempotencyKey:
        'workflow-001',
    },

    task: {
      id:
        'task-001',

      tenantId:
        'tenant-a',

      workflowId:
        'workflow-001',

      workstreamId:
        '01',

      status:
        'ready',

      inputArtifactReferences:
        [],

      dependencyReferences:
        [],

      attempts:
        [],

      createdAt:
        '2026-01-01T00:00:00.000Z',

      updatedAt:
        '2026-01-01T00:00:00.000Z',

      requiredApprovalIds:
        [],

      acceptedApprovalIds:
        [],

      unresolvedInputs:
        [],
    },

    tenantContext:
      context(),

    inputArtifacts:
      [] as ArtifactReference[],
  };
}

test(
  'workflow agent executor delegates to agent orchestration',
  async () => {
    const fakeExecutor =
      new FakeAgentExecutor();

    const orchestrator =
      createOrchestrator(
        fakeExecutor,
      );

    const adapter =
      new WorkflowAgentExecutor({
        orchestrator,

        requestBuilder:
          createRequestBuilder(),
      });

    const result =
      await adapter.execute(
        createWorkflowContext(),
      );

    assert.equal(
      result.artifact.artifactId,
      'artifact-001',
    );

    assert.equal(
      result.artifact.workflowId,
      'workflow-001',
    );

    assert.equal(
      result.artifact.taskId,
      'task-001',
    );

    assert.equal(
      result.artifact.workstreamId,
      '01',
    );

    assert.equal(
      result.artifact.accepted,
      false,
    );

    assert.equal(
      result.artifact.autoApproved,
      false,
    );

    assert.ok(
      fakeExecutor.lastRequest,
    );
  },
);

test(
  'workflow agent executor preserves tenant scope',
  async () => {
    const adapter =
      new WorkflowAgentExecutor({
        orchestrator:
          createOrchestrator(
            new FakeAgentExecutor(),
          ),

        requestBuilder:
          createRequestBuilder({
            tenantContext:
              context(
                'tenant-b',
              ),
          }),
      });

    await assert.rejects(
      () =>
        adapter.execute(
          createWorkflowContext(),
        ),
      /tenant boundary/i,
    );
  },
);

test(
  'workflow agent executor rejects workflow mismatch',
  async () => {
    const adapter =
      new WorkflowAgentExecutor({
        orchestrator:
          createOrchestrator(
            new FakeAgentExecutor(),
          ),

        requestBuilder:
          createRequestBuilder({
            workflowId:
              'workflow-999',
          }),
      });

    await assert.rejects(
      () =>
        adapter.execute(
          createWorkflowContext(),
        ),
      /workflow mismatch/i,
    );
  },
);

test(
  'workflow agent executor rejects task mismatch',
  async () => {
    const adapter =
      new WorkflowAgentExecutor({
        orchestrator:
          createOrchestrator(
            new FakeAgentExecutor(),
          ),

        requestBuilder:
          createRequestBuilder({
            taskId:
              'task-999',
          }),
      });

    await assert.rejects(
      () =>
        adapter.execute(
          createWorkflowContext(),
        ),
      /task mismatch/i,
    );
  },
);

test(
  'workflow agent executor rejects workstream mismatch',
  async () => {
    const adapter =
      new WorkflowAgentExecutor({
        orchestrator:
          createOrchestrator(
            new FakeAgentExecutor(),
          ),

        requestBuilder:
          createRequestBuilder({
            workstreamId:
              '99',
          }),
      });

    await assert.rejects(
      () =>
        adapter.execute(
          createWorkflowContext(),
        ),
      /workstream mismatch/i,
    );
  },
);

test(
  'workflow agent executor rejects cross-tenant artifact',
  async () => {
    const adapter =
      new WorkflowAgentExecutor({
        orchestrator:
          createOrchestrator(
            new FakeAgentExecutor(
              malformedArtifact({
                tenantId:
                  'tenant-b',
              }),
            ),
          ),

        requestBuilder:
          createRequestBuilder(),
      });

    await assert.rejects(
      () =>
        adapter.execute(
          createWorkflowContext(),
        ),
      /artifact crossed tenant boundary/i,
    );
  },
);

test(
  'workflow agent executor rejects accepted artifacts',
  async () => {
    const adapter =
      new WorkflowAgentExecutor({
        orchestrator:
          createOrchestrator(
            new FakeAgentExecutor(
              malformedArtifact({
                accepted:
                  true,
              }),
            ),
          ),

        requestBuilder:
          createRequestBuilder(),
      });

    await assert.rejects(
      () =>
        adapter.execute(
          createWorkflowContext(),
        ),
      /accepted or auto-approved artifact/i,
    );
  },
);

test(
  'workflow agent executor rejects auto-approved artifacts',
  async () => {
    const adapter =
      new WorkflowAgentExecutor({
        orchestrator:
          createOrchestrator(
            new FakeAgentExecutor(
              malformedArtifact({
                autoApproved:
                  true,
              }),
            ),
          ),

        requestBuilder:
          createRequestBuilder(),
      });

    await assert.rejects(
      () =>
        adapter.execute(
          createWorkflowContext(),
        ),
      /accepted or auto-approved artifact/i,
    );
  },
);