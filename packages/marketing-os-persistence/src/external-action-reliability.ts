import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type { TenantContext } from '@platform/contracts';
import {
  externalActionOperationalEvents,
  externalActionWorkflowOutbox,
  externalProviderCredentialHealth,
  externalProviderHealth,
} from '@platform/db';
import type { ExternalActionMutationSafetyGate } from '@platform/marketing-os-core';

import type { MarketingOSPersistenceDatabase } from './index.js';

export type ExternalActionOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'DEAD_LETTER';
export type ProviderHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'RATE_LIMITED'
  | 'AUTH_FAILURE'
  | 'UNAVAILABLE'
  | 'UNKNOWN';
export type CredentialHealthStatus =
  | 'VALID'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'REVOKED'
  | 'INVALID'
  | 'MISSING'
  | 'UNKNOWN';

export type ExternalActionOperationalEventType =
  | 'PROPOSAL_CREATED'
  | 'SIMULATION_COMPLETED'
  | 'POLICY_DECISION'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_DECIDED'
  | 'EXECUTE_ATTEMPT'
  | 'PROVIDER_EXECUTED'
  | 'PROVIDER_VERIFIED'
  | 'VERIFICATION_MISMATCH'
  | 'PROVIDER_UNCERTAIN'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_AUTH_FAILURE'
  | 'PROVIDER_SERVER_FAILURE'
  | 'ROLLBACK_REQUESTED'
  | 'ROLLBACK_SUCCEEDED'
  | 'ROLLBACK_FAILED'
  | 'IDEMPOTENCY_REPLAY'
  | 'OUTBOX_CLAIMED'
  | 'OUTBOX_LEASE_RECOVERED'
  | 'OUTBOX_RETRY_SCHEDULED'
  | 'OUTBOX_DEAD_LETTERED'
  | 'OUTBOX_REPLAYED';

export interface ReliableExternalActionOutboxEvent {
  id: string;
  tenantId: string;
  workflowRunId: string;
  externalActionId: string;
  eventType: string;
  state: string;
  provider: string;
  accountId: string;
  campaignId?: string;
  verificationStatus?: string;
  correlationId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  deliveryStatus: ExternalActionOutboxStatus;
  deliveryAttempts: number;
  leaseId?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  deliveredAt?: string;
  failureCode?: string;
  failureReason?: string;
  failedAt?: string;
  deadLetteredAt?: string;
  retryAfterAt?: string;
  occurredAt: string;
}

export interface ProviderHealthRecord {
  tenantId: string;
  provider: string;
  status: ProviderHealthStatus;
  rollingFailureCount: number;
  lastSuccessfulAt?: string;
  lastFailureAt?: string;
  retryAfterAt?: string;
  cooldownUntil?: string;
  recoveryProbeLeaseUntil?: string;
  lastErrorCode?: string;
}

export interface CredentialHealthRecord {
  tenantId: string;
  provider: string;
  status: CredentialHealthStatus;
  observedAt: string;
  expiresAt?: string;
  lastRefreshAt?: string;
  lastFailureAt?: string;
  disconnectedAt?: string;
  rotationRequired: boolean;
  lastErrorCode?: string;
}

export interface ExternalActionOperationalEvent {
  id?: string;
  provider: string;
  eventType: ExternalActionOperationalEventType;
  correlationId: string;
  externalActionId?: string;
  workflowRunId?: string;
  outboxEventId?: string;
  latencyMs?: number;
  errorCode?: string;
  details?: Record<string, unknown>;
  occurredAt?: string;
}

export interface OutboxClaimOptions {
  leaseOwner: string;
  leaseDurationMs?: number;
  now?: Date;
}

export interface OutboxFailureInput {
  leaseId?: string;
  code: string;
  reason?: string;
  retryable: boolean;
  retryAfterMs?: number;
  maxAttempts?: number;
  now?: Date;
}

export interface OutboxDelivery {
  deliver(context: TenantContext, event: ReliableExternalActionOutboxEvent): Promise<void>;
}

