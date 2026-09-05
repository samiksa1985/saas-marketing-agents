import { and, desc, eq } from 'drizzle-orm';

import type {
  Account,
  CompanyIntelligenceProfile,
  ICPAssessment,
  ICPProfile,
  TenantContext,
} from '@platform/contracts';

import type { createDb } from '@platform/db';

import {
  companyIntelligenceProfiles,
  icpAssessmentSnapshots,
  marketingAccounts,
  marketingIcpProfiles,
} from '@platform/db';

export type PersistedCompanyIntelligenceProfile = CompanyIntelligenceProfile;

export interface PersistedICPAssessment extends ICPAssessment {
  id: string;
  icpId: string;
}

type Db = ReturnType<typeof createDb>;

function requireTenant(context: TenantContext): string {
  if (!context.tenantId) {
    throw new Error('TENANT_CONTEXT_REQUIRED');
  }

  return context.tenantId;
}

function assertTenant(context: TenantContext, tenantId: string): void {
  if (!context.tenantId || context.tenantId !== tenantId) {
    throw new Error('TENANT_SCOPE_DENIED');
  }
}

export class PersistentCompanyIntelligenceStore {
  constructor(private readonly db: Db) {}

  async saveCompanyProfile(
    context: TenantContext,
    profile: PersistedCompanyIntelligenceProfile,
  ): Promise<void> {
    assertTenant(context, profile.tenantId);

    const now = new Date();

    await this.db
      .insert(companyIntelligenceProfiles)
      .values({
        id: profile.id,
        tenantId: profile.tenantId,
        companyName: profile.companyName,
        website: profile.website ?? null,
        industry: profile.industry ?? null,
        subIndustry: profile.subIndustry ?? null,
        headquarters: profile.headquarters ?? null,
        geographies: profile.geographies,
        employeeBand: profile.employeeBand ?? null,
        revenueBand: profile.revenueBand ?? null,
        businessModel: profile.businessModel ?? null,
        products: profile.products,
        services: profile.services,
        technologies: profile.technologies,
        competitors: profile.competitors,
        customers: profile.customers,
        painPoints: profile.painPoints,
        strategicPriorities: profile.strategicPriorities,
        buyingSignals: profile.buyingSignals,
        risks: profile.risks,
        opportunities: profile.opportunities,
        evidenceIds: profile.evidenceIds,
        confidence: profile.confidence,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: companyIntelligenceProfiles.id,
        set: {
          companyName: profile.companyName,
          website: profile.website ?? null,
          industry: profile.industry ?? null,
          subIndustry: profile.subIndustry ?? null,
          headquarters: profile.headquarters ?? null,
          geographies: profile.geographies,
          employeeBand: profile.employeeBand ?? null,
          revenueBand: profile.revenueBand ?? null,
          businessModel: profile.businessModel ?? null,
          products: profile.products,
          services: profile.services,
          technologies: profile.technologies,
          competitors: profile.competitors,
          customers: profile.customers,
          painPoints: profile.painPoints,
          strategicPriorities: profile.strategicPriorities,
          buyingSignals: profile.buyingSignals,
          risks: profile.risks,
          opportunities: profile.opportunities,
          evidenceIds: profile.evidenceIds,
          confidence: profile.confidence,
          updatedAt: now,
        },
      });
  }

  async getCompanyProfile(
    context: TenantContext,
    companyId: string,
  ): Promise<PersistedCompanyIntelligenceProfile | null> {
    const tenantId = requireTenant(context);

    const rows = await this.db
      .select()
      .from(companyIntelligenceProfiles)
      .where(
        and(
          eq(companyIntelligenceProfiles.tenantId, tenantId),
          eq(companyIntelligenceProfiles.id, companyId),
        ),
      )
      .limit(1);

    const row = rows[0];

    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenantId,
      companyName: row.companyName,
      ...(row.website === null ? {} : { website: row.website }),
      ...(row.industry === null ? {} : { industry: row.industry }),
      ...(row.subIndustry === null ? {} : { subIndustry: row.subIndustry }),
      ...(row.headquarters === null ? {} : { headquarters: row.headquarters }),
      geographies: row.geographies as string[],
      ...(row.employeeBand === null ? {} : { employeeBand: row.employeeBand }),
      ...(row.revenueBand === null ? {} : { revenueBand: row.revenueBand }),
      ...(row.businessModel === null ? {} : { businessModel: row.businessModel }),
      products: row.products as string[],
      services: row.services as string[],
      technologies: row.technologies as string[],
      competitors: row.competitors as string[],
      customers: row.customers as string[],
      painPoints: row.painPoints as string[],
      strategicPriorities: row.strategicPriorities as string[],
      buyingSignals: row.buyingSignals as string[],
      risks: row.risks as string[],
      opportunities: row.opportunities as string[],
      evidenceIds: row.evidenceIds as string[],
      confidence: row.confidence,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async saveICPProfile(context: TenantContext, profile: ICPProfile): Promise<void> {
    assertTenant(context, profile.tenantId);

    const now = new Date();

    await this.db
      .insert(marketingIcpProfiles)
      .values({
        id: profile.id,
        tenantId: profile.tenantId,
        name: profile.name,
        industries: profile.industries,
        companySizes: profile.companySizes,
        geographies: profile.geographies,
        buyingTriggers: profile.buyingTriggers,
        painPoints: profile.painPoints,
        desiredOutcomes: profile.desiredOutcomes,
        exclusions: profile.exclusions,
        confidence: profile.confidence ?? null,
        evidenceIds: profile.evidenceIds,
        status: profile.status,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: marketingIcpProfiles.id,
        set: {
          name: profile.name,
          industries: profile.industries,
          companySizes: profile.companySizes,
          geographies: profile.geographies,
          buyingTriggers: profile.buyingTriggers,
          painPoints: profile.painPoints,
          desiredOutcomes: profile.desiredOutcomes,
          exclusions: profile.exclusions,
          confidence: profile.confidence ?? null,
          evidenceIds: profile.evidenceIds,
          status: profile.status,
          updatedAt: now,
        },
      });
  }

  async getICPProfile(context: TenantContext, icpId: string): Promise<ICPProfile | null> {
    const tenantId = requireTenant(context);

    const rows = await this.db
      .select()
      .from(marketingIcpProfiles)
      .where(and(eq(marketingIcpProfiles.tenantId, tenantId), eq(marketingIcpProfiles.id, icpId)))
      .limit(1);

    const row = rows[0];

    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      industries: row.industries as string[],
      companySizes: row.companySizes as string[],
      geographies: row.geographies as string[],
      buyingTriggers: row.buyingTriggers as string[],
      painPoints: row.painPoints as string[],
      desiredOutcomes: row.desiredOutcomes as string[],
      exclusions: row.exclusions as string[],
      ...(row.confidence === null ? {} : { confidence: row.confidence }),
      evidenceIds: row.evidenceIds as string[],
      status: row.status as ICPProfile['status'],
    };
  }

