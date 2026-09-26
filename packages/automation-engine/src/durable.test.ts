import {
  test,
} from 'node:test';

import * as assert
  from 'node:assert/strict';

import type {
  AutomationDefinition,
  AutomationSignal,
  TenantContext,
} from '@platform/contracts';

import {
  DurableAutomationDispatcher,
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

const definition:
  AutomationDefinition = {
    id:
      '11111111-1111-1111-1111-111111111111',
    tenantId:
      'tenant-a',
    name:
      'Lead Automation',
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
    conditions: [],
    workflowReference:
      'lead-workflow',
    locale:
      'en',
    createdAt:
      '2026-09-03T00:00:00.000Z',
    updatedAt:
      '2026-09-03T00:00:00.000Z',
  };

const signal:
  AutomationSignal = {
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
    payload: {},
  };

test(
  'durable dispatcher claims before workflow start',
  async () => {
    const order:
      string[] = [];

    const dispatcher =
      new DurableAutomationDispatcher(
        {
          async start() {
            order.push(
              'workflow',
            );

            return {
              workflowId:
                'workflow-1',
            };
          },
        },
        {
          async claim() {
            order.push(
              'claim',
            );

            return {
              claimed:
                true,
              executionId:
                'execution-1',
            };
          },

          async markStarted() {
            order.push(
              'started',
            );
          },

          async markFailed() {
            order.push(
              'failed',
            );
          },
        },
      );

    const result =
      await dispatcher.dispatch(
        definition,
        signal,
        context,
      );

    assert.deepEqual(
      order,
      [
        'claim',
        'workflow',
        'started',
      ],
    );

    assert.equal(
      result.status,
      'STARTED',
    );
  },
);

test(
  'durable duplicate never starts second workflow',
  async () => {
    let starts = 0;

    const dispatcher =
      new DurableAutomationDispatcher(
        {
          async start() {
            starts += 1;

            return {
              workflowId:
                'never',
            };
          },
        },
        {
          async claim() {
            return {
              claimed:
                false,
              duplicate:
                true,
              workflowId:
                'workflow-existing',
            };
          },

          async markStarted() {},

          async markFailed() {},
        },
      );

    const result =
      await dispatcher.dispatch(
        definition,
        signal,
        context,
      );

    assert.equal(
      result.status,
      'DUPLICATE',
    );

    assert.equal(
      result.workflowId,
      'workflow-existing',
    );

    assert.equal(
      starts,
      0,
    );
  },
);

test(
  'workflow start failure is recorded as failed',
  async () => {
    let failed = 0;

    const dispatcher =
      new DurableAutomationDispatcher(
        {
          async start() {
            throw new Error(
              'workflow down',
            );
          },
        },
        {
          async claim() {
            return {
              claimed:
                true,
              executionId:
                'execution-1',
            };
          },

          async markStarted() {},

          async markFailed(
            _id,
            error,
          ) {
            failed += 1;

            assert.equal(
              error,
              'workflow down',
            );
          },
        },
      );

    await assert.rejects(
      dispatcher.dispatch(
        definition,
        signal,
        context,
      ),
      /workflow down/,
    );

    assert.equal(
      failed,
      1,
    );
  },
);
