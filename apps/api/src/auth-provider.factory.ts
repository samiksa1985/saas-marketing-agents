import { AuthenticationError, type AuthProvider } from '@platform/auth';
import { OidcAuthProvider } from '@platform/auth/oidc';
import type { RuntimeConfig } from '@platform/config';
import type { TenantContext } from '@platform/contracts';

import { LocalAcceptanceAuthProvider } from './local-acceptance-auth.js';

export class RejectingAuthProvider implements AuthProvider {
  async verifyAccessToken(_token: string): Promise<TenantContext> {
    throw new AuthenticationError('OIDC authentication is not configured');
  }
}

/** Keeps production OIDC-only and makes local acceptance opt-in and explicit. */
export function createApiAuthProvider(config: RuntimeConfig): AuthProvider {
  if (config.nodeEnv === 'production') {
    if (!config.oidcIssuerUrl || !config.oidcAudience) {
      throw new Error('PRODUCTION_OIDC_CONFIGURATION_REQUIRED');
    }
    return new OidcAuthProvider({ issuerUrl: config.oidcIssuerUrl, audience: config.oidcAudience });
  }
  if (config.oidcIssuerUrl && config.oidcAudience) {
    return new OidcAuthProvider({ issuerUrl: config.oidcIssuerUrl, audience: config.oidcAudience });
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
