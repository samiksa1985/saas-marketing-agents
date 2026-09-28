import type { EntitlementDecision, Permission, Role, TenantContext } from '@platform/contracts';

import { hasPermission, requireTenantContext } from '@platform/domain';

export type GovernancePolicyDenyReason =
  | 'MISSING_TENANT_CONTEXT'
  | 'TENANT_SCOPE_DENIED'
  | 'ROLE_DENIED'
  | 'PERMISSION_DENIED'
  | 'ENTITLEMENT_DENIED'
  | 'ENTITY_SCOPE_DENIED'
  | 'APPROVAL_REQUIRED';

export interface GovernanceEntityScope {
  tenantId: string;
  ownerUserId?: string;
  allowedUserIds?: readonly string[];
}

export interface GovernanceApprovalRequirement {
  tenantId: string;
  required: boolean;
  approved: boolean;
}

export interface GovernancePolicyInput {
  context: TenantContext | undefined;
  tenantId: string;
  permission: Permission;
  requiredRoles?: readonly Role[];
  entitlement?: EntitlementDecision;
  entityScope?: GovernanceEntityScope;
  approval?: GovernanceApprovalRequirement;
}

export interface GovernancePolicyDecision {
  allowed: boolean;
  reasons: GovernancePolicyDenyReason[];
}

function deny(reason: GovernancePolicyDenyReason): GovernancePolicyDecision {
  return {
    allowed: false,
    reasons: [reason],
  };
}

/**
 * Evaluates every supplied policy input and fails closed.  Roles narrow an
 * operation when requested; they never imply a permission by themselves.
 */
export function evaluateGovernancePolicy(input: GovernancePolicyInput): GovernancePolicyDecision {
  let context: TenantContext;

  try {
    context = requireTenantContext(input.context) as TenantContext;
  } catch {
    return deny('MISSING_TENANT_CONTEXT');
  }

  if (!input.tenantId || context.tenantId !== input.tenantId) {
    return deny('TENANT_SCOPE_DENIED');
  }

  if (
    input.requiredRoles &&
    input.requiredRoles.length > 0 &&
    !input.requiredRoles.some((role) => context.roles.includes(role))
  ) {
    return deny('ROLE_DENIED');
  }

  if (!hasPermission(context, input.permission)) {
    return deny('PERMISSION_DENIED');
  }

  if (input.entitlement) {
    if (input.entitlement.tenantId !== input.tenantId || !input.entitlement.allowed) {
      return deny('ENTITLEMENT_DENIED');
    }
  }

  if (input.entityScope) {
    if (input.entityScope.tenantId !== input.tenantId) {
      return deny('ENTITY_SCOPE_DENIED');
    }

    const ownerUserId = input.entityScope.ownerUserId;
    const allowedUserIds = input.entityScope.allowedUserIds;
    if (ownerUserId || allowedUserIds?.length) {
      if (!context.userId) {
        return deny('ENTITY_SCOPE_DENIED');
      }

      const isOwner = ownerUserId === context.userId;
      const isExplicitlyScoped = allowedUserIds?.includes(context.userId) ?? false;
      if (!isOwner && !isExplicitlyScoped) {
        return deny('ENTITY_SCOPE_DENIED');
      }
    }
  }

  if (input.approval) {
    if (input.approval.tenantId !== input.tenantId) {
      return deny('TENANT_SCOPE_DENIED');
    }

    if (input.approval.required && !input.approval.approved) {
      return deny('APPROVAL_REQUIRED');
    }
  }

  return {
    allowed: true,
    reasons: [],
  };
}