  async saveAccount(context: TenantContext, account: Account): Promise<void> {
    assertTenant(context, account.tenantId);

    const now = new Date();

    await this.db
      .insert(marketingAccounts)
      .values({
        id: account.id,
        tenantId: account.tenantId,
        name: account.name,
        website: account.website ?? null,
        industry: account.industry ?? null,
        geography: account.geography ?? null,
        employeeBand: account.employeeBand ?? null,
        icpFit: account.icpFit ?? null,
        status: account.status,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: marketingAccounts.id,
        set: {
          name: account.name,
          website: account.website ?? null,
          industry: account.industry ?? null,
          geography: account.geography ?? null,
          employeeBand: account.employeeBand ?? null,
          icpFit: account.icpFit ?? null,
          status: account.status,
          updatedAt: now,
        },
      });
  }

  async getAccount(context: TenantContext, accountId: string): Promise<Account | null> {
    const tenantId = requireTenant(context);

    const rows = await this.db
      .select()
      .from(marketingAccounts)
      .where(and(eq(marketingAccounts.tenantId, tenantId), eq(marketingAccounts.id, accountId)))
      .limit(1);

    const row = rows[0];

    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      ...(row.website === null ? {} : { website: row.website }),
      ...(row.industry === null ? {} : { industry: row.industry }),
      ...(row.geography === null ? {} : { geography: row.geography }),
      ...(row.employeeBand === null ? {} : { employeeBand: row.employeeBand }),
      ...(row.icpFit === null ? {} : { icpFit: row.icpFit }),
      status: row.status as Account['status'],
    };
  }

  async saveICPAssessment(
    context: TenantContext,
    assessment: PersistedICPAssessment,
  ): Promise<void> {
    assertTenant(context, assessment.tenantId);

    const now = new Date();

    await this.db.insert(icpAssessmentSnapshots).values({
      id: assessment.id,
      tenantId: assessment.tenantId,
      accountId: assessment.accountId,
      icpId: assessment.icpId,
      score: assessment.score,
      tier: assessment.tier,
      matchedIndustries: assessment.matchedIndustries,
      matchedGeographies: assessment.matchedGeographies,
      matchedTriggers: assessment.matchedTriggers,
      matchedPainPoints: assessment.matchedPainPoints,
      exclusions: assessment.exclusions,
      evidenceIds: assessment.evidenceIds,
      reasons: assessment.reasons,
      model: assessment.model,
      createdAt: now,
      updatedAt: now,
    });
  }

  async getLatestICPAssessment(
    context: TenantContext,
    accountId: string,
    icpId: string,
  ): Promise<PersistedICPAssessment | null> {
    const tenantId = requireTenant(context);

    const rows = await this.db
      .select()
      .from(icpAssessmentSnapshots)
      .where(
        and(
          eq(icpAssessmentSnapshots.tenantId, tenantId),
          eq(icpAssessmentSnapshots.accountId, accountId),
          eq(icpAssessmentSnapshots.icpId, icpId),
        ),
      )
      .orderBy(desc(icpAssessmentSnapshots.createdAt))
      .limit(1);

    const row = rows[0];

    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenantId,
      accountId: row.accountId,
      icpId: row.icpId,
      score: row.score,
      tier: row.tier as PersistedICPAssessment['tier'],
      matchedIndustries: row.matchedIndustries as string[],
      matchedGeographies: row.matchedGeographies as string[],
      matchedTriggers: row.matchedTriggers as string[],
      matchedPainPoints: row.matchedPainPoints as string[],
      exclusions: row.exclusions as string[],
      evidenceIds: row.evidenceIds as string[],
      reasons: row.reasons as string[],
      model: row.model,
    };
  }
}
