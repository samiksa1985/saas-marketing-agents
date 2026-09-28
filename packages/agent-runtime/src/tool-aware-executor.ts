import {
  type AgentExecutionRequest,
  type AgentExecutionResult,
  type AgentExecutor,
} from './index.js';
import type { ToolCall, ToolGateway } from '@platform/tool-gateway';

export interface ToolAwareAgentExecutionRequest
  extends AgentExecutionRequest {
  toolCalls?: ToolCall[];
  approvedApprovalIds?: string[];
}

export class ToolAwareAgentExecutor
  implements AgentExecutor
{
  constructor(
    private readonly baseExecutor: AgentExecutor,
    private readonly toolGateway: ToolGateway,
  ) {}

  async execute(
    request: ToolAwareAgentExecutionRequest,
  ): Promise<AgentExecutionResult> {
    const toolResults: Record<string, unknown> = {};
    const approvals = new Set(
      request.approvedApprovalIds ?? [],
    );

    for (const call of request.toolCalls ?? []) {
      if (
        call.tenantId !==
        request.tenantContext.tenantId
      ) {
        throw new Error(
          'Cross-tenant tool call denied',
        );
      }

      toolResults[call.toolId] =
        await this.toolGateway.execute(
          call,
          {
            tenant:
              request.tenantContext,
            approvedApprovalIds:
              approvals,
          },
        );
    }

    if (
      Object.keys(toolResults).length === 0
    ) {
      return this.baseExecutor.execute(
        request,
      );
    }

    return this.baseExecutor.execute({
      ...request,
      input: {
        originalInput: request.input,
        toolResults,
      },
    });
  }
}
