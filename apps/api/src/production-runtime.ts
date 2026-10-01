import { Catch, type ArgumentsHost, type ExceptionFilter, HttpException, type LoggerService } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { RuntimeConfig } from '@platform/config';
import {
  createStructuredLogger,
  platformMetrics,
  runWithRequestId,
  safeRouteLabel,
} from '@platform/observability';

type RequestLike = { headers: Record<string, string | string[] | undefined>; method?: string; route?: { path?: string | string[] }; ip?: string; socket?: { remoteAddress?: string }; requestId?: string };
type ResponseLike = { setHeader(name: string, value: string): void; status(code: number): ResponseLike; json(value: unknown): void; once?(event: 'finish', listener: () => void): void; statusCode?: number };
type Next = () => void;
type ExpressLike = { set?(name: string, value: unknown): void };

const apiLogger = createStructuredLogger('api');
export const apiMetrics = platformMetrics;

export function metricsAuthorizationAllowed(
  authorization: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!authorization || !expectedToken || !authorization.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function requestIdFor(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Za-z0-9._-]{8,128}$/.test(candidate) ? candidate : randomUUID();
}

export function safeHealthResponse() {
  return { status: 'ok', service: 'api' };
}

export function safeReadinessResponse() {
  return { status: 'ready' };
}

export class SanitizedJsonLogger implements LoggerService {
  private emit(level: string, message: unknown, context?: string): void {
    const safeLevel = level === 'error' || level === 'warn' || level === 'debug' ? level : 'info';
    apiLogger.emit(safeLevel, 'framework.log', {
      message: typeof message === 'string' ? message : 'non-string framework message',
      ...(context ? { context } : {}),
    });
  }
  log(message: unknown, context?: string) { this.emit('info', message, context); }
  error(message: unknown, _trace?: string, context?: string) { this.emit('error', message, context); }
  warn(message: unknown, context?: string) { this.emit('warn', message, context); }
  debug(message: unknown, context?: string) { this.emit('debug', message, context); }
  verbose(message: unknown, context?: string) { this.emit('trace', message, context); }
}

@Catch()
export class SafeHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const code = status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED';
    apiLogger.emit(status >= 500 ? 'error' : 'warn', 'http.request.failed', {
      status,
      code,
      requestId: request.requestId ?? 'unknown',
      method: request.method,
      route: safeRouteLabel(request.route?.path),
    });
    response.status(status).json({ statusCode: status, code, requestId: request.requestId });
  }
}

/** Per-instance protective limiter; a production edge/WAF remains mandatory for distributed limits. */
export function createRateLimitMiddleware(config: RuntimeConfig) {
  const buckets = new Map<string, { count: number; resetsAt: number }>();
  return (request: RequestLike, response: ResponseLike, next: Next): void => {
    const now = Date.now();
    const key = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const current = buckets.get(key);
    const bucket = !current || current.resetsAt <= now ? { count: 0, resetsAt: now + config.apiRateLimitWindowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > config.apiRateLimitMax) {
      response.setHeader('Retry-After', String(Math.ceil((bucket.resetsAt - now) / 1000)));
      response.status(429).json({ statusCode: 429, code: 'RATE_LIMITED', requestId: request.requestId });
      return;
    }
    next();
  };
}

export function configureProductionRuntime(app: INestApplication, config: RuntimeConfig): void {
  const express = app.getHttpAdapter().getInstance() as ExpressLike;
  express.set?.('trust proxy', config.trustProxy ? 1 : false);
  app.use((request: RequestLike, response: ResponseLike, next: Next) => {
    const requestId = requestIdFor(request.headers['x-request-id']);
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (config.nodeEnv === 'production') response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const startedAt = performance.now();
    response.once?.('finish', () => {
      const route = safeRouteLabel(request.route?.path);
      if (route === '/metrics') return;
      const status = response.statusCode ?? 500;
      const method = request.method ?? 'OTHER';
      const durationMs = Math.max(0, performance.now() - startedAt);
      apiMetrics.recordHttpRequest(method, route, status, durationMs);
      apiLogger.emit(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'http.request.completed', {
        method, route, status, durationMs: Math.round(durationMs),
      });
      if (route === '/workflows' || route.startsWith('/workflows/')) {
        apiMetrics.recordSignal('workflow', status >= 500 ? 'failed' : status >= 400 ? 'rejected' : 'succeeded');
        apiLogger.emit(status >= 400 ? 'warn' : 'info', 'workflow.request.completed', {
          route, status, durationMs: Math.round(durationMs),
        });
      }
    });
    runWithRequestId(requestId, next);
  });
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
      if (!origin || config.corsAllowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  });
  app.use(createRateLimitMiddleware(config));
  app.useLogger(new SanitizedJsonLogger());
  app.useGlobalFilters(new SafeHttpExceptionFilter());
}

export function sanitizedRuntimeSummary(config: RuntimeConfig) {
  return { releaseVersion: config.releaseVersion };
}
