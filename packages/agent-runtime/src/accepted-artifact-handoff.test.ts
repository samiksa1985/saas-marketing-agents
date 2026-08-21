import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import type {
  TransitionMetadata,
} from '@platform/workflow-runtime';

import {
  InMemoryWorkflowRuntime,
} from '@platform/workflow-runtime';

import {
  HandoffRuntimeIntegration,
} from './handoff-runtime-integration.js';

import type {
  ApprovableAgentArtifact,
} from './human-approval.js';

import {
  AcceptedArtifactHandoffError,
  AcceptedArtifactHandoffService,
} from './accepted-artifact-handoff.js';

function context(
  tenantId = 'tenant-a',
): TenantContext {
  return {
    tenantId,

    roles: [
      'tenant_admin',
      'reviewer',
    ],

    permissions: [
      'workflow:execute',
      'workflow:read',
      'artifact:read',
      'artifact:write',
      'approval:decide',
    ],

    locale:
      'en',
  };
}

function metadata(
  key: string,
): TransitionMetadata {
  return {
    actor:
      'reviewer-001',

    reason:
      key,

    timestamp:
      '2026-01-01T00:00:00.000Z',

    idempotencyKey:
      key,
  };
}

function approvedArtifact(
  overrides:
    Partial<ApprovableAgentArtifact> =
    {},
): ApprovableAgentArtifact {
  return {
    artifactId:
      'artifact-001',

    version:
      '1',

    tenantId:
      'tenant-a',

    status:
      'approved',

    accepted:
      true,

    workflowId:
      'workflow-placeholder',

    taskId:
      'task-placeholder',

    workstreamId:
      '01',

    payload: {
      kind:
        'agent-proposal',

      content:
        {
          recommendation:
            'Approved recommendation',
        },

      locale:
        'en',
    },

    autoApproved:
      false,

    ...overrides,
  };
}

async function createScenario() {
  const runtime =
    new InMemoryWorkflowRuntime();

  const workflow =
    await runtime.createWorkflow({
      tenantId:
        'tenant-a',

      engagementId:
        'engagement-a',

      locale:
        'en',

      selectedWorkstreamIds: [
        '01',
        '02',
      ],

      idempotencyKey:
        'accepted-artifact-handoff-workflow',
    });

  const tasks =
    runtime.getTasks(
      workflow.id,
      context(),
    );

  const upstreamTask =
    tasks.find(
      (task) =>
        task.workstreamId ===
        '01',
    );

  const downstreamTask =
    tasks.find(
      (task) =>
        task.workstreamId ===
        '02',
    );

  assert.ok(
    upstreamTask,
    'Expected workstream 01 task.',
  );

  assert.ok(
    downstreamTask,
    'Expected workstream 02 task.',
  );

  upstreamTask!.unresolvedInputs =
    [];

  downstreamTask!.unresolvedInputs =
    [];

  for (
    const dependency of
      downstreamTask!.dependencyReferences
  ) {
    dependency.satisfied =
      true;
  }

  const blockingDependency =
    downstreamTask!.dependencyReferences.find(
      (dependency) =>
        dependency.kind ===
        'blocking',
    );

  assert.ok(
    blockingDependency,
    'Expected blocking dependency from 01 to 02.',
  );

  blockingDependency!.satisfied =
    false;

  const integration =
    new HandoffRuntimeIntegration(
      runtime,
    );

  const service =
    new AcceptedArtifactHandoffService(
      integration,
    );

  return {
    runtime,
    workflow,
    upstreamTask:
      upstreamTask!,
    downstreamTask:
      downstreamTask!,
    service,
  };
}

test(
  'accepted artifact creates a pending runtime handoff',
  async () => {
    const {
      workflow,
      upstreamTask,
      downstreamTask,
      service,
    } =
      await createScenario();

    const result =
      service.create({
        tenantContext:
          context(),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          '01',

        toWorkstreamId:
          '02',

        artifact:
          approvedArtifact({
            workflowId:
              workflow.id,

            taskId:
              upstreamTask.id,

            workstreamId:
              upstreamTask.workstreamId,
          }),
      });

    assert.equal(
      result.status,
      'pending',
    );

    assert.equal(
      result.downstreamTaskId,
      downstreamTask.id,
    );

    assert.equal(
      result.downstreamReadiness.ready,
      false,
    );

    assert.ok(
      result.handoffId,
    );

    assert.ok(
      result.runtimeHandoffId,
    );
  },
);