export interface OutboxProcessingResult {
  outcome: 'IDLE' | 'DELIVERED' | 'RETRY_SCHEDULED' | 'DEAD_LETTER';
  event?: ReliableExternalActionOutboxEvent;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LEASE_DURATION_MS = 60_000;
const RECOVERY_PROBE_DURATION_MS = 120_000;

function assertTenant(context: TenantContext): void {
  if (!context.tenantId) throw new Error('TENANT_CONTEXT_REQUIRED');
}

export function sanitizeOperationalDiagnostic(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(authorization|bearer|token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 512);
}

/** Codes are persisted in varchar(128) columns and must never become a secret channel. */
export function sanitizeOperationalCode(value?: string, fallback = 'UNKNOWN'): string {
  return (sanitizeOperationalDiagnostic(value) ?? fallback).slice(0, 128);
}

/** Defensive boundary for internal callers: operational JSON is never a secret store. */
export function sanitizeOperationalDetails(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeDetailValue(value, 0) as Record<string, unknown>;
}

function sanitizeDetailValue(value: unknown, depth: number, key?: string): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (key && /(authorization|token|secret|password|api[-_]?key|credential)/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return sanitizeOperationalDiagnostic(value) ?? '';
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeDetailValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeDetailValue(entryValue, depth + 1, entryKey),
      ]),
    );
  }
  return '[UNSUPPORTED]';
}

export function credentialHealthForExpiry(
  expiresAt: Date | undefined,
  now: Date = new Date(),
): CredentialHealthStatus {
  if (!expiresAt) return 'UNKNOWN';
  if (expiresAt <= now) return 'EXPIRED';
  return expiresAt.getTime() - now.getTime() <= 7 * 24 * 60 * 60_000 ? 'EXPIRING' : 'VALID';
}

export function decideProviderHealthMutation(
  health: ProviderHealthRecord | undefined,
  now: Date = new Date(),
): { allowed: boolean; code?: string; recoveryProbeRequired?: boolean } {
  if (!health || health.status === 'HEALTHY' || health.status === 'UNKNOWN') return { allowed: true };
  if (health.status === 'AUTH_FAILURE') return { allowed: false, code: 'PROVIDER_AUTH_HEALTH_BLOCKED' };
  const retryAt = health.retryAfterAt ? new Date(health.retryAfterAt) : undefined;
  const cooldown = health.cooldownUntil ? new Date(health.cooldownUntil) : undefined;
  if ((retryAt && retryAt > now) || (cooldown && cooldown > now)) {
    return { allowed: false, code: 'PROVIDER_HEALTH_COOLDOWN_ACTIVE' };
  }
  return { allowed: false, code: 'PROVIDER_RECOVERY_PROBE_REQUIRED', recoveryProbeRequired: true };
}

/** Deterministic retry policy shared by durable and in-memory worker tests. */
export function calculateOutboxRetryAt(
  attempt: number,
  now: Date = new Date(),
  retryAfterMs?: number,
): Date {
  const exponentialMs = Math.min(15 * 60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + Math.max(exponentialMs, retryAfterMs ?? 0));
}

export function classifyProviderFailure(code: string): {
  health: ProviderHealthStatus;
  credential?: CredentialHealthStatus;
  event: ExternalActionOperationalEventType;
  cooldownMs: number;
} {
  const normalized = code.toUpperCase();
  if (normalized.includes('META_ADS_CREDENTIALS_MISSING')) {
    return { health: 'AUTH_FAILURE', credential: 'MISSING', event: 'PROVIDER_AUTH_FAILURE', cooldownMs: 30 * 60_000 };
  }
  if (normalized.includes('META_ADS_ACCOUNT_ID_INVALID') || normalized.includes('META_ADS_API_VERSION_INVALID')) {
    return { health: 'AUTH_FAILURE', credential: 'INVALID', event: 'PROVIDER_AUTH_FAILURE', cooldownMs: 30 * 60_000 };
  }
  if (normalized.includes('EXPIRED')) {
    return { health: 'AUTH_FAILURE', credential: 'EXPIRED', event: 'PROVIDER_AUTH_FAILURE', cooldownMs: 30 * 60_000 };
  }
  if (normalized.includes('INVALID_GRANT') || normalized.includes('REVOKED')) {
    return { health: 'AUTH_FAILURE', credential: 'REVOKED', event: 'PROVIDER_AUTH_FAILURE', cooldownMs: 30 * 60_000 };
  }
  if (normalized.includes('AUTH') || normalized.includes('CREDENTIAL')) {
    return { health: 'AUTH_FAILURE', credential: 'INVALID', event: 'PROVIDER_AUTH_FAILURE', cooldownMs: 30 * 60_000 };
  }
  if (normalized.includes('QUOTA') || normalized.includes('RATE_LIMIT')) {
    return { health: 'RATE_LIMITED', event: 'PROVIDER_RATE_LIMIT', cooldownMs: 60_000 };
  }
  if (normalized.includes('TIMEOUT') || normalized.includes('NETWORK') || normalized.includes('UNAVAILABLE') || normalized.includes('SERVER')) {
    return { health: 'UNAVAILABLE', event: 'PROVIDER_SERVER_FAILURE', cooldownMs: 30_000 };
  }
  return { health: 'DEGRADED', event: 'PROVIDER_SERVER_FAILURE', cooldownMs: 15_000 };
}

