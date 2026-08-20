import type { Locale } from '@platform/contracts';

export type ICPConfidence =
  | 'high'
  | 'medium'
  | 'low'
  | 'unresolved';

export type ICPAccountTier =
  | 'tier_1'
  | 'tier_2'
  | 'tier_3'
  | 'parked'
  | 'rejected';

export type ICPEvidenceStatus =
  | 'verified'
  | 'corroborated'
  | 'hypothesized'
  | 'missing'
  | 'stale';

export type ICPBuyerRoleStatus =
  | 'known'
  | 'hypothesized'
  | 'missing';

export type ICPSuppressionStatus =
  | 'clear'
  | 'suppressed'
  | 'unknown';

export type ICPAccountStage =
  | 'candidate'
  | 'qualified'
  | 'active'
  | 'engaged'
  | 'opportunity'
  | 'handoff'
  | 'retired';

export interface ICPEvidence {
  id: string;
  type:
    | 'firmographic'
    | 'business-fit'
    | 'trigger'
    | 'intent'
    | 'buyer'
    | 'commercial'
    | 'technographic'
    | 'compliance'
    | 'sales'
    | 'other';
  claim: string;
  source: string;
  sourceDate?: string;
  accessedAt?: string;
  status: ICPEvidenceStatus;
  confidence: ICPConfidence;
}

export interface ICPTrigger {
  id: string;
  family:
    | 'growth'
    | 'funding'
    | 'leadership'
    | 'hiring'
    | 'technology'
    | 'expansion'
    | 'regulatory'
    | 'procurement'
    | 'competitive'
    | 'other';
  signal: string;
  source: string;
  detectedAt?: string;
  freshnessDays?: number;
  confidence: ICPConfidence;
}

export interface ICPBuyerRole {
  role:
    | 'economic_buyer'
    | 'champion'
    | 'technical_buyer'
    | 'business_buyer'
    | 'procurement'
    | 'legal'
    | 'finance'
    | 'user'
    | 'other';
  title?: string;
  name?: string;
  status: ICPBuyerRoleStatus;
  evidenceIds: string[];
}

export interface ICPFitAssessment {
  score: number;
  confidence: ICPConfidence;
  rationale: string;
  positiveSignals: string[];
  disqualifiers: string[];
  antiICPFlags: string[];
  evidenceIds: string[];
}

export interface ICPNextMilestone {
  description: string;
  owner?: string;
  dueAt?: string;
  status: 'pending' | 'completed' | 'blocked';
}

export interface ICPSuppression {
  status: ICPSuppressionStatus;
  reasons: string[];
  checkedAt?: string;
  source?: string;
}

export interface ICPAccount {
  accountId: string;
  tenantId: string;
  locale: Locale;
  name: string;
  website?: string;
  region?: string;
  sector?: string;
  employeeBand?: string;
  revenueBand?: string;
  stage: ICPAccountStage;
  tier: ICPAccountTier;
  fit: ICPFitAssessment;
  evidence: ICPEvidence[];
  triggers: ICPTrigger[];
  buyerCommittee: ICPBuyerRole[];
  ownerId?: string;
  reasonForSelection: string;
  confidence: ICPConfidence;
  nextMilestone?: ICPNextMilestone;
  suppression: ICPSuppression;
  sourceDate?: string;
  retirementDate?: string;
}

export interface ICPDefinition {
  version: string;
  market: {
    geography: string[];
    sectors: string[];
    languages: Locale[];
  };
  idealCustomerProfile: {
    description: string;
    requiredCharacteristics: string[];
    preferredCharacteristics: string[];
    disqualifiers: string[];
    antiICP: string[];
  };
  buyingMotion: {
    triggers: string[];
    buyerRoles: string[];
    qualificationRules: string[];
  };
  evidenceRules: {
    minimumEvidenceCount: number;
    minimumIndependentSignalFamilies: number;
    maxSignalAgeDays?: number;
    requireSourceDate: boolean;
  };
  tierRules: {
    tier1: string;
    tier2: string;
    tier3: string;
  };
  accounts: ICPAccount[];
  unresolvedInputs: string[];
}

export interface ICPValidationIssue {
  path: string;
  code:
    | 'required'
    | 'invalid'
    | 'missing_evidence'
    | 'missing_owner'
    | 'suppressed'
    | 'insufficient_signals'
    | 'stale_signal'
    | 'unresolved';
  message: string;
}

export interface ICPValidationResult {
  valid: boolean;
  issues: ICPValidationIssue[];
  warnings: string[];
}

function pushIssue(
  issues: ICPValidationIssue[],
  path: string,
  code: ICPValidationIssue['code'],
  message: string,
): void {
  issues.push({
    path,
    code,
    message,
  });
}

