import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('EPIC11 persistent store scopes every core read by tenant and uses explicit natural idempotency keys', async () => {
  const source = await readFile(new URL('../src/customer-journey-lifecycle.ts', import.meta.url), 'utf8');
  for (const table of ['customerJourneyEvents', 'customerLifecycleAssessments', 'customerJourneyStageAssessments', 'nextBestActionRecommendations', 'customerJourneyPlans', 'journeyActionOutcomes', 'journeyLearningRecords']) assert.match(source, new RegExp(table));
  assert.match(source, /TENANT_SCOPE_DENIED/); assert.match(source, /eq\(customerJourneyEvents\.tenantId, context\.tenantId\)/); assert.match(source, /eq\(nextBestActionRecommendations\.tenantId, context\.tenantId\)/); assert.match(source, /eq\(journeyActionOutcomes\.tenantId, context\.tenantId\)/); assert.match(source, /eq\(journeyLearningRecords\.tenantId, context\.tenantId\)/);
  assert.match(source, /JOURNEY_EVENT_IDEMPOTENCY_MISMATCH/); assert.match(source, /onConflictDoNothing\(\)/); assert.doesNotMatch(source, /send\(|call\(|book\(|refund\(/);
});
