/**
 * Authoritative tenant membership enforcement (WS-PROD-04).
 *
 * A cryptographically valid OIDC token proves external identity ONLY. It must
 * never select a tenant, role, or permission by itself. This wrapper applies
 * the production trust boundary:
 *
 *   verified subject + claimed tenant
 *     -> authoritative tenant_members row (users -> tenant_members -> roles)
 *     -> canonical permissions from role_permissions
 *     -> TenantContext
 *
 * The claimed tenant id is used ONLY to scope the database lookup (RLS-safe);
 * authorization comes exclusively from the membership row. Unknown users,
 * unknown tenants, tenant mismatches, inactive memberships, and unresolvable
 * roles all fail closed with AuthenticationError.
 */
import type { Permission, Role, TenantContext } from '@platform/contracts';

import { AuthenticationError, type AuthProvider } from './index.js';

export interface TenantMembership {
  tenantId: string;
  role: Role;
  permissions: Permission[];
}

export interface TenantMembershipResolver {
  /**
   * Resolves the authoritative membership for an external subject against the
   * claimed tenant, or null when no active membership exists.
   */
  resolve(subject: string, claimedTenantId: string): Promise<TenantMembership | null>;
}

export class TenantMembershipAuthProvider implements AuthProvider {
  constructor(
    private readonly identity: AuthProvider,
    private readonly membership: TenantMembershipResolver,
  ) {}

  async verifyAccessToken(token: string): Promise<TenantContext> {
    // Cryptographic verification first: issuer, audience, signature, expiry.
    const verified = await this.identity.verifyAccessToken(token);

    const subject = verified.userId;
    if (!subject) {
      throw new AuthenticationError('Authenticated token does not contain a subject identifier');
    }

    // Then authoritative membership: claims cannot grant tenancy, roles, or
    // permissions on their own.
    const membership = await this.membership.resolve(subject, verified.tenantId);
    if (!membership) {
      throw new AuthenticationError('No active membership for the requested tenant');
    }
    if (membership.tenantId !== verified.tenantId) {
      throw new AuthenticationError('Tenant selection is not authorized for this subject');
    }

    return {
      tenantId: membership.tenantId,
      userId: subject,
      roles: [membership.role],
      permissions: [...membership.permissions],
      locale: verified.locale,
    };
  }
}
