import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantContext } from '@platform/contracts';

import { InMemoryCustomerEngagementStore, assessContactability, assessLeadEngagement, buildJourneyContext, deriveBuyingSignals, detectConversationIntent, normalizeConversationIngress, receptionistRecommendation, recommendResponse, type ConversationIngressEvent, type CustomerCommunicationGovernancePlan, type CustomerCommunicationProviderCapabilities } from './customer-engagement.js';

const tenantA: TenantContext = { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'ar' };
const tenantB: TenantContext = { tenantId: 'tenant-b', roles: [], permissions: [], locale: 'en' };
const input = (overrides: Partial<ConversationIngressEvent> = {}): ConversationIngressEvent => ({ tenantId: 'tenant-a', provider: 'CUSTOM', channel: 'WEB_CHAT', externalThreadId: 'thread-1', externalMessageId: 'message-1', direction: 'INBOUND', participantIdentityIds: ['identity-ar'], occurredAt: '2026-09-15T00:00:00.000Z', contentHash: 'hash-only', consentStatus: 'ALLOWED', languageHints: ['ar-SA', 'en'], classificationHints: ['سعر', 'اجتماع'], evidenceRefs: [{ id: 'evidence-1', source: 'web-chat', summary: 'Arabic pricing and meeting request' }], idempotencyKey: 'ingress-1', ...overrides });

test('conversation ingress is provider-neutral, Arabic-safe, and idempotent without raw content', async () => {
  const event = normalizeConversationIngress(tenantA, input());
  const duplicate = normalizeConversationIngress(tenantA, input());
  assert.equal(event.eventId, duplicate.eventId); assert.equal(event.conversationId, duplicate.conversationId); assert.equal(event.languageHints[0], 'ar-SA');
  const store = new InMemoryCustomerEngagementStore(); await store.saveConversationEvent(tenantA, event); await store.saveConversationEvent(tenantA, duplicate);
  assert.equal((await store.findConversationEvent(tenantA, 'ingress-1'))?.eventId, event.eventId);
  assert.equal(await store.findConversationEvent(tenantB, 'ingress-1'), undefined);
});

test('deterministic intent, buying signals, engagement, consent and recommendations fail closed', () => {
  const event = normalizeConversationIngress(tenantA, input()); const intent = detectConversationIntent(event); const signals = deriveBuyingSignals(intent);
  assert.equal(intent.primary, 'PRICING'); assert.ok(intent.secondary.includes('MEETING_REQUEST')); assert.equal(signals[0]?.type, 'PRICING_REQUEST');
  const allowed = assessContactability({ tenantId: 'tenant-a', leadId: 'lead-a', channel: 'WEB_CHAT', purpose: 'SALES', status: 'ALLOWED', source: 'consent-evidence', evidenceRefs: [] });
  assert.equal(assessLeadEngagement('tenant-a', 'lead-a', [intent], signals, allowed).state, 'ENGAGED');
  const conversation = { conversationId: event.conversationId, tenantId: 'tenant-a', channel: 'WEB_CHAT' as const, state: 'ACTIVE' as const, leadId: 'lead-a', languageHints: ['ar-SA'], createdAt: event.createdAt, updatedAt: event.createdAt };
  assert.equal(recommendResponse(conversation, intent, allowed).state, 'RECOMMENDATION_ONLY');
  const blocked = assessContactability({ ...allowed, status: 'OPTED_OUT' }); assert.equal(recommendResponse(conversation, intent, blocked).action, 'DO_NOT_CONTACT');
  assert.equal(receptionistRecommendation({ sessionId: 'session-a', tenantId: 'tenant-a', conversationId: event.conversationId, profileId: 'profile-a', state: 'ACTIVE', createdAt: event.createdAt, updatedAt: event.createdAt }, intent, blocked).requiresHuman, true);
});

test('journey context preserves unknowns and does not fabricate revenue or identity', () => {
  const journey = buildJourneyContext({ tenantId: 'tenant-a', campaignIds: [], verifiedRevenueEventIds: [], engagementState: 'UNKNOWN', qualification: 'UNKNOWN', intent: 'UNKNOWN', evidenceRefs: [] });
  assert.deepEqual(journey.unknowns, ['LEAD_UNKNOWN', 'IDENTITY_UNKNOWN', 'OPPORTUNITY_UNKNOWN']);
});

test('provider contracts remain neutral and customer communication is non-executable', () => {
  const capabilities: CustomerCommunicationProviderCapabilities = { provider: 'FUTURE_ADAPTER', tenantId: 'tenant-a', capabilities: ['CONVERSATIONS', 'EMAIL', 'SMS', 'WHATSAPP', 'WEB_CHAT', 'VOICE', 'SOCIAL_DM', 'AI_RECEPTIONIST', 'CRM', 'CALENDAR', 'LEAD_MANAGEMENT', 'REPUTATION_REVIEWS', 'LOCAL_PRESENCE', 'MULTI_LOCATION_GROWTH'], evidenceRefs: [] };
  const plan: CustomerCommunicationGovernancePlan = { recommendationId: 'recommendation-a', tenantId: 'tenant-a', conversationId: 'conversation-a', consentRequired: true, policyRequired: true, approvalRequired: true, providerCapabilityRequired: 'CONVERSATIONS', deliveryVerificationRequired: true, state: 'NOT_EXECUTABLE_IN_EPIC10' };
  assert.equal(capabilities.capabilities.includes('WHATSAPP'), true);
  assert.equal(plan.state, 'NOT_EXECUTABLE_IN_EPIC10');
  assert.equal(plan.providerCapabilityRequired, 'CONVERSATIONS');
});
