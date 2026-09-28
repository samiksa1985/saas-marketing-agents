import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import {
  assessBuyingIntent,
  assessLeadQualification,
  calculateCampaignRevenueMetrics,
  createLeadRecord,
  createPersonIdentity,
  diagnoseAcquisitionRevenue,
  linkLeadIdentity,
  quarantineMalformedLead,
  recommendLeadRouting,
  resolveIdentity,
  type CRMProviderCapabilities,
  type CustomerAcquisitionRevenueStore,
  type LeadCaptureInput,
  type LeadCaptureQuarantine,
  type LeadRecord,
} from '@platform/marketing-os-core';
import { PersistentCustomerAcquisitionRevenueStore, type MarketingOSPersistenceDatabase } from '@platform/marketing-os-persistence';

import { ApiTenantDatabase } from './tenant-database.js';

type CustomerAcquisitionRevenueTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;
export const CUSTOMER_ACQUISITION_REVENUE_APPLICATION_SERVICE = 'PLATFORM_CUSTOMER_ACQUISITION_REVENUE_APPLICATION_SERVICE';
export type LeadCaptureResult = { status: 'CAPTURED'; lead: LeadRecord; identityResolution: string } | LeadCaptureQuarantine;

class ApiTenantCustomerAcquisitionRevenueStore<TTransaction extends CustomerAcquisitionRevenueTransaction> implements CustomerAcquisitionRevenueStore {
  constructor(private readonly tenantDatabase: ApiTenantDatabase<TTransaction>) {}
  private use<T>(context: TenantContext, operation: (store: PersistentCustomerAcquisitionRevenueStore) => Promise<T>) { return this.tenantDatabase.execute(context, (transaction) => operation(new PersistentCustomerAcquisitionRevenueStore(transaction))); }
  findLeadByIdempotencyKey(context: TenantContext, value: string) { return this.use(context, (store) => store.findLeadByIdempotencyKey(context, value)); }
  saveLead(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveLead']>[1], key: string) { return this.use(context, (store) => store.saveLead(context, value, key)); }
  saveLeadQuarantine(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveLeadQuarantine']>[1]) { return this.use(context, (store) => store.saveLeadQuarantine(context, value)); }
  getLead(context: TenantContext, value: string) { return this.use(context, (store) => store.getLead(context, value)); }
  listLeads(context: TenantContext) { return this.use(context, (store) => store.listLeads(context)); }
  findIdentities(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['findIdentities']>[1]) { return this.use(context, (store) => store.findIdentities(context, value)); }
  getIdentity(context: TenantContext, value: string) { return this.use(context, (store) => store.getIdentity(context, value)); }
  saveIdentity(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveIdentity']>[1]) { return this.use(context, (store) => store.saveIdentity(context, value)); }
  saveIdentityEdge(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveIdentityEdge']>[1]) { return this.use(context, (store) => store.saveIdentityEdge(context, value)); }
  listIdentityEdges(context: TenantContext, value: string) { return this.use(context, (store) => store.listIdentityEdges(context, value)); }
  saveIdentityAlias(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveIdentityAlias']>[1]) { return this.use(context, (store) => store.saveIdentityAlias(context, value)); }
  listIdentityAliases(context: TenantContext, value: string) { return this.use(context, (store) => store.listIdentityAliases(context, value)); }
  saveLeadIdentityLink(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveLeadIdentityLink']>[1]) { return this.use(context, (store) => store.saveLeadIdentityLink(context, value)); }
  listLeadIdentityLinks(context: TenantContext, value: string) { return this.use(context, (store) => store.listLeadIdentityLinks(context, value)); }
  saveSignal(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveSignal']>[1]) { return this.use(context, (store) => store.saveSignal(context, value)); }
  listSignals(context: TenantContext, value: string) { return this.use(context, (store) => store.listSignals(context, value)); }
  saveConversationThread(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveConversationThread']>[1]) { return this.use(context, (store) => store.saveConversationThread(context, value)); }
  listConversationThreads(context: TenantContext) { return this.use(context, (store) => store.listConversationThreads(context)); }
  saveConversationParticipant(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveConversationParticipant']>[1]) { return this.use(context, (store) => store.saveConversationParticipant(context, value)); }
  listConversationParticipants(context: TenantContext, value: string) { return this.use(context, (store) => store.listConversationParticipants(context, value)); }
  saveQualification(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveQualification']>[1]) { return this.use(context, (store) => store.saveQualification(context, value)); }
  getQualification(context: TenantContext, value: string) { return this.use(context, (store) => store.getQualification(context, value)); }
  saveOpportunity(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveOpportunity']>[1]) { return this.use(context, (store) => store.saveOpportunity(context, value)); }
  getOpportunity(context: TenantContext, value: string) { return this.use(context, (store) => store.getOpportunity(context, value)); }
  listOpportunities(context: TenantContext) { return this.use(context, (store) => store.listOpportunities(context)); }
  saveRevenueEvent(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveRevenueEvent']>[1]) { return this.use(context, (store) => store.saveRevenueEvent(context, value)); }
  listRevenueEvents(context: TenantContext) { return this.use(context, (store) => store.listRevenueEvents(context)); }
  saveAttribution(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveAttribution']>[1]) { return this.use(context, (store) => store.saveAttribution(context, value)); }
  listAttribution(context: TenantContext) { return this.use(context, (store) => store.listAttribution(context)); }
  saveFunnelTransition(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveFunnelTransition']>[1]) { return this.use(context, (store) => store.saveFunnelTransition(context, value)); }
  listFunnelTransitions(context: TenantContext) { return this.use(context, (store) => store.listFunnelTransitions(context)); }
  saveDiagnostic(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveDiagnostic']>[1]) { return this.use(context, (store) => store.saveDiagnostic(context, value)); }
  listDiagnostics(context: TenantContext) { return this.use(context, (store) => store.listDiagnostics(context)); }
  saveRoutingRecommendation(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveRoutingRecommendation']>[1]) { return this.use(context, (store) => store.saveRoutingRecommendation(context, value)); }
  listRoutingRecommendations(context: TenantContext) { return this.use(context, (store) => store.listRoutingRecommendations(context)); }
  saveDataQualityAssessment(context: TenantContext, value: Parameters<CustomerAcquisitionRevenueStore['saveDataQualityAssessment']>[1]) { return this.use(context, (store) => store.saveDataQualityAssessment(context, value)); }
  listDataQualityAssessments(context: TenantContext) { return this.use(context, (store) => store.listDataQualityAssessments(context)); }
  saveProviderCapabilities(context: TenantContext, value: CRMProviderCapabilities) { return this.use(context, (store) => store.saveProviderCapabilities(context, value)); }
  listProviderCapabilities(context: TenantContext) { return this.use(context, (store) => store.listProviderCapabilities(context)); }
}

/** API façade for first-party acquisition intelligence. It owns no CRM SDK, provider transport, or mutation authority. */
export class CustomerAcquisitionRevenueApplicationService<TTransaction extends CustomerAcquisitionRevenueTransaction> {
  private readonly store: CustomerAcquisitionRevenueStore;
  constructor(tenantDatabase: ApiTenantDatabase<TTransaction>) { this.store = new ApiTenantCustomerAcquisitionRevenueStore(tenantDatabase); }

  async captureLead(context: TenantContext, input: LeadCaptureInput): Promise<LeadCaptureResult> {
    const existing = await this.store.findLeadByIdempotencyKey(context, input.idempotencyKey);
    if (existing) return { status: 'CAPTURED', lead: existing, identityResolution: 'IDEMPOTENT_REPLAY' };
    let lead: LeadRecord;
    try { lead = createLeadRecord(context, input); } catch (error) { const quarantine = quarantineMalformedLead(context, input, error); await this.store.saveLeadQuarantine(context, quarantine); return quarantine; }
    await this.store.saveLead(context, lead, input.idempotencyKey);
    const candidates = await this.store.findIdentities(context, lead.externalLeadIds.length || lead.email || lead.phone ? createPersonIdentity(context, lead, []).identifiers : []);
    const resolution = resolveIdentity(lead, candidates);
    if (resolution.identity && ['EXACT_MATCH', 'NORMALIZED_MATCH', 'STRONG_MATCH'].includes(resolution.resolution)) await this.store.saveLeadIdentityLink(context, linkLeadIdentity(context, lead, resolution));
    if (resolution.resolution === 'NO_MATCH') {
      const identity = createPersonIdentity(context, lead, lead.evidenceRefs);
      await this.store.saveIdentity(context, identity);
      await this.store.saveLeadIdentityLink(context, { linkId: `${identity.identityId}:lead`, tenantId: context.tenantId, leadId: lead.leadId, identityId: identity.identityId, resolution: 'EXACT_MATCH', reason: 'FIRST_PARTY_LEAD_IDENTITY_CREATED', confidence: 1, evidenceRefs: lead.evidenceRefs, resolverVersion: 'IDENTITY_RESOLUTION_V1', createdAt: lead.createdAt });
    }
    return { status: 'CAPTURED', lead, identityResolution: resolution.resolution };
  }
  async getLead(context: TenantContext, leadId: string) { const lead = await this.store.getLead(context, leadId); if (!lead) throw new Error('LEAD_NOT_FOUND'); return lead; }
  listLeads(context: TenantContext) { return this.store.listLeads(context); }
  async qualification(context: TenantContext, leadId: string) { const lead = await this.getLead(context, leadId); const existing = await this.store.getQualification(context, leadId); if (existing) return existing; const assessment = assessLeadQualification(lead, await this.store.listSignals(context, leadId)); return this.store.saveQualification(context, assessment); }
  async identity(context: TenantContext, leadId: string) { await this.getLead(context, leadId); return this.store.listLeadIdentityLinks(context, leadId); }
  async engagement(context: TenantContext, leadId: string) { await this.getLead(context, leadId); return this.store.listSignals(context, leadId); }
  async getIdentity(context: TenantContext, identityId: string) { const identity = await this.store.getIdentity(context, identityId); if (!identity) throw new Error('CUSTOMER_IDENTITY_NOT_FOUND'); return identity; }
  listOpportunities(context: TenantContext) { return this.store.listOpportunities(context); }
  async getOpportunity(context: TenantContext, opportunityId: string) { const opportunity = await this.store.getOpportunity(context, opportunityId); if (!opportunity) throw new Error('OPPORTUNITY_NOT_FOUND'); return opportunity; }
  listRevenueEvents(context: TenantContext) { return this.store.listRevenueEvents(context); }
  listRevenueAttribution(context: TenantContext) { return this.store.listAttribution(context); }
  listFunnel(context: TenantContext) { return this.store.listFunnelTransitions(context); }
  async revenueIntelligence(context: TenantContext) {
    const [leads, qualifications, opportunities, events, attributions] = await Promise.all([this.store.listLeads(context), Promise.all((await this.store.listLeads(context)).map((lead) => this.store.getQualification(context, lead.leadId))), this.store.listOpportunities(context), this.store.listRevenueEvents(context), this.store.listAttribution(context)]);
    const campaignIds = [...new Set(leads.flatMap((lead) => [lead.sourceCampaignId, lead.unifiedCampaignId]).filter((value): value is string => Boolean(value)))];
    return campaignIds.map((campaignId) => calculateCampaignRevenueMetrics({ campaignId, leads, qualifications: qualifications.filter((item): item is NonNullable<typeof item> => Boolean(item)), opportunities, revenueEvents: events, attributions }));
  }
  async diagnostics(context: TenantContext) { const [metrics, leads, opportunities] = await Promise.all([this.revenueIntelligence(context), this.store.listLeads(context), this.store.listOpportunities(context)]); return metrics.flatMap((item) => diagnoseAcquisitionRevenue({ tenantId: context.tenantId, metrics: item, leads, opportunities })); }
  async routingRecommendations(context: TenantContext) { const leads = await this.store.listLeads(context); return Promise.all(leads.map(async (lead) => { const qualification = await this.qualification(context, lead.leadId); const intent = assessBuyingIntent(lead, await this.store.listSignals(context, lead.leadId)); return this.store.saveRoutingRecommendation(context, recommendLeadRouting(lead, qualification, intent)); })); }
}
