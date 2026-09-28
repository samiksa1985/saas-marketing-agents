import type {
  Locale,
} from './index.js';


export type MarketingExecutionDomain =
  | 'CAMPAIGN'
  | 'CONTENT'
  | 'CREATIVE'
  | 'SEO';

export type MarketingFunnelStage =
  | 'AWARENESS'
  | 'CONSIDERATION'
  | 'CONVERSION'
  | 'RETENTION'
  | 'EXPANSION';

export type MarketingExecutionChannel =
  | 'WEBSITE'
  | 'LANDING_PAGE'
  | 'EMAIL'
  | 'LINKEDIN'
  | 'X'
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'SEARCH'
  | 'DISPLAY'
  | 'OTHER';

export type MarketingExecutionStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export type MarketingExecutionRisk =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export interface MarketingEvidenceReference {
  id: string;
  sourceType:
    | 'COMPANY_CONTEXT'
    | 'STRATEGY'
    | 'MARKET_INTELLIGENCE'
    | 'KNOWLEDGE_BASE'
    | 'ANALYTICS'
    | 'CRM'
    | 'WEBSITE'
    | 'KEYWORD_RESEARCH'
    | 'BRAND_ASSET'
    | 'OTHER';
}

export interface MarketingQualityFlag {
  code: string;
  severity:
    | 'INFO'
    | 'WARNING'
    | 'BLOCKING';
  message: string;
}

export interface MarketingAssumption {
  id: string;
  statement: string;
  material: boolean;
}

export interface MarketingExecutionEnvelope {
  tenantId: string;
  locale: Locale;
  status: MarketingExecutionStatus;
  confidence: number;
  evidence: MarketingEvidenceReference[];
  assumptions: MarketingAssumption[];
  qaFlags: MarketingQualityFlag[];
  requiresApproval: true;
}


/* ==========================================================
 * CAMPAIGN
 * ========================================================== */

export interface CampaignExecutionInput {
  tenantId: string;
  locale: Locale;

  companyContextId: string;
  strategyId: string;

  goal: string;
  audience: string[];

  offer?: string;

  budget?: {
    amount: number;
    currency: string;
  };

  channels: MarketingExecutionChannel[];
  funnelStages: MarketingFunnelStage[];

  evidence?: MarketingEvidenceReference[];
}

export interface CampaignAssetRequirement {
  assetType: string;
  channel: MarketingExecutionChannel;
  purpose: string;
}

export interface CampaignKPI {
  name: string;
  target?: number;
  unit?: string;
}

export interface CampaignExecutionPlan
  extends MarketingExecutionEnvelope {
  domain: 'CAMPAIGN';

  goal: string;
  audience: string[];
  offer?: string;

  messaging: string[];
  assets: CampaignAssetRequirement[];

  funnelStages: MarketingFunnelStage[];

  budget?: {
    amount: number;
    currency: string;
  };

  kpis: CampaignKPI[];

  launchChecklist: string[];
}


/* ==========================================================
 * CONTENT
 * ========================================================== */

export interface ContentProductionInput {
  tenantId: string;
  locale: Locale;

  companyContextId: string;
  strategyId: string;

  brief: string;
  audience: string[];

  channel: MarketingExecutionChannel;
  funnelStage: MarketingFunnelStage;

  objective: string;

  approvedClaims?: string[];
  prohibitedClaims?: string[];

  evidence?: MarketingEvidenceReference[];
}

export interface ContentDraft {
  id: string;
  concept: string;
  hook: string;
  body: string;
  cta: string;

  metadata: {
    channel: MarketingExecutionChannel;
    funnelStage: MarketingFunnelStage;
  };
}

export interface ContentProductionResult
  extends MarketingExecutionEnvelope {
  domain: 'CONTENT';

  concepts: string[];
  hooks: string[];
  drafts: ContentDraft[];

  sources: MarketingEvidenceReference[];
}

export interface ContentOptimizationInput {
  tenantId: string;
  locale: Locale;

  draft: ContentDraft;

  audience: string[];
  channel: MarketingExecutionChannel;
  funnelStage: MarketingFunnelStage;

  objective: string;

  brandRequirements?: string[];
  prohibitedClaims?: string[];

  evidence?: MarketingEvidenceReference[];
}

export interface ContentOptimizationResult
  extends MarketingExecutionEnvelope {
  domain: 'CONTENT';

  originalDraftId: string;
  optimizedDraft: ContentDraft;

  changes: string[];
}


/* ==========================================================
 * CREATIVE
 * ========================================================== */

export interface CreativeConceptInput {
  tenantId: string;
  locale: Locale;

