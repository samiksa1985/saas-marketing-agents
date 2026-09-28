import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import { assessContactability, deriveBuyingSignals, detectConversationIntent, normalizeConversationIngress, recommendResponse, type AIReceptionistSession, type ConversationIngressEvent, type ConversationThreadRecord, type CustomerEngagementStore } from '@platform/marketing-os-core';
import { PersistentCustomerEngagementStore, type MarketingOSPersistenceDatabase } from '@platform/marketing-os-persistence';

import { ApiTenantDatabase } from './tenant-database.js';

type CustomerEngagementTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;
export const CUSTOMER_ENGAGEMENT_APPLICATION_SERVICE = 'PLATFORM_CUSTOMER_ENGAGEMENT_APPLICATION_SERVICE';

class ApiTenantCustomerEngagementStore<T extends CustomerEngagementTransaction> implements CustomerEngagementStore {
  constructor(private readonly database: ApiTenantDatabase<T>) {}
  private use<R>(context: TenantContext, operation: (store: PersistentCustomerEngagementStore) => Promise<R>) { return this.database.execute(context, (transaction) => operation(new PersistentCustomerEngagementStore(transaction))); }
  findConversationEvent(context: TenantContext, value: string) { return this.use(context, (store) => store.findConversationEvent(context, value)); }
  saveConversationEvent(context: TenantContext, value: Parameters<CustomerEngagementStore['saveConversationEvent']>[1]) { return this.use(context, (store) => store.saveConversationEvent(context, value)); }
  saveConversation(context: TenantContext, value: Parameters<CustomerEngagementStore['saveConversation']>[1]) { return this.use(context, (store) => store.saveConversation(context, value)); }
  getConversation(context: TenantContext, value: string) { return this.use(context, (store) => store.getConversation(context, value)); }
  listConversations(context: TenantContext) { return this.use(context, (store) => store.listConversations(context)); }
  saveTurn(context: TenantContext, value: Parameters<CustomerEngagementStore['saveTurn']>[1]) { return this.use(context, (store) => store.saveTurn(context, value)); }
  listTurns(context: TenantContext, value: string) { return this.use(context, (store) => store.listTurns(context, value)); }
  saveIntent(context: TenantContext, value: Parameters<CustomerEngagementStore['saveIntent']>[1]) { return this.use(context, (store) => store.saveIntent(context, value)); }
  listIntents(context: TenantContext, value: string) { return this.use(context, (store) => store.listIntents(context, value)); }
  saveRecommendation(context: TenantContext, value: Parameters<CustomerEngagementStore['saveRecommendation']>[1]) { return this.use(context, (store) => store.saveRecommendation(context, value)); }
  listRecommendations(context: TenantContext, value: string) { return this.use(context, (store) => store.listRecommendations(context, value)); }
  saveSession(context: TenantContext, value: Parameters<CustomerEngagementStore['saveSession']>[1]) { return this.use(context, (store) => store.saveSession(context, value)); }
  getSession(context: TenantContext, value: string) { return this.use(context, (store) => store.getSession(context, value)); }
  saveHandoff(context: TenantContext, value: Parameters<CustomerEngagementStore['saveHandoff']>[1]) { return this.use(context, (store) => store.saveHandoff(context, value)); }
  listHandoffs(context: TenantContext) { return this.use(context, (store) => store.listHandoffs(context)); }
  saveFollowUp(context: TenantContext, value: Parameters<CustomerEngagementStore['saveFollowUp']>[1]) { return this.use(context, (store) => store.saveFollowUp(context, value)); }
  listFollowUps(context: TenantContext) { return this.use(context, (store) => store.listFollowUps(context)); }
  saveDiagnostic(context: TenantContext, value: Parameters<CustomerEngagementStore['saveDiagnostic']>[1]) { return this.use(context, (store) => store.saveDiagnostic(context, value)); }
  listDiagnostics(context: TenantContext, value: string) { return this.use(context, (store) => store.listDiagnostics(context, value)); }
}

