import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  ArtifactReference,
  TenantContext,
} from '@platform/contracts';

import {
  HandoffService,
  HandoffServiceError,
} from './handoff-service.js';

function createTenantContext(
  overrides: Partial<TenantContext> = {},
): TenantContext {
  return {
    tenantId: 'tenant-001',
    userId: 'user-001',
    roles: [
      'reviewer',
    ],
    permissions: [
      'approval:decide',
      'artifact:read',
      'artifact:write',
    ],
    locale: 'en-US',
    ...overrides,
  };
}

function createApprovedArtifact(
  overrides: Partial<ArtifactReference> = {},
): ArtifactReference {
  return {
    artifactId: 'artifact-001',
    version: '1',
    tenantId: 'tenant-001',
    status: 'approved',
    accepted: true,
    ...overrides,
  };
}

function createBaseRequest(
  artifacts: ArtifactReference[],
) {
  return {
    tenantContext:
      createTenantContext(),

    workflowId:
      'workflow-001',

    fromWorkstreamId:
      '01',

    toWorkstreamId:
      '02',

    artifactIds:
      artifacts.map(
        (artifact) =>
          artifact.artifactId,
      ),

    artifacts,
  };
}

test(
  'create handoff from accepted artifact',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact();

    const handoff =
      service.create(
        createBaseRequest([
          artifact,
        ]),
      );

    assert.equal(
      handoff.status,
      'pending',
    );

    assert.equal(
      handoff.tenantId,
      'tenant-001',
    );

    assert.equal(
      handoff.workflowId,
      'workflow-001',
    );

    assert.deepEqual(
      handoff.artifactIds,
      ['artifact-001'],
    );
  },
);

test(
  'same handoff creation is deterministic and idempotent',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact();

    const request =
      createBaseRequest([
        artifact,
      ]);

    const first =
      service.create(request);

    const second =
      service.create(request);

    assert.equal(
      first.id,
      second.id,
    );
  },
);

test(
  'handoff rejects unaccepted artifacts',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact({
        status: 'draft',
        accepted: false,
      });

    assert.throws(
      () =>
        service.create(
          createBaseRequest([
            artifact,
          ]),
        ),
      (error) => {
        assert.ok(
          error instanceof
            HandoffServiceError,
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
  'handoff rejects cross-tenant artifacts',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact({
        tenantId:
          'tenant-999',
      });

    assert.throws(
      () =>
        service.create(
          createBaseRequest([
            artifact,
          ]),
        ),
      (error) => {
        assert.ok(
          error instanceof
            HandoffServiceError,
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
  'accepted handoff transitions to accepted',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact();

    const handoff =
      service.create(
        createBaseRequest([
          artifact,
        ]),
      );

    const accepted =
      service.accept({
        tenantContext:
          createTenantContext(),

        handoffId:
          handoff.id,

        actorId:
          'reviewer-001',
      });

    assert.equal(
      accepted.status,
      'accepted',
    );
  },
);

test(
  'rejected handoff transitions to rejected',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact();

    const handoff =
      service.create(
        createBaseRequest([
          artifact,
        ]),
      );

    const rejected =
      service.reject({
        tenantContext:
          createTenantContext(),

        handoffId:
          handoff.id,

        actorId:
          'reviewer-001',
      });

    assert.equal(
      rejected.status,
      'rejected',
    );
  },
);

test(
  'blocked handoff transitions to blocked',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact();

    const handoff =
      service.create(
        createBaseRequest([
          artifact,
        ]),
      );

    const blocked =
      service.block({
        tenantContext:
          createTenantContext(),

        handoffId:
          handoff.id,

        actorId:
          'system',
      });

    assert.equal(
      blocked.status,
      'blocked',
    );
  },
);

test(
  'terminal handoff cannot be changed again',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact();

    const handoff =
      service.create(
        createBaseRequest([
          artifact,
        ]),
      );

    service.accept({
      tenantContext:
        createTenantContext(),

      handoffId:
        handoff.id,

      actorId:
        'reviewer-001',
    });

    assert.throws(
      () =>
        service.reject({
          tenantContext:
            createTenantContext(),

          handoffId:
            handoff.id,

          actorId:
            'reviewer-001',
        }),
      (error) => {
        assert.ok(
          error instanceof
            HandoffServiceError,
        );

        assert.equal(
          error.code,
          'handoff_terminal',
        );

        return true;
      },
    );
  },
);

test(
  'cross-tenant handoff access is denied',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact();

    const handoff =
      service.create(
        createBaseRequest([
          artifact,
        ]),
      );

    assert.throws(
      () =>
        service.accept({
          tenantContext:
            createTenantContext({
              tenantId:
                'tenant-999',
            }),

          handoffId:
            handoff.id,

          actorId:
            'reviewer-999',
        }),
      (error) => {
        assert.ok(
          error instanceof
            HandoffServiceError,
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
  'handoff rejects an empty artifact list',
  () => {
    const service =
      new HandoffService();

    assert.throws(
      () =>
        service.create(
          createBaseRequest([]),
        ),
      (error) => {
        assert.ok(
          error instanceof
            HandoffServiceError,
        );

        assert.equal(
          error.code,
          'invalid_handoff',
        );

        return true;
      },
    );
  },
);

test(
  'handoff rejects same source and target workstream',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact();

    assert.throws(
      () =>
        service.create({
          ...createBaseRequest([
            artifact,
          ]),
          toWorkstreamId:
            '01',
        }),
      (error) => {
        assert.ok(
          error instanceof
            HandoffServiceError,
        );

        assert.equal(
          error.code,
          'same_workstream',
        );

        return true;
      },
    );
  },
);

test(
  'handoff get enforces tenant isolation',
  () => {
    const service =
      new HandoffService();

    const artifact =
      createApprovedArtifact();

    const handoff =
      service.create(
        createBaseRequest([
          artifact,
        ]),
      );

    assert.equal(
      service.get(
        handoff.id,
        createTenantContext(),
      ).id,
      handoff.id,
    );

    assert.throws(
      () =>
        service.get(
          handoff.id,
          createTenantContext({
            tenantId:
              'tenant-999',
          }),
        ),
      (error) => {
        assert.ok(
          error instanceof
            HandoffServiceError,
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
  'handoff cannot accept an unknown handoff',
  () => {
    const service =
      new HandoffService();

    assert.throws(
      () =>
        service.accept({
          tenantContext:
            createTenantContext(),

          handoffId:
            'handoff-does-not-exist',

          actorId:
            'reviewer-001',
        }),
      (error) => {
        assert.ok(
          error instanceof
            HandoffServiceError,
        );

        assert.equal(
          error.code,
          'handoff_not_found',
        );

        return true;
      },
    );
  },
);