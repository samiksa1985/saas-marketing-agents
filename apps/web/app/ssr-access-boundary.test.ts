import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { pilotAccess, signedOutAccess } from './pilot-access.js';

test('server-rendered pages import pilot access from a server-safe module, not the client shell', async () => {
  const [home, surface, access] = await Promise.all([
    readFile('app/page.tsx', 'utf8'),
    readFile('app/[surface]/page.tsx', 'utf8'),
    readFile('app/pilot-access.ts', 'utf8'),
  ]);

  assert.match(home, /from '\.\/pilot-access'/);
  assert.match(surface, /from '\.\.\/pilot-access'/);
  assert.doesNotMatch(`${home}\n${surface}`, /\{ pilotAccess, signedOutAccess \} from ['"].*product-shell/);
  assert.doesNotMatch(access, /^['"]use client['"]/m);
  assert.doesNotMatch(access, /PILOT_API_TOKEN|NEXT_PUBLIC_PILOT_API_TOKEN/);
});

test('SSR access values always provide concrete permission and entitlement arrays', () => {
  for (const access of [pilotAccess, signedOutAccess]) {
    assert.ok(Array.isArray(access.permissions));
    assert.ok(Array.isArray(access.entitlements));
  }
  assert.equal(pilotAccess.permissions.includes('workflow:execute'), true);
  assert.equal(signedOutAccess.tenantContext, 'missing');
});