/** Tenant-scoped intelligence façade. It produces recommendations only; it owns no communication transport or send operation. */
export class CustomerEngagementApplicationService<T extends CustomerEngagementTransaction> {
  private readonly store: CustomerEngagementStore;
  constructor(database: ApiTenantDatabase<T>) { this.store = new ApiTenantCustomerEngagementStore(database); }
  async ingest(context: TenantContext, input: ConversationIngressEvent) {
    const existing = await this.store.findConversationEvent(context, input.idempotencyKey); if (existing) return existing;
    const event = normalizeConversationIngress(context, input);
    const thread: ConversationThreadRecord = { conversationId: event.conversationId, tenantId: context.tenantId, channel: event.channel, state: event.direction === 'INBOUND' ? 'WAITING_AGENT' : 'WAITING_CUSTOMER', ...(event.externalThreadId ? { externalThreadId: event.externalThreadId } : {}), languageHints: event.languageHints, createdAt: event.createdAt, updatedAt: event.createdAt };
    await this.store.saveConversationEvent(context, event); await this.store.saveConversation(context, thread);
    await this.store.saveTurn(context, { turnId: `${event.eventId}:turn`, tenantId: context.tenantId, conversationId: event.conversationId, eventId: event.eventId, direction: event.direction, occurredAt: event.occurredAt, ...(event.contentReference ? { contentReference: event.contentReference } : {}), ...(event.contentHash ? { contentHash: event.contentHash } : {}), ...(event.redactedExcerpt ? { redactedExcerpt: event.redactedExcerpt } : {}), evidenceRefs: event.evidenceRefs });
    const intent = detectConversationIntent(event); await this.store.saveIntent(context, intent);
    const contactability = assessContactability({ tenantId: context.tenantId, channel: event.channel, purpose: 'SALES', status: event.consentStatus, source: 'CONVERSATION_INGRESS', evidenceRefs: event.evidenceRefs });
    await this.store.saveRecommendation(context, recommendResponse(thread, intent, contactability));
    return event;
  }
  listConversations(context: TenantContext) { return this.store.listConversations(context); }
  async getConversation(context: TenantContext, id: string) { const item = await this.store.getConversation(context, id); if (!item) throw new Error('CONVERSATION_NOT_FOUND'); return item; }
  intents(context: TenantContext, id: string) { return this.store.listIntents(context, id); }
  turns(context: TenantContext, id: string) { return this.store.listTurns(context, id); }
  async signals(context: TenantContext, id: string) { return (await this.store.listIntents(context, id)).flatMap(deriveBuyingSignals); }
  async summary(context: TenantContext, id: string) {
    const intents = await this.store.listIntents(context, id);
    const primary = intents[0];
    return {
      conversationId: id,
      primaryIntent: primary?.primary ?? 'UNKNOWN',
      secondaryIntents: primary?.secondary ?? [],
      evidenceRefs: primary?.evidenceRefs ?? [],
      unknowns: primary ? [] : ['NO_PERSISTED_INTENT_EVIDENCE'],
      limitations: ['STRUCTURED_FACTS_ONLY_NO_GENERATED_PROSE'],
    };
  }
  recommendations(context: TenantContext, id: string) { return this.store.listRecommendations(context, id); }
  diagnostics(context: TenantContext, id: string) { return this.store.listDiagnostics(context, id); }
  handoffs(context: TenantContext) { return this.store.listHandoffs(context); }
  followUps(context: TenantContext) { return this.store.listFollowUps(context); }
  async analytics(context: TenantContext) { const conversations = await this.store.listConversations(context); return { tenantId: context.tenantId, conversationCount: conversations.length, activeConversations: conversations.filter((item) => item.state === 'ACTIVE' || item.state === 'WAITING_AGENT').length, limitations: ['DENOMINATOR_DEPENDENT_RATES_ARE_UNKNOWN_UNTIL_COMPLETE_DATA_EXISTS'] }; }
  async startSession(context: TenantContext, input: { sessionId: string; conversationId: string; profileId: string }) { await this.getConversation(context, input.conversationId); const existing = await this.store.getSession(context, input.sessionId); if (existing) return existing; const createdAt = new Date().toISOString(); const session: AIReceptionistSession = { sessionId: input.sessionId, tenantId: context.tenantId, conversationId: input.conversationId, profileId: input.profileId, state: 'NEW', createdAt, updatedAt: createdAt }; return this.store.saveSession(context, session); }
  async getSession(context: TenantContext, id: string) { const item = await this.store.getSession(context, id); if (!item) throw new Error('RECEPTIONIST_SESSION_NOT_FOUND'); return item; }
  async ingestSessionEvent(context: TenantContext, sessionId: string, input: ConversationIngressEvent) {
    const session = await this.getSession(context, sessionId);
    const normalized = normalizeConversationIngress(context, input);
    if (normalized.conversationId !== session.conversationId) throw new Error('RECEPTIONIST_SESSION_CONVERSATION_MISMATCH');
    return this.ingest(context, input);
  }
  sessionRecommendations(context: TenantContext, id: string) { return this.getSession(context, id).then((session) => this.store.listRecommendations(context, session.conversationId)); }
  sessionHandoff(context: TenantContext, id: string) { return this.getSession(context, id).then((session) => this.store.listHandoffs(context).then((items) => items.filter((item) => item.sessionId === session.sessionId))); }
}
