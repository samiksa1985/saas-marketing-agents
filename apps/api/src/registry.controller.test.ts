import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Module,
} from '@nestjs/common';

import {
  NestFactory,
} from '@nestjs/core';

import type {
  TenantContext,
} from '@platform/contracts';

import type {
  AuthProvider,
} from '@platform/auth';

import {
  AuthenticationError,
} from '@platform/auth';

import {
  AUTH_PROVIDER,
  ApiAuthGuard,
} from './auth.guard.js';

import {
  REGISTRY_SERVICE,
  RegistryController,
  RegistryService,
} from './registry.controller.js';

const tenantARead: TenantContext = {
  tenantId:
    'tenant-a',

  userId:
    'user-a',

  roles: [
    'reviewer',
  ],

  permissions: [
    'workflow:read',
  ],

  locale:
    'en',
};

const tenantANoRead: TenantContext = {
  tenantId:
    'tenant-a',

  userId:
    'user-a',

  roles: [],

  permissions: [],

  locale:
    'en',
};

const tenantBRead: TenantContext = {
  tenantId:
    'tenant-b',

  userId:
    'user-b',

  roles: [
    'reviewer',
  ],

  permissions: [
    'workflow:read',
  ],

  locale:
    'en',
};

const authProvider: AuthProvider = {
  async verifyAccessToken(
    token: string,
  ): Promise<TenantContext> {
    switch (
      token
    ) {
      case 'tenant-a-read':
        return tenantARead;

      case 'tenant-a-no-read':
        return tenantANoRead;

      case 'tenant-b-read':
        return tenantBRead;

      case 'invalid':
        throw new AuthenticationError(
          'Invalid token',
        );

      default:
        throw new AuthenticationError(
          'Unknown token',
        );
    }
  },
};

const registryServiceStub = {
  async agents() {
    return [
      {
        id:
          'agent-1',

        name:
          'Test Agent',
      },
    ];
  },

  async agent(
    agentId: string,
  ) {
    return {
      id:
        agentId,
    };
  },

  async workstreams() {
    return [
      {
        id:
          'workstream-1',
      },
    ];
  },

  async workstream(
    workstreamId: string,
  ) {
    return {
      id:
        workstreamId,
    };
  },

  async graph(
    version: string,
  ) {
    return {
      version,

      nodes: [],

      edges: [],
    };
  },

  async graphReadiness(
    version: string,
    tenantContext: TenantContext,
  ) {
    return {
      graph: {
        version,

        nodes: [],

        edges: [],
      },

      readiness: {
        tenantId:
          tenantContext.tenantId,

        userId:
          tenantContext.userId,

        ready:
          true,
      },
    };
  },
};

@Module({
  controllers: [
    RegistryController,
  ],

  providers: [
    {
      provide:
        REGISTRY_SERVICE,

      useValue:
        registryServiceStub,
    },

    {
      provide:
        AUTH_PROVIDER,

      useValue:
        authProvider,
    },

    {
      provide:
        ApiAuthGuard,

      useFactory(
        provider:
          AuthProvider,
      ) {
        return new ApiAuthGuard(
          provider,
        );
      },

      inject: [
        AUTH_PROVIDER,
      ],
    },
  ],
})
class RegistryTestModule {}

async function createTestApp() {
  const app =
    await NestFactory.create(
      RegistryTestModule,
      {
        logger: [
          'error',
          'warn',
        ],
      },
    );

  await app.listen(
    0,
    '127.0.0.1',
  );

  return app;
}

async function assertResponse(
  response: Response,
  expectedStatus: number,
) {
  const body =
    await response.text();

  if (
    response.status !==
    expectedStatus
  ) {
    throw new Error(
      [
        `Expected HTTP ${expectedStatus} but received ${response.status}.`,
        `Response body: ${body}`,
      ].join(
        '\n',
      ),
    );
  }

  return body;
}

test(
  'registry API rejects requests without authentication',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/agents`,
        );

      await assertResponse(
        response,
        401,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'registry API rejects invalid bearer tokens',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/agents`,
          {
            headers: {
              authorization:
                'Bearer invalid',
            },
          },
        );

      await assertResponse(
        response,
        401,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'registry API rejects authenticated users without workflow:read',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/agents`,
          {
            headers: {
              authorization:
                'Bearer tenant-a-no-read',
            },
          },
        );

      await assertResponse(
        response,
        403,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'registry API allows authenticated users with workflow:read',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/agents`,
          {
            headers: {
              authorization:
                'Bearer tenant-a-read',
            },
          },
        );

      const body =
        await assertResponse(
          response,
          200,
        );

      assert.deepEqual(
        JSON.parse(body),
        [
          {
            id:
              'agent-1',

            name:
              'Test Agent',
          },
        ],
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'registry readiness uses authenticated tenant instead of x-tenant-id',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/graphs/v1/readiness`,
          {
            headers: {
              authorization:
                'Bearer tenant-b-read',

              'x-tenant-id':
                'tenant-a',
            },
          },
        );

      const body =
        await assertResponse(
          response,
          200,
        );

      const parsed =
        JSON.parse(body);

      assert.equal(
        parsed.readiness.tenantId,
        'tenant-b',
      );

      assert.equal(
        parsed.readiness.userId,
        'user-b',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'registry agent lookup preserves authenticated access control',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/agents/agent-42`,
          {
            headers: {
              authorization:
                'Bearer tenant-a-read',
            },
          },
        );

      const body =
        await assertResponse(
          response,
          200,
        );

      assert.deepEqual(
        JSON.parse(body),
        {
          id:
            'agent-42',
        },
      );
    } finally {
      await app.close();
    }
  },
);