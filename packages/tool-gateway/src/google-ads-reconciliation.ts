import { createHash } from 'node:crypto';
import { GoogleAdsProviderError } from './google-ads.js';

/**
 * WS-PROD-09 retry/quota/reconciliation boundary for Google Ads.
 *
 * - Retry only transient classes (TIMEOUT, NETWORK_UNCERTAINTY, QUOTA) with
 *   bounded exponential backoff + jitter. Never retry authorization,
 *   permission, invalid-argument, policy, account-mapping, or approval
 *   failures, and never blindly repeat an ambiguous consequential mutation.
 * - Reconciliation compares intended vs actual provider state via read-back;
 *   API success alone is never business success; ambiguity escalates to
 *   MANUAL_REVIEW rather than retry.
 */

export type GoogleAdsRetryDecision = 'RETRY' | 'FAIL' | 'MANUAL_REVIEW';

export function classifyGoogleAdsRetry(error: GoogleAdsProviderError): GoogleAdsRetryDecision {
  if (error.unknownOutcome) return 'MANUAL_REVIEW';
  if (error.retryable && ['TIMEOUT', 'NETWORK_UNCERTAINTY', 'QUOTA'].includes(error.errorClass)) return 'RETRY';
  return 'FAIL';
}

export interface GoogleAdsBackoffOptions {
  baseMs?: number;
  maxMs?: number;
  maxAttempts?: number;
  jitterRatio?: number;
  random?: () => number;
}

/** Bounded exponential backoff with jitter; attempts are capped. */
export function googleAdsBackoffDelays(options: GoogleAdsBackoffOptions = {}): number[] {
  const base = options.baseMs ?? 1_000;
  const max = options.maxMs ?? 30_000;
  const attempts = Math.min(Math.max(options.maxAttempts ?? 3, 1), 10);
  const jitterRatio = options.jitterRatio ?? 0.2;
  const random = options.random ?? Math.random;
  const delays: number[] = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const exponential = Math.min(max, base * 2 ** attempt);
    const jitter = exponential * jitterRatio * (random() * 2 - 1);
    delays.push(Math.max(0, Math.round(exponential + jitter)));
  }
  return delays;
}

export async function withGoogleAdsRetry<T>(
  operation: () => Promise<T>,
  options: GoogleAdsBackoffOptions & { onRetry?: (error: GoogleAdsProviderError, delayMs: number) => void } = {},
): Promise<T> {
  const delays = googleAdsBackoffDelays(options);
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const classified = error instanceof GoogleAdsProviderError ? error : undefined;
      if (!classified || classifyGoogleAdsRetry(classified) !== 'RETRY' || attempt >= delays.length) {
        throw error;
      }
      options.onRetry?.(classified, delays[attempt]!);
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  throw lastError;
}

/** Bounded per-connection/customer concurrency; excess work fails closed fast. */
export class GoogleAdsQuotaLimiter {
  private active = 0;
  private readonly limit: number;

  constructor(limit = 2) {
    this.limit = Math.min(Math.max(limit, 1), 10);
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      throw new GoogleAdsProviderError('GOOGLE_ADS_QUOTA_CONCURRENCY_LIMIT', true, false, 'QUOTA');
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
    }
  }

  get inFlight(): number {
    return this.active;
  }
}

export type GoogleAdsReconciliationOutcome = 'MATCHED' | 'MISMATCHED' | 'MANUAL_REVIEW' | 'PENDING';

export interface GoogleAdsReconciliationInput<TActual> {
  intent: Record<string, unknown>;
  readActual: () => Promise<TActual | undefined>;
  compare: (actual: TActual) => boolean;
  maxReadAttempts?: number;
  readDelayMs?: number;
  /** True when the dispatch outcome was ambiguous (timeout after possible acceptance). */
  ambiguousDispatch?: boolean;
}

/**
 * Read-back reconciliation. Ambiguous dispatch never retries the mutation;
 * it determines remote state first and escalates to MANUAL_REVIEW when the
 * state cannot be proven within the bounded read window.
 */
export async function reconcileGoogleAdsOutcome<TActual>(
  input: GoogleAdsReconciliationInput<TActual>,
): Promise<{ outcome: GoogleAdsReconciliationOutcome; actual?: TActual }> {
  const attempts = Math.min(Math.max(input.maxReadAttempts ?? 3, 1), 10);
  const delay = input.readDelayMs ?? 2_000;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let actual: TActual | undefined;
    try {
      actual = await input.readActual();
    } catch (error) {
      if (error instanceof GoogleAdsProviderError && error.retryable && attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (error instanceof GoogleAdsProviderError && !error.retryable) {
        return { outcome: 'MANUAL_REVIEW' };
      }
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return { outcome: 'MANUAL_REVIEW' };
    }
    if (actual === undefined) {
      // Read returned no state; eventual consistency may still be settling.
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return { outcome: 'MANUAL_REVIEW' };
    }
    return input.compare(actual) ? { outcome: 'MATCHED', actual } : { outcome: 'MISMATCHED', actual };
  }
  return { outcome: 'MANUAL_REVIEW' };
}

/**
 * Dispatch fence: Google Ads operations have no provider idempotency key, so
 * before re-dispatch after an uncertain outcome the caller MUST reconcile the
 * remote state; this guard encodes that rule explicitly.
 */
export function assertSafeRedispatch(outcome: 'PROVIDER_ACCEPTED' | 'PROVIDER_UNKNOWN'): void {
  if (outcome === 'PROVIDER_UNKNOWN') {
    throw new GoogleAdsProviderError('GOOGLE_ADS_AMBIGUOUS_DISPATCH_REQUIRES_RECONCILIATION', false, true, 'VERIFICATION');
  }
}

export function dispatchFingerprint(intent: Record<string, unknown>): string {
  const stable = JSON.stringify(intent, Object.keys(intent).sort());
  return createHash('sha256').update(stable).digest('hex');
}
