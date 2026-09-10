import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { AuthenticationError, type AuthProvider } from '@platform/auth';
import type { TenantContext } from '@platform/contracts';

export interface LocalAcceptanceAuthProviderOptions {
  tokenFile: string;
  tenantId: string;
  userId: string;
}

/**
 * Explicit local acceptance authentication only. It is selected solely by the
 * non-production composition factory after configuration has validated the
 * external token file. It has no OIDC or production fallback behavior.
 */
export class LocalAcceptanceAuthProvider implements AuthProvider {
  readonly #expectedToken: Buffer;
  readonly #context: TenantContext;

  constructor(options: LocalAcceptanceAuthProviderOptions) {
    const token = readLocalAcceptanceToken(options.tokenFile);
    if (!options.tenantId || !options.userId) {
      throw new Error('LOCAL_ACCEPTANCE_AUTH_IDENTITY_REQUIRED');
    }
    this.#expectedToken = Buffer.from(token, 'utf8');
    this.#context = {
      tenantId: options.tenantId,
      userId: options.userId,
      roles: ['tenant_admin'],
      permissions: [
        'marketing:admin',
        'workflow:execute',
        'approval:decide',
        'integration:admin',
        'artifact:read',
        'audit:read',
      ],
      locale: 'ar-SA',
    };
  }

  async verifyAccessToken(token: string): Promise<TenantContext> {
    const supplied = Buffer.from(token, 'utf8');
    if (
      supplied.length !== this.#expectedToken.length ||
      !timingSafeEqual(supplied, this.#expectedToken)
    ) {
      throw new AuthenticationError('Invalid local acceptance access token');
    }
    return {
      ...this.#context,
      roles: [...this.#context.roles],
      permissions: [...this.#context.permissions],
    };
  }
}

function readLocalAcceptanceToken(tokenFile: string): string {
  try {
    const token = readFileSync(tokenFile, 'utf8').trim();
    if (!token) throw new Error('LOCAL_ACCEPTANCE_AUTH_TOKEN_EMPTY');
    return token;
  } catch {
    throw new Error('LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE_UNREADABLE');
  }
}
