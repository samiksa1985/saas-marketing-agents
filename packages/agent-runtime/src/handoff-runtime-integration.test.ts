import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  ArtifactReference,
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

function context(
  tenantId = 'tenant-a',
): TenantContext {
  return {
    tenantId,
    roles: [
      'tenant_admin',
    ],
    permissions: [
      'workflow:execute',
      'workflow:read',
      'artifact:read',
      'artifact:write',
      'approval:decide',
    ],
    locale: 'en',
  };
}

function metadata(
  key: string,
): TransitionMetadata {
  return {
    actor: 'test-user',
    reason: key,
    timestamp:
      '2026-01-01T00:00:00.000Z',
    idempotencyKey: key,
  };
}

function approvedArtifact(
  id = 'artifact-001',
): ArtifactReference {
  return {
    artifactId: id,
    version: '1',
    tenantId: 'tenant-a',
    status: 'approved',
    accepted: true,
  };
}

async function createScenario() {
  const runtime =
    new InMemoryWorkflowRuntime();

  const workflow =
    await runtime.createWorkflow({
      tenantId: 'tenant-a',
      engagementId:
        'engagement-a',
      locale: 'en',
      selectedWorkstreamIds: [
        '01',
        '02',
      ],
      idempotencyKey:
        'handoff-integration-workflow',
    });

  const tasks =
    runtime.getTasks(
      workflow.id,
      context('tenant-a'),
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
    'Expected workstream 01 task',
  );

  assert.ok(
    downstreamTask,
    'Expected workstream 02 task',
  );

  upstreamTask.unresolvedInputs =
    [];

  downstreamTask.unresolvedInputs =
    [];

  for (
    const dependency of
      downstreamTask.dependencyReferences
  ) {
    dependency.satisfied =
      true;
  }

  const blockingDependency =
    downstreamTask.dependencyReferences.find(
      (dependency) =>
        dependency.kind ===
        'blocking',
    );

  assert.ok(
    blockingDependency,
    'Expected a blocking dependency from workstream 01 to 02',
  );

  blockingDependency.satisfied =
    false;

  const integration =
    new HandoffRuntimeIntegration(
      runtime,
    );

  return {
    runtime,
    integration,
    workflow,
    upstreamTask,
    downstreamTask,
  };
}

test(
  'pending handoff keeps downstream task blocked',
  async () => {
    const {
      integration,
      workflow,
      downstreamTask,
    } =
      await createScenario();

    const result =
      integration.create({
        tenantContext:
          context('tenant-a'),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          '01',

        toWorkstreamId:
          '02',

        artifactIds: [
          'artifact-001',
        ],

        artifacts: [
          approvedArtifact(),
        ],
      });

    assert.equal(
      result.handoff.status,
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
  },
);

test(
  'accepted handoff satisfies blocking dependency and makes downstream task ready',
  async () => {
    const {
      integration,
      workflow,
      downstreamTask,
    } =
      await createScenario();

    const created =
      integration.create({
        tenantContext:
          context('tenant-a'),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          '01',

        toWorkstreamId:
          '02',

        artifactIds: [
          'artifact-001',
        ],

        artifacts: [
          approvedArtifact(),
        ],
      });

    assert.equal(
      created.downstreamReadiness.ready,
      false,
    );

    const accepted =
      integration.accept({
        tenantContext:
          context('tenant-a'),

        handoffId:
          created.handoff.id,

        actorId:
          'reviewer-001',

        metadata:
          metadata('accept-handoff'),
      });

    assert.equal(
      accepted.handoff.status,
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
  'rejected handoff keeps downstream task blocked',
  async () => {
    const {
      integration,
      workflow,
    } =
      await createScenario();

    const created =
      integration.create({
        tenantContext:
          context('tenant-a'),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          '01',

        toWorkstreamId:
          '02',

        artifactIds: [
          'artifact-001',
        ],

        artifacts: [
          approvedArtifact(),
        ],
      });

    const rejected =
      integration.reject({
        tenantContext:
          context('tenant-a'),

        handoffId:
          created.handoff.id,

        actorId:
          'reviewer-001',

        metadata:
          metadata(
            'reject-handoff',
          ),
      });

    assert.equal(
      rejected.handoff.status,
      'rejected',
    );

    assert.equal(
      rejected.downstreamReadiness.ready,
      false,
    );
  },
);

test(
  'handoff creation is idempotent across the integration layer',
  async () => {
    const {
      integration,
      workflow,
    } =
      await createScenario();

    const request = {
      tenantContext:
        context('tenant-a'),

      workflowId:
        workflow.id,

      fromWorkstreamId:
        '01',

      toWorkstreamId:
        '02',

      artifactIds: [
        'artifact-001',
      ],

      artifacts: [
        approvedArtifact(),
      ],
    };

    const first =
      integration.create(
        request,
      );

    const second =
      integration.create(
        request,
      );

    assert.equal(
      first.handoff.id,
      second.handoff.id,
    );

    assert.equal(
      first.runtimeHandoffId,
      second.runtimeHandoffId,
    );
  },
);

test(
  'cross-tenant acceptance is denied',
  async () => {
    const {
      integration,
      workflow,
    } =
      await createScenario();

    const created =
      integration.create({
        tenantContext:
          context('tenant-a'),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          '01',

        toWorkstreamId:
          '02',

        artifactIds: [
          'artifact-001',
        ],

        artifacts: [
          approvedArtifact(),
        ],
      });

    assert.throws(
      () =>
        integration.accept({
          tenantContext:
            context('tenant-b'),

          handoffId:
            created.handoff.id,

          actorId:
            'reviewer-b',

          metadata:
            metadata(
              'cross-tenant-accept',
            ),
        }),
      /Cross-tenant handoff access is denied/i,
    );
  },
);

test(
  'runtime and service handoff states remain aligned after acceptance',
  async () => {
    const {
      runtime,
      integration,
      workflow,
    } =
      await createScenario();

    const created =
      integration.create({
        tenantContext:
          context('tenant-a'),

        workflowId:
          workflow.id,

        fromWorkstreamId:
          '01',

        toWorkstreamId:
          '02',

        artifactIds: [
          'artifact-001',
        ],

        artifacts: [
          approvedArtifact(),
        ],
      });

    integration.accept({
      tenantContext:
        context('tenant-a'),

      handoffId:
        created.handoff.id,

      actorId:
        'reviewer-001',

      metadata:
        metadata(
          'align-acceptance',
        ),
    });

    const runtimeHandoffs =
      runtime.getHandoffs(
        workflow.id,
        context('tenant-a'),
      );

    const runtimeHandoff =
      runtimeHandoffs.find(
        (handoff) =>
          handoff.id ===
          created.runtimeHandoffId,
      );

    assert.ok(
      runtimeHandoff,
      'Expected runtime handoff',
    );

    assert.equal(
      runtimeHandoff.status,
      'accepted',
    );
  },
);