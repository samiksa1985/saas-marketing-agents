import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import {
  billingOrganizationEntitlements,
  billingPlanEntitlements,
  billingSubscriptions,
  billingUsageCounters,
} from '@platform/db';

import type {
  BillingSubscription,
  EntitlementValue,
  OrganizationEntitlementOverride,
  PlanEntitlement,
  UsageCounter,
} from '@platform/contracts';

/** Structural read interface keeps this adapter mockable without PostgreSQL. */
export interface BillingAuthorityPersistenceDatabase {
  select: (...args: any[]) => any;
}

function asEntitlementValue(value: unknown): EntitlementValue {
  if (
    typeof value !== 'boolean' &&
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    throw new Error('Stored entitlement value is invalid');
  }

  return value;
}

function timestamp(value: Date): string {
  return value.toISOString();
}

/**
 * PostgreSQL/Drizzle implementation of the authoritative billing reads used by
 * AuthoritativeEntitlementAccess. It returns no caller-selected limits.
 */
export class PersistentBillingAuthorityRepository {
  constructor(private readonly db: BillingAuthorityPersistenceDatabase) {}

  async getActiveSubscription(
    tenantId: string,
    now: string,
  ): Promise<BillingSubscription | null> {
    const current = new Date(now);
    const row = await this.db
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.tenantId, tenantId),
          or(
            eq(billingSubscriptions.status, 'ACTIVE'),
            eq(billingSubscriptions.status, 'TRIALING'),
          ),
          lte(billingSubscriptions.currentPeriodStart, current),
          gte(billingSubscriptions.currentPeriodEnd, current),
        ),
      )
      .orderBy(desc(billingSubscriptions.currentPeriodEnd))
      .limit(1);

    const subscription = row[0];

    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      tenantId: subscription.tenantId,
      planId: subscription.planId,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      startedAt: timestamp(subscription.startedAt),
      currentPeriodStart: timestamp(subscription.currentPeriodStart),
      currentPeriodEnd: timestamp(subscription.currentPeriodEnd),
      ...(subscription.trialEndsAt
        ? { trialEndsAt: timestamp(subscription.trialEndsAt) }
        : {}),
      ...(subscription.cancelledAt
        ? { cancelledAt: timestamp(subscription.cancelledAt) }
        : {}),
      ...(subscription.provider ? { provider: subscription.provider } : {}),
      ...(subscription.providerSubscriptionId
        ? { providerSubscriptionId: subscription.providerSubscriptionId }
        : {}),
    };
  }

  async getPlanEntitlement(
    planId: string,
    key: string,
  ): Promise<PlanEntitlement | null> {
    const rows = await this.db
      .select()
      .from(billingPlanEntitlements)
      .where(
        and(
          eq(billingPlanEntitlements.planId, planId),
          eq(billingPlanEntitlements.key, key),
        ),
      )
      .limit(1);
    const row = rows[0];

    return row
      ? {
          id: row.id,
          planId: row.planId,
          key: row.key,
          value: asEntitlementValue(row.value),
        }
      : null;
  }

  async getOrganizationEntitlementOverride(
    tenantId: string,
    key: string,
    now: string,
  ): Promise<OrganizationEntitlementOverride | null> {
    const rows = await this.db
      .select()
      .from(billingOrganizationEntitlements)
      .where(
        and(
          eq(billingOrganizationEntitlements.tenantId, tenantId),
          eq(billingOrganizationEntitlements.key, key),
          or(
            // An absent expiry is deliberately included as active.
            gte(billingOrganizationEntitlements.expiresAt, new Date(now)),
            isNull(billingOrganizationEntitlements.expiresAt),
          ),
        ),
      )
      .limit(1);
    const row = rows[0];

    return row
      ? {
          id: row.id,
          tenantId: row.tenantId,
          key: row.key,
          value: asEntitlementValue(row.value),
          ...(row.reason ? { reason: row.reason } : {}),
          ...(row.expiresAt ? { expiresAt: timestamp(row.expiresAt) } : {}),
        }
      : null;
  }

  async getUsageCounter(
    tenantId: string,
    key: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<UsageCounter | null> {
    const rows = await this.db
      .select()
      .from(billingUsageCounters)
      .where(
        and(
          eq(billingUsageCounters.tenantId, tenantId),
          eq(billingUsageCounters.key, key),
          eq(billingUsageCounters.periodStart, new Date(periodStart)),
          eq(billingUsageCounters.periodEnd, new Date(periodEnd)),
        ),
      )
      .limit(1);
    const row = rows[0];

    return row
      ? {
          id: row.id,
          tenantId: row.tenantId,
          key: row.key,
          periodStart: timestamp(row.periodStart),
          periodEnd: timestamp(row.periodEnd),
          used: row.used,
          ...(row.limit === null ? {} : { limit: row.limit }),
        }
      : null;
  }
}
