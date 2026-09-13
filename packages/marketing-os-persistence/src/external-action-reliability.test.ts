import assert from 'node:assert/strict';
import test from 'node:test';
import type { TenantContext } from '@platform/contracts';

import {
  calculateOutboxRetryAt,
  classifyProviderFailure,
  credentialHealthForExpiry,
  decideProviderHealthMutation,
  ExternalActionOutboxWorker,
  sanitizeOperationalCode,
  sanitizeOperationalDiagnostic,
  sanitizeOperationalDetails,
  type ExternalActionOutboxDeliveryStore,
  type OutboxClaimOptions,
  type OutboxFailureInput,
  type ReliableExternalActionOutboxEvent,
} from './external-action-reliability.js';

const tenantA: TenantContext = { tenantId: 'tenant-a', roles: [], permissions: [], locale: 'en' as never };
const tenantB: TenantContext = { tenantId: 'tenant-b', roles: [], permissions: [], locale: 'en' as never };

function event(overrides: Partial<ReliableExternalActionOutboxEvent> = {}): ReliableExternalActionOutboxEvent {
  return {
    id: 'event-a', tenantId: tenantA.tenantId, workflowRunId: 'workflow-a', externalActionId: 'action-a',
    eventType: 'EXTERNAL_ACTION_ROLLED_BACK', state: 'ROLLED_BACK', provider: 'GOOGLE_ADS', accountId: 'account-a',
    correlationId: 'action-a', idempotencyKey: 'external-action:action-a:ROLLED_BACK', payload: {},
    deliveryStatus: 'PENDING', deliveryAttempts: 0, nextAttemptAt: '2026-01-01T00:00:00.000Z',
    occurredAt: '2026-01-01T00:00:00.000Z', ...overrides,
  };
}

class MemoryOutbox implements ExternalActionOutboxDeliveryStore {
  value: ReliableExternalActionOutboxEvent;
  private nextLease = 0;
  constructor(value = event()) { this.value = value; }
  async claimNext(context: TenantContext, options: OutboxClaimOptions) {
    assert.equal(context.tenantId, this.value.tenantId, 'tenant isolation must apply before claim');
    const now = options.now ?? new Date('2026-01-01T00:00:00.000Z');
    const expired = this.value.deliveryStatus === 'PROCESSING' && this.value.leaseExpiresAt && new Date(this.value.leaseExpiresAt) <= now;
    if (this.value.deliveryStatus !== 'PENDING' && !expired) return undefined;
    this.value = {
      ...this.value, deliveryStatus: 'PROCESSING', deliveryAttempts: this.value.deliveryAttempts + 1,
      leaseId: `lease-${++this.nextLease}`, leaseOwner: options.leaseOwner,
      leaseExpiresAt: new Date(now.getTime() + (options.leaseDurationMs ?? 60_000)).toISOString(),
    };
    return { ...this.value };
  }
  async markDelivered(context: TenantContext, id: string, leaseId?: string) {
    assert.equal(context.tenantId, this.value.tenantId);
    assert.equal(id, this.value.id);
    if (this.value.deliveryStatus === 'DELIVERED') return { ...this.value };
    assert.equal(leaseId, this.value.leaseId);
    this.value = { ...this.value, deliveryStatus: 'DELIVERED', deliveredAt: '2026-01-01T00:00:01.000Z' };
    return { ...this.value };
  }
  async recordDeliveryFailure(context: TenantContext, id: string, input: OutboxFailureInput) {
    assert.equal(context.tenantId, this.value.tenantId);
    assert.equal(id, this.value.id);
    assert.equal(input.leaseId, this.value.leaseId);
    const now = input.now ?? new Date('2026-01-01T00:00:00.000Z');
    const retry = input.retryable && this.value.deliveryAttempts < (input.maxAttempts ?? 5);
    this.value = {
      ...this.value,
      deliveryStatus: retry ? 'PENDING' : 'DEAD_LETTER',
      failureCode: input.code,
      ...(retry ? { nextAttemptAt: calculateOutboxRetryAt(this.value.deliveryAttempts, now, input.retryAfterMs).toISOString() } : {}),
    };
    return { ...this.value };
  }
}

