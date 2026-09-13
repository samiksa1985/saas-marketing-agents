import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertExternalMarketingActionTransition,
  canTransitionExternalMarketingAction,
  CANONICAL_CAMPAIGN_MUTATION_TYPES,
  META_ADS_MUTATION_TYPES,
  type ExternalMarketingAction,
} from './external-marketing-action.js';
import { externalActionEntitlementKey } from './governed-external-action.js';

function action(status: ExternalMarketingAction['status']): ExternalMarketingAction {
  return {
    id: 'external-action-1',
    tenantId: 'tenant-a',
    planId: 'plan-a',
    workflowId: 'workflow-a',
    type: 'campaign_publish',
    idempotencyKey: 'external-action-key',
    status,
    requestedAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  };
}

test('external marketing action is approval gated and has terminal outcomes', () => {
  assert.equal(canTransitionExternalMarketingAction('DRAFT', 'APPROVAL_REQUIRED'), true);
  assert.equal(canTransitionExternalMarketingAction('ACKNOWLEDGED', 'DISPATCHING'), false);
  assert.throws(
    () => assertExternalMarketingActionTransition(action('APPROVAL_REQUIRED'), 'APPROVED'),
    /EXTERNAL_ACTION_APPROVAL_REQUIRED/,
  );
  assert.doesNotThrow(() =>
    assertExternalMarketingActionTransition(
      { ...action('APPROVAL_REQUIRED'), approvalId: 'approval-a' },
      'APPROVED',
    ),
  );
});

test('external marketing action contract does not permit dispatch before approval', () => {
  assert.throws(
    () => assertExternalMarketingActionTransition(action('DRAFT'), 'DISPATCHING'),
    /EXTERNAL_ACTION_INVALID_TRANSITION/,
  );
});

test('canonical campaign actions and entitlement keys remain provider-neutral', () => {
  assert.deepEqual(META_ADS_MUTATION_TYPES, CANONICAL_CAMPAIGN_MUTATION_TYPES);
  assert.equal(externalActionEntitlementKey('GOOGLE_ADS'), 'marketing.external_action.google_ads');
  assert.equal(externalActionEntitlementKey('META_ADS'), 'marketing.external_action.meta_ads');
});
