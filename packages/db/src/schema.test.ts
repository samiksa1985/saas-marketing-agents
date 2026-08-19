import test from 'node:test';
import assert from 'node:assert/strict';
import { schema } from './index.js';

test('database foundation exposes tenant-scoped tables', () => {
  assert.ok(
    schema.tenants && schema.users && schema.engagements && schema.artifacts && schema.auditEvents,
  );
});
