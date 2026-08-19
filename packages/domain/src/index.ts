import type { Id, Permission, Role } from '@platform/contracts';

export interface TenantContext {
  tenantId: Id;
  userId?: Id;
  roles: Role[];
  permissions: Permission[];
  locale: string;
}

export function requireTenantContext(context: TenantContext | undefined): TenantContext {
  if (!context?.tenantId) throw new Error('Tenant context is required');
  return context;
}

export function hasPermission(context: TenantContext, permission: Permission): boolean {
  return context.permissions.includes(permission);
}
