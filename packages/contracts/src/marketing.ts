import type { Id, Locale } from './index.js';

export type MarketingEntityStatus = 'draft' | 'active' | 'paused' | 'archived' | 'completed';

export type MarketingChannel =
  | 'email'
  | 'social'
  | 'search'
  | 'paid_media'
  | 'website'
  | 'events'
  | 'partner'
  | 'sales'
  | 'other';

export type SignalType =
  | 'intent'
  | 'engagement'
  | 'news'
  | 'funding'
  | 'hiring'
  | 'technology'
  | 'relationship'
  | 'web'
  | 'other';

export type LeadStatus =
  | 'new'
  | 'working'
  | 'qualified'
  | 'disqualified'
  | 'nurturing'
  | 'converted'
  | 'closed';

export type OpportunityStage =
  | 'prospecting'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export type OutcomeType =
  | 'engagement'
  | 'lead'
  | 'qualified_lead'
  | 'meeting'
  | 'opportunity'
  | 'customer'
  | 'revenue'
  | 'profit';

export interface MarketingGoal {
  id: Id;
  tenantId: Id;
  name: string;
  description: string;
  metric: string;
  targetValue?: number;
  targetUnit?: string;
  timeframe?: string;
  status: 'draft' | 'active' | 'achieved' | 'cancelled';
}

export interface CompanyContext {
  tenantId: Id;
  companyName: string;
  website?: string;
  industry?: string;
  markets: string[];
  products: string[];
  services: string[];
  brandVoice?: string;
  positioning?: string;
  goals: Id[];
  locale: Locale;
  updatedAt: string;
}

export interface ICPProfile {
  id: Id;
  tenantId: Id;
  name: string;
  industries: string[];
  companySizes: string[];
  geographies: string[];
  buyingTriggers: string[];
  painPoints: string[];
  desiredOutcomes: string[];
  exclusions: string[];
  confidence?: number;
  evidenceIds: Id[];
  status: MarketingEntityStatus;
}

export interface PersonaProfile {
  id: Id;
  tenantId: Id;
  icpId: Id;
  name: string;
  titlePatterns: string[];
  responsibilities: string[];
  pains: string[];
  buyingCriteria: string[];
  objections: string[];
}

export interface Account {
  id: Id;
  tenantId: Id;
  name: string;
  website?: string;
  industry?: string;
  geography?: string;
  employeeBand?: string;
  icpFit?: number;
  status: MarketingEntityStatus;
}

export interface Contact {
  id: Id;
  tenantId: Id;
  accountId: Id;
  name: string;
  title?: string;
  email?: string;
  roleType?: string;
  buyingInfluence?: string;
}

export interface Signal {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  contactId?: Id;
  type: SignalType;
  source: string;
  summary: string;
  observedAt: string;
  expiresAt?: string;
  confidence?: number;
  evidenceIds: Id[];
}

export interface Campaign {
  id: Id;
  tenantId: Id;
  name: string;
  objective: string;
  channels: MarketingChannel[];
  goalIds: Id[];
  workflowId?: Id;
  status: MarketingEntityStatus;
}

export interface Interaction {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  contactId?: Id;
  campaignId?: Id;
  channel: MarketingChannel;
  type: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface Lead {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  contactId?: Id;
  source?: string;
  score?: number;
  status: LeadStatus;
}

export interface Opportunity {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  name: string;
  stage: OpportunityStage;
  amount?: number;
  currency?: string;
  expectedCloseAt?: string;
}

export interface Customer {
  id: Id;
  tenantId: Id;
  accountId?: Id;
  lifecycleStage: 'new' | 'active' | 'at_risk' | 'renewal' | 'churned' | 'expansion';
}

export interface Outcome {
  id: Id;
  tenantId: Id;
  type: OutcomeType;
  sourceEntityId: Id;
  metric: string;
  value: number;
  unit?: string;
  occurredAt: string;
  attribution?: Record<string, number>;
}

export interface MarketingMemoryRecord {
  id: Id;
  tenantId: Id;
  scope: 'company' | 'customer' | 'account' | 'campaign' | 'interaction' | 'organization' | 'agent';
  scopeId: Id;
  statement: string;
  evidenceIds: Id[];
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Experiment {
  id: Id;
  tenantId: Id;
  name: string;
  hypothesis: string;
  metric: string;
  variants: string[];
  status: 'planned' | 'running' | 'won' | 'lost' | 'inconclusive';
}

export interface Recommendation {
  id: Id;
  tenantId: Id;
  title: string;
  rationale: string;
  action: string;
  confidence?: number;
  evidenceIds: Id[];
  requiresApproval: boolean;
}
