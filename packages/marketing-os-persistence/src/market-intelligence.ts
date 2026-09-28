import { and, desc, eq } from 'drizzle-orm';

import type {
  MarketIntelligenceSnapshot,
  TenantContext,
} from '@platform/contracts';

import type { createDb } from '@platform/db';

import {
  marketCompetitorProfiles,
  marketEvidenceRecords,
  marketIntelligenceSnapshots,
  marketOpportunitySnapshots,
  marketThreatSnapshots,
  marketTrendSnapshots,
} from '@platform/db';

type Db = ReturnType<typeof createDb>;

function assertTenant(
  context: TenantContext,
  tenantId: string,
): void {
  if (!context.tenantId || context.tenantId !== tenantId) {
    throw new Error('TENANT_SCOPE_DENIED');
  }
}

export class PersistentMarketIntelligenceStore {
  constructor(private readonly db: Db) {}

  async save(
    context: TenantContext,
    snapshot: MarketIntelligenceSnapshot,
  ): Promise<void> {
    assertTenant(context, snapshot.tenantId);

    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .insert(marketIntelligenceSnapshots)
        .values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          researchQuestion: snapshot.researchQuestion,
          marketSummary: snapshot.marketSummary,
          customerSignals: snapshot.customerSignals,
          confidence: snapshot.confidence,
          createdAt: new Date(snapshot.createdAt),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: marketIntelligenceSnapshots.id,
          set: {
            researchQuestion: snapshot.researchQuestion,
            marketSummary: snapshot.marketSummary,
            customerSignals: snapshot.customerSignals,
            confidence: snapshot.confidence,
            updatedAt: now,
          },
        });

      await tx
        .delete(marketCompetitorProfiles)
        .where(
          and(
            eq(
              marketCompetitorProfiles.tenantId,
              snapshot.tenantId,
            ),
            eq(
              marketCompetitorProfiles.snapshotId,
              snapshot.id,
            ),
          ),
        );

      await tx
        .delete(marketTrendSnapshots)
        .where(
          and(
            eq(
              marketTrendSnapshots.tenantId,
              snapshot.tenantId,
            ),
            eq(
              marketTrendSnapshots.snapshotId,
              snapshot.id,
            ),
          ),
        );

      await tx
        .delete(marketOpportunitySnapshots)
        .where(
          and(
            eq(
              marketOpportunitySnapshots.tenantId,
              snapshot.tenantId,
            ),
            eq(
              marketOpportunitySnapshots.snapshotId,
              snapshot.id,
            ),
          ),
        );

      await tx
        .delete(marketThreatSnapshots)
        .where(
          and(
            eq(
              marketThreatSnapshots.tenantId,
              snapshot.tenantId,
            ),
            eq(
              marketThreatSnapshots.snapshotId,
              snapshot.id,
            ),
          ),
        );

      await tx
        .delete(marketEvidenceRecords)
        .where(
          and(
            eq(
              marketEvidenceRecords.tenantId,
              snapshot.tenantId,
            ),
            eq(
              marketEvidenceRecords.snapshotId,
              snapshot.id,
            ),
          ),
        );

      if (snapshot.competitors.length) {
        await tx.insert(marketCompetitorProfiles).values(
          snapshot.competitors.map((item) => ({
            id: item.id,
            tenantId: snapshot.tenantId,
            snapshotId: snapshot.id,
            name: item.name,
            website: item.website ?? null,
            category: item.category ?? null,
            positioning: item.positioning ?? null,
            products: item.products,
            strengths: item.strengths,
            weaknesses: item.weaknesses,
            differentiators: item.differentiators,
            targetSegments: item.targetSegments,
            channels: item.channels,
            evidenceIds: item.evidenceIds,
            confidence: item.confidence,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      if (snapshot.trends.length) {
        await tx.insert(marketTrendSnapshots).values(
          snapshot.trends.map((item) => ({
            id: item.id,
            tenantId: snapshot.tenantId,
            snapshotId: snapshot.id,
            name: item.name,
            description: item.description,
            direction: item.direction,
            relevance: item.relevance,
            evidenceIds: item.evidenceIds,
            confidence: item.confidence,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      if (snapshot.opportunities.length) {
        await tx.insert(marketOpportunitySnapshots).values(
          snapshot.opportunities.map((item) => ({
            id: item.id,
            tenantId: snapshot.tenantId,
            snapshotId: snapshot.id,
            title: item.title,
            description: item.description,
            type: item.type,
            impact: item.impact,
            evidenceIds: item.evidenceIds,
            confidence: item.confidence,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      if (snapshot.threats.length) {
        await tx.insert(marketThreatSnapshots).values(
          snapshot.threats.map((item) => ({
            id: item.id,
            tenantId: snapshot.tenantId,
            snapshotId: snapshot.id,
            title: item.title,
            description: item.description,
            type: item.type,
            severity: item.severity,
            evidenceIds: item.evidenceIds,
            confidence: item.confidence,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      if (snapshot.evidence.length) {
        await tx.insert(marketEvidenceRecords).values(
          snapshot.evidence.map((item) => ({
            id: item.id,
            tenantId: snapshot.tenantId,
            snapshotId: snapshot.id,
            type: item.type,
            claim: item.claim,
            sourceRef: item.sourceRef,
            sourceDate: item.sourceDate
              ? new Date(item.sourceDate)
              : null,
            confidence: item.confidence,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    });
  }

  async getLatest(
    context: TenantContext,
    tenantId: string,
  ): Promise<MarketIntelligenceSnapshot | null> {
    assertTenant(context, tenantId);

    const rows = await this.db
      .select()
      .from(marketIntelligenceSnapshots)
      .where(
        eq(
          marketIntelligenceSnapshots.tenantId,
          tenantId,
        ),
      )
      .orderBy(
        desc(marketIntelligenceSnapshots.createdAt),
      )
      .limit(1);

    const snapshot = rows[0];

    if (!snapshot) return null;

    return this.getById(
      context,
      tenantId,
      snapshot.id,
    );
  }

  async getById(
    context: TenantContext,
    tenantId: string,
    snapshotId: string,
  ): Promise<MarketIntelligenceSnapshot | null> {
    assertTenant(context, tenantId);

    const rows = await this.db
      .select()
      .from(marketIntelligenceSnapshots)
      .where(
        and(
          eq(
            marketIntelligenceSnapshots.tenantId,
            tenantId,
          ),
          eq(
            marketIntelligenceSnapshots.id,
            snapshotId,
          ),
        ),
      )
      .limit(1);

    const snapshot = rows[0];

    if (!snapshot) return null;

    const competitors = await this.db
      .select()
      .from(marketCompetitorProfiles)
      .where(
        and(
          eq(
            marketCompetitorProfiles.tenantId,
            tenantId,
          ),
          eq(
            marketCompetitorProfiles.snapshotId,
            snapshotId,
          ),
        ),
      );

    const trends = await this.db
      .select()
      .from(marketTrendSnapshots)
      .where(
        and(
          eq(
            marketTrendSnapshots.tenantId,
            tenantId,
          ),
          eq(
            marketTrendSnapshots.snapshotId,
            snapshotId,
          ),
        ),
      );

    const opportunities = await this.db
      .select()
      .from(marketOpportunitySnapshots)
      .where(
        and(
          eq(
            marketOpportunitySnapshots.tenantId,
            tenantId,
          ),
          eq(
            marketOpportunitySnapshots.snapshotId,
            snapshotId,
          ),
        ),
      );

    const threats = await this.db
      .select()
      .from(marketThreatSnapshots)
      .where(
        and(
          eq(
            marketThreatSnapshots.tenantId,
            tenantId,
          ),
          eq(
            marketThreatSnapshots.snapshotId,
            snapshotId,
          ),
        ),
      );

    const evidence = await this.db
      .select()
      .from(marketEvidenceRecords)
      .where(
        and(
          eq(
            marketEvidenceRecords.tenantId,
            tenantId,
          ),
          eq(
            marketEvidenceRecords.snapshotId,
            snapshotId,
          ),
        ),
      );

    return {
      id: snapshot.id,
      tenantId: snapshot.tenantId,
      researchQuestion: snapshot.researchQuestion,
      marketSummary: snapshot.marketSummary,
      customerSignals:
        snapshot.customerSignals as string[],
      confidence: snapshot.confidence,

      competitors: competitors.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        name: item.name,
        ...(item.website
          ? { website: item.website }
          : {}),
        ...(item.category
          ? { category: item.category }
          : {}),
        ...(item.positioning
          ? { positioning: item.positioning }
          : {}),
        products: item.products as string[],
        strengths: item.strengths as string[],
        weaknesses: item.weaknesses as string[],
        differentiators:
          item.differentiators as string[],
        targetSegments:
          item.targetSegments as string[],
        channels: item.channels as string[],
        evidenceIds: item.evidenceIds as string[],
        confidence: item.confidence,
      })),

      trends: trends.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        name: item.name,
        description: item.description,
        direction:
          item.direction as
            | 'rising'
            | 'stable'
            | 'declining'
            | 'uncertain',
        relevance: item.relevance,
        evidenceIds: item.evidenceIds as string[],
        confidence: item.confidence,
      })),

      opportunities: opportunities.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        title: item.title,
        description: item.description,
        type:
          item.type as
            | 'demand'
            | 'segment'
            | 'positioning'
            | 'channel'
            | 'product'
            | 'competitive',
        impact:
          item.impact as
            | 'low'
            | 'medium'
            | 'high',
        evidenceIds: item.evidenceIds as string[],
        confidence: item.confidence,
      })),

      threats: threats.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        title: item.title,
        description: item.description,
        type:
          item.type as
            | 'competitive'
            | 'market'
            | 'customer'
            | 'channel'
            | 'pricing'
            | 'technology',
        severity:
          item.severity as
            | 'low'
            | 'medium'
            | 'high',
        evidenceIds: item.evidenceIds as string[],
        confidence: item.confidence,
      })),

      evidence: evidence.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        type:
          item.type as
            | 'market'
            | 'competitor'
            | 'customer'
            | 'trend'
            | 'demand'
            | 'positioning',
        claim: item.claim,
        sourceRef: item.sourceRef,
        ...(item.sourceDate
          ? { sourceDate: item.sourceDate.toISOString() }
          : {}),
        confidence: item.confidence,
      })),

      createdAt: snapshot.createdAt.toISOString(),
    };
  }
}
