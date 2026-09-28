import { createHash } from 'node:crypto';

import type { TenantContext } from '@platform/contracts';
import type { ConversationChannel as AcquisitionConversationChannel, CustomerGrowthCapability } from './customer-acquisition-revenue.js';

export type CustomerEngagementChannel = AcquisitionConversationChannel | 'IN_APP';
export type ConversationLifecycle = 'NEW' | 'ACTIVE' | 'WAITING_CUSTOMER' | 'WAITING_AGENT' | 'WAITING_HUMAN' | 'ESCALATED' | 'RESOLVED' | 'CLOSED' | 'UNKNOWN';
export type ConversationDirection = 'INBOUND' | 'OUTBOUND' | 'SYSTEM' | 'UNKNOWN';
export type ContactabilityStatus = 'UNKNOWN' | 'ALLOWED' | 'RESTRICTED' | 'OPTED_OUT' | 'BLOCKED';
export type ConversationIntentKind = 'GENERAL_INQUIRY' | 'PRODUCT_INQUIRY' | 'SERVICE_INQUIRY' | 'PRICING' | 'DEMO_REQUEST' | 'MEETING_REQUEST' | 'PURCHASE_INTENT' | 'SUPPORT' | 'COMPLAINT' | 'CANCELLATION' | 'RENEWAL' | 'UPSELL_INTEREST' | 'PARTNERSHIP' | 'CAREER' | 'SPAM' | 'ABUSE' | 'UNKNOWN';
export type EngagementState = 'NEW' | 'UNCONTACTED' | 'CONTACTED' | 'RESPONDED' | 'ENGAGED' | 'HIGH_INTENT' | 'MEETING_REQUESTED' | 'MEETING_SCHEDULED' | 'QUALIFIED' | 'NURTURE' | 'DORMANT' | 'OPTED_OUT' | 'ESCALATED' | 'UNKNOWN';
export type ResponseAction = 'ANSWER' | 'ASK_CLARIFYING_QUESTION' | 'ASK_QUALIFICATION_QUESTION' | 'SHARE_INFORMATION' | 'OFFER_MEETING' | 'HANDOFF_SALES' | 'HANDOFF_SUPPORT' | 'ESCALATE' | 'FOLLOW_UP' | 'DO_NOT_CONTACT' | 'NO_ACTION';
export type HandoffTarget = 'SALES' | 'SUPPORT' | 'ACCOUNT_MANAGER' | 'RECEPTION' | 'SPECIALIST' | 'HUMAN_AGENT' | 'OTHER';
export type CustomerEngagementCapability = CustomerGrowthCapability;