/**
 * PostgreSQL adapter for the durable external-action delivery outbox. Every
 * method must be called from a transaction already scoped to its tenant.
 */
export class PersistentExternalActionReliabilityStore {
  constructor(private readonly db: MarketingOSPersistenceDatabase) {}

  async listOutbox(
    context: TenantContext,
    statuses: ExternalActionOutboxStatus[] = ['PENDING', 'PROCESSING', 'FAILED', 'DEAD_LETTER'],
  ): Promise<ReliableExternalActionOutboxEvent[]> {
    assertTenant(context);
    const rows = await this.db
      .select()
      .from(externalActionWorkflowOutbox)
      .where(
        and(
          eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
          inArray(externalActionWorkflowOutbox.deliveryStatus, statuses),
        ),
      )
      .orderBy(asc(externalActionWorkflowOutbox.nextAttemptAt), asc(externalActionWorkflowOutbox.occurredAt));
    return rows.map(toOutboxEvent);
  }

  async operationalSummary(context: TenantContext): Promise<Record<ExternalActionOutboxStatus, number>> {
    const events = await this.listOutbox(context, ['PENDING', 'PROCESSING', 'FAILED', 'DEAD_LETTER', 'DELIVERED']);
    return events.reduce(
      (summary, event) => ({ ...summary, [event.deliveryStatus]: summary[event.deliveryStatus] + 1 }),
      { PENDING: 0, PROCESSING: 0, DELIVERED: 0, FAILED: 0, DEAD_LETTER: 0 },
    );
  }

