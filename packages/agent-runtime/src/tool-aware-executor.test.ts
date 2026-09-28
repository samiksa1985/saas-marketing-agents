import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MockAIProvider,
  AIProviderRouter,
} from '@platform/ai-gateway';
import { InMemoryToolGateway } from '@platform/tool-gateway';
import {
  AIGatewayAgentExecutor,
} from './index.js';
import { ToolAwareAgentExecutor } from './tool-aware-executor.js';

const policy = {
  provider: 'mock',
  model: 'deterministic-v1',
  timeoutMs: 1000,
  maxRetries: 0,
  retryableErrors: [],
  maxInputTokens: 10000,
  maxOutputTokens: 10000,
  costLimit: 1,
  requiredCapabilities: ['text-generation' as const],
};

test('tool-aware executor routes through tool gateway', async () => {
  const gateway = new InMemoryToolGateway();

  gateway.register({
    definition: {
      toolId: 'artifact.lookup',
      description: 'Lookup',
      risk: 'READ',
      permissions: ['artifact:read'],
      tenantScoped: true,
    },
    async execute() {
      return { found: true };
    },
  });

  const executor = new ToolAwareAgentExecutor(
    new AIGatewayAgentExecutor(
      new AIProviderRouter([
        new MockAIProvider(),
      ]),
    ),
    gateway,
  );

  const result = await executor.execute({
    tenantContext: {
      tenantId: 'tenant-a',
      roles: [],
      permissions: ['artifact:read'],
      locale: 'en',
    },
    workflowId: 'workflow-1',
    taskId: 'task-1',
    workstreamId: 'sales',
    agentId: 'sales',
    locale: 'en',
    inputArtifactReferences: [],
    approvedSystemInstructions: 'approved',
    executionPolicy: policy,
    input: { accountId: 'A1' },
    idempotencyKey: 'exec-1',
    toolCalls: [{
      toolId: 'artifact.lookup',
      tenantId: 'tenant-a',
      idempotencyKey: 'tool-1',
      input: { accountId: 'A1' },
    }],
  });

  assert.equal(
    result.proposedArtifact.tenantId,
    'tenant-a',
  );
});

test('tool-aware executor rejects cross-tenant tools', async () => {
  const executor = new ToolAwareAgentExecutor(
    new AIGatewayAgentExecutor(
      new AIProviderRouter([
        new MockAIProvider(),
      ]),
    ),
    new InMemoryToolGateway(),
  );

  await assert.rejects(
    executor.execute({
      tenantContext: {
        tenantId: 'tenant-a',
        roles: [],
        permissions: [],
        locale: 'en',
      },
      workflowId: 'workflow-1',
      taskId: 'task-1',
      workstreamId: 'sales',
      agentId: 'sales',
      locale: 'en',
      inputArtifactReferences: [],
      approvedSystemInstructions: 'approved',
      executionPolicy: policy,
      input: {},
      idempotencyKey: 'exec-2',
      toolCalls: [{
        toolId: 'artifact.lookup',
        tenantId: 'tenant-b',
        idempotencyKey: 'tool-2',
        input: {},
      }],
    }),
    /Cross-tenant tool call denied/,
  );
});
