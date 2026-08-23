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
  ApprovalApiService,
  ApprovalController,
} from './approval.controller.js';

const tenantAExecute:
  TenantContext = {
  tenantId:
    'tenant-a',

  userId:
    'user-a',

  roles: [
    'tenant_admin',
  ],

  permissions: [
    'workflow:execute',
    'artifact:read',
    'approval:decide',
  ],

  locale:
    'en',
};

const tenantARead:
  TenantContext = {
  tenantId:
    'tenant-a',

  userId:
    'user-a',

  roles: [
    'reviewer',
  ],

  permissions: [
    'artifact:read',
  ],

  locale:
    'en',
};

const tenantADecider:
  TenantContext = {
  tenantId:
    'tenant-a',

  userId:
    'approver-a',

  roles: [
    'reviewer',
  ],

  permissions: [
    'artifact:read',
    'approval:decide',
  ],

  locale:
    'en',
};

const tenantBDecider:
  TenantContext = {
  tenantId:
    'tenant-b',

  userId:
    'approver-b',

  roles: [
    'reviewer',
  ],

  permissions: [
    'artifact:read',
    'approval:decide',
  ],

  locale:
    'en',
};

const authProvider:
  AuthProvider = {
  async verifyAccessToken(
    token:
      string,
  ): Promise<TenantContext> {
    switch (
      token
    ) {
      case 'tenant-a-execute':
        return tenantAExecute;

      case 'tenant-a-read':
        return tenantARead;

      case 'tenant-a-decider':
        return tenantADecider;

      case 'tenant-b-decider':
        return tenantBDecider;

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
    ApprovalController,
  ],

  providers: [
    ApprovalApiService,

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
class ApprovalTestModule {}

async function createTestApp() {
  const app =
    await NestFactory.create(
      ApprovalTestModule,
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

async function readJson(
  response:
    Response,
) {
  const text =
    await response.text();

  return {
    text,

    body:
      JSON.parse(
        text,
      ),
  };
}

async function expectStatus(
  response:
    Response,

  expected:
    number,
) {
  const {
    text,
    body,
  } =
    await readJson(
      response,
    );

  assert.equal(
    response.status,
    expected,
    `Expected ${expected}, received ${response.status}: ${text}`,
  );

  return body;
}

test(
  'approval API rejects unauthenticated requests',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/approvals`,
        );

      await expectStatus(
        response,
        401,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'approval creation requires workflow:execute',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/approvals`,
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
                artifactId:
                  'artifact-1',
              }),
          },
        );

      await expectStatus(
        response,
        403,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'approval can be created by workflow executor',
  async () => {
    const app =
      await createTestApp();

    try {
      const response =
        await fetch(
          `${await app.getUrl()}/approvals`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',

              'idempotency-key':
                'approval-create-1',
            },

            body:
              JSON.stringify({
                artifactId:
                  'artifact-1',
              }),
          },
        );

      const approval =
        await expectStatus(
          response,
          201,
        );

      assert.equal(
        approval.tenantId,
        'tenant-a',
      );

      assert.equal(
        approval.artifactId,
        'artifact-1',
      );

      assert.equal(
        approval.decision,
        undefined,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'approval decision requires approval:decide',
  async () => {
    const app =
      await createTestApp();

    try {
      const createResponse =
        await fetch(
          `${await app.getUrl()}/approvals`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',

              'idempotency-key':
                'approval-permission-1',
            },

            body:
              JSON.stringify({
                artifactId:
                  'artifact-2',
              }),
          },
        );

      const approval =
        await expectStatus(
          createResponse,
          201,
        );

      const decideResponse =
        await fetch(
          `${await app.getUrl()}/approvals/${approval.id}/decision`,
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
                decision:
                  'approved',
              }),
          },
        );

      await expectStatus(
        decideResponse,
        403,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'approval can be approved by a decider',
  async () => {
    const app =
      await createTestApp();

    try {
      const createResponse =
        await fetch(
          `${await app.getUrl()}/approvals`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',

              'idempotency-key':
                'approval-approve-1',
            },

            body:
              JSON.stringify({
                artifactId:
                  'artifact-3',
              }),
          },
        );

      const approval =
        await expectStatus(
          createResponse,
          201,
        );

      const decideResponse =
        await fetch(
          `${await app.getUrl()}/approvals/${approval.id}/decision`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-decider',

              'idempotency-key':
                'decision-approve-1',
            },

            body:
              JSON.stringify({
                decision:
                  'approved',
              }),
          },
        );

      const decided =
        await expectStatus(
          decideResponse,
          201,
        );

      assert.equal(
        decided.decision,
        'approved',
      );

      assert.equal(
        decided.approverUserId,
        'approver-a',
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'approved_with_conditions requires conditions',
  async () => {
    const app =
      await createTestApp();

    try {
      const createResponse =
        await fetch(
          `${await app.getUrl()}/approvals`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',

              'idempotency-key':
                'approval-condition-1',
            },

            body:
              JSON.stringify({
                artifactId:
                  'artifact-4',
              }),
          },
        );

      const approval =
        await expectStatus(
          createResponse,
          201,
        );

      const decideResponse =
        await fetch(
          `${await app.getUrl()}/approvals/${approval.id}/decision`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-decider',
            },

            body:
              JSON.stringify({
                decision:
                  'approved_with_conditions',
              }),
          },
        );

      await expectStatus(
        decideResponse,
        400,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'approval is tenant isolated',
  async () => {
    const app =
      await createTestApp();

    try {
      const createResponse =
        await fetch(
          `${await app.getUrl()}/approvals`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',

              'idempotency-key':
                'approval-tenant-isolation',
            },

            body:
              JSON.stringify({
                artifactId:
                  'artifact-5',
              }),
          },
        );

      const approval =
        await expectStatus(
          createResponse,
          201,
        );

      const decideResponse =
        await fetch(
          `${await app.getUrl()}/approvals/${approval.id}/decision`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-b-decider',
            },

            body:
              JSON.stringify({
                decision:
                  'approved',
              }),
          },
        );

      await expectStatus(
        decideResponse,
        403,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'approval creation is idempotent',
  async () => {
    const app =
      await createTestApp();

    try {
      const request = async () =>
          fetch(
            `${await app.getUrl()}/approvals`,
            {
              method:
                'POST',

              headers: {
                'content-type':
                  'application/json',

                authorization:
                  'Bearer tenant-a-execute',

                'idempotency-key':
                  'approval-idempotent',
              },

              body:
                JSON.stringify({
                  artifactId:
                    'artifact-6',
                }),
            },
          );

      const first =
        await expectStatus(
          await request(),
          201,
        );

      const second =
        await expectStatus(
          await request(),
          201,
        );

      assert.equal(
        first.id,
        second.id,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'approval cannot be decided twice',
  async () => {
    const app =
      await createTestApp();

    try {
      const createResponse =
        await fetch(
          `${await app.getUrl()}/approvals`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',

              'idempotency-key':
                'approval-double-1',
            },

            body:
              JSON.stringify({
                artifactId:
                  'artifact-7',
              }),
          },
        );

      const approval =
        await expectStatus(
          createResponse,
          201,
        );

      await expectStatus(
        await fetch(
          `${await app.getUrl()}/approvals/${approval.id}/decision`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-decider',
            },

            body:
              JSON.stringify({
                decision:
                  'approved',
              }),
          },
        ),
        201,
      );

      const secondDecision =
        await fetch(
          `${await app.getUrl()}/approvals/${approval.id}/decision`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-decider',
            },

            body:
              JSON.stringify({
                decision:
                  'rejected',
              }),
          },
        );

      await expectStatus(
        secondDecision,
        409,
      );
    } finally {
      await app.close();
    }
  },
);

test(
  'approval list is tenant scoped',
  async () => {
    const app =
      await createTestApp();

    try {
      await expectStatus(
        await fetch(
          `${await app.getUrl()}/approvals`,
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/json',

              authorization:
                'Bearer tenant-a-execute',

              'idempotency-key':
                'approval-list-tenant-a',
            },

            body:
              JSON.stringify({
                artifactId:
                  'artifact-8',
              }),
          },
        ),
        201,
      );

      const listResponse =
        await fetch(
          `${await app.getUrl()}/approvals`,
          {
            headers: {
              authorization:
                'Bearer tenant-b-decider',
            },
          },
        );

      const approvals =
        await expectStatus(
          listResponse,
          200,
        );

      assert.equal(
        approvals.length,
        0,
      );
    } finally {
      await app.close();
    }
  },
);



