import { createHash } from 'node:crypto';
import type { ArtifactReference, Locale, TenantContext } from '@platform/contracts';

export type AIProviderCapability = 'text-generation';
export type AIProviderErrorCode =
  | 'unsupported_model'
  | 'timeout'
  | 'rate_limited'
  | 'provider_failure'
  | 'policy_rejected'
  | 'invalid_request';
export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  currency: 'USD';
}
export interface AIExecutionPolicy {
  provider: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  retryableErrors: AIProviderErrorCode[];
  maxInputTokens: number;
  maxOutputTokens: number;
  costLimit: number;
  requiredCapabilities: AIProviderCapability[];
}
export interface AIRequest {
  tenantContext: TenantContext;
  tenantId: string;
  executionId: string;
  workflowId: string;
  taskId: string;
  agentId: string;
  locale: Locale;
  inputArtifactReferences: ArtifactReference[];
  approvedSystemInstructions: string;
  input: unknown;
  policy: AIExecutionPolicy;
}
export interface AIResponse {
  provider: string;
  model: string;
  output: unknown;
  usage: AIUsage;
  durationMs: number;
  warnings: string[];
  executionId: string;
}
export interface AIProvider {
  readonly name: string;
  readonly models: ReadonlySet<string>;
  readonly capabilities: ReadonlySet<AIProviderCapability>;
  generate(request: AIRequest): Promise<AIResponse>;
}
export class AIProviderError extends Error {
  constructor(
    public readonly code: AIProviderErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly provider?: string,
    public readonly model?: string,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
export class AIProviderRouter {
  constructor(private readonly providers: AIProvider[]) {}
  route(policy: AIExecutionPolicy): AIProvider {
    const provider = this.providers.find((candidate) => candidate.name === policy.provider);
    if (!provider)
      throw new AIProviderError(
        'provider_failure',
        `Provider is not configured: ${policy.provider}`,
      );
    if (!provider.models.has(policy.model))
      throw new AIProviderError(
        'unsupported_model',
        `Model is not supported: ${policy.provider}/${policy.model}`,
      );
    for (const capability of policy.requiredCapabilities)
      if (!provider.capabilities.has(capability))
        throw new AIProviderError('unsupported_model', `Provider lacks capability: ${capability}`);
    return provider;
  }
  async execute(request: AIRequest): Promise<AIResponse> {
    const provider = this.route(request.policy);
    const started = Date.now();
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await withTimeout(provider.generate(request), request.policy.timeoutMs);
        if (response.usage.estimatedCost > request.policy.costLimit)
          throw new AIProviderError(
            'policy_rejected',
            'Execution cost exceeds tenant policy',
            false,
            provider.name,
            request.policy.model,
          );
        return {
          ...response,
          provider: provider.name,
          model: request.policy.model,
          durationMs: Date.now() - started,
          executionId: request.executionId,
        };
      } catch (error) {
        const normalized =
          error instanceof AIProviderError
            ? error
            : new AIProviderError(
                'provider_failure',
                error instanceof Error ? error.message : 'Provider failed',
                false,
                provider.name,
                request.policy.model,
              );
        if (
          !normalized.retryable ||
          attempt >= request.policy.maxRetries ||
          !request.policy.retryableErrors.includes(normalized.code)
        )
          throw normalized;
      }
    }
  }
}
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new AIProviderError('timeout', `Provider timed out after ${timeoutMs}ms`, true)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  readonly models = new Set(['deterministic-v1']);
  readonly capabilities = new Set<AIProviderCapability>(['text-generation']);
  private calls = 0;
  constructor(private readonly behavior: 'success' | 'retryable-failure' | 'timeout' = 'success') {}
  get callCount(): number {
    return this.calls;
  }
  async generate(request: AIRequest): Promise<AIResponse> {
    this.calls += 1;
    if (this.behavior === 'retryable-failure')
      throw new AIProviderError(
        'rate_limited',
        'Mock provider rate limited',
        true,
        this.name,
        request.policy.model,
      );
    if (this.behavior === 'timeout')
      await new Promise((resolve) => setTimeout(resolve, request.policy.timeoutMs + 5));
    const inputTokens = JSON.stringify(request.input).length;
    const output = {
      kind: 'mock-ai-output',
      executionId: request.executionId,
      agentId: request.agentId,
      workstreamId: request.taskId ? request.taskId.slice(0, 16) : request.agentId,
      locale: request.locale,
      approvedInstructionsHash: createHash('sha256')
        .update(request.approvedSystemInstructions)
        .digest('hex'),
    };
    const outputTokens = JSON.stringify(output).length;
    return {
      provider: this.name,
      model: request.policy.model,
      output,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCost: (inputTokens + outputTokens) * 0.000001,
        currency: 'USD',
      },
      durationMs: 0,
      warnings: [],
      executionId: request.executionId,
    };
  }
}
