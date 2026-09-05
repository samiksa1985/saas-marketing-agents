import {
  test,
} from 'node:test';

import * as assert
  from 'node:assert/strict';

import {
  AutomationStore,
} from './automation.js';

test(
  'automation definition write rejects cross tenant before database access',
  async () => {
    let calls = 0;

    const store =
      new AutomationStore({
        async execute() {
          calls += 1;
          return [];
        },
      });

    await assert.rejects(
      store.saveDefinition(
        {
          id:
            '11111111-1111-1111-1111-111111111111',
          tenantId:
            'tenant-a',
          name:
            'Automation',
          enabled:
            true,
          trigger: {
            type:
              'MANUAL',
          },
          conditionMode:
            'ALL',
          conditions: [],
          workflowReference:
            'workflow',
          locale:
            'en',
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
