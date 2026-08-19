import type { TenantContext } from '@platform/domain';
import { hasPermission, requireTenantContext } from '@platform/domain';
import type { Permission } from '@platform/contracts';

export interface AuthProvider {
  verifyAccessToken(token: string): Promise<TenantContext>;
}

export function authorize(
  context: TenantContext | undefined,
  permission: Permission,
): TenantContext {
  const tenantContext = requireTenantContext(context);
  if (!hasPermission(tenantContext, permission)) throw new Error('Forbidden');
  return tenantContext;
}
