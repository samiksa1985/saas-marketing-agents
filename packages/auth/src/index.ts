import type {
  TenantContext,
} from '@platform/contracts';

import type {
  Permission,
} from '@platform/contracts';

export interface AuthProvider {
  verifyAccessToken(
    token: string,
  ): Promise<TenantContext>;
}

export class AuthenticationError
  extends Error {
  constructor(
    message =
      'Authentication required',
  ) {
    super(message);

    this.name =
      'AuthenticationError';
  }
}

export class AuthorizationError
  extends Error {
  constructor(
    message =
      'Forbidden',
  ) {
    super(message);

    this.name =
      'AuthorizationError';
  }
}

export function extractBearerToken(
  authorization:
    | string
    | undefined,
): string {
  if (
    !authorization
  ) {
    throw new AuthenticationError(
      'Authorization header is required',
    );
  }

  const match =
    /^Bearer\s+(.+)$/i.exec(
      authorization.trim(),
    );

  if (
    !match?.[1]
  ) {
    throw new AuthenticationError(
      'Authorization header must use Bearer token authentication',
    );
  }

  const token =
    match[1].trim();

  if (
    !token
  ) {
    throw new AuthenticationError(
      'Bearer token is empty',
    );
  }

  return token;
}

export async function authenticate(
  provider:
    AuthProvider,
  authorization:
    | string
    | undefined,
): Promise<TenantContext> {
  const token =
    extractBearerToken(
      authorization,
    );

  try {
    const context =
      await provider.verifyAccessToken(
        token,
      );

    if (
      !context?.tenantId
    ) {
      throw new AuthenticationError(
        'Authenticated context does not contain a tenant identifier',
      );
    }

    if (
      !context.userId
    ) {
      throw new AuthenticationError(
        'Authenticated context does not contain a user identifier',
      );
    }

    return context;
  } catch (
    error
  ) {
    if (
      error instanceof
      AuthenticationError
    ) {
      throw error;
    }

    throw new AuthenticationError(
      'Invalid or expired access token',
    );
  }
}

export function authorize(
  context:
    | TenantContext
    | undefined,
  permission:
    Permission,
): TenantContext {
  if (
    !context?.tenantId
  ) {
    throw new AuthorizationError(
      'Authenticated tenant context is required',
    );
  }

  if (
    !context.userId
  ) {
    throw new AuthorizationError(
      'Authenticated user context is required',
    );
  }

  if (
    !context.permissions.includes(
      permission,
    )
  ) {
    throw new AuthorizationError(
      `Missing permission: ${permission}`,
    );
  }

  return context;
}