  async claimNext(
    context: TenantContext,
    options: OutboxClaimOptions,
  ): Promise<ReliableExternalActionOutboxEvent | undefined> {
    assertTenant(context);
    const now = options.now ?? new Date();
    const leaseExpiresAt = new Date(now.getTime() + (options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS));
    const [candidate] = await this.db
      .select()
      .from(externalActionWorkflowOutbox)
      .where(
        and(
          eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
          or(
            and(
              eq(externalActionWorkflowOutbox.deliveryStatus, 'PENDING'),
              lte(externalActionWorkflowOutbox.nextAttemptAt, now),
            ),
            and(
              eq(externalActionWorkflowOutbox.deliveryStatus, 'PROCESSING'),
              lte(externalActionWorkflowOutbox.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(externalActionWorkflowOutbox.nextAttemptAt), asc(externalActionWorkflowOutbox.occurredAt))
      .limit(1);
    if (!candidate) return undefined;

    const leaseId = randomUUID();
    const [claimed] = await this.db
      .update(externalActionWorkflowOutbox)
      .set({
        deliveryStatus: 'PROCESSING',
        deliveryAttempts: candidate.deliveryAttempts + 1,
        leaseId,
        leaseOwner: options.leaseOwner,
        leaseExpiresAt,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
          eq(externalActionWorkflowOutbox.id, candidate.id),
          eq(externalActionWorkflowOutbox.deliveryStatus, candidate.deliveryStatus),
          ...(candidate.deliveryStatus === 'PROCESSING'
            ? [eq(externalActionWorkflowOutbox.leaseExpiresAt, candidate.leaseExpiresAt!)]
            : [lte(externalActionWorkflowOutbox.nextAttemptAt, now)]),
        ),
      )
      .returning();
    if (!claimed) return undefined; // A competing worker owns it; do not deliver.
    const event = toOutboxEvent(claimed);
    await this.recordEvent(context, {
      provider: event.provider,
      externalActionId: event.externalActionId,
      workflowRunId: event.workflowRunId,
      outboxEventId: event.id,
      correlationId: event.correlationId,
      eventType: candidate.deliveryStatus === 'PROCESSING' ? 'OUTBOX_LEASE_RECOVERED' : 'OUTBOX_CLAIMED',
      occurredAt: now.toISOString(),
    });
    return event;
  }

  async markDelivered(
    context: TenantContext,
    eventId: string,
    leaseId?: string,
  ): Promise<ReliableExternalActionOutboxEvent> {
    assertTenant(context);
    const now = new Date();
    const processingClaim = leaseId
      ? and(
          eq(externalActionWorkflowOutbox.deliveryStatus, 'PROCESSING'),
          eq(externalActionWorkflowOutbox.leaseId, leaseId),
        )
      : eq(externalActionWorkflowOutbox.deliveryStatus, 'PENDING');
    const [row] = await this.db
      .update(externalActionWorkflowOutbox)
      .set({
        deliveryStatus: 'DELIVERED',
        leaseId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        deliveredAt: now,
        failureCode: null,
        failureReason: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
          eq(externalActionWorkflowOutbox.id, eventId),
          processingClaim,
        ),
      )
      .returning();
    if (row) return toOutboxEvent(row);
    const existing = await this.requireOutbox(context, eventId);
    if (existing.deliveryStatus === 'DELIVERED') return existing;
    throw new Error('EXTERNAL_ACTION_OUTBOX_LEASE_NOT_OWNED');
  }

  async recordDeliveryFailure(
    context: TenantContext,
    eventId: string,
    input: OutboxFailureInput,
  ): Promise<ReliableExternalActionOutboxEvent> {
    assertTenant(context);
    const now = input.now ?? new Date();
    const existing = await this.requireOutbox(context, eventId);
    if (existing.deliveryStatus === 'DELIVERED') return existing;
    if (input.leaseId && existing.leaseId !== input.leaseId) throw new Error('EXTERNAL_ACTION_OUTBOX_LEASE_NOT_OWNED');
    const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const retry = input.retryable && existing.deliveryAttempts < maxAttempts;
    const retryAt = retry ? calculateOutboxRetryAt(existing.deliveryAttempts, now, input.retryAfterMs) : undefined;
    const safeCode = sanitizeOperationalCode(input.code, 'OUTBOX_DELIVERY_FAILED');
    const diagnostic = sanitizeOperationalDiagnostic(input.reason ?? input.code) ?? null;
    const [row] = await this.db
      .update(externalActionWorkflowOutbox)
      .set({
        deliveryStatus: retry ? 'PENDING' : 'DEAD_LETTER',
        leaseId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: retryAt ?? new Date(existing.nextAttemptAt),
        retryAfterAt: input.retryAfterMs ? new Date(now.getTime() + input.retryAfterMs) : null,
        failureCode: safeCode,
        failureReason: diagnostic,
        lastError: diagnostic,
        failedAt: now,
        deadLetteredAt: retry ? null : now,
        updatedAt: now,
      })
      .where(
        and(
          eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
          eq(externalActionWorkflowOutbox.id, eventId),
          eq(externalActionWorkflowOutbox.deliveryStatus, 'PROCESSING'),
          ...(input.leaseId ? [eq(externalActionWorkflowOutbox.leaseId, input.leaseId)] : []),
        ),
      )
      .returning();
    if (!row) throw new Error('EXTERNAL_ACTION_OUTBOX_LEASE_NOT_OWNED');
    const event = toOutboxEvent(row);
    await this.recordEvent(context, {
      provider: event.provider,
      externalActionId: event.externalActionId,
      workflowRunId: event.workflowRunId,
      outboxEventId: event.id,
      correlationId: event.correlationId,
      eventType: retry ? 'OUTBOX_RETRY_SCHEDULED' : 'OUTBOX_DEAD_LETTERED',
      errorCode: safeCode,
      details: { attempt: event.deliveryAttempts, retryable: input.retryable },
      occurredAt: now.toISOString(),
    });
    return event;
  }

  async replay(
    context: TenantContext,
    eventId: string,
    now: Date = new Date(),
  ): Promise<ReliableExternalActionOutboxEvent> {
    assertTenant(context);
    const [row] = await this.db
      .update(externalActionWorkflowOutbox)
      .set({
        deliveryStatus: 'PENDING',
        leaseId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: now,
        failureCode: null,
        failureReason: null,
        retryAfterAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
          eq(externalActionWorkflowOutbox.id, eventId),
          inArray(externalActionWorkflowOutbox.deliveryStatus, ['FAILED', 'DEAD_LETTER']),
        ),
      )
      .returning();
    const event = row ? toOutboxEvent(row) : await this.requireOutbox(context, eventId);
    if (row) {
      await this.recordEvent(context, {
        provider: event.provider,
        externalActionId: event.externalActionId,
        workflowRunId: event.workflowRunId,
        outboxEventId: event.id,
        correlationId: event.correlationId,
        eventType: 'OUTBOX_REPLAYED',
        occurredAt: now.toISOString(),
      });
    }
    return event;
  }

  async recoverExpiredLeases(context: TenantContext, now: Date = new Date()): Promise<number> {
    assertTenant(context);
    const rows = await this.db
      .update(externalActionWorkflowOutbox)
      .set({
        deliveryStatus: 'PENDING',
        leaseId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(externalActionWorkflowOutbox.tenantId, context.tenantId),
          eq(externalActionWorkflowOutbox.deliveryStatus, 'PROCESSING'),
          lte(externalActionWorkflowOutbox.leaseExpiresAt, now),
        ),
      )
      .returning();
    await Promise.all(
      rows.map((row) =>
        this.recordEvent(context, {
          provider: row.provider,
          externalActionId: row.externalActionId,
          workflowRunId: row.workflowRunId,
          outboxEventId: row.id,
          correlationId: row.correlationId,
          eventType: 'OUTBOX_LEASE_RECOVERED',
          occurredAt: now.toISOString(),
        }),
      ),
    );
    return rows.length;
  }

  async getProviderHealth(context: TenantContext, provider: string): Promise<ProviderHealthRecord | undefined> {
    assertTenant(context);
    const [row] = await this.db
      .select()
      .from(externalProviderHealth)
      .where(and(eq(externalProviderHealth.tenantId, context.tenantId), eq(externalProviderHealth.provider, provider)))
      .limit(1);
    return row ? toProviderHealth(row) : undefined;
  }

  async recordProviderSuccess(context: TenantContext, provider: string, now: Date = new Date()): Promise<void> {
    assertTenant(context);
    await this.db
      .insert(externalProviderHealth)
      .values({
        id: providerHealthId(context.tenantId, provider),
        tenantId: context.tenantId,
        provider,
        status: 'HEALTHY',
        rollingFailureCount: 0,
        lastSuccessfulAt: now,
        recoveryProbeLeaseUntil: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [externalProviderHealth.tenantId, externalProviderHealth.provider],
        set: {
          status: 'HEALTHY',
          rollingFailureCount: 0,
          lastSuccessfulAt: now,
          retryAfterAt: null,
          cooldownUntil: null,
          recoveryProbeLeaseUntil: null,
          lastErrorCode: null,
          updatedAt: now,
        },
      });
    await this.recordCredentialHealth(context, provider, { status: 'VALID', now });
  }

  async recordProviderFailure(
    context: TenantContext,
    provider: string,
    code: string,
    retryAfterMs?: number,
    now: Date = new Date(),
  ): Promise<ProviderHealthRecord> {
    assertTenant(context);
    const existing = await this.getProviderHealth(context, provider);
    const safeCode = sanitizeOperationalCode(code, 'PROVIDER_FAILURE');
    const classified = classifyProviderFailure(safeCode);
    const failures = (existing?.rollingFailureCount ?? 0) + 1;
    const cooldownMs = Math.max(classified.cooldownMs, retryAfterMs ?? 0);
    const cooldownUntil = new Date(now.getTime() + cooldownMs);
    const retryAfterAt = retryAfterMs ? new Date(now.getTime() + retryAfterMs) : null;
    await this.db
      .insert(externalProviderHealth)
      .values({
        id: providerHealthId(context.tenantId, provider),
        tenantId: context.tenantId,
        provider,
        status: classified.health,
        rollingFailureCount: failures,
        lastFailureAt: now,
        retryAfterAt,
        cooldownUntil,
        lastErrorCode: safeCode,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [externalProviderHealth.tenantId, externalProviderHealth.provider],
        set: {
          status: classified.health,
          rollingFailureCount: failures,
          lastFailureAt: now,
          retryAfterAt,
          cooldownUntil,
          lastErrorCode: safeCode,
          updatedAt: now,
        },
      });
    if (classified.credential) await this.recordCredentialHealth(context, provider, { status: classified.credential, code: safeCode, now });
    await this.recordEvent(context, {
      provider,
      eventType: classified.event,
      correlationId: `provider-health:${provider}`,
      errorCode: safeCode,
      occurredAt: now.toISOString(),
    });
    return (await this.getProviderHealth(context, provider))!;
  }

  async tryAcquireRecoveryProbe(
    context: TenantContext,
    provider: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    assertTenant(context);
    const [row] = await this.db
      .update(externalProviderHealth)
      .set({ recoveryProbeLeaseUntil: new Date(now.getTime() + RECOVERY_PROBE_DURATION_MS), updatedAt: now })
      .where(
        and(
          eq(externalProviderHealth.tenantId, context.tenantId),
          eq(externalProviderHealth.provider, provider),
          or(
            isNull(externalProviderHealth.recoveryProbeLeaseUntil),
            lte(externalProviderHealth.recoveryProbeLeaseUntil, now),
          ),
        ),
      )
      .returning();
    return Boolean(row);
  }

  async getCredentialHealth(context: TenantContext, provider: string): Promise<CredentialHealthRecord | undefined> {
    assertTenant(context);
    const [row] = await this.db
      .select()
      .from(externalProviderCredentialHealth)
      .where(
        and(
          eq(externalProviderCredentialHealth.tenantId, context.tenantId),
          eq(externalProviderCredentialHealth.provider, provider),
        ),
      )
      .limit(1);
    return row ? toCredentialHealth(row) : undefined;
  }

  async recordCredentialHealth(
    context: TenantContext,
    provider: string,
    input: {
      status: CredentialHealthStatus;
      code?: string;
      expiresAt?: Date;
      refreshSucceeded?: boolean;
      disconnected?: boolean;
      rotationRequired?: boolean;
      now?: Date;
    },
  ): Promise<void> {
    assertTenant(context);
    const now = input.now ?? new Date();
    const safeCode = input.code === undefined ? undefined : sanitizeOperationalCode(input.code, 'CREDENTIAL_FAILURE');
    const failed = input.status !== 'VALID' && input.status !== 'EXPIRING';
    await this.db
      .insert(externalProviderCredentialHealth)
      .values({
        id: credentialHealthId(context.tenantId, provider),
        tenantId: context.tenantId,
        provider,
        status: input.status,
        observedAt: now,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        ...(input.refreshSucceeded ? { lastRefreshAt: now } : {}),
        ...(failed ? { lastFailureAt: now } : {}),
        ...(input.disconnected ? { disconnectedAt: now } : {}),
        rotationRequired: input.rotationRequired ?? input.status === 'EXPIRING',
        ...(safeCode ? { lastErrorCode: safeCode } : {}),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [externalProviderCredentialHealth.tenantId, externalProviderCredentialHealth.provider],
        set: {
          status: input.status,
          observedAt: now,
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          ...(input.refreshSucceeded ? { lastRefreshAt: now } : {}),
          ...(failed ? { lastFailureAt: now } : {}),
          ...(input.disconnected ? { disconnectedAt: now } : {}),
          rotationRequired: input.rotationRequired ?? input.status === 'EXPIRING',
          ...(safeCode ? { lastErrorCode: safeCode } : {}),
          updatedAt: now,
        },
      });
  }

  async recordEvent(context: TenantContext, event: ExternalActionOperationalEvent): Promise<void> {
    assertTenant(context);
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
    await this.db.insert(externalActionOperationalEvents).values({
      id: event.id ?? `external-action-event:${randomUUID()}`,
      tenantId: context.tenantId,
      provider: event.provider,
      externalActionId: event.externalActionId ?? null,
      workflowRunId: event.workflowRunId ?? null,
      outboxEventId: event.outboxEventId ?? null,
      eventType: event.eventType,
      correlationId: event.correlationId,
      latencyMs: event.latencyMs ?? null,
      errorCode: event.errorCode === undefined ? null : sanitizeOperationalCode(event.errorCode),
      details: sanitizeOperationalDetails(event.details ?? {}),
      occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    }).onConflictDoNothing();
  }

  private async requireOutbox(context: TenantContext, eventId: string): Promise<ReliableExternalActionOutboxEvent> {
    const [row] = await this.db
      .select()
      .from(externalActionWorkflowOutbox)
      .where(and(eq(externalActionWorkflowOutbox.tenantId, context.tenantId), eq(externalActionWorkflowOutbox.id, eventId)))
      .limit(1);
    if (!row) throw new Error('EXTERNAL_ACTION_OUTBOX_NOT_FOUND_OR_ACCESS_DENIED');
    return toOutboxEvent(row);
  }
}

/** A worker receives only delivery events and an idempotency key, never a provider mutation capability. */
export interface ExternalActionOutboxDeliveryStore {
  claimNext(context: TenantContext, options: OutboxClaimOptions): Promise<ReliableExternalActionOutboxEvent | undefined>;
  markDelivered(context: TenantContext, eventId: string, leaseId?: string): Promise<ReliableExternalActionOutboxEvent>;
  recordDeliveryFailure(
    context: TenantContext,
    eventId: string,
    input: OutboxFailureInput,
  ): Promise<ReliableExternalActionOutboxEvent>;
}

export class ExternalActionOutboxWorker {
  constructor(
    private readonly outbox: ExternalActionOutboxDeliveryStore,
    private readonly delivery: OutboxDelivery,
  ) {}

  async processNext(context: TenantContext, leaseOwner: string): Promise<OutboxProcessingResult> {
    const event = await this.outbox.claimNext(context, { leaseOwner });
    if (!event) return { outcome: 'IDLE' };
    try {
      await this.delivery.deliver(context, event);
      return { outcome: 'DELIVERED', event: await this.outbox.markDelivered(context, event.id, event.leaseId) };
    } catch (error) {
      const failure = deliveryFailure(error);
      const updated = await this.outbox.recordDeliveryFailure(context, event.id, {
        ...failure,
        ...(event.leaseId ? { leaseId: event.leaseId } : {}),
      });
      return { outcome: updated.deliveryStatus === 'DEAD_LETTER' ? 'DEAD_LETTER' : 'RETRY_SCHEDULED', event: updated };
    }
  }
}

/** Fails mutation closed for persisted unsafe provider state; it does not affect read-back verification. */
export class PersistentProviderHealthMutationGate implements ExternalActionMutationSafetyGate {
  constructor(private readonly store: PersistentExternalActionReliabilityStore) {}

  async allowMutation(
    context: TenantContext,
    proposal: { provider: string },
    now: Date = new Date(),
  ): Promise<{ allowed: boolean; code?: string }> {
    const health = await this.store.getProviderHealth(context, proposal.provider);
    const decision = decideProviderHealthMutation(health, now);
    if (!decision.recoveryProbeRequired) return decision;
    const probe = await this.store.tryAcquireRecoveryProbe(context, proposal.provider, now);
    return probe ? { allowed: true } : { allowed: false, code: 'PROVIDER_RECOVERY_PROBE_IN_PROGRESS' };
  }

  recordSuccess(context: TenantContext, proposal: { provider: string }): Promise<void> {
    return this.store.recordProviderSuccess(context, proposal.provider);
  }

  recordFailure(
    context: TenantContext,
    proposal: { provider: string },
    code: string,
    retryAfterMs?: number,
  ): Promise<void> {
    return this.store.recordProviderFailure(context, proposal.provider, code, retryAfterMs).then(() => undefined);
  }
}

function deliveryFailure(error: unknown): Pick<OutboxFailureInput, 'code' | 'reason' | 'retryable' | 'retryAfterMs'> {
  if (error && typeof error === 'object') {
    const input = error as { code?: unknown; message?: unknown; retryable?: unknown; retryAfterMs?: unknown };
    return {
      code: typeof input.code === 'string' ? input.code : 'OUTBOX_DELIVERY_FAILED',
      retryable: input.retryable !== false,
      ...(typeof input.message === 'string'
        ? { reason: sanitizeOperationalDiagnostic(input.message) ?? 'OUTBOX_DELIVERY_FAILED' }
        : {}),
      ...(typeof input.retryAfterMs === 'number' && input.retryAfterMs >= 0 ? { retryAfterMs: input.retryAfterMs } : {}),
    };
  }
  return { code: 'OUTBOX_DELIVERY_FAILED', retryable: true };
}

function toOutboxEvent(row: typeof externalActionWorkflowOutbox.$inferSelect): ReliableExternalActionOutboxEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workflowRunId: row.workflowRunId,
    externalActionId: row.externalActionId,
    eventType: row.eventType,
    state: row.state,
    provider: row.provider,
    accountId: row.accountId,
    ...(row.campaignId ? { campaignId: row.campaignId } : {}),
    ...(row.verificationStatus ? { verificationStatus: row.verificationStatus } : {}),
    correlationId: row.correlationId,
    idempotencyKey: row.idempotencyKey,
    payload: row.payload as Record<string, unknown>,
    deliveryStatus: row.deliveryStatus as ExternalActionOutboxStatus,
    deliveryAttempts: row.deliveryAttempts,
    ...(row.leaseId ? { leaseId: row.leaseId } : {}),
    ...(row.leaseOwner ? { leaseOwner: row.leaseOwner } : {}),
    ...(row.leaseExpiresAt ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}),
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    ...(row.lastAttemptAt ? { lastAttemptAt: row.lastAttemptAt.toISOString() } : {}),
    ...(row.deliveredAt ? { deliveredAt: row.deliveredAt.toISOString() } : {}),
    ...(row.failureCode ? { failureCode: row.failureCode } : {}),
    ...(row.failureReason ? { failureReason: row.failureReason } : {}),
    ...(row.failedAt ? { failedAt: row.failedAt.toISOString() } : {}),
    ...(row.deadLetteredAt ? { deadLetteredAt: row.deadLetteredAt.toISOString() } : {}),
    ...(row.retryAfterAt ? { retryAfterAt: row.retryAfterAt.toISOString() } : {}),
    occurredAt: row.occurredAt.toISOString(),
  };
}

function toProviderHealth(row: typeof externalProviderHealth.$inferSelect): ProviderHealthRecord {
  return {
    tenantId: row.tenantId,
    provider: row.provider,
    status: row.status as ProviderHealthStatus,
    rollingFailureCount: row.rollingFailureCount,
    ...(row.lastSuccessfulAt ? { lastSuccessfulAt: row.lastSuccessfulAt.toISOString() } : {}),
    ...(row.lastFailureAt ? { lastFailureAt: row.lastFailureAt.toISOString() } : {}),
    ...(row.retryAfterAt ? { retryAfterAt: row.retryAfterAt.toISOString() } : {}),
    ...(row.cooldownUntil ? { cooldownUntil: row.cooldownUntil.toISOString() } : {}),
    ...(row.recoveryProbeLeaseUntil ? { recoveryProbeLeaseUntil: row.recoveryProbeLeaseUntil.toISOString() } : {}),
    ...(row.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
  };
}

function toCredentialHealth(row: typeof externalProviderCredentialHealth.$inferSelect): CredentialHealthRecord {
  return {
    tenantId: row.tenantId,
    provider: row.provider,
    status: row.status as CredentialHealthStatus,
    observedAt: row.observedAt.toISOString(),
    ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
    ...(row.lastRefreshAt ? { lastRefreshAt: row.lastRefreshAt.toISOString() } : {}),
    ...(row.lastFailureAt ? { lastFailureAt: row.lastFailureAt.toISOString() } : {}),
    ...(row.disconnectedAt ? { disconnectedAt: row.disconnectedAt.toISOString() } : {}),
    rotationRequired: row.rotationRequired,
    ...(row.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
  };
}

function providerHealthId(tenantId: string, provider: string): string {
  return `external-provider-health:${tenantId}:${provider}`;
}

function credentialHealthId(tenantId: string, provider: string): string {
  return `external-provider-credential-health:${tenantId}:${provider}`;
}
