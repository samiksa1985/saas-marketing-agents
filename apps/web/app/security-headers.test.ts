import assert from 'node:assert/strict';
import test from 'node:test';
import nextConfig, { productionSecurityHeaders, securityHeadersForEnvironment } from '../next.config.js';

test('web security headers enforce HTTPS, same-origin resources, and OIDC-compatible top-level redirects', () => {
  const headers = securityHeadersForEnvironment('production');
  const configured = headers?.[0]?.headers;
  const values = new Map(configured?.map(({ key, value }) => [key, value]) ?? []);

  assert.equal(headers?.[0]?.source, '/:path*');
  assert.match(values.get('Content-Security-Policy') ?? '', /default-src 'self'/);
  assert.match(values.get('Content-Security-Policy') ?? '', /frame-ancestors 'none'/);
  assert.match(values.get('Content-Security-Policy') ?? '', /form-action 'self'/);
  assert.match(values.get('Strict-Transport-Security') ?? '', /max-age=31536000/);
  assert.equal(values.get('X-Frame-Options'), 'DENY');
  assert.ok(productionSecurityHeaders.length >= 7);
  assert.deepEqual(securityHeadersForEnvironment('development'), []);
  assert.equal(typeof nextConfig.headers, 'function');
});
