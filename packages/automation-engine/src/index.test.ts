import {
  test,
} from 'node:test';

import * as assert
  from 'node:assert/strict';

import type {
  TenantContext,
} from '@platform/contracts';

import {
  AutomationDispatcher,
  automationTriggerMatches,
  evaluateAutomationConditions,
  type AutomationDefinition,
  type AutomationSignal,
} from './index.js';

const context:
  TenantContext = {
    tenantId:
      'tenant-a',

    roles: [],

    permissions: [
      'workflow:execute',
    ],

    locale:
      'en',
  };

function definition():
  AutomationDefinition {
  return {
    id:
      'automation-1',

    tenantId:
      'tenant-a',

    name:
      'Hot Lead Automation',

    enabled:
      true,

    trigger: {
      type:
        'EVENT',

      eventType:
        'lead.scored',
    },

    conditionMode:
      'ALL',

    conditions: [
      {
        field:
          'lead.score',

        operator:
          'GTE',

        value:
          80,
      },

      {
        field:
          'lead.status',

        operator:
          'EQ',

        value:
          'qualified',
      },
    ],

    workflowReference:
      'lead-conversion-workflow',

    locale:
      'en',

    createdAt:
      '2026-09-03T00:00:00.000Z',

    updatedAt:
      '2026-09-03T00:00:00.000Z',
  };
}

function signal():
  AutomationSignal {
  return {
    tenantId:
      'tenant-a',

    triggerType:
      'EVENT',

    eventType:
      'lead.scored',

    idempotencyKey:
      'event-1',

    occurredAt:
      '2026-09-03T00:01:00.000Z',

    payload: {
      lead: {
        score:
          91,

        status:
          'qualified',
      },
    },
  };
}

test(
  'event trigger matches exact event type',
  () => {
    assert.equal(
      automationTriggerMatches(
        definition().trigger,
        signal(),
      ),
      true,
    );
  },
);

test(
  'all automation conditions must pass',
  () => {
    assert.equal(
      evaluateAutomationConditions(
        definition(),
        signal().payload,
      ),
      true,
    );

    const lowScore =
      signal();

    lowScore.payload = {
      lead: {
        score:
          20,

        status:
          'qualified',
      },
    };

    assert.equal(
      evaluateAutomationConditions(
        definition(),
        lowScore.payload,
      ),
      false,
    );
  },
);

test(
  'dispatcher starts canonical workflow once',
  async () => {
    let calls = 0;

    const dispatcher =
      new AutomationDispatcher({
        async start(
          request,
          tenant,
        ) {
          calls += 1;

          assert.equal(
            tenant.tenantId,
            'tenant-a',
          );

          assert.equal(
            request.workflowReference,
            'lead-conversion-workflow',
          );

          return {
            workflowId:
              'workflow-1',
          };
        },
      });

    const first =
      await dispatcher.dispatch(
        definition(),
        signal(),
        context,
      );

    assert.equal(
      first.status,
      'STARTED',
    );

    assert.equal(
      first.workflowId,
      'workflow-1',
    );

    const replay =
      await dispatcher.dispatch(
        definition(),
        signal(),
        context,
      );

    assert.equal(
      replay.status,
      'DUPLICATE',
    );

    assert.equal(
      calls,
      1,
    );
  },
);

test(
  'cross tenant automation is rejected before workflow start',
  async () => {
    let calls = 0;

    const dispatcher =
      new AutomationDispatcher({
        async start() {
          calls += 1;

          return {
            workflowId:
              'never',
          };
        },
      });

    await assert.rejects(
      dispatcher.dispatch(
        definition(),
        {
          ...signal(),
          tenantId:
            'tenant-b',
        },
        context,
      ),
      /Cross-tenant/,
    );

    assert.equal(
      calls,
      0,
    );
  },
);

test(
  'disabled automation does not start workflow',
  async () => {
    let calls = 0;

    const dispatcher =
      new AutomationDispatcher({
        async start() {
          calls += 1;

          return {
            workflowId:
              'never',
          };
        },
      });

    const disabled = {
      ...definition(),
      enabled:
        false,
    };

    const result =
      await dispatcher.dispatch(
        disabled,
        signal(),
        context,
      );

    assert.equal(
      result.status,
      'SKIPPED_DISABLED',
    );

    assert.equal(
      calls,
      0,
    );
  },
);

test(
  'failed workflow start can retry same idempotency key',
  async () => {
    let calls = 0;

    const dispatcher =
      new AutomationDispatcher({
        async start() {
          calls += 1;

          if (
            calls === 1
          ) {
            throw new Error(
              'workflow unavailable',
            );
          }

          return {
            workflowId:
              'workflow-retry',
          };
        },
      });

    await assert.rejects(
      dispatcher.dispatch(
        definition(),
        signal(),
        context,
      ),
      /workflow unavailable/,
    );

    const retry =
      await dispatcher.dispatch(
        definition(),
        signal(),
        context,
      );

    assert.equal(
      retry.status,
      'STARTED',
    );

    assert.equal(
      calls,
      2,
    );
  },
);

test(
  'schedule and webhook triggers require exact logical key',
  () => {
    assert.equal(
      automationTriggerMatches(
        {
          type:
            'SCHEDULE',

          scheduleExpression:
            '0 8 * * *',

          timezone:
            'Asia/Riyadh',
        },
        {
          tenantId:
            'tenant-a',

          triggerType:
            'SCHEDULE',

          scheduleExpression:
            '0 8 * * *',

          idempotencyKey:
            'schedule-1',

          occurredAt:
            '2026-09-03T05:00:00.000Z',

          payload: {},
        },
      ),
      true,
    );

    assert.equal(
      automationTriggerMatches(
        {
          type:
            'WEBHOOK',

          webhookKey:
            'crm-lead',
        },
        {
          tenantId:
            'tenant-a',

          triggerType:
            'WEBHOOK',

          webhookKey:
            'other-hook',

          idempotencyKey:
            'webhook-1',

          occurredAt:
            '2026-09-03T00:00:00.000Z',

          payload: {},
        },
      ),
      false,
    );
  },
);
