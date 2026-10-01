import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStructuredLogger,
  currentRequestId,
  PlatformMetrics,
  runWithRequestId,
  safeRouteLabel,
} from './index.js';

test('structured logs correlate requests and redact sensitive fields and values', () => {
  const output: string[] = [];
  const logger = createStructuredLogger('api', (line) => output.push(line));
  runWithRequestId('request-123', () =>
    logger.emit('warn', 'authentication.rejected', {
      reason: 'Bearer eyJhbGciOiJIUzI1NiJ9',
      authorization: 'secret-header',
      nested: {
        email: 'person@example.com',
        detail: 'password=hunter2',
        diagnostic:
          'subject person@example.com token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signaturevalue123 refresh_token=refresh-canary',
      },
    }),
  );
  assert.equal(currentRequestId(), undefined);
  const record = JSON.parse(output[0]!) as Record<string, unknown>;
  assert.equal(record.requestId, 'request-123');
  assert.equal(record.authorization, '[REDACTED]');
  assert.equal(record.reason, 'Bearer [REDACTED]');
  assert.deepEqual(record.nested, {
    email: '[REDACTED]',
    detail: 'password=[REDACTED]',
    diagnostic: 'subject [REDACTED_EMAIL] token [REDACTED_JWT] refresh_token=[REDACTED]',
  });
});

test('metrics expose bounded request labels and platform outcomes without sample values', () => {
  const metrics = new PlatformMetrics();
  metrics.recordHttpRequest('GET', '/workflows/:workflowId', 200, 125);
  metrics.recordHttpRequest('GET', '/workflows/person@example.com', 200, 200);
  metrics.recordSignal('provider', 'uncertain');
  const output = metrics.renderPrometheus();
  assert.match(
    output,
    /codecore_http_requests_total\{method="GET",route="\/workflows\/:workflowId",status="200"\} 1/,
  );
  assert.match(
    output,
    /codecore_http_requests_total\{method="GET",route="unmatched",status="200"\} 1/,
  );
  assert.match(output, /codecore_platform_events_total\{signal="provider",outcome="uncertain"\} 1/);
  assert.doesNotMatch(output, /person@example\.com/);
  assert.equal(safeRouteLabel('/health'), '/health');
  assert.equal(safeRouteLabel('/health?token=secret'), 'unmatched');
});
