import assert from 'node:assert/strict';
import test from 'node:test';
import type { TenantContext } from '@platform/contracts';
import {
  AIProviderError,
  AIProviderRouter,
  MockAIProvider,
  type AIExecutionPolicy,
  type AIRequest,
} from './index.js';

const context: TenantContext = { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' };
const policy: AIExecutionPolicy = {
  provider: 'mock',
  model: 'deterministic-v1',
  timeoutMs: 20,
  maxRetries: 2,
  retryableErrors: ['rate_limited', 'timeout'],
  maxInputTokens: 10000,
  maxOutputTokens: 10000,
  costLimit: 1,
  requiredCapabilities: ['text-generation'],
};
const request = (override: Partial<AIRequest> = {}): AIRequest => ({
  tenantContext: context,
  tenantId: context.tenantId,
  executionId: 'execution-a',
  workflowId: 'workflow-a',
  taskId: 'task-a',
  agentId: 'agent-a',
  locale: 'en',
  inputArtifactReferences: [],
  approvedSystemInstructions: 'approved',
  input: { prompt: 'test' },
  policy,
  ...override,
});

test('mock provider execution returns usage and cost metadata', async () => {
  const response = await new AIProviderRouter([new MockAIProvider()]).execute(request());
  assert.equal(response.provider, 'mock');
  assert.equal(response.model, 'deterministic-v1');
  assert.ok(response.usage.totalTokens > 0);
  assert.ok(response.usage.estimatedCost > 0);
});
test('provider routing rejects unsupported models', async () => {
  await assert.rejects(
    () =>
      new AIProviderRouter([new MockAIProvider()]).execute(
        request({ policy: { ...policy, model: 'unknown' } }),
      ),
    (error: unknown) => error instanceof AIProviderError && error.code === 'unsupported_model',
  );
});
test('retry policy retries retryable provider failures', async () => {
  const provider = new MockAIProvider('retryable-failure');
  await assert.rejects(
    () => new AIProviderRouter([provider]).execute(request()),
    (error: unknown) => error instanceof AIProviderError && error.code === 'rate_limited',
  );
  assert.equal(provider.callCount, 3);
});
test('timeout policy returns structured timeout', async () => {
  const provider = new MockAIProvider('timeout');
  await assert.rejects(
    () =>
      new AIProviderRouter([provider]).execute(
        request({ policy: { ...policy, timeoutMs: 1, maxRetries: 0 } }),
      ),
    (error: unknown) => error instanceof AIProviderError && error.code === 'timeout',
  );
});
test('tenant policy rejects over-cost execution', async () => {
  await assert.rejects(
    () =>
      new AIProviderRouter([new MockAIProvider()]).execute(
        request({ policy: { ...policy, costLimit: 0 } }),
      ),
    (error: unknown) => error instanceof AIProviderError && error.code === 'policy_rejected',
  );
});