test('outbox delivers once and duplicate worker delivery is suppressed', async () => {
  const outbox = new MemoryOutbox();
  const calls: string[] = [];
  const worker = new ExternalActionOutboxWorker(outbox, {
    deliver: async (_context, value) => { calls.push(value.idempotencyKey); },
  });
  assert.equal((await worker.processNext(tenantA, 'worker-a')).outcome, 'DELIVERED');
  assert.equal((await worker.processNext(tenantA, 'worker-b')).outcome, 'IDLE');
  assert.deepEqual(calls, ['external-action:action-a:ROLLED_BACK']);
});

test('transient delivery failure honors retry-after and max attempts dead-letters', async () => {
  const outbox = new MemoryOutbox();
  const worker = new ExternalActionOutboxWorker(outbox, {
    deliver: async () => { throw { code: 'RATE_LIMIT', retryable: true, retryAfterMs: 120_000 }; },
  });
  const retry = await worker.processNext(tenantA, 'worker-a');
  assert.equal(retry.outcome, 'RETRY_SCHEDULED');
  assert.equal(outbox.value.nextAttemptAt, '2026-01-01T00:02:00.000Z');
  outbox.value = event({ deliveryAttempts: 4 });
  assert.equal((await worker.processNext(tenantA, 'worker-a')).outcome, 'DEAD_LETTER');
  assert.equal(outbox.value.deliveryStatus, 'DEAD_LETTER');
});

test('expired processing lease can be claimed by a recovery worker without cross-tenant access', async () => {
  const outbox = new MemoryOutbox(event({ deliveryStatus: 'PROCESSING', leaseId: 'dead-worker', leaseExpiresAt: '2025-12-31T23:59:00.000Z' }));
  const claimed = await outbox.claimNext(tenantA, { leaseOwner: 'recovery-worker' });
  assert.equal(claimed?.leaseOwner, 'recovery-worker');
  await assert.rejects(() => outbox.claimNext(tenantB, { leaseOwner: 'other-tenant' }));
});

test('provider health opens safely and only permits a controlled post-cooldown probe', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.deepEqual(decideProviderHealthMutation({ tenantId: 'tenant-a', provider: 'GOOGLE_ADS', status: 'AUTH_FAILURE', rollingFailureCount: 1 }, now), { allowed: false, code: 'PROVIDER_AUTH_HEALTH_BLOCKED' });
  assert.deepEqual(decideProviderHealthMutation({ tenantId: 'tenant-a', provider: 'GOOGLE_ADS', status: 'RATE_LIMITED', rollingFailureCount: 1, retryAfterAt: '2026-01-01T00:01:00.000Z' }, now), { allowed: false, code: 'PROVIDER_HEALTH_COOLDOWN_ACTIVE' });
  assert.deepEqual(decideProviderHealthMutation({ tenantId: 'tenant-a', provider: 'GOOGLE_ADS', status: 'DEGRADED', rollingFailureCount: 1, cooldownUntil: '2025-12-31T23:59:00.000Z' }, now), { allowed: false, code: 'PROVIDER_RECOVERY_PROBE_REQUIRED', recoveryProbeRequired: true });
});

test('credential lifecycle and provider classifications are provider-neutral and secret-safe', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(credentialHealthForExpiry(new Date('2025-12-31T23:59:00.000Z'), now), 'EXPIRED');
  assert.equal(credentialHealthForExpiry(new Date('2026-01-03T00:00:00.000Z'), now), 'EXPIRING');
  assert.equal(classifyProviderFailure('oauth invalid_grant').credential, 'REVOKED');
  assert.equal(classifyProviderFailure('META_ADS_TOKEN_EXPIRED').credential, 'EXPIRED');
  assert.equal(classifyProviderFailure('META_ADS_TOKEN_REVOKED').credential, 'REVOKED');
  assert.equal(classifyProviderFailure('META_ADS_CREDENTIALS_MISSING').credential, 'MISSING');
  assert.equal(classifyProviderFailure('GOOGLE_ADS_QUOTA_RATE_LIMITED').health, 'RATE_LIMITED');
  assert.equal(sanitizeOperationalDiagnostic('Authorization: Bearer not-a-real-token')?.includes('not-a-real-token'), false);
  assert.equal(sanitizeOperationalCode('Authorization: Bearer not-a-real-token').includes('not-a-real-token'), false);
  assert.equal(sanitizeOperationalCode('x'.repeat(500)).length, 128);
  assert.deepEqual(
    sanitizeOperationalDetails({ request: { accessToken: 'not-a-real-token' }, status: 'safe' }),
    { request: { accessToken: '[REDACTED]' }, status: 'safe' },
  );
});
