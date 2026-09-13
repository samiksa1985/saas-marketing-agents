import type { Permission, TenantContext } from '@platform/contracts';

export type ToolRisk =
  | 'READ'
  | 'WRITE'
  | 'EXTERNAL_SIDE_EFFECT';

export interface ToolDefinition {
  toolId: string;
  description: string;
  risk: ToolRisk;
  permissions: Permission[];
  tenantScoped: boolean;
}

export interface ToolCall {
  toolId: string;
  tenantId: string;
  idempotencyKey: string;
  approvalId?: string;
  input: Record<string, unknown>;
}

export interface ToolExecutionContext {
  tenant: TenantContext;
  approvedApprovalIds: Set<string>;
}

export interface ToolHandler {
  definition: ToolDefinition;
  execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown>;
}

export interface ToolAdapter {
  toolId: string;
  invoke(
    context: TenantContext,
    input: unknown,
    idempotencyKey: string,
  ): Promise<unknown>;
}

export class ToolGatewayError extends Error {}

export interface ToolGateway {
  register(handler: ToolHandler): void;

  execute(
    call: ToolCall,
    context: ToolExecutionContext,
  ): Promise<unknown>;
}

export function assertToolAccess(
  context: TenantContext,
  toolId: string,
): void {
  if (!context.tenantId || !toolId) {
    throw new ToolGatewayError(
      'Tenant-scoped tool access is required',
    );
  }
}

export class InMemoryToolGateway
  implements ToolGateway
{
  private readonly tools =
    new Map<string, ToolHandler>();

  private readonly results =
    new Map<string, unknown>();

  register(handler: ToolHandler): void {
    const toolId =
      handler.definition.toolId;

    if (this.tools.has(toolId)) {
      throw new ToolGatewayError(
        `TOOL_ALREADY_REGISTERED:${toolId}`,
      );
    }

    this.tools.set(toolId, handler);
  }

  async execute(
    call: ToolCall,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    if (
      !context.tenant.tenantId ||
      context.tenant.tenantId !== call.tenantId
    ) {
      throw new ToolGatewayError(
        'TENANT_CONTEXT_MISMATCH',
      );
    }

    const cacheKey =
      `${call.tenantId}:${call.idempotencyKey}`;

    if (this.results.has(cacheKey)) {
      return this.results.get(cacheKey);
    }

    const handler =
      this.tools.get(call.toolId);

    if (!handler) {
      throw new ToolGatewayError(
        `TOOL_NOT_FOUND:${call.toolId}`,
      );
    }

    const definition =
      handler.definition;

    const granted =
      new Set(
        context.tenant.permissions,
      );

    const missing =
      definition.permissions.filter(
        (permission) =>
          !granted.has(permission),
      );

    if (missing.length > 0) {
      throw new ToolGatewayError(
        `TOOL_PERMISSION_DENIED:${missing.join(',')}`,
      );
    }

    if (
      definition.risk ===
      'EXTERNAL_SIDE_EFFECT'
    ) {
      if (
        !call.approvalId ||
        !context.approvedApprovalIds.has(
          call.approvalId,
        )
      ) {
        throw new ToolGatewayError(
          `TOOL_APPROVAL_REQUIRED:${definition.toolId}`,
        );
      }
    }

    const output =
      await handler.execute(
        call.input,
        context,
      );

    this.results.set(
      cacheKey,
      output,
    );

    return output;
  }
}

export * from './google-ads.js';
export * from './meta-ads.js';
export * from './external-action-provider-registry.js';
