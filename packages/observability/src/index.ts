import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ObservabilitySignal = 'authentication' | 'authorization' | 'workflow' | 'provider';
export type SignalOutcome =
  | 'accepted'
  | 'rejected'
  | 'started'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'uncertain'
  | 'verified';

type CorrelationContext = { requestId: string };
type LogWriter = (line: string) => void;

const correlation = new AsyncLocalStorage<CorrelationContext>();
const sensitiveKey =
  /authorization|cookie|token|secret|password|credential|api.?key|private.?key|connection.?string|database.?url|email|phone|address|full.?name/i;
const secretAssignment =
  /\b(authorization|bearer|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|token|secret|password|credential|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi;
const url = /\b(?:https?|postgres(?:ql)?|redis):\/\/[^\s"'<>]+/gi;

function safeText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(secretAssignment, '$1=[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(url, '[REDACTED_URL]')
    .slice(0, 500);
}

function sanitize(value: unknown, key = '', depth = 0): unknown {
  if (sensitiveKey.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return safeText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : '[NON_FINITE]';
  if (typeof value === 'boolean' || value === null) return value;
  if (depth >= 4) return '[TRUNCATED]';
  if (Array.isArray(value))
    return value.slice(0, 20).map((entry) => sanitize(entry, '', depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey, depth + 1)]),
    );
  }
  return `[${typeof value}]`;
}

export function runWithRequestId<TResult>(requestId: string, callback: () => TResult): TResult {
  return correlation.run({ requestId }, callback);
}

export function currentRequestId(): string | undefined {
  return correlation.getStore()?.requestId;
}

export function createStructuredLogger(
  service: string,
  writer: LogWriter = (line) => {
    process.stdout.write(`${line}\n`);
  },
) {
  return {
    emit(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
      const record = sanitize({
        ...fields,
        timestamp: new Date().toISOString(),
        level,
        service,
        event: /^[A-Za-z0-9_.-]{1,80}$/.test(event) ? event : 'invalid_event',
        ...(currentRequestId() ? { requestId: currentRequestId() } : {}),
      }) as Record<string, unknown>;
      writer(JSON.stringify(record));
    },
  };
}

const durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;
const knownMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

type HttpSummary = {
  count: number;
  sum: number;
  buckets: number[];
};

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

export class PlatformMetrics {
  private readonly httpCounts = new Map<string, number>();
  private readonly httpDurations = new Map<string, HttpSummary>();
  private readonly signalCounts = new Map<string, number>();

  recordHttpRequest(method: string, route: string, status: number, durationMs: number): void {
    const safeMethod = knownMethods.has(method.toUpperCase()) ? method.toUpperCase() : 'OTHER';
    const safeRoute = /^\/[A-Za-z0-9_./:-]{1,120}$/.test(route) ? route : 'unmatched';
    const safeStatus =
      Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : '500';
    const durationSeconds = Math.max(0, Number.isFinite(durationMs) ? durationMs / 1000 : 0);
    const countKey = JSON.stringify([safeMethod, safeRoute, safeStatus]);
    this.httpCounts.set(countKey, (this.httpCounts.get(countKey) ?? 0) + 1);
    const durationKey = JSON.stringify([safeMethod, safeRoute]);
    const summary = this.httpDurations.get(durationKey) ?? {
      count: 0,
      sum: 0,
      buckets: durationBuckets.map(() => 0),
    };
    summary.count += 1;
    summary.sum += durationSeconds;
    durationBuckets.forEach((bound, index) => {
      if (durationSeconds <= bound) summary.buckets[index]! += 1;
    });
    this.httpDurations.set(durationKey, summary);
  }

  recordSignal(signal: ObservabilitySignal, outcome: SignalOutcome): void {
    const key = `${signal}\u0000${outcome}`;
    this.signalCounts.set(key, (this.signalCounts.get(key) ?? 0) + 1);
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP codecore_http_requests_total Completed HTTP requests.',
      '# TYPE codecore_http_requests_total counter',
    ];
    for (const [key, count] of this.httpCounts) {
      const [method, route, status] = JSON.parse(key) as string[];
      lines.push(
        `codecore_http_requests_total{method="${escapeLabel(method!)}",route="${escapeLabel(route!)}",status="${escapeLabel(status!)}"} ${count}`,
      );
    }

    lines.push(
      '# HELP codecore_http_request_duration_seconds HTTP request duration in seconds.',
      '# TYPE codecore_http_request_duration_seconds histogram',
    );
    for (const [key, summary] of this.httpDurations) {
      const [method, route] = JSON.parse(key) as string[];
      durationBuckets.forEach((bound, index) => {
        lines.push(
          `codecore_http_request_duration_seconds_bucket{method="${escapeLabel(method!)}",route="${escapeLabel(route!)}",le="${bound}"} ${summary.buckets[index]}`,
        );
      });
      lines.push(
        `codecore_http_request_duration_seconds_bucket{method="${escapeLabel(method!)}",route="${escapeLabel(route!)}",le="+Inf"} ${summary.count}`,
      );
      lines.push(
        `codecore_http_request_duration_seconds_sum{method="${escapeLabel(method!)}",route="${escapeLabel(route!)}"} ${summary.sum}`,
      );
      lines.push(
        `codecore_http_request_duration_seconds_count{method="${escapeLabel(method!)}",route="${escapeLabel(route!)}"} ${summary.count}`,
      );
    }

    lines.push(
      '# HELP codecore_platform_events_total Observed security, workflow, and provider outcomes.',
      '# TYPE codecore_platform_events_total counter',
    );
    for (const [key, count] of this.signalCounts) {
      const [signal, outcome] = key.split('\u0000') as [ObservabilitySignal, SignalOutcome];
      lines.push(
        `codecore_platform_events_total{signal="${signal}",outcome="${outcome}"} ${count}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }
}

export function safeRouteLabel(route: string | string[] | undefined): string {
  const value = Array.isArray(route) ? route[0] : route;
  if (typeof value !== 'string') return 'unmatched';
  return /^\/[A-Za-z0-9_./:-]{1,120}$/.test(value) ? value : 'unmatched';
}

export const platformMetrics = new PlatformMetrics();
