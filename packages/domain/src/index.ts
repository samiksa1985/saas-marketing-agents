import type { Permission, TenantContext } from '@platform/contracts';

export type { TenantContext } from '@platform/contracts';

export function requireTenantContext(context: TenantContext | undefined): TenantContext {
  if (!context?.tenantId) throw new Error('Tenant context is required');
  return context;
}

export function hasPermission(context: TenantContext, permission: Permission): boolean {
  return context.permissions.includes(permission);
}
