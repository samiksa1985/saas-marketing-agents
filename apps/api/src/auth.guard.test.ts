import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ExecutionContext,
} from '@nestjs/common';

import type {
  TenantContext,
} from '@platform/contracts';

import type {
  AuthProvider,
} from '@platform/auth';

import {
  ApiAuthGuard,
  getAuthContext,
  AUTH_CONTEXT,
  type AuthenticatedRequest,
} from './auth.guard.js';

function context(): TenantContext {
  return {
    tenantId:
      'tenant-a',

    userId:
      'user-a',

    roles: [
      'reviewer',
    ],

    permissions: [
      'workflow:read',
      'workflow:execute',
      'artifact:read',
      'approval:decide',
    ],

    locale:
      'en',
  };
}

function executionContext(
  authorization?:
    string,
) {
  const request: AuthenticatedRequest = {
    headers: {
      ...(authorization
        ? {
            authorization,
          }
        : {}),
    },
  };

  const context =
    {
      switchToHttp() {
        return {
          getRequest<
            TRequest = AuthenticatedRequest,
          >() {
            return request as TRequest;
          },
        };
      },
    } as unknown as ExecutionContext;

  return {
    context,
    request,
  };
}

class StaticProvider
  implements AuthProvider {
  public token:
    string | undefined;

  constructor(
    private readonly tenantContext:
      TenantContext,
  ) {}

  async verifyAccessToken(
    token: string,
  ): Promise<TenantContext> {
    this.token =
      token;

    return this.tenantContext;
  }
}

class RejectingProvider
  implements AuthProvider {
  async verifyAccessToken(
    _token: string,
  ): Promise<TenantContext> {
    throw new Error(
      'invalid token',
    );
  }
}

test(
  'API auth guard accepts a valid Bearer token',
  async () => {
    const provider =
      new StaticProvider(
        context(),
      );

    const guard =
      new ApiAuthGuard(
        provider,
      );

    const {
      context:
        execution,
      request,
    } =
      executionContext(
        'Bearer abc123',
      );

    const result =
      await guard.canActivate(
        execution,
      );

    assert.equal(
      result,
      true,
    );

    assert.equal(
      provider.token,
      'abc123',
    );

    assert.deepEqual(
      request[AUTH_CONTEXT],
      context(),
    );
  },
);

test(
  'API auth guard rejects a missing authorization header',
  async () => {
    const guard =
      new ApiAuthGuard(
        new StaticProvider(
          context(),
        ),
      );

    const {
      context:
        execution,
    } =
      executionContext();

    await assert.rejects(
      () =>
        guard.canActivate(
          execution,
        ),
      /authorization header is required/i,
    );
  },
);

test(
  'API auth guard rejects an invalid token',
  async () => {
    const guard =
      new ApiAuthGuard(
        new RejectingProvider(),
      );

    const {
      context:
        execution,
    } =
      executionContext(
        'Bearer invalid',
      );

    await assert.rejects(
      () =>
        guard.canActivate(
          execution,
        ),
      /invalid or expired access token|authentication failed/i,
    );
  },
);

test(
  'getAuthContext returns the authenticated tenant context',
  async () => {
    const provider =
      new StaticProvider(
        context(),
      );

    const guard =
      new ApiAuthGuard(
        provider,
      );

    const {
      context:
        execution,
      request,
    } =
      executionContext(
        'Bearer valid',
      );

    await guard.canActivate(
      execution,
    );

    assert.deepEqual(
      getAuthContext(
        request,
      ),
      context(),
    );
  },
);

test(
  'getAuthContext rejects unauthenticated requests',
  () => {
    const {
      request,
    } =
      executionContext();

    assert.throws(
      () =>
        getAuthContext(
          request,
        ),
      /authenticated context is missing/i,
    );
  },
);

test(
  'authenticated tenant is the only tenant context available to the request',
  async () => {
    const provider =
      new StaticProvider(
        context(),
      );

    const guard =
      new ApiAuthGuard(
        provider,
      );

    const {
      context:
        execution,
      request,
    } =
      executionContext(
        'Bearer tenant-a-user-a',
      );

    await guard.canActivate(
      execution,
    );

    const authenticatedContext =
      getAuthContext(
        request,
      );

    assert.equal(
      authenticatedContext.tenantId,
      'tenant-a',
    );

    assert.equal(
      authenticatedContext.userId,
      'user-a',
    );
  },
);