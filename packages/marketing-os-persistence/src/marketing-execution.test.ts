import {
  test,
} from 'node:test';

import * as assert
  from 'node:assert/strict';

import {
  MarketingExecutionStore,
} from './marketing-execution.js';


test(
  'marketing execution persistence rejects cross tenant before database access',
  async () => {
    let calls = 0;

    const store =
      new MarketingExecutionStore({
        async execute() {
          calls += 1;
          return [];
        },
      });

    await assert.rejects(
      store.saveArtifact(
        {
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

            evidence: [],

            assumptions: [],

            qaFlags: [],

            requiresApproval:
              true,

            concepts: [],

            hooks: [],

            drafts: [],

            sources: [],
          },

          evidenceIds: [],

          createdAt:
            '2026-09-03T00:00:00.000Z',

          updatedAt:
            '2026-09-03T00:00:00.000Z',
        },
        'tenant-b',
      ),
      /Cross-tenant/,
    );

    assert.equal(
      calls,
      0,
    );
  },
);
