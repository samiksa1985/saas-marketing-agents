import type {
  BillingSubscription,
  EntitlementDecision,
  OrganizationEntitlementOverride,
  PlanEntitlement,
  UsageCounter,
} from '@platform/contracts';

import { assertEntitled, resolveEntitlement } from './index.js';

export interface AuthoritativeBillingRepository {
  getActiveSubscription(
    tenantId: string,
    now: string,
  ): Promise<BillingSubscription | null>;
  getPlanEntitlement(
    planId: string,
    key: string,
  ): Promise<PlanEntitlement | null>;
  getOrganizationEntitlementOverride(
    tenantId: string,
    key: string,
    now: string,
  ): Promise<OrganizationEntitlementOverride | null>;
  getUsageCounter(
    tenantId: string,
    key: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<UsageCounter | null>;
}

export interface AuthoritativeUsageReservation {
  consume(request: {
    tenantId: string;
    key: string;
    amount: number;
    /** Resolved only from the active plan or organization override. */
    limit: number;
    periodStart: string;
    periodEnd: string;
    idempotencyKey: string;
    source: string;
  }): Promise<unknown>;
}

export interface AuthoritativeEntitlementAccessOptions {
  now?: () => string;
  source?: string;
}

interface ResolvedAuthority {
  decision: EntitlementDecision;
  subscription: BillingSubscription | null;
  usageLimit?: number;
}

function assertTenant(
  requestedTenantId: string,
  resourceTenantId: string,
  resource: string,
): void {
  if (!requestedTenantId.trim()) {
    throw new Error('Tenant context is required');
  }

  if (requestedTenantId !== resourceTenantId) {
    throw new Error(`Cross-tenant ${resource} access denied`);
  }
}

function assertActivePeriod(
  subscription: BillingSubscription,
  now: string,
): boolean {
  if (
    subscription.status !== 'ACTIVE' &&
    subscription.status !== 'TRIALING'
  ) {
    return false;
  }

  const current = Date.parse(now);
  const start = Date.parse(subscription.currentPeriodStart);
  const end = Date.parse(subscription.currentPeriodEnd);

  return (
    Number.isFinite(current) &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    current >= start &&
    current <= end
  );
}

/**
 * Canonical adapter for agent access checks. It obtains subscription, plan,
 * organization override, and usage from authoritative stores before granting a
 * request. Callers can request units, but can never select a quota limit.
 */
export class AuthoritativeEntitlementAccess {
  private readonly now: () => string;
  private readonly source: string;

  constructor(
    private readonly repository: AuthoritativeBillingRepository,
    private readonly usageReservation: AuthoritativeUsageReservation,
    options: AuthoritativeEntitlementAccessOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.source = options.source ?? 'agent-runtime';
  }

  async authorize(
    tenantId: string,
    entitlementKey: string,
  ): Promise<EntitlementDecision> {
    return (await this.resolve(tenantId, entitlementKey)).decision;
  }

  async consume(
    tenantId: string,
    entitlementKey: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Usage consumption must be a positive integer');
    }

    if (!idempotencyKey.trim()) {
      throw new Error('Usage idempotency key is required');
    }

    const authority = await this.resolve(tenantId, entitlementKey);
    assertEntitled(authority.decision);

    if (
      authority.subscription === null ||
      authority.usageLimit === undefined
    ) {
      throw new Error(
        `Entitlement ${entitlementKey} is not a metered numeric entitlement`,
      );
    }

    await this.usageReservation.consume({
      tenantId,
      key: entitlementKey,
      amount,
      limit: authority.usageLimit,
      periodStart: authority.subscription.currentPeriodStart,
      periodEnd: authority.subscription.currentPeriodEnd,
      idempotencyKey,
      source: this.source,
    });
  }

  private async resolve(
    tenantId: string,
    entitlementKey: string,
  ): Promise<ResolvedAuthority> {
    if (!tenantId.trim()) {
      throw new Error('Tenant context is required');
    }

    if (!entitlementKey.trim()) {
      throw new Error('Entitlement key is required');
    }

    const now = this.now();
    const subscription = await this.repository.getActiveSubscription(
      tenantId,
      now,
    );

    if (subscription === null) {
      return {
        subscription: null,
        decision: {
          tenantId,
          key: entitlementKey,
          allowed: false,
          source: 'DEFAULT_DENY',
          reason: 'No active subscription was found for this tenant.',
        },
      };
    }

    assertTenant(tenantId, subscription.tenantId, 'subscription');

    if (!assertActivePeriod(subscription, now)) {
      return {
        subscription,
        decision: {
          tenantId,
          key: entitlementKey,
          allowed: false,
          source: 'DEFAULT_DENY',
          reason: 'The tenant subscription is not active for the current period.',
        },
      };
    }

    const [planEntitlement, override] = await Promise.all([
      this.repository.getPlanEntitlement(subscription.planId, entitlementKey),
      this.repository.getOrganizationEntitlementOverride(
        tenantId,
        entitlementKey,
        now,
      ),
    ]);

    if (planEntitlement !== null && planEntitlement.planId !== subscription.planId) {
      throw new Error('Plan entitlement does not match active subscription');
    }

    if (override !== null) {
      assertTenant(tenantId, override.tenantId, 'entitlement override');
    }

    const resolvedValue = override?.value ?? planEntitlement?.value;
    const usageLimit =
      typeof resolvedValue === 'number' ? resolvedValue : undefined;

    if (
      usageLimit !== undefined &&
      (!Number.isInteger(usageLimit) || usageLimit < 0)
    ) {
      throw new Error('Authoritative numeric entitlement must be a non-negative integer');
    }

    const persistedUsage =
      usageLimit === undefined
        ? null
        : await this.repository.getUsageCounter(
            tenantId,
            entitlementKey,
            subscription.currentPeriodStart,
            subscription.currentPeriodEnd,
          );

    if (persistedUsage !== null) {
      assertTenant(tenantId, persistedUsage.tenantId, 'usage');

      if (persistedUsage.key !== entitlementKey) {
        throw new Error('Usage key does not match entitlement key');
      }
    }

    const usage =
      usageLimit === undefined
        ? undefined
        : {
            id: persistedUsage?.id ?? `authoritative:${tenantId}:${entitlementKey}`,
            tenantId,
            key: entitlementKey,
            periodStart: subscription.currentPeriodStart,
            periodEnd: subscription.currentPeriodEnd,
            used: persistedUsage?.used ?? 0,
            // Never trust a stored quota as the authority; derive it above.
            limit: usageLimit,
          } satisfies UsageCounter;

    return {
      subscription,
      usageLimit,
      decision: resolveEntitlement({
        tenantId,
        key: entitlementKey,
        planEntitlements: planEntitlement ? [planEntitlement] : [],
        organizationOverrides: override ? [override] : [],
        usage,
        now,
      }),
    };
  }
}
