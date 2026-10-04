import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  authenticate,
  AuthenticationError,
  type AuthProvider,
} from '@platform/auth';
import { createStructuredLogger, platformMetrics } from '@platform/observability';
import type { BrowserSessionAuthenticator } from './browser-auth.service.js';
import { cookieValue, sessionCookieName } from './browser-auth.service.js';

const securityLogger = createStructuredLogger('api');

export const AUTH_PROVIDER =
  'PLATFORM_AUTH_PROVIDER';

export const AUTH_CONTEXT =
  'platformAuthContext';

export interface AuthenticatedRequest {
  headers: {
    authorization?:
      | string
      | string[]
      | undefined;
    cookie?: string | string[] | undefined;
    origin?: string | string[] | undefined;
    'x-csrf-token'?: string | string[] | undefined;
  };
  method?: string;

  [AUTH_CONTEXT]?:
    TenantContext;
}

@Injectable()
export class ApiAuthGuard
  implements CanActivate {
  constructor(
    @Inject(AUTH_PROVIDER)
    private readonly provider:
      AuthProvider,
    private readonly browserSessions?: BrowserSessionAuthenticator,
    private readonly production = process.env.NODE_ENV === 'production',
  ) {}

  async canActivate(
    executionContext:
      ExecutionContext,
  ): Promise<boolean> {
    const request =
      executionContext
        .switchToHttp()
        .getRequest<
          AuthenticatedRequest
        >();

    const rawAuthorization =
      request.headers.authorization;

    const authorization =
      Array.isArray(
        rawAuthorization,
      )
        ? rawAuthorization[0]
        : rawAuthorization;

    try {
      let tenantContext: TenantContext;
      if (!authorization && this.browserSessions) {
        const rawCookie = request.headers.cookie;
        const cookies = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie;
        const sessionId = cookieValue(cookies, sessionCookieName(this.production));
        if (sessionId) {
          const rawOrigin = request.headers.origin;
          const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
          const rawCsrf = request.headers['x-csrf-token'];
          const csrfToken = Array.isArray(rawCsrf) ? rawCsrf[0] : rawCsrf;
          tenantContext = (
            await this.browserSessions.authenticateRequest(
              sessionId,
              request.method ?? 'GET',
              origin,
              csrfToken,
            )
          ).context;
        } else {
          tenantContext = await authenticate(this.provider, authorization);
        }
      } else {
        tenantContext = await authenticate(this.provider, authorization);
      }

      request[
        AUTH_CONTEXT
      ] = tenantContext;
      platformMetrics.recordSignal('authentication', 'accepted');

      return true;
    } catch (
      error
    ) {
      platformMetrics.recordSignal('authentication', 'rejected');
      securityLogger.emit('warn', 'security.authentication.rejected', {
        reason: error instanceof AuthenticationError ? 'invalid_credentials' : 'authentication_failed',
      });
      if (
        error instanceof
        AuthenticationError
      ) {
        throw new UnauthorizedException(
          error.message,
        );
      }

      throw new UnauthorizedException(
        'Authentication failed',
      );
    }
  }
}

export function getAuthContext(
  request:
    AuthenticatedRequest,
): TenantContext {
  const context =
    request[
      AUTH_CONTEXT
    ];

  if (
    !context
  ) {
    throw new UnauthorizedException(
      'Authenticated context is missing',
    );
  }

  return context;
}