export function validateICPAccount(
  account: ICPAccount,
  rules: ICPDefinition['evidenceRules'],
): ICPValidationResult {
  const issues: ICPValidationIssue[] = [];
  const warnings: string[] = [];

  if (!account.accountId.trim()) {
    pushIssue(
      issues,
      'accountId',
      'required',
      'Account ID is required.',
    );
  }

  if (!account.tenantId.trim()) {
    pushIssue(
      issues,
      'tenantId',
      'required',
      'Tenant ID is required.',
    );
  }

  if (!account.name.trim()) {
    pushIssue(
      issues,
      'name',
      'required',
      'Account name is required.',
    );
  }

  if (!account.reasonForSelection.trim()) {
    pushIssue(
      issues,
      'reasonForSelection',
      'required',
      'A documented selection reason is required.',
    );
  }

  if (
    account.tier !== 'rejected' &&
    account.tier !== 'parked' &&
    !account.ownerId
  ) {
    pushIssue(
      issues,
      'ownerId',
      'missing_owner',
      'Active ICP accounts require an accountable owner.',
    );
  }

  if (account.suppression.status === 'suppressed') {
    pushIssue(
      issues,
      'suppression.status',
      'suppressed',
      'Suppressed accounts cannot enter active execution.',
    );
  }

  const usableEvidence = account.evidence.filter(
    (item) =>
      item.status === 'verified' ||
      item.status === 'corroborated',
  );

  if (
    account.tier !== 'rejected' &&
    account.tier !== 'parked' &&
    usableEvidence.length < rules.minimumEvidenceCount
  ) {
    pushIssue(
      issues,
      'evidence',
      'missing_evidence',
      `At least ${rules.minimumEvidenceCount} usable evidence item(s) are required.`,
    );
  }

  const signalFamilies = new Set(
    account.triggers.map(
      (trigger) => trigger.family,
    ),
  );

  if (
    account.tier === 'tier_1' &&
    signalFamilies.size <
      rules.minimumIndependentSignalFamilies
  ) {
    pushIssue(
      issues,
      'triggers',
      'insufficient_signals',
      `Tier 1 requires at least ${rules.minimumIndependentSignalFamilies} independent signal families.`,
    );
  }

  if (rules.maxSignalAgeDays !== undefined) {
    const now = Date.now();

    for (const trigger of account.triggers) {
      if (!trigger.detectedAt) {
        warnings.push(
          `${trigger.id}: trigger has no detectedAt date.`,
        );
        continue;
      }

      const detectedAt = Date.parse(
        trigger.detectedAt,
      );

      if (Number.isNaN(detectedAt)) {
        pushIssue(
          issues,
          `triggers.${trigger.id}.detectedAt`,
          'invalid',
          'Trigger detectedAt must be a valid ISO date.',
        );
        continue;
      }

      const ageDays =
        (now - detectedAt) /
        (1000 * 60 * 60 * 24);

      if (ageDays > rules.maxSignalAgeDays) {
        pushIssue(
          issues,
          `triggers.${trigger.id}`,
          'stale_signal',
          `Trigger is older than the allowed ${rules.maxSignalAgeDays}-day freshness window.`,
        );
      }
    }
  }

  if (rules.requireSourceDate) {
    for (const evidence of account.evidence) {
      if (!evidence.sourceDate) {
        pushIssue(
          issues,
          `evidence.${evidence.id}`,
          'unresolved',
          'Evidence source date is required.',
        );
      }
    }
  }

  if (account.fit.antiICPFlags.length > 0) {
    warnings.push(
      'Account contains anti-ICP flags.',
    );
  }

  if (
    account.buyerCommittee.length === 0 &&
    (
      account.tier === 'tier_1' ||
      account.tier === 'tier_2'
    )
  ) {
    pushIssue(
      issues,
      'buyerCommittee',
      'missing_evidence',
      'Tier 1 and Tier 2 accounts require a buyer committee map.',
    );
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

export function createEmptyICPDefinition(
  version = '1',
): ICPDefinition {
  return {
    version,
    market: {
      geography: [],
      sectors: [],
      languages: [],
    },
    idealCustomerProfile: {
      description: '',
      requiredCharacteristics: [],
      preferredCharacteristics: [],
      disqualifiers: [],
      antiICP: [],
    },
    buyingMotion: {
      triggers: [],
      buyerRoles: [],
      qualificationRules: [],
    },
    evidenceRules: {
      minimumEvidenceCount: 1,
      minimumIndependentSignalFamilies: 2,
      maxSignalAgeDays: 90,
      requireSourceDate: true,
    },
    tierRules: {
      tier1: '',
      tier2: '',
      tier3: '',
    },
    accounts: [],
    unresolvedInputs: [],
  };
}