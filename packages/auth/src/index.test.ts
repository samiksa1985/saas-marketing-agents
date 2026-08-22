import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  AuthenticationError,
  AuthorizationError,
  authenticate,
  authorize,
  extractBearerToken,
  type AuthProvider,
} from './index.js';

function context(
  overrides: Partial<TenantContext> = {},
): TenantContext {
  return {
    tenantId:
      'tenant-a',

    userId:
      'user-a',

    roles:
      [],

    permissions:
      [
        'tenant:read',
        'workflow:read',
        'workflow:execute',
        'artifact:read',
        'artifact:write',
      ],

    locale:
      'en',

    ...overrides,
  };
}

class StaticAuthProvider
  implements AuthProvider {
  public calls = 0;

  constructor(
    private readonly value:
      TenantContext,
  ) {}

  async verifyAccessToken(
    token: string,
  ): Promise<TenantContext> {
    this.calls += 1;

    assert.equal(
      token,
      'valid-token',
    );

    return this.value;
  }
}

class FailingAuthProvider
  implements AuthProvider {
  async verifyAccessToken(
    _token: string,
  ): Promise<TenantContext> {
    throw new Error(
      'provider rejected token',
    );
  }
}

test(
  'extractBearerToken accepts a valid Bearer header',
  () => {
    assert.equal(
      extractBearerToken(
        'Bearer valid-token',
      ),
      'valid-token',
    );
  },
);

test(
  'extractBearerToken rejects a missing header',
  () => {
    assert.throws(
      () =>
        extractBearerToken(
          undefined,
        ),
      AuthenticationError,
    );
  },
);

test(
  'extractBearerToken rejects malformed authorization headers',
  () => {
    assert.throws(
      () =>
        extractBearerToken(
          'Basic abc123',
        ),
      AuthenticationError,
    );

    assert.throws(
      () =>
        extractBearerToken(
          'Bearer',
        ),
      AuthenticationError,
    );
  },
);

test(
  'authenticate passes the verified identity through unchanged',
  async () => {
    const expected =
      context({
        tenantId:
          'tenant-a',

        userId:
          'user-a',
      });

    const provider =
      new StaticAuthProvider(
        expected,
      );

    const actual =
      await authenticate(
        provider,
        'Bearer valid-token',
      );

    assert.deepEqual(
      actual,
      expected,
    );

    assert.equal(
      provider.calls,
      1,
    );
  },
);

test(
  'authenticate rejects provider failures as authentication errors',
  async () => {
    const provider =
      new FailingAuthProvider();

    await assert.rejects(
      () =>
        authenticate(
          provider,
          'Bearer invalid-token',
        ),
      (error: unknown) =>
        error instanceof
          AuthenticationError &&
        /invalid or expired access token/i.test(
          error.message,
        ),
    );
  },
);

test(
  'authenticate rejects an authenticated context without a tenant',
  async () => {
    const provider =
      new StaticAuthProvider(
        context({
          tenantId:
            '',
        }),
      );

    await assert.rejects(
      () =>
        authenticate(
          provider,
          'Bearer valid-token',
        ),
      (error: unknown) =>
        error instanceof
          AuthenticationError &&
        /tenant identifier/i.test(
          error.message,
        ),
    );
  },
);

test(
  'authenticate rejects an authenticated context without a user',
  async () => {
    const provider =
      new StaticAuthProvider(
        context({
          userId:
            '',
        }),
      );

    await assert.rejects(
      () =>
        authenticate(
          provider,
          'Bearer valid-token',
        ),
      (error: unknown) =>
        error instanceof
          AuthenticationError &&
        /user identifier/i.test(
          error.message,
        ),
    );
  },
);

test(
  'authorize allows a user with the required permission',
  () => {
    const tenantContext =
      context({
        permissions: [
          'workflow:read',
        ],
      });

    const result =
      authorize(
        tenantContext,
        'workflow:read',
      );

    assert.deepEqual(
      result,
      tenantContext,
    );
  },
);

test(
  'authorize rejects a user without the required permission',
  () => {
    const tenantContext =
      context({
        permissions: [
          'workflow:read',
        ],
      });

    assert.throws(
      () =>
        authorize(
          tenantContext,
          'workflow:execute',
        ),
      (error: unknown) =>
        error instanceof
          AuthorizationError &&
        /missing permission/i.test(
          error.message,
        ),
    );
  },
);

test(
  'authorize rejects missing tenant context',
  () => {
    assert.throws(
      () =>
        authorize(
          undefined,
          'workflow:read',
        ),
      AuthorizationError,
    );
  },
);

test(
  'agent-like context cannot decide human approval without approval permission',
  () => {
    const agentContext =
      context({
        roles: [],
        permissions: [
          'workflow:execute',
          'artifact:read',
          'artifact:write',
        ],
      });

    assert.throws(
      () =>
        authorize(
          agentContext,
          'approval:decide',
        ),
      (error: unknown) =>
        error instanceof
          AuthorizationError &&
        /missing permission/i.test(
          error.message,
        ),
    );
  },
);

test(
  'human approver context can decide approval when explicitly granted',
  () => {
    const humanContext =
      context({
        roles: [
          'reviewer',
        ],

        permissions: [
          'workflow:read',
          'approval:decide',
        ],
      });

    const result =
      authorize(
        humanContext,
        'approval:decide',
      );

    assert.deepEqual(
      result,
      humanContext,
    );
  },
);

test(
  'cross-tenant identity remains bound to the authenticated tenant',
  async () => {
    const provider =
      new StaticAuthProvider(
        context({
          tenantId:
            'tenant-b',
          userId:
            'user-b',
        }),
      );

    const authenticated =
      await authenticate(
        provider,
        'Bearer valid-token',
      );

    assert.equal(
      authenticated.tenantId,
      'tenant-b',
    );

    assert.equal(
      authenticated.userId,
      'user-b',
    );
  },
);