import type { TenantContext } from '@platform/domain';

export interface ToolAdapter {
  toolId: string;
  invoke(context: TenantContext, input: unknown, idempotencyKey: string): Promise<unknown>;
}
export function assertToolAccess(context: TenantContext, toolId: string): void {
  if (!context.tenantId || !toolId) throw new Error('Tenant-scoped tool access is required');
}
