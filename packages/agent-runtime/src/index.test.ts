import assert from 'node:assert/strict';
import test from 'node:test';
import type { TenantContext } from '@platform/contracts';
import { MockAIProvider, AIProviderRouter, type AIExecutionPolicy } from '@platform/ai-gateway';
import { AIGatewayAgentExecutor, AgentExecutionError } from './index.js';

const tenantContext: TenantContext = {
  tenantId: 'tenant-a',
  roles: [],
  permissions: [],
  locale: 'en',
};
const policy: AIExecutionPolicy = {
  provider: 'mock',
  model: 'deterministic-v1',
  timeoutMs: 20,
  maxRetries: 1,
  retryableErrors: ['rate_limited'],
  maxInputTokens: 1000,
  maxOutputTokens: 1000,
  costLimit: 1,
  requiredCapabilities: ['text-generation'],
};
const request = (locale: TenantContext['locale'] = 'en') => ({
  tenantContext: { ...tenantContext, locale },
  workflowId: 'workflow-a',
  taskId: 'task-a',
  workstreamId: '01',
  agentId: 'agent-a',
  locale,
  inputArtifactReferences: [],
  approvedSystemInstructions: 'approved system instruction',
  executionPolicy: policy,
  input: { value: 'input' },
  idempotencyKey: 'execution-command',
});

test('agent executor produces a proposed artifact without approval', async () => {
  const result = await new AIGatewayAgentExecutor(
    new AIProviderRouter([new MockAIProvider()]),
  ).execute(request());
  assert.equal(result.proposedArtifact.status, 'draft');
  assert.equal(result.proposedArtifact.accepted, false);
  assert.equal(result.proposedArtifact.autoApproved, false);
  assert.equal(result.errors.length, 0);
});
test('agent executor emits structured provider and agent events', async () => {
  const events: Array<{
    eventType: string;
    tenantId: string;
    workflowId: string;
    taskId: string;
    executionId: string;
    correlationId: string;
  }> = [];
  const result = await new AIGatewayAgentExecutor(new AIProviderRouter([new MockAIProvider()]), {
    emit: (event) => events.push(event),
  }).execute(request());
  assert.deepEqual(
    events.map((event) => event.eventType),
    [
      'agent.execution_started',
      'provider.requested',
      'provider.completed',
      'agent.execution_completed',
    ],
  );
  assert.ok(
    events.every(
      (event) =>
        event.tenantId === 'tenant-a' &&
        event.workflowId === 'workflow-a' &&
        event.taskId === 'task-a' &&
        event.executionId === result.executionId &&
        event.correlationId === 'execution-command',
    ),
  );
});
test('duplicate execution request has deterministic execution identity', async () => {
  const executor = new AIGatewayAgentExecutor(new AIProviderRouter([new MockAIProvider()]));
  const first = await executor.execute(request());
  const second = await executor.execute(request());
  assert.equal(first.executionId, second.executionId);
  assert.equal(first.proposedArtifact.artifactId, second.proposedArtifact.artifactId);
});
test('provider failure becomes structured retryable execution failure', async () => {
  const executor = new AIGatewayAgentExecutor(
    new AIProviderRouter([new MockAIProvider('retryable-failure')]),
  );
  await assert.rejects(
    () => executor.execute(request()),
    (error: unknown) =>
      error instanceof AgentExecutionError && error.code === 'rate_limited' && error.retryable,
  );
});
test('Arabic execution context is preserved', async () => {
  const result = await new AIGatewayAgentExecutor(
    new AIProviderRouter([new MockAIProvider()]),
  ).execute(request('ar-SA'));
  assert.equal(result.proposedArtifact.payload.locale, 'ar-SA');
});
