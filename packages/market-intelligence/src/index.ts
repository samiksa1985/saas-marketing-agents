import type {
  CompetitorProfile,
  MarketEvidence,
  MarketIntelligenceSnapshot,
  MarketOpportunity,
  MarketThreat,
  MarketTrend,
  TenantContext,
} from '@platform/contracts';

export interface MarketIntelligenceInput {
  id: string;
  tenantId: string;
  researchQuestion: string;
  marketSummary: string;
  competitors?: CompetitorProfile[];
  customerSignals?: string[];
  trends?: MarketTrend[];
  opportunities?: MarketOpportunity[];
  threats?: MarketThreat[];
  evidence?: MarketEvidence[];
}

function assertTenant(context: TenantContext, tenantId: string): void {
  if (!context.tenantId || context.tenantId !== tenantId) {
    throw new Error('TENANT_SCOPE_DENIED');
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function validateEvidenceTenant(
  tenantId: string,
  evidence: readonly MarketEvidence[],
): void {
  for (const item of evidence) {
    if (item.tenantId !== tenantId) {
      throw new Error('TENANT_SCOPE_DENIED');
    }
  }
}

function validateEntityTenants(
  tenantId: string,
  entities: readonly { tenantId: string }[],
): void {
  for (const entity of entities) {
    if (entity.tenantId !== tenantId) {
      throw new Error('TENANT_SCOPE_DENIED');
    }
  }
}

function calculateConfidence(
  evidence: readonly MarketEvidence[],
  completeness: number,
): number {
  if (!evidence.length) return clamp(completeness * 0.35);

  const evidenceConfidence =
    evidence.reduce((sum, item) => sum + clamp(item.confidence), 0) /
    evidence.length;

  return clamp(evidenceConfidence * 0.7 + completeness * 0.3);
}

export function buildMarketIntelligenceSnapshot(
  context: TenantContext,
  input: MarketIntelligenceInput,
): MarketIntelligenceSnapshot {
  assertTenant(context, input.tenantId);

  const competitors = input.competitors ?? [];
  const trends = input.trends ?? [];
  const opportunities = input.opportunities ?? [];
  const threats = input.threats ?? [];
  const evidence = input.evidence ?? [];
  const customerSignals = input.customerSignals ?? [];

  validateEvidenceTenant(input.tenantId, evidence);
  validateEntityTenants(input.tenantId, competitors);
  validateEntityTenants(input.tenantId, trends);
  validateEntityTenants(input.tenantId, opportunities);
  validateEntityTenants(input.tenantId, threats);

  let completeness = 0;

  if (input.marketSummary.trim()) completeness += 20;
  if (competitors.length) completeness += 20;
  if (customerSignals.length) completeness += 15;
  if (trends.length) completeness += 15;
  if (opportunities.length) completeness += 10;
  if (threats.length) completeness += 10;
  if (evidence.length) completeness += 10;

  return {
    id: input.id,
    tenantId: input.tenantId,
    researchQuestion: input.researchQuestion,
    marketSummary: input.marketSummary,
    competitors,
    customerSignals,
    trends,
    opportunities,
    threats,
    evidence,
    confidence: calculateConfidence(evidence, completeness),
    createdAt: new Date().toISOString(),
  };
}

export function rankCompetitors(
  context: TenantContext,
  tenantId: string,
  competitors: readonly CompetitorProfile[],
): CompetitorProfile[] {
  assertTenant(context, tenantId);
  validateEntityTenants(tenantId, competitors);

  return [...competitors].sort((a, b) => {
    const evidenceDifference = b.evidenceIds.length - a.evidenceIds.length;
    if (evidenceDifference !== 0) return evidenceDifference;

    return b.confidence - a.confidence;
  });
}

export function prioritizeMarketOpportunities(
  context: TenantContext,
  tenantId: string,
  opportunities: readonly MarketOpportunity[],
): MarketOpportunity[] {
  assertTenant(context, tenantId);
  validateEntityTenants(tenantId, opportunities);

  const impactWeight = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...opportunities].sort((a, b) => {
    const impactDifference =
      impactWeight[b.impact] - impactWeight[a.impact];

    if (impactDifference !== 0) return impactDifference;

    return b.confidence - a.confidence;
  });
}

export function prioritizeMarketThreats(
  context: TenantContext,
  tenantId: string,
  threats: readonly MarketThreat[],
): MarketThreat[] {
  assertTenant(context, tenantId);
  validateEntityTenants(tenantId, threats);

  const severityWeight = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...threats].sort((a, b) => {
    const severityDifference =
      severityWeight[b.severity] - severityWeight[a.severity];

    if (severityDifference !== 0) return severityDifference;

    return b.confidence - a.confidence;
  });
}

export function collectMarketEvidenceIds(
  snapshot: MarketIntelligenceSnapshot,
): string[] {
  const ids = new Set<string>();

  for (const item of snapshot.evidence) ids.add(item.id);

  for (const competitor of snapshot.competitors) {
    for (const id of competitor.evidenceIds) ids.add(id);
  }

  for (const trend of snapshot.trends) {
    for (const id of trend.evidenceIds) ids.add(id);
  }

  for (const opportunity of snapshot.opportunities) {
    for (const id of opportunity.evidenceIds) ids.add(id);
  }

  for (const threat of snapshot.threats) {
    for (const id of threat.evidenceIds) ids.add(id);
  }

  return Array.from(ids);
}
