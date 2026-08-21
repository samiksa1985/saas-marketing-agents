import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIProviderRouter,
  MockAIProvider,
  type AIExecutionPolicy,
} from '@platform/ai-gateway';

import {
  AgentExecutionOrchestrator,
  AgentOrchestrationError,
  createMockAgentExecutionOrchestrator,
} from './execution-orchestrator.js';

import {
  createEmptyICPDefinition,
  type ICPAccount,
} from './icp-contract.js';

function createPolicy(): AIExecutionPolicy {
  return {
    provider: 'mock',
    model: 'deterministic-v1',
    timeoutMs: 1_000,
    maxRetries: 1,
    retryableErrors: [
      'rate_limited',
      'timeout',
    ],
    maxInputTokens: 20_000,
    maxOutputTokens: 10_000,
    costLimit: 1,
    requiredCapabilities: [
      'text-generation',
    ],
  };
}

function createTenantContext() {
  return {
    tenantId: 'tenant-001',
    userId: 'user-001',
    roles: [
      'tenant_admin',
    ] as ('tenant_admin')[],
    permissions: [
      'workflow:execute',
      'artifact:write',
    ] as (
      | 'workflow:execute'
      | 'artifact:write'
    )[],
    locale: 'en-US' as const,
  };
}

function createICPAccount(): ICPAccount {
  return {
    accountId: 'account-001',
    tenantId: 'tenant-001',
    locale: 'en-US',

    name: 'Example Corp',

    region: 'Saudi Arabia',

    sector: 'B2B SaaS',

    stage: 'qualified',

    tier: 'tier_1',

    fit: {
      score: 90,
      confidence: 'high',
      rationale:
        'Strong evidence-backed fit.',
      positiveSignals: [
        'Growth trigger',
      ],
      disqualifiers: [],
      antiICPFlags: [],
      evidenceIds: [
        'evidence-001',
      ],
    },

    evidence: [
      {
        id: 'evidence-001',
        type: 'business-fit',
        claim:
          'Strong fit for the target motion.',
        source:
          'customer-research',
        sourceDate:
          '2026-08-20',
        status: 'verified',
        confidence: 'high',
      },
    ],

    triggers: [
      {
        id: 'trigger-001',
        family: 'growth',
        signal:
          'Relevant growth trigger.',
        source:
          'company-news',
        detectedAt:
          '2026-08-20T00:00:00.000Z',
        confidence: 'high',
      },
      {
        id: 'trigger-002',
        family: 'hiring',
        signal:
          'Relevant hiring trigger.',
        source:
          'company-careers',
        detectedAt:
          '2026-08-20T00:00:00.000Z',
        confidence: 'medium',
      },
    ],

    buyerCommittee: [
      {
        role: 'economic_buyer',
        title:
          'Chief Revenue Officer',
        status: 'known',
        evidenceIds: [
          'evidence-001',
        ],
      },
    ],

    ownerId: 'seller-001',

    reasonForSelection:
      'Evidence-backed fit with two independent signal families.',

    confidence: 'high',

    suppression: {
      status: 'clear',
      reasons: [],
      checkedAt:
        '2026-08-20T00:00:00.000Z',
      source:
        'suppression-system',
    },

    sourceDate:
      '2026-08-20',
  };
}

function createOrchestrator(
  provider: MockAIProvider,
): AgentExecutionOrchestrator {
  const router =
    new AIProviderRouter([
      provider,
    ]);

  return createMockAgentExecutionOrchestrator(
    router,
  );
}

function createBaseRequest() {
  return {
    tenantContext:
      createTenantContext(),

    workflowId:
      'workflow-001',

    taskId:
      'task-001',

    workstreamId:
      '01',

    agentId:
      'abm-abm-account-based-strategist',

    agentSourcePath:
      'abm/abm-account-based-strategist.md',

    locale:
      'en-US' as const,

    input: {
      objective:
        'Create an account strategy.',
      company:
        'Example Corp',
    },

    inputArtifactReferences: [],

    approvedSystemInstructions:
      'Use only approved account evidence.',

    executionPolicy:
      createPolicy(),

    idempotencyKey:
      'orchestration-test-001',
  };
}

test(
  'execution orchestrator connects definition, prompt, and executor',
  async () => {
    const provider =
      new MockAIProvider();

    const orchestrator =
      createOrchestrator(
        provider,
      );

    const result =
      await orchestrator.execute(
        createBaseRequest(),
      );

    assert.equal(
      result.definition.agentId,
      'abm-abm-account-based-strategist',
    );

    assert.match(
      result.assembledPrompt.systemPrompt,
      /AGENT ID: abm-abm-account-based-strategist/,
    );

    assert.match(
      result.assembledPrompt.userPrompt,
      /Example Corp/,
    );

    assert.equal(
      result.proposedArtifact.status,
      'draft',
    );

    assert.equal(
      result.proposedArtifact.accepted,
      false,
    );

    assert.equal(
      result.proposedArtifact.autoApproved,
      false,
    );

    assert.equal(
      provider.callCount,
      1,
    );
  },
);

test(
  'execution orchestrator validates ICP before execution',
  async () => {
    const provider =
      new MockAIProvider();

    const orchestrator =
      createOrchestrator(
        provider,
      );

    const result =
      await orchestrator.execute({
        ...createBaseRequest(),

        workflowId:
          'workflow-002',

        taskId:
          'task-002',

        idempotencyKey:
          'orchestration-test-002',

        icpAccount:
          createICPAccount(),

        icpDefinition:
          createEmptyICPDefinition(),
      });

    assert.ok(
      result.icpValidation,
    );

    assert.equal(
      result.icpValidation?.valid,
      true,
    );

    assert.equal(
      result.proposedArtifact.status,
      'draft',
    );

    assert.equal(
      provider.callCount,
      1,
    );
  },
);

test(
  'execution orchestrator blocks invalid ICP without calling provider',
  async () => {
    const provider =
      new MockAIProvider();

    const orchestrator =
      createOrchestrator(
        provider,
      );

    const account =
      createICPAccount();

    delete account.ownerId;

    account.triggers = [
      {
        id: 'trigger-001',
        family: 'growth',
        signal:
          'Only one trigger.',
        source:
          'company-news',
        detectedAt:
          '2026-08-20T00:00:00.000Z',
        confidence: 'medium',
      },
    ];

    await assert.rejects(
      () =>
        orchestrator.execute({
          ...createBaseRequest(),

          workflowId:
            'workflow-003',

          taskId:
            'task-003',

          idempotencyKey:
            'orchestration-test-003',

          icpAccount:
            account,

          icpDefinition:
            createEmptyICPDefinition(),
        }),
      (error) => {
        assert.ok(
          error instanceof
            AgentOrchestrationError,
        );

        assert.equal(
          error.code,
          'icp_invalid',
        );

        return true;
      },
    );

    assert.equal(
      provider.callCount,
      0,
    );
  },
);

test(
  'execution orchestrator rejects agent definition mismatch',
  async () => {
    const provider =
      new MockAIProvider();

    const orchestrator =
      createOrchestrator(
        provider,
      );

    await assert.rejects(
      () =>
        orchestrator.execute({
          ...createBaseRequest(),

          workflowId:
            'workflow-004',

          taskId:
            'task-004',

          agentId:
            'wrong-agent-id',

          idempotencyKey:
            'orchestration-test-004',
        }),
      (error) => {
        assert.ok(
          error instanceof
            AgentOrchestrationError,
        );

        assert.equal(
          error.code,
          'agent_mismatch',
        );

        return true;
      },
    );

    assert.equal(
      provider.callCount,
      0,
    );
  },
);