import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentExecutor,
} from './index.js';

import {
  AI_REQUEST_ENTITLEMENT,
  EntitlementAwareAgentExecutor,
  type AgentEntitlementAccess,
} from './entitlement-aware-executor.js';

const request:
  AgentExecutionRequest = {
  tenantContext: {
    tenantId: 'tenant-a',
    roles: [],
    permissions: [],
    locale: 'en',
  },
  workflowId: 'workflow-1',
  taskId: 'task-1',
  workstreamId: 'workstream-1',
  agentId: 'agent-1',
  locale: 'en',
  inputArtifactReferences: [],
  approvedSystemInstructions:
    'approved',
  executionPolicy: {
    provider: 'mock',
    model: 'deterministic-v1',
    timeoutMs: 1000,
    maxRetries: 0,
    retryableErrors: [],
    maxInputTokens: 10000,
    maxOutputTokens: 2000,
    costLimit: 10,
    requiredCapabilities: [],
  },
  input: {},
  idempotencyKey:
    'billing-runtime-test-1',
};

function result():
  AgentExecutionResult {
  return {
    executionId: 'execution-1',

    proposedArtifact: {
      artifactId: 'artifact-1',
      version: '1',
      tenantId: 'tenant-a',
      workflowId: 'workflow-1',
      taskId: 'task-1',
      workstreamId: 'workstream-1',

      payload: {
        kind: 'agent-proposal',
        content: {},
        locale: 'en',
      },

      status: 'draft',
      accepted: false,
      autoApproved: false,
    },

    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      estimatedCost: 0,
      currency: 'USD',
    },

    provider: 'mock',
    model: 'deterministic-v1',
    durationMs: 1,
    warnings: [],
    errors: [],
  };
}

class SuccessfulExecutor
  implements AgentExecutor
{
  calls = 0;

  async execute():
    Promise<AgentExecutionResult> {
    this.calls += 1;
    return result();
  }
}

class FailingExecutor
  implements AgentExecutor
{
  calls = 0;

  async execute():
    Promise<AgentExecutionResult> {
    this.calls += 1;

    throw new Error(
      'provider failed',
    );
  }
}

function createAccess(
  allowed = true,
): AgentEntitlementAccess & {
  consumptions: string[];
} {
  const state = {
    consumptions: [] as string[],

    async authorize(
      tenantId: string,
      key: string,
    ) {
      return {
        tenantId,
        key,
        allowed,
        source:
          'PLAN' as const,
        entitlementValue: 100,
        reason:
          allowed
            ? 'allowed'
            : 'quota exhausted',
      };
    },

    async consume(
      tenantId: string,
      key: string,
      amount: number,
      idempotencyKey: string,
    ) {
      state.consumptions.push(
        [
          tenantId,
          key,
          amount,
          idempotencyKey,
        ].join(':'),
      );
    },
  };

  return state;
}

test(
  'successful execution consumes one AI request',
  async () => {
    const inner =
      new SuccessfulExecutor();

    const access =
      createAccess(true);

    const executor =
      new EntitlementAwareAgentExecutor(
        inner,
        access,
      );

    await executor.execute(
      request,
    );

    assert.equal(
      inner.calls,
      1,
    );

    assert.equal(
      access.consumptions.length,
      1,
    );

    assert.match(
      access.consumptions[0]!,
      new RegExp(
        AI_REQUEST_ENTITLEMENT,
      ),
    );
  },
);

test(
  'denied entitlement blocks before provider execution',
  async () => {
    const inner =
      new SuccessfulExecutor();

    const access =
      createAccess(false);

    const executor =
      new EntitlementAwareAgentExecutor(
        inner,
        access,
      );

    await assert.rejects(
      executor.execute(request),
      /Entitlement denied/,
    );

    assert.equal(
      inner.calls,
      0,
    );

    assert.equal(
      access.consumptions.length,
      0,
    );
  },
);

test(
  'provider failure still consumes reserved quota',
  async () => {
    const inner =
      new FailingExecutor();

    const access =
      createAccess(true);

    const executor =
      new EntitlementAwareAgentExecutor(
        inner,
        access,
      );

    await assert.rejects(
      executor.execute(request),
      /provider failed/,
    );

    assert.equal(
      inner.calls,
      1,
    );

    assert.equal(
      access.consumptions.length,
      1,
    );
  },
);

test(
  'cross tenant entitlement decision is rejected',
  async () => {
    const inner =
      new SuccessfulExecutor();

    const access:
      AgentEntitlementAccess = {
      async authorize(
        _tenantId,
        key,
      ) {
        return {
          tenantId:
            'tenant-b',
          key,
          allowed: true,
          source: 'PLAN',
          entitlementValue:
            100,
          reason: 'allowed',
        };
      },

      async consume() {},
    };

    const executor =
      new EntitlementAwareAgentExecutor(
        inner,
        access,
      );

    await assert.rejects(
      executor.execute(request),
      /Cross-tenant/,
    );

    assert.equal(
      inner.calls,
      0,
    );
  },
);
