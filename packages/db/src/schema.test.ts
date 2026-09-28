import test from 'node:test';
import assert from 'node:assert/strict';
import { schema } from './index.js';

test('database foundation exposes tenant-scoped tables', () => {
  assert.ok(
    schema.tenants && schema.users && schema.engagements && schema.artifacts && schema.auditEvents,
  );
});

test('database schema exposes canonical admin governance tables', () => {
  assert.ok(
    schema.governanceFeatureFlags &&
      schema.governanceDataExportRequests &&
      schema.governanceDataDeletionRequests &&
      schema.governanceRetentionPolicies &&
      schema.governanceOrganizationOverrides,
  );
  assert.equal(schema.governanceAuditEvents, schema.auditEvents);
});

test('database schema exposes the CFO forecast snapshot separately from scenarios', () => {
  assert.ok(schema.financialForecastSnapshots);
  assert.ok(schema.financialScenarioSnapshots);
  assert.notEqual(
    schema.financialForecastSnapshots,
    schema.financialScenarioSnapshots,
  );
});
