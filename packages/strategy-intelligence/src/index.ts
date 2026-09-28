import type {
  MarketingStrategy,
  StrategyPriority,
  StrategyRoadmapItem,
  TenantContext,
} from '@platform/contracts';

export interface StrategyBuildInput
  extends Omit<
    MarketingStrategy,
    | 'version'
    | 'confidence'
    | 'status'
    | 'requiresApproval'
    | 'createdAt'
    | 'updatedAt'
  > {
  version?: number;
  status?: MarketingStrategy['status'];
  evidenceConfidence?: number[];
}

function assertTenant(
  context: TenantContext,
  tenantId: string,
): void {
  if (!context.tenantId || context.tenantId !== tenantId) {
    throw new Error('TENANT_SCOPE_DENIED');
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function priorityWeight(
  priority: StrategyPriority,
): number {
  switch (priority) {
    case 'CRITICAL':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
  }
}

function calculateCompleteness(
  input: StrategyBuildInput,
): number {
  let score = 0;

  if (input.executiveSummary.trim()) score += 10;
  if (input.objectives.length) score += 10;
  if (input.icpIds.length) score += 10;
  if (input.positioning.trim()) score += 10;
  if (input.messaging.length) score += 10;
  if (input.channels.length) score += 10;
  if (input.offers.length) score += 5;
  if (input.campaigns.length) score += 10;
  if (input.contentPillars.length) score += 5;
  if (input.kpis.length) score += 10;
  if (input.roadmap.length) score += 5;
  if (input.evidenceIds.length) score += 5;

  return clamp(score);
}

export function calculateStrategyConfidence(
  input: StrategyBuildInput,
): number {
  const completeness = calculateCompleteness(input);

  const evidenceScores =
    input.evidenceConfidence ?? [];

  if (!evidenceScores.length) {
    return clamp(completeness * 0.5);
  }

  const evidenceConfidence =
    evidenceScores.reduce(
      (sum, value) => sum + clamp(value),
      0,
    ) / evidenceScores.length;

  return clamp(
    completeness * 0.4 +
      evidenceConfidence * 0.6,
  );
}

export function validateRoadmap(
  roadmap: readonly StrategyRoadmapItem[],
): void {
  const ids = new Set(
    roadmap.map((item) => item.id),
  );

  for (const item of roadmap) {
    for (const dependency of item.dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(
          `UNKNOWN_STRATEGY_ROADMAP_DEPENDENCY:${dependency}`,
        );
      }

      if (dependency === item.id) {
        throw new Error(
          'STRATEGY_ROADMAP_SELF_DEPENDENCY',
        );
      }
    }
  }
}

export function buildMarketingStrategy(
  context: TenantContext,
  input: StrategyBuildInput,
): MarketingStrategy {
  assertTenant(context, input.tenantId);

  validateRoadmap(input.roadmap);

  const now = new Date().toISOString();

  return {
    id: input.id,
    tenantId: input.tenantId,
    version: input.version ?? 1,
    title: input.title,
    executiveSummary: input.executiveSummary,
    objectiveIds: input.objectiveIds,
    objectives: input.objectives,
    icpIds: input.icpIds,
    positioning: input.positioning,
    messaging: input.messaging,
    channels: input.channels,
    offers: input.offers,
    campaigns: input.campaigns,
    contentPillars: input.contentPillars,
    kpis: input.kpis,
    roadmap: input.roadmap,
    priorities: input.priorities,
    assumptions: input.assumptions,
    evidenceIds: input.evidenceIds,
    confidence: calculateStrategyConfidence(input),
    status: input.status ?? 'DRAFT',
    requiresApproval: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function prioritizeStrategyRoadmap(
  context: TenantContext,
  tenantId: string,
  roadmap: readonly StrategyRoadmapItem[],
): StrategyRoadmapItem[] {
  assertTenant(context, tenantId);

  const horizonWeight = {
    '30': 3,
    '60': 2,
    '90': 1,
  };

  return [...roadmap].sort((a, b) => {
    const priorityDifference =
      priorityWeight(b.priority) -
      priorityWeight(a.priority);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return (
      horizonWeight[b.horizon] -
      horizonWeight[a.horizon]
    );
  });
}

export function createNextStrategyVersion(
  context: TenantContext,
  current: MarketingStrategy,
  next: StrategyBuildInput,
): MarketingStrategy {
  assertTenant(context, current.tenantId);
  assertTenant(context, next.tenantId);

  if (current.tenantId !== next.tenantId) {
    throw new Error('TENANT_SCOPE_DENIED');
  }

  return buildMarketingStrategy(context, {
    ...next,
    version: current.version + 1,
    status: 'DRAFT',
  });
}
