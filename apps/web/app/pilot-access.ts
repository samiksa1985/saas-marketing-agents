import type { ProductAccess } from './product-model';

/**
 * Static, non-secret access presentation for the explicitly local pilot.
 * This module is intentionally server-safe: server components must not import
 * values from a client component boundary.
 */
export const signedOutAccess: ProductAccess = {
  tenantContext: 'missing',
  permissions: [],
  entitlements: [],
};

export const pilotAccess: ProductAccess = {
  tenantContext: 'available',
  permissions: [
    'tenant:read',
    'artifact:read',
    'approval:decide',
    'integration:admin',
    'audit:read',
    'marketing:admin',
    'workflow:read',
    'workflow:execute',
    'organization:read',
    'organization:manage',
    'member:read',
    'member:manage',
    'role:read',
    'role:manage',
    'sales:admin',
    'finance:admin',
    'customer_success:admin',
    'automation:admin',
    'ai_agent:admin',
    'ai_prompt:admin',
    'ai_model:admin',
    'billing:admin',
    'entitlement:admin',
    'feature_flag:read',
    'feature_flag:manage',
    'data_export:request',
    'data_export:read',
    'data_export:manage',
    'data_deletion:request',
    'data_deletion:read',
    'data_deletion:manage',
    'retention_policy:read',
    'retention_policy:manage',
    'security_policy:read',
    'security_policy:manage',
    'system_health:read',
  ],
  entitlements: ['billing-usage'],
};
