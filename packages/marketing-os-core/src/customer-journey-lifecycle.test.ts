import * as assert from 'node:assert/strict';
import test from 'node:test';

import { assessActionEligibility, assessExpansion, assessHealth, assessJourneyStage, assessLifecycle, assessRetentionRisk, buildJourneyPlan, generateNextBestActions, orderJourneyEvents, triggersFromEvents, validLifecycleTransition, type CustomerJourneyEvent } from './customer-journey-lifecycle.js';

const event = (type: CustomerJourneyEvent['type'], occurredAt = '2026-09-01T10:00:00.000Z'): CustomerJourneyEvent => ({ eventId: `${type}-${occurredAt}`, tenantId: 'tenant-a', identityId: 'هوية-١', type, occurredAt, source: 'TEST', idempotencyKey: `${type}-${occurredAt}`, verificationState: 'OBSERVED', evidenceRefs: [{ id: `e-${type}`, source: 'TEST', summary: type, observedAt: occurredAt }], provenance: 'TEST' });

test('journey timeline is deterministic and preserves Arabic identity metadata', () => {
  const events = orderJourneyEvents([event('LEAD_CREATED', '2026-09-02T10:00:00.000Z'), event('SITE_VISIT', '2026-09-01T10:00:00.000Z')]);
  assert.deepEqual(events.map((item) => item.type), ['SITE_VISIT', 'LEAD_CREATED']);
  assert.equal(events[0]?.identityId, 'هوية-١');
});

test('lifecycle requires evidence and rejects invalid churn transition', () => {
  const lead = assessLifecycle({ tenantId: 'tenant-a', identityId: 'identity-a', events: [event('LEAD_CREATED')] });
  assert.equal(lead.currentState, 'LEAD');
  assert.equal(assessLifecycle({ tenantId: 'tenant-a', identityId: 'identity-a', events: [] }).currentState, 'UNKNOWN');
  assert.equal(validLifecycleTransition('LEAD', 'CHURNED'), false);
  assert.throws(() => assessLifecycle({ tenantId: 'tenant-a', identityId: 'identity-a', previous: lead, events: [event('CHURN_SIGNAL')] }), /INVALID_LIFECYCLE_TRANSITION/);
});

test('stage assessment records regression without assuming a linear funnel', () => {
  const lifecycle = assessLifecycle({ tenantId: 'tenant-a', identityId: 'identity-a', events: [event('REVENUE_VERIFIED'), event('COMPLAINT')] });
  const stage = assessJourneyStage(lifecycle, [event('REVENUE_VERIFIED'), event('COMPLAINT')], '2026-09-02T10:00:00.000Z');
  assert.equal(lifecycle.currentState, 'AT_RISK');
  assert.equal(stage.regressionEvidence.length, 1);
});

test('next-best-actions fail closed for opt-out and rank deterministic escalation first', () => {
  const lifecycle = assessLifecycle({ tenantId: 'tenant-a', identityId: 'identity-a', events: [event('COMPLAINT')] });
  const results = generateNextBestActions({ lifecycle, events: [event('COMPLAINT')], contactability: { assessmentId: 'c', tenantId: 'tenant-a', identityId: 'identity-a', channel: 'WEB_CHAT', purpose: 'SALES', status: 'ALLOWED', source: 'TEST', evidenceRefs: [], assessedAt: '2026-09-01T00:00:00.000Z', limitations: [] }, capabilities: ['CONVERSATIONS'] });
  assert.equal(results[0]?.action, 'ESCALATE');
  const optedOut = generateNextBestActions({ lifecycle, events: [event('OPT_OUT')], contactability: { assessmentId: 'c', tenantId: 'tenant-a', identityId: 'identity-a', channel: 'WEB_CHAT', purpose: 'SALES', status: 'OPTED_OUT', source: 'TEST', evidenceRefs: [], assessedAt: '2026-09-01T00:00:00.000Z', limitations: [] }, capabilities: ['CONVERSATIONS'] });
  assert.equal(optedOut[0]?.action, 'DO_NOT_CONTACT');
});

test('eligibility blocks outbound actions with missing consent, fatigue, or provider capability', () => {
  const blocked = assessActionEligibility({ tenantId: 'tenant-a', identityId: 'identity-a', action: 'REENGAGE', lifecycle: 'DORMANT', capabilities: [], evidenceRefs: [event('DORMANCY_SIGNAL').evidenceRefs[0]!], frequency: { tenantId: 'tenant-a', identityId: 'identity-a', purpose: 'MARKETING', result: 'COOLDOWN', recentAttempts: 3, recentResponses: 0, reasonCodes: ['COOLDOWN'] } });
  assert.equal(blocked.result, 'INELIGIBLE');
  assert.ok(blocked.reasonCodes.includes('MISSING_CONTACTABILITY_EVIDENCE'));
});

test('plans are ordered recommendation-only records and signals drive retention, expansion, health, and triggers', () => {
  const lifecycle = assessLifecycle({ tenantId: 'tenant-a', identityId: 'identity-a', events: [event('RENEWAL_SIGNAL')] });
  const actions = generateNextBestActions({ lifecycle, events: [event('RENEWAL_SIGNAL')], contactability: { assessmentId: 'c', tenantId: 'tenant-a', identityId: 'identity-a', channel: 'WEB_CHAT', purpose: 'SALES', status: 'ALLOWED', source: 'TEST', evidenceRefs: [], assessedAt: '2026-09-01T00:00:00.000Z', limitations: [] }, capabilities: ['CONVERSATIONS'] });
  const plan = buildJourneyPlan(actions);
  assert.equal(plan.state, 'RECOMMENDATION_ONLY'); assert.equal(plan.steps[0]?.sequence, 1);
  assert.equal(assessRetentionRisk('tenant-a', 'identity-a', [event('COMPLAINT')]).level, 'HIGH');
  assert.equal(assessExpansion('tenant-a', 'identity-a', [event('EXPANSION_SIGNAL')]).strength, 'STRONG');
  assert.equal(assessHealth('tenant-a', 'identity-a', [event('COMPLAINT')]).health, 'AT_RISK');
  assert.equal(triggersFromEvents([event('RENEWAL_SIGNAL')])[0]?.type, 'RENEWAL_WINDOW');
});