export interface ConversationEvidenceRef { id: string; source: string; summary: string; observedAt?: string; }
export interface ConversationIngressEvent { tenantId: string; provider: string; channel: CustomerEngagementChannel; externalThreadId?: string; externalMessageId?: string; direction: ConversationDirection; participantIdentityIds: string[]; occurredAt: string; contentReference?: string; contentHash?: string; redactedExcerpt?: string; consentStatus: ContactabilityStatus; languageHints: string[]; classificationHints?: string[]; evidenceRefs: ConversationEvidenceRef[]; idempotencyKey: string; }
export interface ConversationEventRecord extends ConversationIngressEvent { eventId: string; conversationId: string; createdAt: string; }
export interface ConversationThreadRecord { conversationId: string; tenantId: string; channel: CustomerEngagementChannel; state: ConversationLifecycle; leadId?: string; identityId?: string; externalThreadId?: string; languageHints: string[]; createdAt: string; updatedAt: string; }
export interface ConversationTurn { turnId: string; tenantId: string; conversationId: string; eventId: string; direction: ConversationDirection; occurredAt: string; contentReference?: string; contentHash?: string; redactedExcerpt?: string; evidenceRefs: ConversationEvidenceRef[]; }
export interface ConversationIntent { intentId: string; tenantId: string; conversationId: string; primary: ConversationIntentKind; secondary: ConversationIntentKind[]; confidence: number; reasonCodes: string[]; limitations: string[]; language: string; detectedAt: string; evidenceRefs: ConversationEvidenceRef[]; classifier: 'DETERMINISTIC_V1'; }
export interface ConversationBuyingSignal { signalId: string; tenantId: string; conversationId: string; leadId?: string; type: string; strength: 'LOW' | 'MEDIUM' | 'HIGH'; confidence: number; source: 'CONVERSATION'; occurredAt: string; evidenceRefs: ConversationEvidenceRef[]; limitations: string[]; }
export interface LeadEngagementAssessment { assessmentId: string; tenantId: string; leadId: string; state: EngagementState; reasonCodes: string[]; confidence: number; freshness: 'FRESH' | 'STALE' | 'UNKNOWN'; lastMeaningfulEngagementAt?: string; evidenceRefs: ConversationEvidenceRef[]; limitations: string[]; assessedAt: string; }
export interface ContactabilityAssessment { assessmentId: string; tenantId: string; identityId?: string; leadId?: string; channel: CustomerEngagementChannel; purpose: 'MARKETING' | 'SALES' | 'SUPPORT' | 'TRANSACTIONAL' | 'UNKNOWN'; status: ContactabilityStatus; source: string; evidenceRefs: ConversationEvidenceRef[]; assessedAt: string; expiresAt?: string; limitations: string[]; }
export interface ResponseRecommendation { recommendationId: string; tenantId: string; conversationId: string; leadId?: string; identityId?: string; action: ResponseAction; reasonCodes: string[]; confidence: number; risk: 'LOW' | 'MEDIUM' | 'HIGH'; requiredGovernance: string[]; expiresAt: string; providerCapabilities: string[]; evidenceRefs: ConversationEvidenceRef[]; limitations: string[]; state: 'RECOMMENDATION_ONLY'; createdAt: string; }
export interface CustomerHandoffRecommendation { handoffRecommendationId: string; tenantId: string; conversationId: string; leadId?: string; target: HandoffTarget; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'; reasonCodes: string[]; evidenceRefs: ConversationEvidenceRef[]; summaryReference?: string; requiredCapability?: string; status: 'RECOMMENDED'; createdAt: string; }
export interface CustomerHandoffRecord extends Omit<CustomerHandoffRecommendation, 'handoffRecommendationId' | 'status'> { handoffId: string; status: 'RECOMMENDED' | 'ACKNOWLEDGED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED' | 'EXPIRED'; }
export interface MeetingIntent { meetingIntentId: string; tenantId: string; conversationId: string; leadId?: string; purpose: string; requestedAt?: string; timezone?: string; participantIdentityIds: string[]; preferredChannel?: CustomerEngagementChannel; urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN'; evidenceRefs: ConversationEvidenceRef[]; limitations: string[]; createdAt: string; state: 'RECOMMENDATION_ONLY'; }
export interface FollowUpRecommendation { followUpId: string; tenantId: string; conversationId: string; leadId?: string; windowStart?: string; windowEnd?: string; priority: 'LOW' | 'NORMAL' | 'HIGH'; channel?: CustomerEngagementChannel; contactabilityRequired: boolean; reasonCodes: string[]; evidenceRefs: ConversationEvidenceRef[]; expiresAt: string; state: 'RECOMMENDATION_ONLY'; }
export interface ConversationSummary { summaryId: string; tenantId: string; conversationId: string; primaryIntent: ConversationIntentKind; secondaryIntents: ConversationIntentKind[]; facts: string[]; questions: string[]; requestedActions: string[]; unknowns: string[]; evidenceRefs: ConversationEvidenceRef[]; createdAt: string; }
export interface Commitment { commitmentId: string; tenantId: string; conversationId: string; ownerType: 'CUSTOMER' | 'BUSINESS'; commitmentType: string; dueAt?: string; status: 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'UNKNOWN'; confidence: number; evidenceRefs: ConversationEvidenceRef[]; }
export interface ConversationDiagnostic { diagnosticId: string; tenantId: string; conversationId: string; type: 'HIGH_INTENT_NO_HANDOFF' | 'MEETING_REQUEST_UNACTIONED' | 'PRICING_REQUEST_UNACTIONED' | 'CUSTOMER_WAITING_TOO_LONG' | 'REPEATED_UNANSWERED_QUESTION' | 'QUALIFIED_LEAD_NO_OPPORTUNITY' | 'OPT_OUT_CONTACT_RISK' | 'MISSING_IDENTITY' | 'MISSING_CONSENT_EVIDENCE' | 'STALE_CONVERSATION' | 'REVENUE_LINK_MISSING' | 'UNKNOWN'; severity: 'INFO' | 'WARNING' | 'HIGH'; reasonCodes: string[]; evidenceRefs: ConversationEvidenceRef[]; recommendedNextStep: ResponseAction; limitations: string[]; generatedAt: string; }
export interface AIReceptionistProfile { profileId: string; tenantId: string; name: string; supportedLanguages: string[]; safetyThreshold: number; enabled: boolean; policyRefs: string[]; }
export interface AIReceptionistPolicy { policyId: string; tenantId: string; profileId: string; requiresHumanFor: string[]; minimumConfidence: number; approvedCapabilities: CustomerEngagementCapability[]; evidenceRefs: ConversationEvidenceRef[]; active: boolean; }
export interface AIReceptionistSession { sessionId: string; tenantId: string; conversationId: string; profileId: string; state: 'NEW' | 'ACTIVE' | 'WAITING_HUMAN' | 'CLOSED'; createdAt: string; updatedAt: string; }
export interface AIReceptionistTurn { turnId: string; tenantId: string; sessionId: string; eventId?: string; idempotencyKey: string; occurredAt: string; evidenceRefs: ConversationEvidenceRef[]; }
export interface AIReceptionistActionRecommendation { actionRecommendationId: string; tenantId: string; sessionId: string; action: ResponseAction; reasonCodes: string[]; confidence: number; requiresHuman: boolean; state: 'RECOMMENDATION_ONLY'; evidenceRefs: ConversationEvidenceRef[]; }
export interface AIReceptionistHandoff { handoffId: string; tenantId: string; sessionId: string; target: HandoffTarget; reasonCodes: string[]; evidenceRefs: ConversationEvidenceRef[]; status: 'RECOMMENDED' | 'ACKNOWLEDGED' | 'ACCEPTED' | 'COMPLETED'; }
export interface AIReceptionistOutcome { outcomeId: string; tenantId: string; sessionId: string; state: 'UNKNOWN' | 'HANDED_OFF' | 'RESOLVED' | 'ABANDONED'; evidenceRefs: ConversationEvidenceRef[]; limitations: string[]; recordedAt: string; }
export interface CustomerCommunicationProviderCapabilities { provider: 'NAWA_NATIVE' | 'CUSTOM' | 'FUTURE_ADAPTER'; tenantId: string; capabilities: CustomerEngagementCapability[]; evidenceRefs: ConversationEvidenceRef[]; }
/** Future adapter seam. Its optional methods intentionally expose no send authority in EPIC-10. */
export interface ConversationProvider { readonly capabilities: CustomerCommunicationProviderCapabilities; normalizeIngress?(context: TenantContext, input: unknown): Promise<ConversationIngressEvent>; }
export interface CustomerCommunicationGovernancePlan { recommendationId: string; tenantId: string; conversationId: string; consentRequired: true; policyRequired: true; approvalRequired: boolean; providerCapabilityRequired: CustomerEngagementCapability; deliveryVerificationRequired: true; state: 'NOT_EXECUTABLE_IN_EPIC10'; }
export interface CustomerJourneyContext { tenantId: string; leadId?: string; identityId?: string; conversationId?: string; campaignIds: string[]; opportunityId?: string; verifiedRevenueEventIds: string[]; engagementState: EngagementState; qualification: 'UNKNOWN' | 'AVAILABLE'; intent: ConversationIntentKind; unknowns: string[]; evidenceRefs: ConversationEvidenceRef[]; }
export interface EngagementAnalytics { tenantId: string; conversationCount: number; activeConversations: number; engagedLeads?: number; highIntentLeads?: number; meetingRequestRate?: number; handoffRate?: number; channelDistribution: Record<string, number>; intentDistribution: Record<string, number>; limitations: string[]; }

export interface CustomerEngagementStore {
  findConversationEvent(context: TenantContext, idempotencyKey: string): Promise<ConversationEventRecord | undefined>;
  saveConversationEvent(context: TenantContext, event: ConversationEventRecord): Promise<ConversationEventRecord>;
  saveConversation(context: TenantContext, conversation: ConversationThreadRecord): Promise<ConversationThreadRecord>;
  getConversation(context: TenantContext, conversationId: string): Promise<ConversationThreadRecord | undefined>;
  listConversations(context: TenantContext): Promise<ConversationThreadRecord[]>;
  saveTurn(context: TenantContext, turn: ConversationTurn): Promise<ConversationTurn>;
  listTurns(context: TenantContext, conversationId: string): Promise<ConversationTurn[]>;
  saveIntent(context: TenantContext, intent: ConversationIntent): Promise<ConversationIntent>;
  listIntents(context: TenantContext, conversationId: string): Promise<ConversationIntent[]>;
  saveRecommendation(context: TenantContext, recommendation: ResponseRecommendation): Promise<ResponseRecommendation>;
  listRecommendations(context: TenantContext, conversationId: string): Promise<ResponseRecommendation[]>;
  saveSession(context: TenantContext, session: AIReceptionistSession): Promise<AIReceptionistSession>;
  getSession(context: TenantContext, sessionId: string): Promise<AIReceptionistSession | undefined>;
  saveHandoff(context: TenantContext, handoff: AIReceptionistHandoff): Promise<AIReceptionistHandoff>;
  listHandoffs(context: TenantContext): Promise<AIReceptionistHandoff[]>;
  saveFollowUp(context: TenantContext, recommendation: FollowUpRecommendation): Promise<FollowUpRecommendation>;
  listFollowUps(context: TenantContext): Promise<FollowUpRecommendation[]>;
  saveDiagnostic(context: TenantContext, diagnostic: ConversationDiagnostic): Promise<ConversationDiagnostic>;
  listDiagnostics(context: TenantContext, conversationId: string): Promise<ConversationDiagnostic[]>;
}

const now = () => new Date().toISOString();
const copy = <T>(value: T): T => structuredClone(value);
const key = (...parts: string[]) => parts.join(':');
function assertTenant(context: TenantContext, tenantId?: string): asserts context is TenantContext & { tenantId: string } { if (!context.tenantId || (tenantId && context.tenantId !== tenantId)) throw new Error('TENANT_SCOPE_DENIED'); }
function id(prefix: string, values: unknown[]): string { return `${prefix}-${createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 24)}`; }

const intentKeywords: Array<[ConversationIntentKind, string[]]> = [
  ['PRICING', ['pricing', 'price', 'سعر', 'الأسعار']], ['DEMO_REQUEST', ['demo', 'عرض توضيحي']], ['MEETING_REQUEST', ['meeting', 'اجتماع']], ['PURCHASE_INTENT', ['buy', 'purchase', 'شراء']], ['SUPPORT', ['support', 'مساعدة']], ['COMPLAINT', ['complaint', 'شكوى']], ['CANCELLATION', ['cancel', 'إلغاء']], ['RENEWAL', ['renew', 'تجديد']], ['UPSELL_INTEREST', ['upgrade', 'ترقية']], ['PARTNERSHIP', ['partner', 'شراكة']], ['CAREER', ['career', 'وظيفة']], ['ABUSE', ['abuse', 'تهديد']], ['SPAM', ['spam', 'رسائل مزعجة']],
];

export function normalizeConversationIngress(context: TenantContext, input: ConversationIngressEvent): ConversationEventRecord {
  assertTenant(context, input.tenantId);
  if (!input.idempotencyKey || !input.provider || !input.occurredAt || (!input.contentReference && !input.contentHash && !input.externalMessageId)) throw new Error('CONVERSATION_INGRESS_MALFORMED');
  const conversationId = id('conversation', [input.tenantId, input.provider, input.channel, input.externalThreadId ?? input.externalMessageId]);
  return { ...copy(input), eventId: id('conversation-event', [input.tenantId, input.idempotencyKey]), conversationId, createdAt: now() };
}
export function detectConversationIntent(event: ConversationEventRecord): ConversationIntent {
  const hints = (event.classificationHints ?? []).map((item) => item.trim().toLocaleLowerCase()).filter(Boolean);
  const matches = intentKeywords.filter(([, words]) => words.some((word) => hints.includes(word.toLocaleLowerCase()))).map(([kind]) => kind);
  const primary = matches[0] ?? 'UNKNOWN';
  return { intentId: id('conversation-intent', [event.tenantId, event.conversationId, event.eventId]), tenantId: event.tenantId, conversationId: event.conversationId, primary, secondary: matches.slice(1), confidence: primary === 'UNKNOWN' ? 0 : 0.8, reasonCodes: primary === 'UNKNOWN' ? ['NO_DETERMINISTIC_INTENT_HINT'] : [`HINT_${primary}`], limitations: primary === 'UNKNOWN' ? ['CONTENT_MINIMIZATION_PREVENTS_UNSUPPORTED_INFERENCE'] : [], language: event.languageHints[0] ?? 'UNKNOWN', detectedAt: event.occurredAt, evidenceRefs: copy(event.evidenceRefs), classifier: 'DETERMINISTIC_V1' };
}
export function deriveBuyingSignals(intent: ConversationIntent): ConversationBuyingSignal[] {
  const signal = ({ PRICING: 'PRICING_REQUEST', DEMO_REQUEST: 'DEMO_REQUEST', MEETING_REQUEST: 'MEETING_REQUEST', PURCHASE_INTENT: 'PURCHASE_INTENT', RENEWAL: 'RENEWAL', UPSELL_INTEREST: 'EXPANSION' } as Record<string, string | undefined>)[intent.primary];
  return signal ? [{ signalId: id('conversation-signal', [intent.tenantId, intent.intentId, signal]), tenantId: intent.tenantId, conversationId: intent.conversationId, type: signal, strength: ['PURCHASE_INTENT', 'MEETING_REQUEST'].includes(intent.primary) ? 'HIGH' : 'MEDIUM', confidence: intent.confidence, source: 'CONVERSATION', occurredAt: intent.detectedAt, evidenceRefs: copy(intent.evidenceRefs), limitations: copy(intent.limitations) }] : [];
}
export function assessContactability(input: Omit<ContactabilityAssessment, 'assessmentId' | 'assessedAt' | 'limitations'>): ContactabilityAssessment { return { ...copy(input), assessmentId: id('contactability', [input.tenantId, input.identityId, input.leadId, input.channel, input.purpose, input.source]), assessedAt: now(), limitations: input.status === 'UNKNOWN' ? ['MISSING_CONTACTABILITY_EVIDENCE'] : [] }; }
export function assessLeadEngagement(tenantId: string, leadId: string, intents: ConversationIntent[], signals: ConversationBuyingSignal[], contactability: ContactabilityAssessment): LeadEngagementAssessment {
  const top = intents[0]?.primary ?? 'UNKNOWN'; const state: EngagementState = contactability.status === 'OPTED_OUT' || contactability.status === 'BLOCKED' ? 'OPTED_OUT' : top === 'MEETING_REQUEST' ? 'MEETING_REQUESTED' : signals.some((signal) => signal.strength === 'HIGH') ? 'HIGH_INTENT' : intents.length ? 'ENGAGED' : 'UNKNOWN';
  return { assessmentId: id('engagement', [tenantId, leadId, top, state]), tenantId, leadId, state, reasonCodes: [`INTENT_${top}`, `CONTACTABILITY_${contactability.status}`], confidence: top === 'UNKNOWN' ? 0 : 0.75, freshness: intents.length ? 'FRESH' : 'UNKNOWN', ...(intents[0]?.detectedAt ? { lastMeaningfulEngagementAt: intents[0].detectedAt } : {}), evidenceRefs: copy(intents.flatMap((item) => item.evidenceRefs)), limitations: contactability.status === 'UNKNOWN' ? ['CONTACTABILITY_UNVERIFIED'] : [], assessedAt: now() };
}
export function recommendResponse(conversation: ConversationThreadRecord, intent: ConversationIntent, contactability: ContactabilityAssessment): ResponseRecommendation {
  const unsafe = contactability.status !== 'ALLOWED' || ['ABUSE', 'COMPLAINT'].includes(intent.primary);
  const action: ResponseAction = contactability.status === 'OPTED_OUT' || contactability.status === 'BLOCKED' ? 'DO_NOT_CONTACT' : ['ABUSE', 'COMPLAINT'].includes(intent.primary) ? 'ESCALATE' : intent.primary === 'MEETING_REQUEST' ? 'OFFER_MEETING' : intent.primary === 'PRICING' ? 'HANDOFF_SALES' : 'ASK_CLARIFYING_QUESTION';
  return { recommendationId: id('response-recommendation', [conversation.tenantId, conversation.conversationId, intent.intentId, action]), tenantId: conversation.tenantId, conversationId: conversation.conversationId, ...(conversation.leadId ? { leadId: conversation.leadId } : {}), ...(conversation.identityId ? { identityId: conversation.identityId } : {}), action, reasonCodes: [`INTENT_${intent.primary}`, `CONTACTABILITY_${contactability.status}`], confidence: unsafe ? 0.9 : intent.confidence, risk: unsafe ? 'HIGH' : 'MEDIUM', requiredGovernance: ['CONSENT_CHECK', 'POLICY_CHECK', 'PROVIDER_CAPABILITY_CHECK', 'NO_AUTONOMOUS_SEND'], expiresAt: new Date(Date.now() + 86_400_000).toISOString(), providerCapabilities: ['CONVERSATIONS'], evidenceRefs: copy(intent.evidenceRefs), limitations: ['RECOMMENDATION_ONLY_NO_TRANSPORT_EXECUTION'], state: 'RECOMMENDATION_ONLY', createdAt: now() };
}
export function receptionistRecommendation(session: AIReceptionistSession, intent: ConversationIntent, contactability: ContactabilityAssessment, explicitHumanRequest = false): AIReceptionistActionRecommendation {
  const requiresHuman = explicitHumanRequest || contactability.status !== 'ALLOWED' || ['ABUSE', 'COMPLAINT', 'CANCELLATION'].includes(intent.primary) || intent.confidence < 0.6;
  return { actionRecommendationId: id('receptionist-recommendation', [session.tenantId, session.sessionId, intent.intentId]), tenantId: session.tenantId, sessionId: session.sessionId, action: requiresHuman ? 'ESCALATE' : 'ASK_CLARIFYING_QUESTION', reasonCodes: requiresHuman ? ['FAIL_CLOSED_HUMAN_HANDOFF_REQUIRED'] : ['SAFE_INFORMATIONAL_GUIDANCE_ONLY'], confidence: intent.confidence, requiresHuman, state: 'RECOMMENDATION_ONLY', evidenceRefs: copy(intent.evidenceRefs) };
}
export function buildJourneyContext(input: Omit<CustomerJourneyContext, 'unknowns'>): CustomerJourneyContext { return { ...copy(input), unknowns: [input.leadId ? '' : 'LEAD_UNKNOWN', input.identityId ? '' : 'IDENTITY_UNKNOWN', input.opportunityId ? '' : 'OPPORTUNITY_UNKNOWN'].filter(Boolean) }; }

export class InMemoryCustomerEngagementStore implements CustomerEngagementStore {
  private readonly events = new Map<string, ConversationEventRecord>(); private readonly conversations = new Map<string, ConversationThreadRecord>(); private readonly turns = new Map<string, ConversationTurn>(); private readonly intents = new Map<string, ConversationIntent>(); private readonly recommendations = new Map<string, ResponseRecommendation>(); private readonly sessions = new Map<string, AIReceptionistSession>(); private readonly handoffs = new Map<string, AIReceptionistHandoff>(); private readonly followUps = new Map<string, FollowUpRecommendation>(); private readonly diagnostics = new Map<string, ConversationDiagnostic>();
  private values<T extends { tenantId: string }>(map: Map<string, T>, context: TenantContext) { assertTenant(context); return [...map.values()].filter((item) => item.tenantId === context.tenantId).map(copy); }
  async findConversationEvent(context: TenantContext, idempotencyKey: string) { return this.values(this.events, context).find((item) => item.idempotencyKey === idempotencyKey); }
  async saveConversationEvent(context: TenantContext, item: ConversationEventRecord) { assertTenant(context, item.tenantId); const existing = await this.findConversationEvent(context, item.idempotencyKey); if (existing && existing.eventId !== item.eventId) throw new Error('CONVERSATION_INGRESS_IDEMPOTENCY_MISMATCH'); this.events.set(key(item.tenantId, item.eventId), copy(item)); return copy(item); }
  async saveConversation(context: TenantContext, item: ConversationThreadRecord) { assertTenant(context, item.tenantId); this.conversations.set(key(item.tenantId, item.conversationId), copy(item)); return copy(item); }
  async getConversation(context: TenantContext, item: string) { return this.values(this.conversations, context).find((value) => value.conversationId === item); }
  async listConversations(context: TenantContext) { return this.values(this.conversations, context); }
  async saveTurn(context: TenantContext, item: ConversationTurn) { assertTenant(context, item.tenantId); this.turns.set(key(item.tenantId, item.turnId), copy(item)); return copy(item); }
  async listTurns(context: TenantContext, item: string) { return this.values(this.turns, context).filter((value) => value.conversationId === item); }
  async saveIntent(context: TenantContext, item: ConversationIntent) { assertTenant(context, item.tenantId); this.intents.set(key(item.tenantId, item.intentId), copy(item)); return copy(item); }
  async listIntents(context: TenantContext, item: string) { return this.values(this.intents, context).filter((value) => value.conversationId === item); }
  async saveRecommendation(context: TenantContext, item: ResponseRecommendation) { assertTenant(context, item.tenantId); this.recommendations.set(key(item.tenantId, item.recommendationId), copy(item)); return copy(item); }
  async listRecommendations(context: TenantContext, item: string) { return this.values(this.recommendations, context).filter((value) => value.conversationId === item); }
  async saveSession(context: TenantContext, item: AIReceptionistSession) { assertTenant(context, item.tenantId); this.sessions.set(key(item.tenantId, item.sessionId), copy(item)); return copy(item); }
  async getSession(context: TenantContext, item: string) { return this.values(this.sessions, context).find((value) => value.sessionId === item); }
  async saveHandoff(context: TenantContext, item: AIReceptionistHandoff) { assertTenant(context, item.tenantId); this.handoffs.set(key(item.tenantId, item.handoffId), copy(item)); return copy(item); }
  async listHandoffs(context: TenantContext) { return this.values(this.handoffs, context); }
  async saveFollowUp(context: TenantContext, item: FollowUpRecommendation) { assertTenant(context, item.tenantId); this.followUps.set(key(item.tenantId, item.followUpId), copy(item)); return copy(item); }
  async listFollowUps(context: TenantContext) { return this.values(this.followUps, context); }
  async saveDiagnostic(context: TenantContext, item: ConversationDiagnostic) { assertTenant(context, item.tenantId); this.diagnostics.set(key(item.tenantId, item.diagnosticId), copy(item)); return copy(item); }
  async listDiagnostics(context: TenantContext, item: string) { return this.values(this.diagnostics, context).filter((value) => value.conversationId === item); }
}