test(
  'accepted handoff makes downstream task ready',
  async () => {
    const {
      workflow,
      upstreamTask,
      downstreamTask,
      service,
    } =
      await createScenario();

    const created =
      service.create({
        tenantContext:
          context(),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          '01',

        toWorkstreamId:
          '02',

        artifact:
          approvedArtifact({
            workflowId:
              workflow.id,

            taskId:
              upstreamTask.id,

            workstreamId:
              upstreamTask.workstreamId,
          }),
      });

    assert.equal(
      created.downstreamReadiness.ready,
      false,
    );

    const accepted =
      service.accept({
        tenantContext:
          context(),

        handoffId:
          created.handoffId,

        actorId:
          'reviewer-001',

        metadata:
          metadata(
            'accept-accepted-artifact-handoff',
          ),
      });

    assert.equal(
      accepted.status,
      'accepted',
    );

    assert.equal(
      accepted.downstreamTaskId,
      downstreamTask.id,
    );

    assert.equal(
      accepted.downstreamReadiness.ready,
      true,
    );
  },
);

test(
  'draft artifact cannot create a handoff',
  async () => {
    const {
      workflow,
      upstreamTask,
      service,
    } =
      await createScenario();

    assert.throws(
      () =>
        service.create({
          tenantContext:
            context(),

          workflowId:
            workflow.id,

          fromWorkstreamId:
            '01',

          toWorkstreamId:
            '02',

          artifact:
            approvedArtifact({
              workflowId:
                workflow.id,

              taskId:
                upstreamTask.id,

              workstreamId:
                upstreamTask.workstreamId,

              status:
                'draft',

              accepted:
                false,
            }),
        }),
      (error) => {
        assert.ok(
          error instanceof
            AcceptedArtifactHandoffError,
        );

        assert.equal(
          error.code,
          'artifact_not_accepted',
        );

        return true;
      },
    );
  },
);

test(
  'cross-tenant artifact cannot create a handoff',
  async () => {
    const {
      workflow,
      upstreamTask,
      service,
    } =
      await createScenario();

    assert.throws(
      () =>
        service.create({
          tenantContext:
            context(),

          workflowId:
            workflow.id,

          fromWorkstreamId:
            '01',

          toWorkstreamId:
            '02',

          artifact:
            approvedArtifact({
              tenantId:
                'tenant-b',

              workflowId:
                workflow.id,

              taskId:
                upstreamTask.id,

              workstreamId:
                upstreamTask.workstreamId,
            }),
        }),
      (error) => {
        assert.ok(
          error instanceof
            AcceptedArtifactHandoffError,
        );

        assert.equal(
          error.code,
          'tenant_mismatch',
        );

        return true;
      },
    );
  },
);

test(
  'handoff creation is deterministic for the same accepted artifact',
  async () => {
    const {
      workflow,
      upstreamTask,
      service,
    } =
      await createScenario();

    const request = {
      tenantContext:
        context(),

      workflowId:
        workflow.id,

      fromWorkstreamId:
        '01',

      toWorkstreamId:
        '02',

      artifact:
        approvedArtifact({
          workflowId:
            workflow.id,

          taskId:
            upstreamTask.id,

          workstreamId:
            upstreamTask.workstreamId,
        }),
    };

    const first =
      service.create(
        request,
      );

    const second =
      service.create(
        request,
      );

    assert.equal(
      first.handoffId,
      second.handoffId,
    );

    assert.equal(
      first.runtimeHandoffId,
      second.runtimeHandoffId,
    );
  },
);

test(
  'rejected handoff keeps downstream task blocked',
  async () => {
    const {
      workflow,
      upstreamTask,
      downstreamTask,
      service,
    } =
      await createScenario();

    const created =
      service.create({
        tenantContext:
          context(),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          '01',

        toWorkstreamId:
          '02',

        artifact:
          approvedArtifact({
            workflowId:
              workflow.id,

            taskId:
              upstreamTask.id,

            workstreamId:
              upstreamTask.workstreamId,
          }),
      });

    const rejected =
      service.reject({
        tenantContext:
          context(),

        handoffId:
          created.handoffId,

        actorId:
          'reviewer-001',

        metadata:
          metadata(
            'reject-accepted-artifact-handoff',
          ),
      });

    assert.equal(
      rejected.status,
      'rejected',
    );

    assert.equal(
      rejected.downstreamTaskId,
      downstreamTask.id,
    );

    assert.equal(
      rejected.downstreamReadiness.ready,
      false,
    );
  },
);

test(
  'accepted handoff is tenant isolated',
  async () => {
    const {
      workflow,
      upstreamTask,
      service,
    } =
      await createScenario();

    const created =
      service.create({
        tenantContext:
          context(),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          '01',

        toWorkstreamId:
          '02',

        artifact:
          approvedArtifact({
            workflowId:
              workflow.id,

            taskId:
              upstreamTask.id,

            workstreamId:
              upstreamTask.workstreamId,
          }),
      });

    assert.throws(
      () =>
        service.accept({
          tenantContext:
            context(
              'tenant-b',
            ),

          handoffId:
            created.handoffId,

          actorId:
            'reviewer-b',

          metadata:
            metadata(
              'cross-tenant-handoff-accept',
            ),
        }),
      /Cross-tenant handoff access is denied/i,
    );
  },
);