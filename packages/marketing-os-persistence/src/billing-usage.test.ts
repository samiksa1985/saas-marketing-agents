import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AtomicBillingUsageStore,
} from './billing-usage.js';

test(
  'atomic usage rejects empty tenant before database access',
  async () => {
    let called = false;

    const store =
      new AtomicBillingUsageStore({
        execute: async () => {
          called = true;
          return [];
        },
      });

    await assert.rejects(
      store.consume({
        tenantId: '',
        key:
          'ai.requests.monthly',
        amount: 1,
        limit: 100,
        periodStart:
          '2026-09-01T00:00:00.000Z',
        periodEnd:
          '2026-10-01T00:00:00.000Z',
        idempotencyKey:
          'run-1',
        source:
          'agent-runtime',
      }),
      /Tenant context/,
    );

    assert.equal(
      called,
      false,
    );
  },
);

test(
  'atomic usage rejects invalid amount before database access',
  async () => {
    let called = false;

    const store =
      new AtomicBillingUsageStore({
        execute: async () => {
          called = true;
          return [];
        },
      });

    await assert.rejects(
      store.consume({
        tenantId:
          'tenant-a',
        key:
          'ai.requests.monthly',
        amount: 0,
        limit: 100,
        periodStart:
          '2026-09-01T00:00:00.000Z',
        periodEnd:
          '2026-10-01T00:00:00.000Z',
        idempotencyKey:
          'run-1',
        source:
          'agent-runtime',
      }),
      /positive integer/,
    );

    assert.equal(
      called,
      false,
    );
  },
);

test(
  'atomic usage interprets successful database result',
  async () => {
    const store =
      new AtomicBillingUsageStore({
        execute: async () => [
          {
            duplicate:
              false,
            consumed:
              true,
            used: 100,
          },
        ],
      });

    const result =
      await store.consume({
        tenantId:
          'tenant-a',
        key:
          'ai.requests.monthly',
        amount: 1,
        limit: 100,
        periodStart:
          '2026-09-01T00:00:00.000Z',
        periodEnd:
          '2026-10-01T00:00:00.000Z',
        idempotencyKey:
          'run-100',
        source:
          'agent-runtime',
      });

    assert.equal(
      result.consumed,
      true,
    );

    assert.equal(
      result.used,
      100,
    );

    assert.equal(
      result.remaining,
      0,
    );
  },
);

test(
  'idempotent replay is accepted without second consumption',
  async () => {
    const store =
      new AtomicBillingUsageStore({
        execute: async () => [
          {
            duplicate:
              true,
            consumed:
              false,
            used: 7,
          },
        ],
      });

    const result =
      await store.consume({
        tenantId:
          'tenant-a',
        key:
          'ai.requests.monthly',
        amount: 1,
        limit: 100,
        periodStart:
          '2026-09-01T00:00:00.000Z',
        periodEnd:
          '2026-10-01T00:00:00.000Z',
        idempotencyKey:
          'same-run',
        source:
          'agent-runtime',
      });

    assert.equal(
      result.duplicate,
      true,
    );

    assert.equal(
      result.consumed,
      false,
    );
  },
);

test(
  'quota exhaustion is surfaced',
  async () => {
    const store =
      new AtomicBillingUsageStore({
        execute: async () => [
          {
            duplicate:
              false,
            consumed:
              false,
            used: 100,
          },
        ],
      });

    await assert.rejects(
      store.consume({
        tenantId:
          'tenant-a',
        key:
          'ai.requests.monthly',
        amount: 1,
        limit: 100,
        periodStart:
          '2026-09-01T00:00:00.000Z',
        periodEnd:
          '2026-10-01T00:00:00.000Z',
        idempotencyKey:
          'over-limit',
        source:
          'agent-runtime',
      }),
      /quota exhausted/i,
    );
  },
);
