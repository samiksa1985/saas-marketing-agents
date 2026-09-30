import assert from 'node:assert/strict';
import test from 'node:test';
import { requestIdFor, sanitizedRuntimeSummary } from './production-runtime.js';

test('request correlation accepts bounded safe IDs and replaces unsafe values', () => {
  assert.equal(requestIdFor('pilot-request-123'), 'pilot-request-123');
  assert.notEqual(requestIdFor('bad value with spaces'), 'bad value with spaces');
});

test('runtime summary does not expose provider or database credentials', () => {
  const summary = sanitizedRuntimeSummary({ releaseVersion: '1.0.0', workflowRuntimeMode: 'temporal', databaseUrl: 'synthetic-database-url-canary', googleAdsExecutionEnabled: false, googleAdsExecutionMode: 'DISABLED', metaAdsExecutionEnabled: false, metaAdsExecutionMode: 'DISABLED' } as never);
  assert.deepEqual(summary.providerMutations, { google: false, meta: false });
  assert.equal(JSON.stringify(summary).match(/token|secret|password/i), null);
  assert.equal(JSON.stringify(summary).includes('synthetic-database-url-canary'), false);
});
