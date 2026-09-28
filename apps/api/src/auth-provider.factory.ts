import { AuthenticationError, type AuthProvider } from '@platform/auth';
import { TenantMembershipAuthProvider, type TenantMembershipResolver } from '@platform/auth/membership';
import { OidcAuthProvider } from '@platform/auth/oidc';
import type { RuntimeConfig } from '@platform/config';
import type { TenantContext } from '@platform/contracts';

import { LocalAcceptanceAuthProvider } from './local-acceptance-auth.js';

export class RejectingAuthProvider implements AuthProvider {
  async verifyAccessToken(_token: string): Promise<TenantContext> {
    throw new AuthenticationError('OIDC authentication is not configured');
  }
}

export interface ApiAuthProviderDependencies {
  /** Authoritative tenant membership resolution (database-backed in the API). */
  membershipResolver?: TenantMembershipResolver;
}

/**
 * Keeps production OIDC-only and makes local acceptance opt-in and explicit.
 * OIDC tokens are additionally bound to authoritative tenant_members rows:
 * claims alone never grant tenancy, roles, or permissions.
 */
export function createApiAuthProvider(
  config: RuntimeConfig,
  dependencies: ApiAuthProviderDependencies = {},
): AuthProvider {
  if (config.nodeEnv === 'production') {
    if (!config.oidcIssuerUrl || !config.oidcAudience) {
      throw new Error('PRODUCTION_OIDC_CONFIGURATION_REQUIRED');
    }
    if (!dependencies.membershipResolver) {
      throw new Error('PRODUCTION_TENANT_MEMBERSHIP_RESOLVER_REQUIRED');
    }
    return new TenantMembershipAuthProvider(
      new OidcAuthProvider({ issuerUrl: config.oidcIssuerUrl, audience: config.oidcAudience }),
      dependencies.membershipResolver,
    );
  }
  if (config.oidcIssuerUrl && config.oidcAudience) {
    const oidc = new OidcAuthProvider({ issuerUrl: config.oidcIssuerUrl, audience: config.oidcAudience });
    return dependencies.membershipResolver
      ? new TenantMembershipAuthProvider(oidc, dependencies.membershipResolver)
      : oidc;
  }
  if (config.localAcceptanceAuthEnabled) {
    if (
      !config.localAcceptanceAuthTokenFile ||
      !config.localAcceptanceAuthTenantId ||
      !config.localAcceptanceAuthUserId
    ) {
      throw new Error('LOCAL_ACCEPTANCE_AUTH_CONFIGURATION_INCOMPLETE');
    }
    return new LocalAcceptanceAuthProvider({
      tokenFile: config.localAcceptanceAuthTokenFile,
      tenantId: config.localAcceptanceAuthTenantId,
      userId: config.localAcceptanceAuthUserId,
    });
  }
  return new RejectingAuthProvider();
}
