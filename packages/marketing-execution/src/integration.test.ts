import {
  test,
} from 'node:test';

import * as assert
  from 'node:assert/strict';

import type {
  MarketingExecutionArtifact,
} from '@platform/contracts';

import {
  bindMarketingApproval,
  bindMarketingExecutionArtifact,
  bindMarketingWorkflowHandoff,
  evaluatePublishReadiness,
  toCanonicalAgentArtifactPayload,
} from './integration.js';


function artifact():
  MarketingExecutionArtifact {
  return {
    id:
      '11111111-1111-1111-1111-111111111111',

    tenantId:
      'tenant-a',

    domain:
      'CONTENT',

    capabilityId:
      'CAP-CONTENT-PRODUCTION',

    workflowId:
      'workflow-1',

    taskId:
      'task-1',

    workstreamId:
      'content',

    status:
      'DRAFT',

    version:
      1,

    output: {
      tenantId:
        'tenant-a',

      locale:
        'en',

      domain:
        'CONTENT',

      status:
        'READY_FOR_REVIEW',

      confidence:
        0.9,

      evidence: [
        {
          id:
            'evidence-1',

          sourceType:
            'STRATEGY',
        },
      ],

      assumptions: [],

      qaFlags: [],

      requiresApproval:
        true,

      concepts: [
        'Concept',
      ],

      hooks: [
        'Hook',
      ],

      drafts: [],

      sources: [
        {
          id:
            'evidence-1',

          sourceType:
            'STRATEGY',
        },
      ],
    },

    evidenceIds: [],

    createdAt:
      '2026-09-03T00:00:00.000Z',

    updatedAt:
      '2026-09-03T00:00:00.000Z',
  };
}


test(
  'marketing artifact binds canonical evidence ids',
  () => {
    const bound =
      bindMarketingExecutionArtifact(
        artifact(),
        'tenant-a',
      );

    assert.deepEqual(
      bound.evidenceIds,
      [
        'evidence-1',
      ],
    );
  },
);


test(
  'cross tenant artifact binding is denied',
  () => {
    assert.throws(
      () =>
        bindMarketingExecutionArtifact(
          artifact(),
          'tenant-b',
        ),
      /Cross-tenant/,
    );
  },
);


test(
  'approved artifact becomes publish ready',
  () => {
    const approved =
      bindMarketingApproval(
        artifact(),
        {
          tenantId:
            'tenant-a',

          artifactId:
            '11111111-1111-1111-1111-111111111111',

          approvalId:
            'approval-1',

          status:
            'APPROVED',
        },
      );

    const readiness =
      evaluatePublishReadiness(
        approved,
        'tenant-a',
      );

    assert.equal(
      readiness.ready,
      true,
    );
  },
);


test(
  'unapproved artifact cannot be publish ready',
  () => {
    const readiness =
      evaluatePublishReadiness(
        artifact(),
        'tenant-a',
      );

    assert.equal(
      readiness.ready,
      false,
    );

    assert.ok(
      readiness.reasons.length >
        0,
    );
  },
);


test(
  'workflow handoff binds artifact to destination domain',
  () => {
    const binding =
      bindMarketingWorkflowHandoff(
        artifact(),
        {
          tenantId:
            'tenant-a',

          fromDomain:
            'CONTENT',

          toDomain:
            'CREATIVE',

          reason:
            'Creative development required',

          artifactIds: [
            '11111111-1111-1111-1111-111111111111',
          ],

          requiredInputs: [
            'content',
          ],
        },
        'tenant-a',
      );

    assert.equal(
      binding.toDomain,
      'CREATIVE',
    );
  },
);


test(
  'canonical agent payload is always draft and never auto approved',
  () => {
    const payload =
      toCanonicalAgentArtifactPayload(
        artifact(),
        'tenant-a',
      );

    assert.equal(
      payload.status,
      'draft',
    );

    assert.equal(
      payload.autoApproved,
      false,
    );

    assert.equal(
      payload.payload.kind,
      'marketing-execution',
    );
  },
);
