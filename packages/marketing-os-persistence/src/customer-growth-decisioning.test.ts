import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('EPIC13 persistence is tenant-scoped, independently verified before learning, and has no provider transport', async () => {
  const source = await readFile(new URL('../src/customer-growth-decisioning.ts', import.meta.url), 'utf8');
  for (const table of ['growthDecisionContexts','growthActionCandidates','growthCandidateEligibilityAssessments','growthDecisionConflictAssessments','growthDecisionScores','growthDecisionRecommendations','growthDecisionOutcomes','growthDecisionLearningRecords']) assert.match(source, new RegExp(table));
  assert.match(source, /TENANT_SCOPE_DENIED/); assert.match(source, /VERIFIED_OUTCOME_REQUIRED/); assert.match(source, /causalClaim: 'NONE'/); assert.match(source, /onConflictDoNothing\(\)/);
  assert.match(source, /eq\(growthDecisionContexts\.tenantId, context\.tenantId\)/);
  assert.doesNotMatch(source, /fetch\(|https?:|provider\.|send\(|execute\(/);
});