  brandContextId: string;
  strategyId: string;
  campaignId?: string;

  audience: string[];

  channel: MarketingExecutionChannel;
  objective: string;

  brandRequirements?: string[];

  evidence?: MarketingEvidenceReference[];
}

export interface CreativeConcept {
  id: string;
  title: string;
  hook: string;
  visualDirection: string;

  formats: string[];
}

export interface CreativeVariant {
  id: string;
  conceptId: string;

  copy: string;
  visualDirection: string;

  hypothesis: string;
}

export interface CreativeExecutionResult
  extends MarketingExecutionEnvelope {
  domain: 'CREATIVE';

  concepts: CreativeConcept[];

  variants: CreativeVariant[];

  abTestPlan: {
    primaryMetric: string;
    hypothesis: string;
    minimumVariants: number;
  };
}


/* ==========================================================
 * SEO
 * ========================================================== */

export type SearchIntent =
  | 'INFORMATIONAL'
  | 'COMMERCIAL'
  | 'TRANSACTIONAL'
  | 'NAVIGATIONAL';

export interface SEOExecutionInput {
  tenantId: string;
  locale: Locale;

  companyContextId: string;
  strategyId: string;

  products: string[];
  targetMarket: string;

  websiteUrl?: string;

  evidence?: MarketingEvidenceReference[];
}

export interface SEOKeywordCluster {
  id: string;

  topic: string;
  keywords: string[];

  intent: SearchIntent;

  priority:
    | 'HIGH'
    | 'MEDIUM'
    | 'LOW';
}

export interface SEOContentBrief {
  id: string;

  keywordClusterId: string;

  title: string;
  objective: string;

  recommendedSections: string[];
}

export interface SEOExecutionResult
  extends MarketingExecutionEnvelope {
  domain: 'SEO';

  keywordClusters: SEOKeywordCluster[];

  contentBriefs: SEOContentBrief[];

  onPageActions: string[];

  technicalRecommendations: string[];

  kpis: CampaignKPI[];
}


/* ==========================================================
 * AGENT POLICY
 * ========================================================== */

export interface MarketingAgentPolicy {
  domain: MarketingExecutionDomain;

  allowedTools: string[];

  mayPublishExternally: false;

  requiresHumanApprovalForExternalAction: true;
}

export interface MarketingExecutionHandoff {
  tenantId: string;

  fromDomain:
    MarketingExecutionDomain;

  toDomain:
    MarketingExecutionDomain;

  reason: string;

  artifactIds: string[];

  requiredInputs: string[];
}


/* ==========================================================
 * PERSISTED EXECUTION ARTIFACT
 * ========================================================== */

export type MarketingExecutionArtifactStatus =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'APPROVED_WITH_CONDITIONS'
  | 'REJECTED';

export interface MarketingExecutionArtifact {
  id: string;
  tenantId: string;

  domain:
    MarketingExecutionDomain;

  capabilityId:
    | 'CAP-CONTENT-PRODUCTION'
    | 'CAP-CONTENT-OPTIMIZATION'
    | 'CAP-CAMPAIGN-DESIGN'
    | 'CAP-CAMPAIGN-PLANNING'
    | 'CAP-CREATIVE-CONCEPT'
    | 'CAP-CREATIVE-VARIANTS'
    | 'CAP-SEO-STRATEGY'
    | 'CAP-SEO-OPTIMIZATION';

  workflowId: string;
  taskId: string;
  workstreamId: string;

  status:
    MarketingExecutionArtifactStatus;

  version: number;

  output:
    | CampaignExecutionPlan
    | ContentProductionResult
    | ContentOptimizationResult
    | CreativeExecutionResult
    | SEOExecutionResult;

  evidenceIds: string[];

  approvalId?: string;

  approvedConditions?: string[];

  createdAt: string;
  updatedAt: string;
}

export interface MarketingExecutionApprovalBinding {
  tenantId: string;
  artifactId: string;
  approvalId: string;

  status:
    | 'PENDING'
    | 'APPROVED'
    | 'APPROVED_WITH_CONDITIONS'
    | 'REJECTED';

  conditions?: string[];
}

export interface MarketingExecutionWorkflowBinding {
  tenantId: string;

  artifactId: string;

  workflowId: string;
  taskId: string;
  workstreamId: string;

  fromDomain:
    MarketingExecutionDomain;

  toDomain?:
    MarketingExecutionDomain;
}

export interface MarketingExecutionPublishReadiness {
  artifactId: string;
  tenantId: string;

  ready: boolean;

  reasons: string[];

  requiresApproval: true;
}
