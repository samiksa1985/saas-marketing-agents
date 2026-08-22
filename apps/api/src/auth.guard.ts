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
  };

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
      const tenantContext =
        await authenticate(
          this.provider,
          authorization,
        );

      request[
        AUTH_CONTEXT
      ] = tenantContext;

      return true;
    } catch (
      error
    ) {
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