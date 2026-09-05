import type {
  Account,
  CompanyEvidence,
  CompanyContext,
  CompanyIntelligenceProfile,
  ICPAssessment,
  ICPProfile,
  Signal,
} from '@platform/contracts';

export type {
  CompanyEvidence,
  CompanyIntelligenceProfile,
  ICPAssessment,
} from '@platform/contracts';

export interface CompanyIntelligenceInput {
  id: string;
  context: CompanyContext;
  industry?: string;
  subIndustry?: string;
  headquarters?: string;
  employeeBand?: string;
  revenueBand?: string;
  businessModel?: string;
  technologies?: string[];
  competitors?: string[];
  customers?: string[];
  painPoints?: string[];
  strategicPriorities?: string[];
  buyingSignals?: string[];
  risks?: string[];
  opportunities?: string[];
  evidence?: CompanyEvidence[];
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  );
}

function normalize(value?: string): string {
  return value?.trim().toLowerCase() ?? '';
}

function overlap(left: string[], right: string[]): string[] {
  const target = new Set(right.map(normalize));
  return unique(left.filter((value) => target.has(normalize(value))));
}

export function buildCompanyIntelligenceProfile(
  input: CompanyIntelligenceInput,
): CompanyIntelligenceProfile {
  if (!input.context.tenantId) {
    throw new Error('TENANT_SCOPE_REQUIRED');
  }

  const evidenceIds = unique((input.evidence ?? []).map((item) => item.id));

  const evidenceConfidence = (input.evidence ?? [])
    .map((item) => item.confidence)
    .filter((value): value is number => typeof value === 'number');

  const averageEvidenceConfidence =
    evidenceConfidence.length > 0
      ? evidenceConfidence.reduce((sum, value) => sum + value, 0) / evidenceConfidence.length
      : 0;

  const completenessFields = [
    input.context.companyName,
    input.context.website,
    input.industry ?? input.context.industry,
    input.employeeBand,
    input.revenueBand,
    input.businessModel,
  ];

  const completeness = completenessFields.filter(Boolean).length / completenessFields.length;

  const confidence = Math.round(
    Math.min(100, Math.max(0, completeness * 60 + averageEvidenceConfidence * 40)),
  );

  return {
    id: input.id,
    tenantId: input.context.tenantId,
    companyName: input.context.companyName,
    website: input.context.website,
    industry: input.industry ?? input.context.industry,
    subIndustry: input.subIndustry,
    headquarters: input.headquarters,
    geographies: unique(input.context.markets),
    employeeBand: input.employeeBand,
    revenueBand: input.revenueBand,
    businessModel: input.businessModel,
    products: unique(input.context.products),
    services: unique(input.context.services),
    technologies: unique(input.technologies ?? []),
    competitors: unique(input.competitors ?? []),
    customers: unique(input.customers ?? []),
    painPoints: unique(input.painPoints ?? []),
    strategicPriorities: unique(input.strategicPriorities ?? []),
    buyingSignals: unique(input.buyingSignals ?? []),
    risks: unique(input.risks ?? []),
    opportunities: unique(input.opportunities ?? []),
    evidenceIds,
    confidence,
    updatedAt: input.context.updatedAt,
  };
}

export function assessAccountAgainstICP(
  account: Account,
  icp: ICPProfile,
  signals: Signal[] = [],
  company?: CompanyIntelligenceProfile,
): ICPAssessment {
  if (account.tenantId !== icp.tenantId) {
    throw new Error('TENANT_SCOPE_DENIED');
  }

  if (company && company.tenantId !== account.tenantId) {
    throw new Error('TENANT_SCOPE_DENIED');
  }

  for (const signal of signals) {
    if (signal.tenantId !== account.tenantId) {
      throw new Error('TENANT_SCOPE_DENIED');
    }
  }

  const accountIndustry = account.industry
    ? [account.industry]
    : company?.industry
      ? [company.industry]
      : [];

  const accountGeography = account.geography ? [account.geography] : (company?.geographies ?? []);

  const matchedIndustries = overlap(accountIndustry, icp.industries);
  const matchedGeographies = overlap(accountGeography, icp.geographies);

  const signalText = signals.map((signal) => signal.summary);
  const companyTriggers = company?.buyingSignals ?? [];

  const matchedTriggers = icp.buyingTriggers.filter((trigger) => {
    const needle = normalize(trigger);

    return [...signalText, ...companyTriggers].some((value) => normalize(value).includes(needle));
  });

  const matchedPainPoints = icp.painPoints.filter((pain) =>
    (company?.painPoints ?? []).some((value) => normalize(value).includes(normalize(pain))),
  );

  const exclusions: string[] = [];

  for (const exclusion of icp.exclusions) {
    const needle = normalize(exclusion);

    const corpus = [
      account.name,
      account.industry,
      account.geography,
      account.employeeBand,
      company?.industry,
      company?.employeeBand,
      company?.revenueBand,
      ...(company?.risks ?? []),
    ].filter((value): value is string => Boolean(value));

    if (corpus.some((value) => normalize(value).includes(needle))) {
      exclusions.push(exclusion);
    }
  }

  let score = 0;

  if (matchedIndustries.length > 0) score += 30;
  if (matchedGeographies.length > 0) score += 20;

  if (
    account.employeeBand &&
    icp.companySizes.map(normalize).includes(normalize(account.employeeBand))
  ) {
    score += 20;
  }

  score += Math.min(15, matchedTriggers.length * 5);
  score += Math.min(15, matchedPainPoints.length * 5);

  if (exclusions.length > 0) {
    score = Math.min(score, 20);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier: ICPAssessment['tier'] =
    exclusions.length > 0
      ? 'rejected'
      : score >= 80
        ? 'tier_1'
        : score >= 60
          ? 'tier_2'
          : score >= 40
            ? 'tier_3'
            : 'rejected';

  const evidenceIds = unique([
    ...icp.evidenceIds,
    ...signals.flatMap((signal) => signal.evidenceIds),
    ...(company?.evidenceIds ?? []),
  ]);

  const reasons: string[] = [];

  if (matchedIndustries.length > 0) {
    reasons.push('Industry matches ICP.');
  }

  if (matchedGeographies.length > 0) {
    reasons.push('Geography matches ICP.');
  }

  if (matchedTriggers.length > 0) {
    reasons.push('Buying triggers detected.');
  }

  if (matchedPainPoints.length > 0) {
    reasons.push('Relevant pain points detected.');
  }

  if (exclusions.length > 0) {
    reasons.push('Account matches ICP exclusion criteria.');
  }

  return {
    accountId: account.id,
    tenantId: account.tenantId,
    score,
    tier,
    matchedIndustries,
    matchedGeographies,
    matchedTriggers,
    matchedPainPoints,
    exclusions,
    evidenceIds,
    reasons,
    model: 'canonical-company-icp-v1',
  };
}
