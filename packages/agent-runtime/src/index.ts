import { createHash } from 'node:crypto';
import type { ArtifactReference, Locale, TenantContext } from '@platform/contracts';
import {
  AIProviderError,
  AIProviderRouter,
  type AIExecutionPolicy,
  type AIRequest,
  type AIResponse,
} from '@platform/ai-gateway';

export interface AgentExecutionContext {
  tenantContext: TenantContext;
  workflowId: string;
  taskId: string;
  workstreamId: string;
  agentId: string;
  locale: Locale;
  inputArtifactReferences: ArtifactReference[];
  approvedSystemInstructions: string;
  executionPolicy: AIExecutionPolicy;
}
export interface AgentExecutionRequest extends AgentExecutionContext {
  input: unknown;
  idempotencyKey: string;
}
export interface ProposedAgentArtifact {
  artifactId: string;
  tenantId: string;
  workflowId: string;
  taskId: string;
  workstreamId: string;
  version: string;
  status: 'draft';
  accepted: false;
  payload: { kind: 'agent-proposal'; content: unknown; locale: Locale };
  autoApproved: false;
}
export interface AgentExecutionResult {
  executionId: string;
  proposedArtifact: ProposedAgentArtifact;
  usage: AIResponse['usage'];
  provider: string;
  model: string;
  durationMs: number;
  warnings: string[];
  errors: Array<{ code: string; message: string; retryable: boolean }>;
}
export interface AgentExecutor {
  execute(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
}
export type ExecutionEventType =
  | 'agent.execution_started'
  | 'agent.execution_completed'
  | 'agent.execution_failed'
  | 'provider.requested'
  | 'provider.completed'
  | 'provider.failed';
export interface ExecutionEvent {
  eventType: ExecutionEventType;
  tenantId: string;
  workflowId: string;
  taskId: string;
  executionId: string;
  timestamp: string;
  correlationId: string;
  payload: Record<string, unknown>;
}
export interface ExecutionEventSink {
  emit(event: ExecutionEvent): void;
}
export class AgentExecutionError extends Error {
  constructor(
    public readonly executionId: string,
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AgentExecutionError';
  }
}
function deterministicId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}
export class AIGatewayAgentExecutor implements AgentExecutor {
  constructor(
    private readonly router: AIProviderRouter,
    private readonly events?: ExecutionEventSink,
  ) {}
  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (!request.tenantContext?.tenantId)
      throw new AgentExecutionError('', 'tenant_invalid', 'Tenant context is required', false);
    const executionId = deterministicId(
      'execution',
      `${request.tenantContext.tenantId}:${request.workflowId}:${request.taskId}:${request.idempotencyKey}`,
    );
    const correlationId = request.idempotencyKey;
    const event = (eventType: ExecutionEventType, payload: Record<string, unknown>) =>
      this.events?.emit({
        eventType,
        tenantId: request.tenantContext.tenantId,
        workflowId: request.workflowId,
        taskId: request.taskId,
        executionId,
        timestamp: new Date().toISOString(),
        correlationId,
        payload,
      });
    event('agent.execution_started', { agentId: request.agentId });
    event('provider.requested', {
      provider: request.executionPolicy.provider,
      model: request.executionPolicy.model,
    });
    const { executionPolicy, ...requestWithoutPolicy } = request;
    const aiRequest: AIRequest = {
      ...requestWithoutPolicy,
      tenantId: request.tenantContext.tenantId,
      executionId,
      policy: executionPolicy,
    };
    try {
      const response = await this.router.execute(aiRequest);
      event('provider.completed', {
        provider: response.provider,
        model: response.model,
        totalTokens: response.usage.totalTokens,
        estimatedCost: response.usage.estimatedCost,
      });
      event('agent.execution_completed', { provider: response.provider, model: response.model });
      return {
        executionId,
        proposedArtifact: {
          artifactId: deterministicId('artifact', executionId),
          tenantId: request.tenantContext.tenantId,
          workflowId: request.workflowId,
          taskId: request.taskId,
          workstreamId: request.workstreamId,
          version: '1',
          status: 'draft',
          accepted: false,
          payload: { kind: 'agent-proposal', content: response.output, locale: request.locale },
          autoApproved: false,
        },
        usage: response.usage,
        provider: response.provider,
        model: response.model,
        durationMs: response.durationMs,
        warnings: response.warnings,
        errors: [],
      };
    } catch (error) {
      const providerError =
        error instanceof AIProviderError
          ? error
          : new AIProviderError(
              'provider_failure',
              error instanceof Error ? error.message : 'Agent execution failed',
            );
      event('provider.failed', { code: providerError.code, retryable: providerError.retryable });
      event('agent.execution_failed', {
        code: providerError.code,
        retryable: providerError.retryable,
      });
      throw new AgentExecutionError(
        executionId,
        providerError.code,
        providerError.message,
        providerError.retryable,
      );
    }
  }
}
export interface AgentRunner {
  run(context: AgentExecutionContext): Promise<ProposedAgentArtifact[]>;
}
export function assertExecutionTenant(context: AgentExecutionContext): void {
  if (!context.tenantContext?.tenantId) throw new Error('Agent execution requires tenant context');
}
