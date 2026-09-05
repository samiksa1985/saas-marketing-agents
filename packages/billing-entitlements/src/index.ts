import type {
  EntitlementDecision,
  EntitlementValue,
  OrganizationEntitlementOverride,
  PlanEntitlement,
  UsageCounter,
} from '@platform/contracts';

export interface EntitlementResolutionInput {
  tenantId: string;
  key: string;
  planEntitlements: PlanEntitlement[];
  organizationOverrides?: OrganizationEntitlementOverride[];
  usage?: UsageCounter;
  now?: string;
}

export interface UsageConsumptionInput {
  tenantId: string;
  key: string;
  amount?: number;
  usage: UsageCounter;
}

function assertTenant(
  tenantId: string,
): void {
  if (!tenantId) {
    throw new Error(
      'Tenant context is required',
    );
  }
}

function isExpired(
  expiresAt: string | undefined,
  now: string,
): boolean {
  if (!expiresAt) {
    return false;
  }

  return (
    new Date(expiresAt).getTime() <=
    new Date(now).getTime()
  );
}

function valueAllows(
  value: EntitlementValue,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  return value.length > 0;
}

export function resolveEntitlement(
  input: EntitlementResolutionInput,
): EntitlementDecision {
  assertTenant(input.tenantId);

  const now =
    input.now ??
    new Date().toISOString();

  const override =
    input.organizationOverrides?.find(
      (candidate) =>
        candidate.tenantId ===
          input.tenantId &&
        candidate.key === input.key &&
        !isExpired(
          candidate.expiresAt,
          now,
        ),
    );

  const planEntitlement =
    input.planEntitlements.find(
      (candidate) =>
        candidate.key === input.key,
    );

  const source =
    override
      ? 'ORGANIZATION_OVERRIDE'
      : planEntitlement
        ? 'PLAN'
        : 'DEFAULT_DENY';

  const entitlementValue =
    override?.value ??
    planEntitlement?.value;

  if (
    entitlementValue === undefined
  ) {
    return {
      tenantId: input.tenantId,
      key: input.key,
      allowed: false,
      source: 'DEFAULT_DENY',
      reason:
        'No entitlement was configured for this capability.',
    };
  }

  const baseAllowed =
    valueAllows(entitlementValue);

  if (!baseAllowed) {
    return {
      tenantId: input.tenantId,
      key: input.key,
      allowed: false,
      source,
      entitlementValue,
      reason:
        'The configured entitlement disables this capability.',
    };
  }

  if (!input.usage) {
    return {
      tenantId: input.tenantId,
      key: input.key,
      allowed: true,
      source,
      entitlementValue,
      reason:
        'Entitlement permits this capability.',
    };
  }

  if (
    input.usage.tenantId !==
    input.tenantId
  ) {
    throw new Error(
      'Cross-tenant usage access denied',
    );
  }

  const limit =
    input.usage.limit;

  if (limit === undefined) {
    return {
      tenantId: input.tenantId,
      key: input.key,
      allowed: true,
      source,
      entitlementValue,
      usage: {
        used: input.usage.used,
      },
      reason:
        'Entitlement permits this capability and no usage limit is configured.',
    };
  }

  const remaining =
    Math.max(
      0,
      limit - input.usage.used,
    );

  return {
    tenantId: input.tenantId,
    key: input.key,
    allowed: remaining > 0,
    source,
    entitlementValue,
    usage: {
      used: input.usage.used,
      limit,
      remaining,
    },
    reason:
      remaining > 0
        ? 'Entitlement and usage limit permit execution.'
        : 'Usage limit has been exhausted.',
  };
}

export function consumeUsage(
  input: UsageConsumptionInput,
): UsageCounter {
  assertTenant(input.tenantId);

  if (
    input.usage.tenantId !==
    input.tenantId
  ) {
    throw new Error(
      'Cross-tenant usage access denied',
    );
  }

  if (
    input.usage.key !== input.key
  ) {
    throw new Error(
      'Usage key does not match entitlement key',
    );
  }

  const amount =
    input.amount ?? 1;

  if (amount <= 0) {
    throw new Error(
      'Usage consumption must be greater than zero',
    );
  }

  const nextUsed =
    input.usage.used + amount;

  if (
    input.usage.limit !== undefined &&
    nextUsed > input.usage.limit
  ) {
    throw new Error(
      'Usage limit exceeded',
    );
  }

  return {
    ...input.usage,
    used: nextUsed,
  };
}

export function assertEntitled(
  decision: EntitlementDecision,
): void {
  if (!decision.allowed) {
    throw new Error(
      `Entitlement denied: ${decision.key} - ${decision.reason}`,
    );
  }
}

export * from './authoritative-access.js';
