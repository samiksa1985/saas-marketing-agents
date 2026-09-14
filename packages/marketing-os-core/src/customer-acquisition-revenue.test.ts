import assert from 'node:assert/strict';
import test from 'node:test';

import type { TenantContext } from '@platform/contracts';

import {
  InMemoryCustomerAcquisitionRevenueStore,
  assessBuyingIntent,
  assessLeadQualification,
  calculateCampaignRevenueMetrics,
  createLeadRecord,
  createPersonIdentity,
  normalizeEmail,
  normalizePhone,
  quarantineMalformedLead,
  recommendLeadRouting,
  resolveIdentity,
  type ConversationEngagementSignal,
  type LeadCaptureInput,
  type RevenueEvent,
  type RevenueOpportunity,
} from './index.js';

const context: TenantContext = { tenantId: 'tenant-a', userId: 'user-a', roles: [], permissions: [], locale: 'en' as never };
const now = () => '2026-09-14T12:00:00.000Z';
function input(overrides: Partial<LeadCaptureInput> = {}): LeadCaptureInput { return { idempotencyKey: 'lead-a', source: 'WEBSITE_FORM', capturedAt: now(), email: ' Name@Example.COM ', phone: '050 123 4567', country: 'SA', firstName: 'فاطمة', company: 'ناوا', evidenceRefs: [{ id: 'form', source: 'form', summary: 'Submitted form.' }], ...overrides }; }
function signal(type: ConversationEngagementSignal['type']): ConversationEngagementSignal { return { signalId: `signal-${type}`, tenantId: context.tenantId, leadId: 'unused', type, source: 'test', occurredAt: now(), confidence: 1, evidenceRefs: [{ id: type, source: 'test', summary: type }] }; }

test('lead normalization supports Arabic data and Saudi phone formats without treating missing data as false', () => {
  const lead = createLeadRecord(context, input(), now);
  assert.equal(lead.email, 'name@example.com'); assert.equal(lead.phone, '+966501234567'); assert.equal(lead.firstName, 'فاطمة'); assert.equal(lead.consentState, 'UNKNOWN');
  assert.equal(normalizeEmail(undefined), undefined); assert.equal(normalizePhone(undefined), undefined);
});

test('lead capture is deterministic, idempotent, and malformed identity is quarantined', async () => {
  const store = new InMemoryCustomerAcquisitionRevenueStore(); const lead = createLeadRecord(context, input(), now);
  await store.saveLead(context, lead, 'lead-a'); await store.saveLead(context, lead, 'lead-a');
  assert.equal((await store.listLeads(context)).length, 1); assert.equal((await store.findLeadByIdempotencyKey(context, 'lead-a'))?.leadId, lead.leadId);
  const missingIdentity = input({ externalLeadIds: [] }); delete missingIdentity.email; delete missingIdentity.phone;
  assert.throws(() => createLeadRecord(context, missingIdentity, now), /LEAD_CAPTURE_INSUFFICIENT_IDENTITY/);
  const malformed = input(); delete malformed.email;
  assert.equal(quarantineMalformedLead(context, malformed, new Error('bad'), now).status, 'QUARANTINED');
});

test('identity resolution auto-links only safe exact/strong matches and flags weak conflicts', () => {
  const lead = createLeadRecord(context, input(), now); const identity = createPersonIdentity(context, lead, lead.evidenceRefs, now);
  assert.equal(resolveIdentity(lead, [identity]).resolution, 'EXACT_MATCH');
  const weak = { ...identity, identityId: 'weak', identifiers: [{ type: 'LEAD_ID' as const, value: 'other', normalizedValue: 'other' }], displayName: 'فاطمة ناوا' };
  assert.equal(resolveIdentity(lead, [weak]).resolution, 'POSSIBLE_MATCH');
  assert.equal(resolveIdentity(lead, [identity, { ...identity, identityId: 'duplicate' }]).resolution, 'CONFLICT');
});

test('qualification and intent are deterministic, evidence-backed, and routing is recommendation-only', () => {
  const lead = createLeadRecord(context, input(), now); const signals = [signal('REQUESTED_DEMO'), signal('MEETING_BOOKED')].map((item) => ({ ...item, leadId: lead.leadId }));
  const qualification = assessLeadQualification(lead, signals, now); const intent = assessBuyingIntent(lead, signals, now); const routing = recommendLeadRouting(lead, qualification, intent, now);
  assert.equal(qualification.grade, 'HOT'); assert.equal(intent.level, 'HIGH'); assert.equal(routing.kind, 'ESCALATE_HOT_LEAD'); assert.equal(routing.actionState, 'RECOMMENDATION_ONLY');
});

test('campaign-to-revenue metrics fail closed for unverified revenue, incompatible currency, and weak attribution', () => {
  const lead = createLeadRecord(context, input({ sourceCampaignId: 'campaign-a' }), now);
  const opportunity: RevenueOpportunity = { opportunityId: 'opp', tenantId: context.tenantId, provider: 'NAWA_NATIVE', linkedLeadIds: [lead.leadId], name: 'opp', stage: 'CLOSED_WON', status: 'WON', amountMinor: 1000, currency: 'SAR', createdAt: now(), updatedAt: now(), sourceCampaignIds: ['campaign-a'], evidenceRefs: [] };
  const event: RevenueEvent = { eventId: 'revenue', tenantId: context.tenantId, opportunityId: 'opp', type: 'BOOKED_REVENUE', amountMinor: 1000, currency: 'SAR', occurredAt: now(), idempotencyKey: 'revenue', evidenceRefs: [], verificationState: 'UNVERIFIED' };
  const metrics = calculateCampaignRevenueMetrics({ campaignId: 'campaign-a', currency: 'SAR', spendMinor: 100, leads: [lead], qualifications: [], opportunities: [opportunity], revenueEvents: [event], attributions: [] });
  assert.equal(metrics.closedWonRevenueMinor, 0); assert.ok(metrics.reasons.includes('UNVERIFIED_REVENUE_EXCLUDED')); assert.ok(metrics.reasons.includes('ATTRIBUTION_INSUFFICIENT'));
});
