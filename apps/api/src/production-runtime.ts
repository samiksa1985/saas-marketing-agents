import { Catch, type ArgumentsHost, type ExceptionFilter, HttpException, type LoggerService } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RuntimeConfig } from '@platform/config';

type RequestLike = { headers: Record<string, string | string[] | undefined>; method?: string; originalUrl?: string; url?: string; ip?: string; socket?: { remoteAddress?: string }; requestId?: string };
type ResponseLike = { setHeader(name: string, value: string): void; status(code: number): ResponseLike; json(value: unknown): void };
type Next = () => void;
type ExpressLike = { set?(name: string, value: unknown): void };

const secretName = /authorization|cookie|token|secret|password|credential|api.?key/i;

export function requestIdFor(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Za-z0-9._-]{8,128}$/.test(candidate) ? candidate : randomUUID();
}

export class SanitizedJsonLogger implements LoggerService {
  private emit(level: string, message: unknown, context?: string): void {
    const safe = typeof message === 'string' ? message.replace(/(authorization|token|secret|password)=[^\s,]+/gi, '$1=[REDACTED]') : 'structured event';
    process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'api', message: safe.slice(0, 500), ...(context ? { context } : {}) })}\n`);
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
    process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'api', event: 'request_failed', status, code, requestId: request.requestId ?? 'unknown', method: request.method, path: request.originalUrl ?? request.url })}\n`);
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
  if (config.trustProxy) express.set?.('trust proxy', 1);
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
    next();
  });
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
      if (!origin || config.corsAllowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS origin denied'));
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
  return { releaseVersion: config.releaseVersion, workflowRuntimeMode: config.workflowRuntimeMode, providerMutations: { google: config.googleAdsExecutionEnabled && config.googleAdsExecutionMode === 'REAL', meta: config.metaAdsExecutionEnabled && config.metaAdsExecutionMode === 'REAL' } };
}
