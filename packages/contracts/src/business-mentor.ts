export type MentorEvidenceKind =
  | 'BUSINESS_METRIC'
  | 'PIPELINE'
  | 'CLIENT'
  | 'PROFITABILITY'
  | 'GOAL'
  | 'DECISION'
  | 'ANALYTICS'
  | 'CUSTOMER_SUCCESS'
  | 'COMPANY_INTELLIGENCE'
  | 'OTHER';

export type MentorStatementType =
  | 'FACT'
  | 'INFERENCE'
  | 'ASSUMPTION'
  | 'RECOMMENDATION';

export type MentorPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export type MentorRiskType =
  | 'FINANCIAL'
  | 'COMMERCIAL'
  | 'CUSTOMER'
  | 'COMPLIANCE'
  | 'PRIVACY'
  | 'REPUTATIONAL'
  | 'OPERATIONAL'
  | 'STRATEGIC';

export interface MentorEvidence {
  id: string;
  kind: MentorEvidenceKind;
  label: string;
  value?: string | number;
  sourceId?: string;
}

export interface MentorGoal {
  id: string;
  description: string;
  target?: number;
  unit?: string;
}

export interface MentorDecisionContext {
  id: string;
  question: string;
  options: string[];
  constraints?: string[];
}

export interface BusinessMentorInput {
  tenantId: string;
  locale: 'ar' | 'en';

  businessMetrics: MentorEvidence[];
  pipeline: MentorEvidence[];
  clients: MentorEvidence[];
  profitability: MentorEvidence[];

  goals: MentorGoal[];

  decisions?: MentorDecisionContext[];
}

export interface MentorPriorityItem {
  id: string;
  priority: MentorPriority;
  title: string;
  rationale: string;
  expectedImpact: string;
  evidenceIds: string[];
  confidence: number;
}

export interface MentorDecisionOption {
  option: string;
  advantages: string[];
  disadvantages: string[];
  risks: string[];
}

export interface MentorDecisionRecommendation {
  decisionId: string;
  question: string;

  recommendedOption?: string;

  options: MentorDecisionOption[];

  rationale: string;
  expectedImpact: string;

  evidenceIds: string[];
  confidence: number;

  requiresHumanDecision: true;
}

export interface MentorRisk {
  type: MentorRiskType;
  description: string;
  severity: MentorPriority;
  evidenceIds: string[];
}

export interface MentorLearning {
  businessLesson: string;
  learningQuestion: string;
}

export interface MentorHandoffRequest {
  targetCapability: string;
  reason: string;
  requiredInputs: string[];
  evidenceIds: string[];
}

export interface BusinessMentorResult {
  tenantId: string;
  locale: 'ar' | 'en';

  status:
    | 'READY'
    | 'NEEDS_MORE_CONTEXT';

  dailyPriorities: MentorPriorityItem[];

  decisions: MentorDecisionRecommendation[];

  risks: MentorRisk[];

  learning: MentorLearning;

  statements: Array<{
    type: MentorStatementType;
    text: string;
    evidenceIds: string[];
  }>;

  handoffs: MentorHandoffRequest[];

  missingFields: string[];

  confidence: number;

  advisoryOnly: true;
  mayExecuteSensitiveActions: false;
}

export interface MentorDecisionSupportInput {
  tenantId: string;
  locale: 'ar' | 'en';

  decision: MentorDecisionContext;

  evidence: MentorEvidence[];
}

export interface MentorDecisionSupportResult {
  tenantId: string;

  decision:
    MentorDecisionRecommendation;

  risks: MentorRisk[];

  missingFields: string[];

  confidence: number;

  advisoryOnly: true;
  requiresHumanDecision: true;
}
