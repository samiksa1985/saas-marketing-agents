import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('EPIC13 API is authenticated, delegates consequential activation to EPIC12, and exposes no execution or verification bypass', async () => {
  const [controller, application] = await Promise.all([
    readFile(new URL('../src/customer-growth-decisioning.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/customer-growth-decisioning.application.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(controller, /@UseGuards\(ApiAuthGuard\)/);
  assert.match(controller, /require\(context, \['marketing:admin'\]\)/);
  assert.match(controller, /require\(context, \['artifact:read'\]\)/);
  assert.match(application, /LifecycleActivationApplicationService/);
  assert.match(application, /this\.activation\.evaluate/);
  assert.doesNotMatch(controller, /@(Post|Get)\('.*(?:execute|send|call|verify)/);
  assert.doesNotMatch(application, /provider\.|fetch\(|send\(|transport\./);
});
