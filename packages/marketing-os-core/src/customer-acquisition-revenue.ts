import { createHash } from 'node:crypto';

import type { TenantContext } from '@platform/contracts';

/** Provider-neutral evidence pointer. It must not contain message content or credentials. */
export interface AcquisitionEvidenceReference {
  id: string;
  source: string;
  summary: string;
  observedAt?: string;
}

export type LeadStatus = 'NEW' | 'ENGAGED' | 'QUALIFIED' | 'DISQUALIFIED' | 'CONVERTED' | 'LOST' | 'UNKNOWN';
export type ConsentState = 'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT' | 'RESTRICTED';
export type IdentityResolutionKind = 'EXACT_MATCH' | 'NORMALIZED_MATCH' | 'STRONG_MATCH' | 'POSSIBLE_MATCH' | 'NO_MATCH' | 'CONFLICT';
export type LeadQualificationGrade = 'HOT' | 'WARM' | 'COOL' | 'UNQUALIFIED' | 'INSUFFICIENT_DATA';
export type BuyingIntentLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export interface LeadRecord {
  leadId: string;
  tenantId: string;
  externalLeadIds: string[];
  source: string;
  sourceProvider?: string;
  sourceCampaignId?: string;
  unifiedCampaignId?: string;
  channel?: string;
  capturedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: LeadStatus;
  lifecycleStage: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  language?: string;
  preferredLanguage?: string;
  sourceMetadata: Record<string, unknown>;
  consentState: ConsentState;
  consentEvidenceRefs: AcquisitionEvidenceReference[];
  evidenceRefs: AcquisitionEvidenceReference[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeadCaptureInput extends Omit<Partial<LeadRecord>, 'leadId' | 'tenantId' | 'createdAt' | 'updatedAt' | 'firstSeenAt' | 'lastSeenAt' | 'externalLeadIds' | 'sourceMetadata' | 'consentEvidenceRefs' | 'evidenceRefs'> {
  idempotencyKey: string;
  source: string;
  capturedAt: string;
  externalLeadIds?: string[];
  sourceMetadata?: Record<string, unknown>;
  consentEvidenceRefs?: AcquisitionEvidenceReference[];
  evidenceRefs?: AcquisitionEvidenceReference[];
}

export interface LeadCaptureQuarantine {
  quarantineId: string;
  tenantId: string;
  status: 'QUARANTINED';
  code: 'LEAD_CAPTURE_MALFORMED' | 'LEAD_CAPTURE_INSUFFICIENT_IDENTITY';
  idempotencyKey: string;
  reason: string;
  capturedAt: string;
}

export interface PersonIdentity {
  identityId: string;
  tenantId: string;
  type: 'PERSON' | 'ORGANIZATION';
  displayName?: string;
  identifiers: IdentityIdentifier[];
  aliases: string[];
  evidenceRefs: AcquisitionEvidenceReference[];
  createdAt: string;
  updatedAt: string;
}

export type IdentityIdentifierType = 'EMAIL' | 'PHONE' | 'CRM_CONTACT_ID' | 'LEAD_ID' | 'CONVERSATION_PARTICIPANT_ID' | 'ANONYMOUS_SESSION_ID' | 'PROVIDER_EXTERNAL_ID';
export interface IdentityIdentifier {
  type: IdentityIdentifierType;
  value: string;
  normalizedValue: string;
  source?: string;
}

export interface IdentityEdge {
  edgeId: string;
  tenantId: string;
  fromIdentityId: string;
  toIdentityId: string;
  resolution: IdentityResolutionKind;
  reason: string;
  confidence: number;
  evidenceRefs: AcquisitionEvidenceReference[];
  resolverVersion: string;
  createdAt: string;
}

export interface IdentityAlias {
  aliasId: string;
  tenantId: string;
  identityId: string;
  alias: string;
  reason: string;
  evidenceRefs: AcquisitionEvidenceReference[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadIdentityLink {
  linkId: string;
  tenantId: string;
  leadId: string;
  identityId: string;
  resolution: IdentityResolutionKind;
  reason: string;
  confidence: number;
  evidenceRefs: AcquisitionEvidenceReference[];
  resolverVersion: string;
  createdAt: string;
}

export interface IdentityResolution {
  resolution: IdentityResolutionKind;
  identity?: PersonIdentity;
  reason: string;
  confidence: number;
  matchedIdentifiers: IdentityIdentifier[];
}

export type ConversationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'WEB_CHAT' | 'VOICE' | 'SOCIAL_DM' | 'OTHER';
export interface ConversationThread {
  threadId: string;
  tenantId: string;
  channel: ConversationChannel;
  externalThreadId?: string;
  participantIdentityIds: string[];
  startedAt: string;
  lastMessageAt?: string;
  evidenceRefs: AcquisitionEvidenceReference[];
}
export interface ConversationParticipant {
  participantId: string;
  tenantId: string;
  threadId: string;
  identityId?: string;
  externalParticipantId?: string;
  role: 'LEAD' | 'AGENT' | 'SYSTEM' | 'UNKNOWN';
}
export interface ConversationMessageMetadata {
  messageId: string;
  tenantId: string;
  threadId: string;
  channel: ConversationChannel;
  occurredAt: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'UNKNOWN';
  evidenceRefs: AcquisitionEvidenceReference[];
}

export type EngagementSignalType = 'REPLIED' | 'OPENED' | 'CLICKED' | 'MEETING_BOOKED' | 'INBOUND_CONVERSATION' | 'REQUESTED_PRICING' | 'REQUESTED_DEMO' | 'SUBMITTED_FORM' | 'HIGH_INTENT_EVENT' | 'NO_RESPONSE' | 'UNSUBSCRIBED';
export interface ConversationEngagementSignal {
  signalId: string;
  tenantId: string;
  leadId: string;
  type: EngagementSignalType;
  channel?: ConversationChannel;
  source: string;
  occurredAt: string;
  confidence: number;
  evidenceRefs: AcquisitionEvidenceReference[];
}

export interface LeadQualificationAssessment {
  assessmentId: string;
  tenantId: string;
  leadId: string;
  score: number;
  grade: LeadQualificationGrade;
  status: 'QUALIFIED' | 'NOT_QUALIFIED' | 'INSUFFICIENT_DATA';
  reasonCodes: string[];
  positiveSignals: EngagementSignalType[];
  negativeSignals: EngagementSignalType[];
  missingSignals: string[];
  confidence: number;
  evidenceRefs: AcquisitionEvidenceReference[];
  ruleVersion: 'QUALIFICATION_V1';
  assessedAt: string;
}

export interface BuyingIntentAssessment {
  assessmentId: string;
  tenantId: string;
  leadId: string;
  level: BuyingIntentLevel;
  reasonCodes: string[];
  confidence: number;
  evidenceRefs: AcquisitionEvidenceReference[];
  ruleVersion: 'BUYING_INTENT_V1';
  assessedAt: string;
}

export type CRMProviderName = 'NAWA_NATIVE' | 'VENDasta' | 'HUBSPOT' | 'SALESFORCE' | 'DYNAMICS_365' | 'CUSTOM';
export type CustomerGrowthCapability = 'CRM' | 'LEAD_MANAGEMENT' | 'CONVERSATIONS' | 'AI_RECEPTIONIST' | 'REPUTATION_REVIEWS' | 'LOCAL_PRESENCE' | 'MULTI_LOCATION_GROWTH';
export interface CRMProviderCapabilities {
  provider: CRMProviderName;
  tenantId: string;
  capabilities: CustomerGrowthCapability[];
  enabled: boolean;
  credentialHealthReference?: string;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';
  supportedOperations: Array<'UPSERT_LEAD_CONTACT' | 'READ_CONTACT' | 'READ_COMPANY' | 'UPSERT_OPPORTUNITY' | 'READ_OPPORTUNITY' | 'READ_OPPORTUNITY_STAGE' | 'READ_REVENUE' | 'ATTACH_EVIDENCE'>;
  read: boolean;
  write: boolean;
}
/** This contract deliberately exposes only capabilities, not CRM provider DTOs or credentials. */
export interface CRMProvider {
  readonly capabilities: CRMProviderCapabilities;
  upsertLeadContact?(context: TenantContext, lead: LeadRecord): Promise<{ externalContactId: string }>;
  readContact?(context: TenantContext, externalContactId: string): Promise<unknown>;
  readCompany?(context: TenantContext, externalCompanyId: string): Promise<unknown>;
  upsertOpportunity?(context: TenantContext, opportunity: RevenueOpportunity): Promise<{ externalOpportunityId: string }>;
  readOpportunity?(context: TenantContext, externalOpportunityId: string): Promise<unknown>;
  readOpportunityStage?(context: TenantContext, externalOpportunityId: string): Promise<unknown>;
  readRevenue?(context: TenantContext, externalOpportunityId: string): Promise<unknown>;
  attachEvidenceReference?(context: TenantContext, externalEntityId: string, evidence: AcquisitionEvidenceReference): Promise<void>;
}

export type OpportunityStage = 'PROSPECTING' | 'QUALIFICATION' | 'DISCOVERY' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST' | 'UNKNOWN';
export interface RevenueOpportunity {
  opportunityId: string;
  tenantId: string;
  externalOpportunityId?: string;
  provider: CRMProviderName;
  accountId?: string;
  primaryContactId?: string;
  linkedLeadIds: string[];
  name: string;
  stage: OpportunityStage;
  rawProviderStage?: string;
  status: 'OPEN' | 'WON' | 'LOST' | 'UNKNOWN';
  amountMinor?: number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  sourceCampaignIds: string[];
  evidenceRefs: AcquisitionEvidenceReference[];
}

export type RevenueEventType = 'OPPORTUNITY_CREATED' | 'OPPORTUNITY_ADVANCED' | 'OPPORTUNITY_WON' | 'OPPORTUNITY_LOST' | 'BOOKED_REVENUE' | 'INVOICE_CREATED' | 'PAYMENT_RECEIVED' | 'REFUND' | 'RENEWAL' | 'EXPANSION';
export interface RevenueEvent {
  eventId: string;
  tenantId: string;
  opportunityId?: string;
  customerId?: string;
  type: RevenueEventType;
  amountMinor?: number;
  currency?: string;
  occurredAt: string;
  sourceProvider?: CRMProviderName;
  externalEventId?: string;
  idempotencyKey: string;
  evidenceRefs: AcquisitionEvidenceReference[];
  verificationState: 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN' | 'MISMATCH';
}

export type FunnelStage = 'IMPRESSION' | 'CLICK' | 'VISITOR' | 'LEAD' | 'ENGAGED_LEAD' | 'QUALIFIED_LEAD' | 'OPPORTUNITY' | 'CLOSED_WON' | 'REVENUE';
export interface FunnelTransition {
  transitionId: string;
  tenantId: string;
  leadId?: string;
  opportunityId?: string;
  fromStage?: FunnelStage;
  toStage: FunnelStage;
  occurredAt: string;
  sourceCampaignId?: string;
  evidenceRefs: AcquisitionEvidenceReference[];
}

export interface RevenueAttributionAssessment {
  assessmentId: string;
  tenantId: string;
  revenueEventId: string;
  opportunityId?: string;
  model: 'LEAD_SOURCE' | 'FIRST_TOUCH' | 'LAST_TOUCH' | 'OPPORTUNITY_SOURCE' | 'CAMPAIGN_ASSISTED' | 'UNATTRIBUTED';
  sourceCampaignIds: string[];
  confidence: number;
  evidenceRefs: AcquisitionEvidenceReference[];
  limitations: string[];
  assessedAt: string;
}

export interface CampaignRevenueMetrics {
  campaignId: string;
  currency: string | 'UNKNOWN';
  leads: number;
  qualifiedLeads: number;
  opportunities: number;
  closedWonRevenueMinor: number | 'UNKNOWN';
  pipelineValueMinor: number | 'UNKNOWN';
  cplMinor: number | 'UNKNOWN';
  cpqlMinor: number | 'UNKNOWN';
  costPerOpportunityMinor: number | 'UNKNOWN';
  cacMinor: number | 'UNKNOWN';
  roas: number | 'UNKNOWN';
  reasons: string[];
}

export interface AcquisitionRevenueDiagnostic {
  diagnosticId: string;
  tenantId: string;
  type: 'HIGH_LEAD_LOW_QUALITY' | 'HIGH_CPL' | 'HIGH_CPQL' | 'LOW_OPPORTUNITY_CONVERSION' | 'OPPORTUNITY_STUCK' | 'LONG_SALES_CYCLE' | 'HIGH_LOSS_RATE' | 'LEADS_WITHOUT_PIPELINE' | 'PIPELINE_WITHOUT_REVENUE' | 'LOW_QUALITY_TRAFFIC' | 'CRM_DATA_STALE' | 'MISSING_LEAD_OWNERSHIP' | 'MISSING_ATTRIBUTION' | 'DUPLICATE_LEADS' | 'IDENTITY_CONFLICT' | 'DATA_QUALITY';
  severity: 'INFO' | 'WARNING' | 'HIGH';
  reasonCodes: string[];
  evidenceRefs: AcquisitionEvidenceReference[];
  generatedAt: string;
}

export interface AcquisitionDataQualityAssessment {
  assessmentId: string;
  tenantId: string;
  subjectType: 'LEAD' | 'IDENTITY' | 'OPPORTUNITY' | 'REVENUE_EVENT' | 'ATTRIBUTION';
  subjectId: string;
  reasonCodes: string[];
  assessedAt: string;
}

export interface LeadRoutingRecommendation {
  recommendationId: string;
  tenantId: string;
  leadId: string;
  kind: 'ASSIGN_TO_SALES_QUEUE' | 'PRIORITIZE_LEAD' | 'REQUEST_HUMAN_REVIEW' | 'REQUEST_MORE_INFORMATION' | 'NURTURE' | 'DISQUALIFY_RECOMMENDATION' | 'ESCALATE_HOT_LEAD';
  reasonCodes: string[];
  confidence: number;
  evidenceRefs: AcquisitionEvidenceReference[];
  createdAt: string;
  /** Recommendation-only: it is never an assignment or message command. */
  actionState: 'RECOMMENDATION_ONLY';
}

export interface CustomerAcquisitionRevenueStore {
  findLeadByIdempotencyKey(context: TenantContext, idempotencyKey: string): Promise<LeadRecord | undefined>;
  saveLead(context: TenantContext, lead: LeadRecord, idempotencyKey: string): Promise<LeadRecord>;
  saveLeadQuarantine(context: TenantContext, quarantine: LeadCaptureQuarantine): Promise<LeadCaptureQuarantine>;
  getLead(context: TenantContext, leadId: string): Promise<LeadRecord | undefined>;
  listLeads(context: TenantContext): Promise<LeadRecord[]>;
  findIdentities(context: TenantContext, identifiers: IdentityIdentifier[]): Promise<PersonIdentity[]>;
  getIdentity(context: TenantContext, identityId: string): Promise<PersonIdentity | undefined>;
  saveIdentity(context: TenantContext, identity: PersonIdentity): Promise<PersonIdentity>;
  saveIdentityEdge(context: TenantContext, edge: IdentityEdge): Promise<IdentityEdge>;
  listIdentityEdges(context: TenantContext, identityId: string): Promise<IdentityEdge[]>;
  saveIdentityAlias(context: TenantContext, alias: IdentityAlias): Promise<IdentityAlias>;
  listIdentityAliases(context: TenantContext, identityId: string): Promise<IdentityAlias[]>;
  saveLeadIdentityLink(context: TenantContext, link: LeadIdentityLink): Promise<LeadIdentityLink>;
  listLeadIdentityLinks(context: TenantContext, leadId: string): Promise<LeadIdentityLink[]>;
  saveSignal(context: TenantContext, signal: ConversationEngagementSignal): Promise<ConversationEngagementSignal>;
  listSignals(context: TenantContext, leadId: string): Promise<ConversationEngagementSignal[]>;
  saveConversationThread(context: TenantContext, thread: ConversationThread): Promise<ConversationThread>;
  listConversationThreads(context: TenantContext): Promise<ConversationThread[]>;
  saveConversationParticipant(context: TenantContext, participant: ConversationParticipant): Promise<ConversationParticipant>;
  listConversationParticipants(context: TenantContext, threadId: string): Promise<ConversationParticipant[]>;
  saveQualification(context: TenantContext, assessment: LeadQualificationAssessment): Promise<LeadQualificationAssessment>;
  getQualification(context: TenantContext, leadId: string): Promise<LeadQualificationAssessment | undefined>;
  saveOpportunity(context: TenantContext, opportunity: RevenueOpportunity): Promise<RevenueOpportunity>;
  getOpportunity(context: TenantContext, opportunityId: string): Promise<RevenueOpportunity | undefined>;
  listOpportunities(context: TenantContext): Promise<RevenueOpportunity[]>;
  saveRevenueEvent(context: TenantContext, event: RevenueEvent): Promise<RevenueEvent>;
  listRevenueEvents(context: TenantContext): Promise<RevenueEvent[]>;
  saveAttribution(context: TenantContext, assessment: RevenueAttributionAssessment): Promise<RevenueAttributionAssessment>;
  listAttribution(context: TenantContext): Promise<RevenueAttributionAssessment[]>;
  saveFunnelTransition(context: TenantContext, transition: FunnelTransition): Promise<FunnelTransition>;
  listFunnelTransitions(context: TenantContext): Promise<FunnelTransition[]>;
  saveDiagnostic(context: TenantContext, diagnostic: AcquisitionRevenueDiagnostic): Promise<AcquisitionRevenueDiagnostic>;
  listDiagnostics(context: TenantContext): Promise<AcquisitionRevenueDiagnostic[]>;
  saveRoutingRecommendation(context: TenantContext, recommendation: LeadRoutingRecommendation): Promise<LeadRoutingRecommendation>;
  listRoutingRecommendations(context: TenantContext): Promise<LeadRoutingRecommendation[]>;
  saveDataQualityAssessment(context: TenantContext, assessment: AcquisitionDataQualityAssessment): Promise<AcquisitionDataQualityAssessment>;
  listDataQualityAssessments(context: TenantContext): Promise<AcquisitionDataQualityAssessment[]>;
  saveProviderCapabilities(context: TenantContext, capabilities: CRMProviderCapabilities): Promise<CRMProviderCapabilities>;
  listProviderCapabilities(context: TenantContext): Promise<CRMProviderCapabilities[]>;
}

export class CustomerAcquisitionRevenueError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'CustomerAcquisitionRevenueError'; }
}

export function normalizeEmail(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new CustomerAcquisitionRevenueError('LEAD_EMAIL_INVALID');
  return normalized;
}

/** Supports Saudi/GCC E.164 input and local Saudi formats without assuming a Western name shape. */
export function normalizePhone(value: string | undefined, country?: string): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  let compact = value.trim().replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  if (compact.startsWith('05') && (country?.toUpperCase() === 'SA' || country?.toUpperCase() === 'SAUDI_ARABIA')) compact = `+966${compact.slice(1)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) throw new CustomerAcquisitionRevenueError('LEAD_PHONE_INVALID');
  return compact;
}

export function canonicalLeadIdentifiers(lead: Pick<LeadRecord, 'email' | 'phone' | 'externalLeadIds' | 'leadId'>): IdentityIdentifier[] {
  const identifiers: IdentityIdentifier[] = [{ type: 'LEAD_ID', value: lead.leadId, normalizedValue: lead.leadId }];
  const email = normalizeEmail(lead.email);
  const phone = normalizePhone(lead.phone);
  if (email) identifiers.push({ type: 'EMAIL', value: email, normalizedValue: email });
  if (phone) identifiers.push({ type: 'PHONE', value: phone, normalizedValue: phone });
  for (const externalId of lead.externalLeadIds) if (externalId.trim()) identifiers.push({ type: 'PROVIDER_EXTERNAL_ID', value: externalId, normalizedValue: externalId.trim() });
  return identifiers;
}

export function createLeadRecord(context: TenantContext, input: LeadCaptureInput, now: () => string = () => new Date().toISOString()): LeadRecord {
  assertContext(context);
  if (!input.idempotencyKey.trim() || !input.source.trim()) throw new CustomerAcquisitionRevenueError('LEAD_CAPTURE_MALFORMED');
  if (!isTime(input.capturedAt)) throw new CustomerAcquisitionRevenueError('LEAD_CAPTURE_MALFORMED');
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone, input.country);
  const externalLeadIds = uniqueStrings(input.externalLeadIds ?? []);
  if (!email && !phone && externalLeadIds.length === 0) throw new CustomerAcquisitionRevenueError('LEAD_CAPTURE_INSUFFICIENT_IDENTITY');
  const timestamp = now();
  return {
    leadId: deterministicId('lead', [context.tenantId, input.idempotencyKey]), tenantId: context.tenantId,
    externalLeadIds, source: input.source, ...(input.sourceProvider ? { sourceProvider: input.sourceProvider } : {}),
    ...(input.sourceCampaignId ? { sourceCampaignId: input.sourceCampaignId } : {}), ...(input.unifiedCampaignId ? { unifiedCampaignId: input.unifiedCampaignId } : {}),
    ...(input.channel ? { channel: input.channel } : {}), capturedAt: input.capturedAt, firstSeenAt: timestamp, lastSeenAt: timestamp,
    status: input.status ?? 'NEW', lifecycleStage: input.lifecycleStage ?? 'LEAD', ...(input.firstName ? { firstName: input.firstName.trim() } : {}),
    ...(input.lastName ? { lastName: input.lastName.trim() } : {}), ...(input.company ? { company: input.company.trim() } : {}), ...(input.jobTitle ? { jobTitle: input.jobTitle.trim() } : {}),
    ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(input.country ? { country: input.country } : {}), ...(input.city ? { city: input.city } : {}),
    ...(input.language ? { language: input.language } : {}), ...(input.preferredLanguage ? { preferredLanguage: input.preferredLanguage } : {}),
    sourceMetadata: copy(input.sourceMetadata ?? {}), consentState: input.consentState ?? 'UNKNOWN', consentEvidenceRefs: copy(input.consentEvidenceRefs ?? []),
    evidenceRefs: copy(input.evidenceRefs ?? []), confidence: bounded(input.confidence ?? 0.5), createdAt: timestamp, updatedAt: timestamp,
  };
}

export function quarantineMalformedLead(context: TenantContext, input: Pick<LeadCaptureInput, 'idempotencyKey'>, error: unknown, now: () => string = () => new Date().toISOString()): LeadCaptureQuarantine {
  assertContext(context);
  const code = error instanceof CustomerAcquisitionRevenueError && error.code === 'LEAD_CAPTURE_INSUFFICIENT_IDENTITY' ? error.code : 'LEAD_CAPTURE_MALFORMED';
  return { quarantineId: deterministicId('lead-quarantine', [context.tenantId, input.idempotencyKey]), tenantId: context.tenantId, status: 'QUARANTINED', code, idempotencyKey: input.idempotencyKey, reason: code, capturedAt: now() };
}

export function resolveIdentity(lead: LeadRecord, candidates: readonly PersonIdentity[]): IdentityResolution {
  const identifiers = canonicalLeadIdentifiers(lead);
  const exact = candidates.filter((candidate) => candidate.identifiers.some((item) => identifiers.some((expected) => item.type === expected.type && item.normalizedValue === expected.normalizedValue)));
  if (exact.length === 1) return { resolution: 'EXACT_MATCH', identity: copy(exact[0]!), reason: 'EXACT_IDENTIFIER_MATCH', confidence: 1, matchedIdentifiers: matchingIdentifiers(identifiers, exact[0]!) };
  if (exact.length > 1) return { resolution: 'CONFLICT', reason: 'MULTIPLE_EXACT_IDENTITY_CANDIDATES', confidence: 0, matchedIdentifiers: [] };
  const email = identifiers.find((item) => item.type === 'EMAIL');
  const phone = identifiers.find((item) => item.type === 'PHONE');
  const strong = candidates.filter((candidate) => Boolean(email) && Boolean(phone) && hasIdentifier(candidate, email!) && hasIdentifier(candidate, phone!));
  if (strong.length === 1) return { resolution: 'STRONG_MATCH', identity: copy(strong[0]!), reason: 'EMAIL_AND_PHONE_MATCH', confidence: 0.98, matchedIdentifiers: matchingIdentifiers(identifiers, strong[0]!) };
  if (strong.length > 1) return { resolution: 'CONFLICT', reason: 'MULTIPLE_STRONG_IDENTITY_CANDIDATES', confidence: 0, matchedIdentifiers: [] };
  const possible = candidates.filter((candidate) => normalizedNameMatch(lead, candidate));
  if (possible.length) return { resolution: 'POSSIBLE_MATCH', reason: 'WEAK_NAME_OR_COMPANY_MATCH_REQUIRES_HUMAN_REVIEW', confidence: 0.4, matchedIdentifiers: [] };
  return { resolution: 'NO_MATCH', reason: 'NO_SAFE_IDENTITY_MATCH', confidence: 0, matchedIdentifiers: [] };
}

export function createPersonIdentity(context: TenantContext, lead: LeadRecord, evidenceRefs: AcquisitionEvidenceReference[], now: () => string = () => new Date().toISOString()): PersonIdentity {
  assertTenant(context, lead.tenantId);
  const timestamp = now();
  const name = displayName(lead);
  return { identityId: deterministicId('identity', [lead.tenantId, lead.leadId]), tenantId: lead.tenantId, type: 'PERSON',
    ...(name ? { displayName: name } : {}), identifiers: canonicalLeadIdentifiers(lead), aliases: [], evidenceRefs: copy(evidenceRefs), createdAt: timestamp, updatedAt: timestamp };
}

export function linkLeadIdentity(context: TenantContext, lead: LeadRecord, resolution: IdentityResolution, now: () => string = () => new Date().toISOString()): LeadIdentityLink {
  assertTenant(context, lead.tenantId);
  if (!resolution.identity || !['EXACT_MATCH', 'NORMALIZED_MATCH', 'STRONG_MATCH'].includes(resolution.resolution)) throw new CustomerAcquisitionRevenueError('IDENTITY_LINK_NOT_SAFE');
  return { linkId: deterministicId('lead-identity-link', [lead.tenantId, lead.leadId, resolution.identity.identityId]), tenantId: lead.tenantId, leadId: lead.leadId, identityId: resolution.identity.identityId, resolution: resolution.resolution, reason: resolution.reason, confidence: resolution.confidence, evidenceRefs: copy(resolution.identity.evidenceRefs), resolverVersion: 'IDENTITY_RESOLUTION_V1', createdAt: now() };
}

export function assessLeadQualification(lead: LeadRecord, signals: readonly ConversationEngagementSignal[], now: () => string = () => new Date().toISOString()): LeadQualificationAssessment {
  const positive = signals.filter((item) => ['REQUESTED_DEMO', 'REQUESTED_PRICING', 'MEETING_BOOKED', 'INBOUND_CONVERSATION', 'REPLIED', 'HIGH_INTENT_EVENT', 'SUBMITTED_FORM'].includes(item.type)).map((item) => item.type);
  const negative = signals.filter((item) => ['UNSUBSCRIBED', 'NO_RESPONSE'].includes(item.type)).map((item) => item.type);
  const missing = [lead.email ? undefined : 'EMAIL', lead.company ? undefined : 'COMPANY', signals.length ? undefined : 'ENGAGEMENT_EVIDENCE'].filter((value): value is string => Boolean(value));
  let score = positive.reduce((total, signal) => total + ({ REQUESTED_DEMO: 45, REQUESTED_PRICING: 40, MEETING_BOOKED: 40, INBOUND_CONVERSATION: 20, REPLIED: 15, HIGH_INTENT_EVENT: 15, SUBMITTED_FORM: 10 } as Partial<Record<EngagementSignalType, number>>)[signal]!, 0);
  score += lead.company ? 10 : 0; score += lead.jobTitle ? 5 : 0; score -= negative.includes('UNSUBSCRIBED') ? 100 : negative.length * 10;
  score = Math.max(0, Math.min(100, score));
  const grade: LeadQualificationGrade = negative.includes('UNSUBSCRIBED') ? 'UNQUALIFIED' : missing.length >= 2 ? 'INSUFFICIENT_DATA' : score >= 60 ? 'HOT' : score >= 30 ? 'WARM' : score > 0 ? 'COOL' : 'UNQUALIFIED';
  return { assessmentId: deterministicId('qualification', [lead.tenantId, lead.leadId, signals.map((item) => item.signalId).sort().join(',')]), tenantId: lead.tenantId, leadId: lead.leadId, score, grade,
    status: grade === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : grade === 'UNQUALIFIED' ? 'NOT_QUALIFIED' : 'QUALIFIED',
    reasonCodes: [...positive.map((item) => `POSITIVE_${item}`), ...negative.map((item) => `NEGATIVE_${item}`), ...missing.map((item) => `MISSING_${item}`)], positiveSignals: uniqueStrings(positive) as EngagementSignalType[], negativeSignals: uniqueStrings(negative) as EngagementSignalType[], missingSignals: missing, confidence: signals.length ? bounded(lead.confidence) : 0, evidenceRefs: copy([...lead.evidenceRefs, ...signals.flatMap((item) => item.evidenceRefs)]), ruleVersion: 'QUALIFICATION_V1', assessedAt: now() };
}

export function assessBuyingIntent(lead: LeadRecord, signals: readonly ConversationEngagementSignal[], now: () => string = () => new Date().toISOString()): BuyingIntentAssessment {
  const intentSignals = signals.filter((item) => ['REQUESTED_DEMO', 'REQUESTED_PRICING', 'MEETING_BOOKED', 'INBOUND_CONVERSATION', 'REPLIED', 'HIGH_INTENT_EVENT', 'SUBMITTED_FORM'].includes(item.type));
  const level: BuyingIntentLevel = intentSignals.some((item) => ['REQUESTED_DEMO', 'REQUESTED_PRICING', 'MEETING_BOOKED'].includes(item.type)) ? 'HIGH' : intentSignals.length >= 2 ? 'MEDIUM' : intentSignals.length ? 'LOW' : 'UNKNOWN';
  return { assessmentId: deterministicId('buying-intent', [lead.tenantId, lead.leadId, intentSignals.map((item) => item.signalId).sort().join(',')]), tenantId: lead.tenantId, leadId: lead.leadId, level, reasonCodes: intentSignals.map((item) => `INTENT_${item.type}`), confidence: intentSignals.length ? bounded(lead.confidence) : 0, evidenceRefs: copy(intentSignals.flatMap((item) => item.evidenceRefs)), ruleVersion: 'BUYING_INTENT_V1', assessedAt: now() };
}

export function assessRevenueAttribution(event: RevenueEvent, opportunity: RevenueOpportunity | undefined, model: RevenueAttributionAssessment['model'], now: () => string = () => new Date().toISOString()): RevenueAttributionAssessment {
  const campaignIds = opportunity?.sourceCampaignIds ?? [];
  const resolvedModel = campaignIds.length ? model : 'UNATTRIBUTED';
  const verified = event.verificationState === 'VERIFIED';
  return { assessmentId: deterministicId('revenue-attribution', [event.tenantId, event.eventId, resolvedModel]), tenantId: event.tenantId, revenueEventId: event.eventId, ...(event.opportunityId ? { opportunityId: event.opportunityId } : {}), model: resolvedModel, sourceCampaignIds: [...campaignIds], confidence: verified && campaignIds.length ? 0.8 : 0, evidenceRefs: copy(event.evidenceRefs), limitations: [verified ? 'Attribution is evidence-backed but not causal incrementality.' : 'Revenue is not verified.', ...(campaignIds.length ? [] : ['No unambiguous campaign linkage.'])], assessedAt: now() };
}

export function calculateCampaignRevenueMetrics(input: { campaignId: string; currency?: string; spendMinor?: number; leads: readonly LeadRecord[]; qualifications: readonly LeadQualificationAssessment[]; opportunities: readonly RevenueOpportunity[]; revenueEvents: readonly RevenueEvent[]; attributions: readonly RevenueAttributionAssessment[] }): CampaignRevenueMetrics {
  const reasons: string[] = [];
  const leads = input.leads.filter((item) => item.sourceCampaignId === input.campaignId || item.unifiedCampaignId === input.campaignId);
  const qualified = input.qualifications.filter((item) => leads.some((lead) => lead.leadId === item.leadId) && ['HOT', 'WARM'].includes(item.grade));
  const opportunities = input.opportunities.filter((item) => item.sourceCampaignIds.includes(input.campaignId));
  const verifiedAttributions = input.attributions.filter((item) => item.sourceCampaignIds.includes(input.campaignId) && item.confidence > 0);
  const revenue = input.revenueEvents.filter((item) => item.type === 'BOOKED_REVENUE' && item.verificationState === 'VERIFIED' && verifiedAttributions.some((assessment) => assessment.revenueEventId === item.eventId));
  const currency = input.currency ?? 'UNKNOWN';
  const currencySafe = currency !== 'UNKNOWN' && [...opportunities, ...revenue].every((item) => !item.currency || item.currency === currency);
  if (!currencySafe) reasons.push('CURRENCY_INCOMPATIBLE');
  if (input.revenueEvents.some((item) => item.type === 'BOOKED_REVENUE' && item.verificationState !== 'VERIFIED')) reasons.push('UNVERIFIED_REVENUE_EXCLUDED');
  if (!verifiedAttributions.length && input.revenueEvents.length) reasons.push('ATTRIBUTION_INSUFFICIENT');
  if (!Number.isSafeInteger(input.spendMinor) || input.spendMinor! < 0) reasons.push('SPEND_UNAVAILABLE');
  const verifiedRevenue = currencySafe ? revenue.reduce((total, item) => total + (item.amountMinor ?? 0), 0) : 'UNKNOWN';
  const pipeline = currencySafe ? opportunities.filter((item) => item.status === 'OPEN').reduce((total, item) => total + (item.amountMinor ?? 0), 0) : 'UNKNOWN';
  const spend = input.spendMinor;
  const unit = (denominator: number): number | 'UNKNOWN' => typeof spend === 'number' && denominator > 0 ? spend / denominator : 'UNKNOWN';
  return { campaignId: input.campaignId, currency: currencySafe ? currency : 'UNKNOWN', leads: leads.length, qualifiedLeads: qualified.length, opportunities: opportunities.length, closedWonRevenueMinor: verifiedRevenue, pipelineValueMinor: pipeline, cplMinor: unit(leads.length), cpqlMinor: unit(qualified.length), costPerOpportunityMinor: unit(opportunities.length), cacMinor: unit(opportunities.filter((item) => item.status === 'WON').length), roas: typeof spend === 'number' && spend > 0 && typeof verifiedRevenue === 'number' ? verifiedRevenue / spend : 'UNKNOWN', reasons };
}

export function diagnoseAcquisitionRevenue(input: { tenantId: string; metrics: CampaignRevenueMetrics; opportunities: readonly RevenueOpportunity[]; leads: readonly LeadRecord[]; now?: () => string }): AcquisitionRevenueDiagnostic[] {
  const now = input.now ?? (() => new Date().toISOString()); const diagnostics: AcquisitionRevenueDiagnostic[] = [];
  const add = (type: AcquisitionRevenueDiagnostic['type'], severity: AcquisitionRevenueDiagnostic['severity'], reason: string) => diagnostics.push({ diagnosticId: deterministicId('acquisition-diagnostic', [input.tenantId, input.metrics.campaignId, type, reason]), tenantId: input.tenantId, type, severity, reasonCodes: [reason], evidenceRefs: [], generatedAt: now() });
  if (input.metrics.leads > 0 && input.metrics.qualifiedLeads === 0) add('HIGH_LEAD_LOW_QUALITY', 'HIGH', 'NO_QUALIFIED_LEADS');
  if (input.metrics.leads > 0 && input.metrics.opportunities === 0) add('LEADS_WITHOUT_PIPELINE', 'WARNING', 'NO_LINKED_OPPORTUNITIES');
  if (input.metrics.opportunities > 0 && input.metrics.closedWonRevenueMinor === 0) add('PIPELINE_WITHOUT_REVENUE', 'WARNING', 'NO_VERIFIED_REVENUE');
  if (input.metrics.reasons.includes('ATTRIBUTION_INSUFFICIENT')) add('MISSING_ATTRIBUTION', 'WARNING', 'ATTRIBUTION_INSUFFICIENT');
  if (input.leads.some((lead) => !lead.source)) add('DATA_QUALITY', 'WARNING', 'LEAD_SOURCE_MISSING');
  return diagnostics;
}

export function recommendLeadRouting(lead: LeadRecord, qualification: LeadQualificationAssessment | undefined, intent: BuyingIntentAssessment | undefined, now: () => string = () => new Date().toISOString()): LeadRoutingRecommendation {
  const kind: LeadRoutingRecommendation['kind'] = lead.consentState === 'RESTRICTED' || lead.consentState === 'OPTED_OUT' ? 'REQUEST_HUMAN_REVIEW' : qualification?.grade === 'HOT' || intent?.level === 'HIGH' ? 'ESCALATE_HOT_LEAD' : qualification?.grade === 'UNQUALIFIED' ? 'DISQUALIFY_RECOMMENDATION' : qualification?.grade === 'INSUFFICIENT_DATA' ? 'REQUEST_MORE_INFORMATION' : 'NURTURE';
  return { recommendationId: deterministicId('lead-routing', [lead.tenantId, lead.leadId, kind, qualification?.assessmentId ?? '', intent?.assessmentId ?? '']), tenantId: lead.tenantId, leadId: lead.leadId, kind, reasonCodes: [qualification ? `QUALIFICATION_${qualification.grade}` : 'QUALIFICATION_MISSING', intent ? `INTENT_${intent.level}` : 'INTENT_UNKNOWN', `CONSENT_${lead.consentState}`], confidence: Math.min(qualification?.confidence ?? 0, intent?.confidence ?? 0), evidenceRefs: copy([...lead.evidenceRefs, ...(qualification?.evidenceRefs ?? []), ...(intent?.evidenceRefs ?? [])]), createdAt: now(), actionState: 'RECOMMENDATION_ONLY' };
}

/** Explicit test/dev store. It enforces the same tenant boundary as the SQL adapter. */
export class InMemoryCustomerAcquisitionRevenueStore implements CustomerAcquisitionRevenueStore {
  private readonly leads = new Map<string, LeadRecord>(); private readonly leadIdempotency = new Map<string, string>(); private readonly identities = new Map<string, PersonIdentity>();
  private readonly quarantines = new Map<string, LeadCaptureQuarantine>(); private readonly edges = new Map<string, IdentityEdge>(); private readonly aliases = new Map<string, IdentityAlias>(); private readonly links = new Map<string, LeadIdentityLink>(); private readonly signals = new Map<string, ConversationEngagementSignal>(); private readonly threads = new Map<string, ConversationThread>(); private readonly participants = new Map<string, ConversationParticipant>(); private readonly qualifications = new Map<string, LeadQualificationAssessment>();
  private readonly opportunities = new Map<string, RevenueOpportunity>(); private readonly revenue = new Map<string, RevenueEvent>(); private readonly attributions = new Map<string, RevenueAttributionAssessment>();
  private readonly transitions = new Map<string, FunnelTransition>(); private readonly diagnostics = new Map<string, AcquisitionRevenueDiagnostic>(); private readonly routing = new Map<string, LeadRoutingRecommendation>(); private readonly dataQuality = new Map<string, AcquisitionDataQualityAssessment>(); private readonly capabilities = new Map<string, CRMProviderCapabilities>();
  async findLeadByIdempotencyKey(context: TenantContext, key: string) { const id = this.leadIdempotency.get(tenantKey(context.tenantId, key)); return id ? this.getLead(context, id) : undefined; }
  async saveLead(context: TenantContext, value: LeadRecord, key: string) { assertTenant(context, value.tenantId); const existing = await this.findLeadByIdempotencyKey(context, key); if (existing && existing.leadId !== value.leadId) throw new CustomerAcquisitionRevenueError('LEAD_IDEMPOTENCY_MISMATCH'); this.leads.set(tenantKey(value.tenantId, value.leadId), copy(value)); this.leadIdempotency.set(tenantKey(value.tenantId, key), value.leadId); return copy(value); }
  async saveLeadQuarantine(context: TenantContext, value: LeadCaptureQuarantine) { assertTenant(context, value.tenantId); this.quarantines.set(tenantKey(value.tenantId, value.quarantineId), copy(value)); return copy(value); }
  async getLead(context: TenantContext, id: string) { const value = this.leads.get(tenantKey(context.tenantId, id)); return value ? copy(value) : undefined; }
  async listLeads(context: TenantContext) { return valuesForTenant(this.leads, context).sort(byJson); }
  async findIdentities(context: TenantContext, identifiers: IdentityIdentifier[]) { return (await valuesForTenant(this.identities, context)).filter((identity) => identity.identifiers.some((item) => identifiers.some((expected) => item.type === expected.type && item.normalizedValue === expected.normalizedValue))); }
  async getIdentity(context: TenantContext, id: string) { const value = this.identities.get(tenantKey(context.tenantId, id)); return value ? copy(value) : undefined; }
  async saveIdentity(context: TenantContext, value: PersonIdentity) { assertTenant(context, value.tenantId); this.identities.set(tenantKey(value.tenantId, value.identityId), copy(value)); return copy(value); }
  async saveIdentityEdge(context: TenantContext, value: IdentityEdge) { assertTenant(context, value.tenantId); this.edges.set(tenantKey(value.tenantId, value.edgeId), copy(value)); return copy(value); }
  async listIdentityEdges(context: TenantContext, identityId: string) { return valuesForTenant(this.edges, context).filter((item) => item.fromIdentityId === identityId || item.toIdentityId === identityId).sort(byJson); }
  async saveIdentityAlias(context: TenantContext, value: IdentityAlias) { assertTenant(context, value.tenantId); this.aliases.set(tenantKey(value.tenantId, value.aliasId), copy(value)); return copy(value); }
  async listIdentityAliases(context: TenantContext, identityId: string) { return valuesForTenant(this.aliases, context).filter((item) => item.identityId === identityId).sort(byJson); }
  async saveLeadIdentityLink(context: TenantContext, value: LeadIdentityLink) { assertTenant(context, value.tenantId); this.links.set(tenantKey(value.tenantId, value.linkId), copy(value)); return copy(value); }
  async listLeadIdentityLinks(context: TenantContext, leadId: string) { return (await valuesForTenant(this.links, context)).filter((item) => item.leadId === leadId).sort(byJson); }
  async saveSignal(context: TenantContext, value: ConversationEngagementSignal) { assertTenant(context, value.tenantId); this.signals.set(tenantKey(value.tenantId, value.signalId), copy(value)); return copy(value); }
  async listSignals(context: TenantContext, leadId: string) { return (await valuesForTenant(this.signals, context)).filter((item) => item.leadId === leadId).sort(byJson); }
  async saveConversationThread(context: TenantContext, value: ConversationThread) { assertTenant(context, value.tenantId); this.threads.set(tenantKey(value.tenantId, value.threadId), copy(value)); return copy(value); }
  async listConversationThreads(context: TenantContext) { return valuesForTenant(this.threads, context).sort(byJson); }
  async saveConversationParticipant(context: TenantContext, value: ConversationParticipant) { assertTenant(context, value.tenantId); this.participants.set(tenantKey(value.tenantId, value.participantId), copy(value)); return copy(value); }
  async listConversationParticipants(context: TenantContext, threadId: string) { return valuesForTenant(this.participants, context).filter((item) => item.threadId === threadId).sort(byJson); }
  async saveQualification(context: TenantContext, value: LeadQualificationAssessment) { assertTenant(context, value.tenantId); this.qualifications.set(tenantKey(value.tenantId, value.leadId), copy(value)); return copy(value); }
  async getQualification(context: TenantContext, leadId: string) { const value = this.qualifications.get(tenantKey(context.tenantId, leadId)); return value ? copy(value) : undefined; }
  async saveOpportunity(context: TenantContext, value: RevenueOpportunity) { assertTenant(context, value.tenantId); this.opportunities.set(tenantKey(value.tenantId, value.opportunityId), copy(value)); return copy(value); }
  async getOpportunity(context: TenantContext, id: string) { const value = this.opportunities.get(tenantKey(context.tenantId, id)); return value ? copy(value) : undefined; }
  async listOpportunities(context: TenantContext) { return valuesForTenant(this.opportunities, context).sort(byJson); }
  async saveRevenueEvent(context: TenantContext, value: RevenueEvent) { assertTenant(context, value.tenantId); const existing = [...this.revenue.values()].find((item) => item.tenantId === value.tenantId && item.idempotencyKey === value.idempotencyKey); if (existing && existing.eventId !== value.eventId) throw new CustomerAcquisitionRevenueError('REVENUE_EVENT_IDEMPOTENCY_MISMATCH'); this.revenue.set(tenantKey(value.tenantId, value.eventId), copy(value)); return copy(value); }
  async listRevenueEvents(context: TenantContext) { return valuesForTenant(this.revenue, context).sort(byJson); }
  async saveAttribution(context: TenantContext, value: RevenueAttributionAssessment) { assertTenant(context, value.tenantId); this.attributions.set(tenantKey(value.tenantId, value.assessmentId), copy(value)); return copy(value); }
  async listAttribution(context: TenantContext) { return valuesForTenant(this.attributions, context).sort(byJson); }
  async saveFunnelTransition(context: TenantContext, value: FunnelTransition) { assertTenant(context, value.tenantId); this.transitions.set(tenantKey(value.tenantId, value.transitionId), copy(value)); return copy(value); }
  async listFunnelTransitions(context: TenantContext) { return valuesForTenant(this.transitions, context).sort(byJson); }
  async saveDiagnostic(context: TenantContext, value: AcquisitionRevenueDiagnostic) { assertTenant(context, value.tenantId); this.diagnostics.set(tenantKey(value.tenantId, value.diagnosticId), copy(value)); return copy(value); }
  async listDiagnostics(context: TenantContext) { return valuesForTenant(this.diagnostics, context).sort(byJson); }
  async saveRoutingRecommendation(context: TenantContext, value: LeadRoutingRecommendation) { assertTenant(context, value.tenantId); this.routing.set(tenantKey(value.tenantId, value.recommendationId), copy(value)); return copy(value); }
  async listRoutingRecommendations(context: TenantContext) { return valuesForTenant(this.routing, context).sort(byJson); }
  async saveDataQualityAssessment(context: TenantContext, value: AcquisitionDataQualityAssessment) { assertTenant(context, value.tenantId); this.dataQuality.set(tenantKey(value.tenantId, value.assessmentId), copy(value)); return copy(value); }
  async listDataQualityAssessments(context: TenantContext) { return valuesForTenant(this.dataQuality, context).sort(byJson); }
  async saveProviderCapabilities(context: TenantContext, value: CRMProviderCapabilities) { assertTenant(context, value.tenantId); this.capabilities.set(tenantKey(value.tenantId, value.provider), copy(value)); return copy(value); }
  async listProviderCapabilities(context: TenantContext) { return valuesForTenant(this.capabilities, context).sort(byJson); }
}

function assertContext(context: TenantContext): void { if (!context.tenantId) throw new CustomerAcquisitionRevenueError('TENANT_SCOPE_DENIED'); }
function assertTenant(context: TenantContext, tenantId: string): void { if (!context.tenantId || context.tenantId !== tenantId) throw new CustomerAcquisitionRevenueError('TENANT_SCOPE_DENIED'); }
function tenantKey(tenantId: string, id: string): string { return `${tenantId}\u0000${id}`; }
function deterministicId(prefix: string, values: readonly string[]): string { return `${prefix}:${createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 32)}`; }
function copy<T>(value: T): T { return structuredClone(value); }
function bounded(value: number): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
function isTime(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function uniqueStrings(values: readonly string[]): string[] { return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort(); }
function hasIdentifier(identity: PersonIdentity, identifier: IdentityIdentifier): boolean { return identity.identifiers.some((item) => item.type === identifier.type && item.normalizedValue === identifier.normalizedValue); }
function matchingIdentifiers(identifiers: IdentityIdentifier[], identity: PersonIdentity): IdentityIdentifier[] { return identifiers.filter((item) => hasIdentifier(identity, item)); }
function normalizedNameMatch(lead: LeadRecord, identity: PersonIdentity): boolean { const name = [lead.firstName, lead.lastName, lead.company].filter(Boolean).join(' ').trim().toLocaleLowerCase(); return Boolean(name && identity.displayName && identity.displayName.trim().toLocaleLowerCase() === name); }
function displayName(lead: LeadRecord): string | undefined { const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim(); return name || lead.company; }
function valuesForTenant<T extends { tenantId: string }>(values: Map<string, T>, context: TenantContext): T[] { assertContext(context); return [...values.values()].filter((item) => item.tenantId === context.tenantId).map(copy); }
function byJson<T>(left: T, right: T): number { return JSON.stringify(left).localeCompare(JSON.stringify(right)); }
