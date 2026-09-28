import type { TenantContext } from '@platform/contracts';
import type { TenantScopedTransaction } from '@platform/db';
import { assessExpansion, assessHealth, assessJourneyStage, assessLifecycle, assessRenewal, assessRetentionRisk, buildJourneyPlan, diagnoseJourneyBlockers, generateNextBestActions, type CustomerJourneyEvent } from '@platform/marketing-os-core';
import { PersistentCustomerJourneyStore, type MarketingOSPersistenceDatabase } from '@platform/marketing-os-persistence';
import { ApiTenantDatabase } from './tenant-database.js';

type JourneyTransaction = TenantScopedTransaction & MarketingOSPersistenceDatabase;
export const CUSTOMER_JOURNEY_APPLICATION_SERVICE = 'PLATFORM_CUSTOMER_JOURNEY_APPLICATION_SERVICE';

/** Guarded tenant façade for EPIC11 intelligence. It deliberately has no transport/execution method. */
export class CustomerJourneyApplicationService<T extends JourneyTransaction> {
  constructor(private readonly database: ApiTenantDatabase<T>) {}
  private use<R>(context: TenantContext, operation: (store: PersistentCustomerJourneyStore) => Promise<R>) { return this.database.execute(context, (tx) => operation(new PersistentCustomerJourneyStore(tx))); }
  timeline(context: TenantContext, identityId: string) { return this.use(context, (store) => store.listEvents(context, identityId)); }
  lifecycle(context: TenantContext, identityId: string) { return this.use(context, async (store) => (await store.getLifecycle(context, identityId)) ?? assessLifecycle({ tenantId: context.tenantId, identityId, events: await store.listEvents(context, identityId) })); }
  stage(context: TenantContext, identityId: string) { return this.use(context, async (store) => (await store.getStage(context, identityId)) ?? assessJourneyStage(await this.lifecycle(context, identityId), await store.listEvents(context, identityId))); }
  async evaluate(context: TenantContext, identityId: string) { return this.use(context, async (store) => { const events = await store.listEvents(context, identityId); const lifecycle = await this.lifecycle(context, identityId); const recommendations = generateNextBestActions({ lifecycle, events, capabilities: ['CONVERSATIONS'] }); for (const item of recommendations) await store.saveRecommendation(context, item); const plan = buildJourneyPlan(recommendations); await store.saveLifecycle(context, lifecycle); await store.saveStage(context, assessJourneyStage(lifecycle, events)); await store.savePlan(context, plan); return recommendations; }); }
  recommendations(context: TenantContext, identityId: string) { return this.use(context, (store) => store.listRecommendations(context, identityId)); }
  plan(context: TenantContext, identityId: string) { return this.use(context, (store) => store.getPlan(context, identityId)); }
  async blockers(context: TenantContext, identityId: string) { const [lifecycle, events] = await Promise.all([this.lifecycle(context, identityId), this.timeline(context, identityId)]); return diagnoseJourneyBlockers(lifecycle, events); }
  async health(context: TenantContext, identityId: string) { return assessHealth(context.tenantId, identityId, await this.timeline(context, identityId)); }
  async retention(context: TenantContext, identityId: string) { return assessRetentionRisk(context.tenantId, identityId, await this.timeline(context, identityId)); }
  async renewal(context: TenantContext, identityId: string) { return assessRenewal(context.tenantId, identityId, (await this.lifecycle(context, identityId)).currentState, await this.timeline(context, identityId)); }
  async expansion(context: TenantContext, identityId: string) { return assessExpansion(context.tenantId, identityId, await this.timeline(context, identityId)); }
  async overview(context: TenantContext, identityId: string) { const [timeline, lifecycle, stage, recommendations, plan] = await Promise.all([this.timeline(context, identityId), this.lifecycle(context, identityId), this.stage(context, identityId), this.recommendations(context, identityId), this.plan(context, identityId)]); return { tenantId: context.tenantId, identityId, timeline, lifecycle, stage, recommendations, plan, state: 'RECOMMENDATION_ONLY' as const }; }
  async analytics(context: TenantContext) { return { tenantId: context.tenantId, limitations: ['ANALYTICS_REQUIRES_COMPLETE_TENANT_JOURNEY_POPULATION'], state: 'UNKNOWN' as const }; }
  ingest(context: TenantContext, event: CustomerJourneyEvent) { return this.use(context, (store) => store.saveEvent(context, event)); }
}
