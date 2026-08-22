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

interface TaskResponse {
  id: string;
  workflowId: string;
  tenantId: string;
  workstreamId: string;
  status: string;
}

const tenantAExecute: TenantContext = {
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

const tenantAArtifactRead:
  TenantContext = {
  tenantId:
    'tenant-a',

  userId:
    'user-a',

  roles: [
    'reviewer',
  ],

  permissions: [
    'workflow:read',
    'artifact:read',
  ],

  locale:
    'en',
};

const tenantBExecute: TenantContext = {
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

const tenantNoPermissions:
  TenantContext = {
  tenantId:
    'tenant-a',

  userId:
    'user-a',

  roles: [],

  permissions: [],

  locale:
    'en',
};

const authProvider:
  AuthProvider = {
  async verifyAccessToken(
    token: string,
  ): Promise<TenantContext> {
    switch (
      token
    ) {
      case 'tenant-a-execute':
        return tenantAExecute;

      case 'tenant-a-read':
        return tenantARead;

      case 'tenant-a-artifact-read':
        return tenantAArtifactRead;

      case 'tenant-b-execute':
        return tenantBExecute;

      case 'tenant-no-permissions':
        return tenantNoPermissions;

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
class WorkflowSecurityModule {}

async function createTestApp() {
  const app =
    await NestFactory.create(
      WorkflowSecurityModule,
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
    unknown;

  try {
    body =
      JSON.parse(
        text,
      );
  } catch {
    body =
      text;
  }

  return {
    body,
    text,
  };
}

async function assertStatus<
  T = unknown,
>(
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

  assert.equal(
    response.status,
    expected,
    `Expected ${expected}, received ${response.status}. Body: ${text}`,
  );

  return body as T;
}

function workflowPayload(
  engagementId: string,
) {
  return {
    engagementId,

    locale:
      'en',

    selectedWorkstreamIds: [
      '01',
    ],

    idempotencyKey:
      `security-${engagementId}`,
  };
}

async function createWorkflow(
  app: Awaited<
    ReturnType<
      typeof createTestApp
    >
  >,

  token:
    string = 'tenant-a-execute',

  engagementId:
    string =
      'security-workflow',
): Promise<WorkflowResponse> {
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
            `Bearer ${token}`,
        },

        body:
          JSON.stringify(
            workflowPayload(
              engagementId,
            ),
          ),
      },
    );

  return assertStatus<
    WorkflowResponse
  >(
    response,
    201,
  );
}

async function getTasks(
  app: Awaited<
    ReturnType<
      typeof createTestApp
    >
  >,

  workflowId:
    string,

  token:
    string =
      'tenant-a-execute',
): Promise<TaskResponse[]> {
  const response =
    await fetch(
      `${await app.getUrl()}/workflows/${workflowId}/tasks`,
      {
        headers: {
          authorization:
            `Bearer ${token}`,
        },
      },
    );

  return assertStatus<
    TaskResponse[]
  >(
    response,
    200,
  );
}

test(
  'workflow object access is tenant isolated',
  async () => {
    const app =
      await createTestApp();

    try {
      const workflow =
        await createWorkflow(
          app,
          'tenant-a-execute',
          'security-object-isolation',
        );

      const response =
        await fetch(
          `${await app.getUrl()}/workflows/${workflow.id}`,
          {
            headers: {
              authorization:
                'Bearer tenant-b-execute',
            },
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
  'workflow read endpoints require workflow:read',
  async () => {
    const app =
      await createTestApp();

    try {
      const workflow =
        await createWorkflow(
          app,
          'tenant-a-execute',
          'security-read-permission',
        );

      const endpoints = [
        `/workflows/${workflow.id}`,
        `/workflows/${workflow.id}/tasks`,
        `/workflows/${workflow.id}/readiness`,
        `/workflows/${workflow.id}/handoffs`,
      ];

      for (
        const endpoint of endpoints
      ) {
        const response =
          await fetch(
            `${await app.getUrl()}${endpoint}`,
            {
              headers: {
                authorization:
                  'Bearer tenant-no-permissions',
              },
            },
          );

        assert.equal(
          response.status,
          403,
          `${endpoint} must reject missing workflow:read`,
        );
      }
    } finally {
      await app.close();
    }
  },
);

test(
  'artifact endpoint requires artifact:read',
  async () => {
    const app =
      await createTestApp();

    try {
      const workflow =
        await createWorkflow(
          app,
          'tenant-a-execute',
          'security-artifact-permission',
        );

      const response =
        await fetch(
          `${await app.getUrl()}/workflows/${workflow.id}/artifacts`,
          {
            headers: {
              authorization:
                'Bearer tenant-a-read',
            },
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
  'artifact endpoint allows artifact:read',
  async () => {
    const app =
      await createTestApp();

    try {
      const workflow =
        await createWorkflow(
          app,
          'tenant-a-execute',
          'security-artifact-allow',
        );

      const response =
        await fetch(
          `${await app.getUrl()}/workflows/${workflow.id}/artifacts`,
          {
            headers: {
              authorization:
                'Bearer tenant-a-artifact-read',
            },
          },
        );

      await assertStatus(
        response,
        200,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'workflow command endpoints require workflow:execute',
  async () => {
    const app =
      await createTestApp();

    try {
      const workflow =
        await createWorkflow(
          app,
          'tenant-a-execute',
          'security-command-permission',
        );

      const commands = [
        'pause',
        'resume',
        'cancel',
      ];

      for (
        const command of commands
      ) {
        const response =
          await fetch(
            `${await app.getUrl()}/workflows/${workflow.id}/${command}`,
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
                    'security matrix test',
                }),
            },
          );

        assert.equal(
          response.status,
          403,
          `${command} must reject missing workflow:execute`,
        );
      }
    } finally {
      await app.close();
    }
  },
);

test(
  'task claim requires workflow:execute',
  async () => {
    const app =
      await createTestApp();

    try {
      const workflow =
        await createWorkflow(
          app,
          'tenant-a-execute',
          'security-claim-permission',
        );

      const tasks =
        await getTasks(
          app,
          workflow.id,
          'tenant-a-execute',
        );

      assert.ok(
        tasks.length >
          0,
      );

      const claimResponse =
        await fetch(
          `${await app.getUrl()}/tasks/${tasks[0]!.id}/claim`,
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
                workerId:
                  'security-test-worker',
              }),
          },
        );

      await assertStatus(
        claimResponse,
        403,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'cross-tenant task claim is rejected',
  async () => {
    const app =
      await createTestApp();

    try {
      const workflow =
        await createWorkflow(
          app,
          'tenant-a-execute',
          'security-cross-tenant-task',
        );

      const tasks =
        await getTasks(
          app,
          workflow.id,
          'tenant-a-execute',
        );

      assert.ok(
        tasks.length >
          0,
      );

      const claimResponse =
        await fetch(
          `${await app.getUrl()}/tasks/${tasks[0]!.id}/claim`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-b-execute',
            },

            body:
              JSON.stringify({
                workerId:
                  'tenant-b-worker',
              }),
          },
        );

      await assertStatus(
        claimResponse,
        403,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'tenant spoofing headers cannot change authorization identity',
  async () => {
    const app =
      await createTestApp();

    try {
      const workflow =
        await createWorkflow(
          app,
          'tenant-a-execute',
          'security-header-spoof',
        );

      const response =
        await fetch(
          `${await app.getUrl()}/workflows/${workflow.id}`,
          {
            headers: {
              authorization:
                'Bearer tenant-b-execute',

              'x-tenant-id':
                'tenant-a',

              'x-user-id':
                'user-a',
            },
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
  'invalid workflow object IDs do not bypass authorization',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/workflows/not-a-real-workflow`,
          {
            headers: {
              authorization:
                'Bearer tenant-a-read',
            },
          },
        );

      assert.ok(
        response.status ===
          403 ||
        response.status ===
          404,
        `Unexpected status: ${response.status}`,
      );
    } finally {
      await app.close();
    }
  },
);
