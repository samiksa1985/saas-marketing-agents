import {
  and,
  desc,
  eq,
} from 'drizzle-orm';

import type {
  MarketingStrategy,
  StrategyCampaignRecommendation,
  StrategyChannel,
  StrategyKPI,
  StrategyObjective,
  StrategyRoadmapItem,
  TenantContext,
} from '@platform/contracts';

import type {
  createDb,
} from '@platform/db';

import {
  marketingStrategies,
  marketingStrategyVersions,
} from '@platform/db';

type Db =
  ReturnType<typeof createDb>;

function assertTenant(
  context: TenantContext,
  tenantId: string,
): void {
  if (
    !context.tenantId ||
    context.tenantId !== tenantId
  ) {
    throw new Error(
      'TENANT_SCOPE_DENIED',
    );
  }
}

export class PersistentMarketingStrategyStore {
  constructor(
    private readonly db: Db,
  ) {}

  async save(
    context: TenantContext,
    strategy: MarketingStrategy,
  ): Promise<void> {
    assertTenant(
      context,
      strategy.tenantId,
    );

    const now = new Date();

    await this.db.transaction(
      async (tx) => {
        const existing =
          await tx
            .select()
            .from(
              marketingStrategies,
            )
            .where(
              and(
                eq(
                  marketingStrategies.tenantId,
                  strategy.tenantId,
                ),
                eq(
                  marketingStrategies.id,
                  strategy.id,
                ),
              ),
            )
            .limit(1);

        if (
          existing[0] &&
          strategy.version <
            existing[0].currentVersion
        ) {
          throw new Error(
            'STRATEGY_VERSION_REGRESSION',
          );
        }

        await tx
          .insert(
            marketingStrategies,
          )
          .values({
            id: strategy.id,
            tenantId:
              strategy.tenantId,
            title: strategy.title,
            currentVersion:
              strategy.version,
            status:
              strategy.status,
            createdAt:
              new Date(
                strategy.createdAt,
              ),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target:
              marketingStrategies.id,
            set: {
              title:
                strategy.title,
              currentVersion:
                strategy.version,
              status:
                strategy.status,
              updatedAt: now,
            },
          });

        await tx
          .insert(
            marketingStrategyVersions,
          )
          .values({
            tenantId:
              strategy.tenantId,
            strategyId:
              strategy.id,
            version:
              strategy.version,
            executiveSummary:
              strategy.executiveSummary,
            objectiveIds:
              strategy.objectiveIds,
            objectives:
              strategy.objectives,
            icpIds:
              strategy.icpIds,
            positioning:
              strategy.positioning,
            messaging:
              strategy.messaging,
            channels:
              strategy.channels,
            offers:
              strategy.offers,
            campaigns:
              strategy.campaigns,
            contentPillars:
              strategy.contentPillars,
            kpis:
              strategy.kpis,
            roadmap:
              strategy.roadmap,
            priorities:
              strategy.priorities,
            assumptions:
              strategy.assumptions,
            evidenceIds:
              strategy.evidenceIds,
            confidence:
              strategy.confidence,
            requiresApproval:
              strategy.requiresApproval,
            status:
              strategy.status,
            createdAt:
              new Date(
                strategy.createdAt,
              ),
            updatedAt: now,
          })
          .onConflictDoNothing();
      },
    );
  }

  async getLatest(
    context: TenantContext,
    tenantId: string,
    strategyId: string,
  ): Promise<MarketingStrategy | null> {
    assertTenant(
      context,
      tenantId,
    );

    const roots =
      await this.db
        .select()
        .from(
          marketingStrategies,
        )
        .where(
          and(
            eq(
              marketingStrategies.tenantId,
              tenantId,
            ),
            eq(
              marketingStrategies.id,
              strategyId,
            ),
          ),
        )
        .limit(1);

    const root = roots[0];

    if (!root) {
      return null;
    }

    const rows =
      await this.db
        .select()
        .from(
          marketingStrategyVersions,
        )
        .where(
          and(
            eq(
              marketingStrategyVersions.tenantId,
              tenantId,
            ),
            eq(
              marketingStrategyVersions.strategyId,
              strategyId,
            ),
          ),
        )
        .orderBy(
          desc(
            marketingStrategyVersions.version,
          ),
        )
        .limit(1);

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: root.id,
      tenantId:
        root.tenantId,
      version:
        row.version,
      title:
        root.title,
      executiveSummary:
        row.executiveSummary,
      objectiveIds:
        row.objectiveIds as string[],
      objectives:
        row.objectives as StrategyObjective[],
      icpIds:
        row.icpIds as string[],
      positioning:
        row.positioning,
      messaging:
        row.messaging as string[],
      channels:
        row.channels as StrategyChannel[],
      offers:
        row.offers as string[],
      campaigns:
        row.campaigns as StrategyCampaignRecommendation[],
      contentPillars:
        row.contentPillars as string[],
      kpis:
        row.kpis as StrategyKPI[],
      roadmap:
        row.roadmap as StrategyRoadmapItem[],
      priorities:
        row.priorities as string[],
      assumptions:
        row.assumptions as string[],
      evidenceIds:
        row.evidenceIds as string[],
      confidence:
        row.confidence,
      status:
        row.status,
      requiresApproval: true,
      createdAt:
        row.createdAt.toISOString(),
      updatedAt:
        row.updatedAt.toISOString(),
    };
  }

  async listVersions(
    context: TenantContext,
    tenantId: string,
    strategyId: string,
  ) {
    assertTenant(
      context,
      tenantId,
    );

    return this.db
      .select()
      .from(
        marketingStrategyVersions,
      )
      .where(
        and(
          eq(
            marketingStrategyVersions.tenantId,
            tenantId,
          ),
          eq(
            marketingStrategyVersions.strategyId,
            strategyId,
          ),
        ),
      )
      .orderBy(
        desc(
          marketingStrategyVersions.version,
        ),
      );
  }
}
