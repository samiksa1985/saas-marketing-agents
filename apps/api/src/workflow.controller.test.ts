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
  WorkflowApiService,
  WorkflowController,
} from './workflow.controller.js';

interface WorkflowResponse {
  id: string;
  tenantId: string;
  engagementId: string;
  selectedWorkstreamIds: string[];
  locale: string;
  status?: string;
}

interface ReadinessResponse {
  taskId: string;
  workstreamId: string;
  readiness: boolean;
}

const tenantAExecuteRead: TenantContext = {
  tenantId:
    'tenant-a',

  userId:
    'user-a',

  roles: [
    'tenant_admin',
  ],

  permissions: [
    'workflow:read',
    'workflow:execute',
    'artifact:read',
    'artifact:write',
  ],

  locale:
    'en',
};

const tenantAReadOnly: TenantContext = {
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

const tenantBExecuteRead: TenantContext = {
  tenantId:
    'tenant-b',

  userId:
    'user-b',

  roles: [
    'tenant_admin',
  ],

  permissions: [
    'workflow:read',
    'workflow:execute',
    'artifact:read',
    'artifact:write',
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
      case 'tenant-a-execute':
        return tenantAExecuteRead;

      case 'tenant-a-read':
        return tenantAReadOnly;

      case 'tenant-b-execute':
        return tenantBExecuteRead;

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

@Module({
  controllers: [
    WorkflowController,
  ],

  providers: [
    WorkflowApiService,

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
class WorkflowTestModule {}

async function createTestApp() {
  const app =
    await NestFactory.create(
      WorkflowTestModule,
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

async function responseBody(
  response: Response,
): Promise<{
  body: unknown;
  text: string;
}> {
  const text =
    await response.text();

  let body:
    | unknown;

  try {
    body =
      JSON.parse(text);
  } catch {
    body =
      text;
  }

  return {
    body,
    text,
  };
}

async function assertStatus<T>(
  response: Response,
  expected: number,
): Promise<T> {
  const {
    body,
    text,
  } =
    await responseBody(
      response,
    );

  if (
    response.status !==
    expected
  ) {
    throw new Error(
      [
        `Expected HTTP ${expected} but received ${response.status}.`,
        `Response body: ${text}`,
      ].join(
        '\n',
      ),
    );
  }

  return body as T;
}

function workflowBody(
  engagementId =
    'engagement-api-test',
) {
  return {
    engagementId,

    locale:
      'en',

    selectedWorkstreamIds: [
      '01',
    ],

    idempotencyKey:
      `api-${engagementId}`,
  };
}

test(
  'workflow API rejects requests without authentication',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/workflows`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',
            },

            body:
              JSON.stringify(
                workflowBody(),
              ),
          },
        );

      await assertStatus(
        response,
        401,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'workflow API rejects authenticated users without workflow:execute',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/workflows`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-read',
            },

            body:
              JSON.stringify(
                workflowBody(
                  'engagement-read-only',
                ),
              ),
          },
        );

      await assertStatus(
        response,
        403,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'workflow API creates a workflow from the authenticated tenant context',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/workflows`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',
            },

            body:
              JSON.stringify(
                workflowBody(
                  'engagement-create-a',
                ),
              ),
          },
        );

      const body =
        await assertStatus<WorkflowResponse>(
          response,
          201,
        );

      assert.equal(
        body.tenantId,
        'tenant-a',
      );

      assert.equal(
        body.engagementId,
        'engagement-create-a',
      );

      assert.deepEqual(
        body.selectedWorkstreamIds,
        ['01'],
      );

      assert.equal(
        body.locale,
        'en',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'workflow API does not trust x-tenant-id over authenticated identity',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/workflows`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-b-execute',

              'x-tenant-id':
                'tenant-a',
            },

            body:
              JSON.stringify(
                workflowBody(
                  'engagement-tenant-b',
                ),
              ),
          },
        );

      const body =
        await assertStatus<WorkflowResponse>(
          response,
          201,
        );

      assert.equal(
        body.tenantId,
        'tenant-b',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'workflow API allows the authenticated tenant to read its workflow',
  async () => {
    const app =
      await createTestApp();

    try {
      const createResponse =
        await fetch(
          `${await app.getUrl()}/workflows`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',
            },

            body:
              JSON.stringify(
                workflowBody(
                  'engagement-read-a',
                ),
              ),
          },
        );

      const created =
        await assertStatus<WorkflowResponse>(
          createResponse,
          201,
        );

      const readResponse =
        await fetch(
          `${await app.getUrl()}/workflows/${created.id}`,
          {
            headers: {
              authorization:
                'Bearer tenant-a-execute',
            },
          },
        );

      const workflow =
        await assertStatus<WorkflowResponse>(
          readResponse,
          200,
        );

      assert.equal(
        workflow.id,
        created.id,
      );

      assert.equal(
        workflow.tenantId,
        'tenant-a',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'workflow API denies cross-tenant workflow access',
  async () => {
    const app =
      await createTestApp();

    try {
      const createResponse =
        await fetch(
          `${await app.getUrl()}/workflows`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',
            },

            body:
              JSON.stringify(
                workflowBody(
                  'engagement-cross-tenant',
                ),
              ),
          },
        );

      const created =
        await assertStatus<WorkflowResponse>(
          createResponse,
          201,
        );

      const crossTenantResponse =
        await fetch(
          `${await app.getUrl()}/workflows/${created.id}`,
          {
            headers: {
              authorization:
                'Bearer tenant-b-execute',
            },
          },
        );

      assert.equal(
        crossTenantResponse.status,
        403,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'workflow API start requires workflow:execute',
  async () => {
    const app =
      await createTestApp();

    try {
      const createResponse =
        await fetch(
          `${await app.getUrl()}/workflows`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',
            },

            body:
              JSON.stringify(
                workflowBody(
                  'engagement-start-permission',
                ),
              ),
          },
        );

      const created =
        await assertStatus<WorkflowResponse>(
          createResponse,
          201,
        );

      const startResponse =
        await fetch(
          `${await app.getUrl()}/workflows/${created.id}/start`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-read',
            },

            body:
              JSON.stringify({
                reason:
                  'unauthorized start attempt',
              }),
          },
        );

      await assertStatus(
        startResponse,
        403,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'workflow API can start a workflow with workflow:execute',
  async () => {
    const app =
      await createTestApp();

    try {
      const createResponse =
        await fetch(
          `${await app.getUrl()}/workflows`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',
            },

            body:
              JSON.stringify(
                workflowBody(
                  'engagement-start',
                ),
              ),
          },
        );

      const created =
        await assertStatus<WorkflowResponse>(
          createResponse,
          201,
        );

      const startResponse =
        await fetch(
          `${await app.getUrl()}/workflows/${created.id}/start`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',
            },

            body:
              JSON.stringify({
                reason:
                  'API integration test start',

                idempotencyKey:
                  `start-${created.id}`,
              }),
          },
        );

      const started = await assertStatus<WorkflowResponse>(
        startResponse,
        201,
      );

      assert.equal(
        started.id,
        created.id,
      );

      assert.equal(
        started.status,
        'running',
      );
    } finally {
      await app.close();
    }
  },
);
