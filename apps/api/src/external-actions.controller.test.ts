import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('external-action controller has no Google provider or credential bypass', async () => {
  const source = await readFile(new URL('../src/external-actions.controller.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /@platform\/tool-gateway/);
  assert.doesNotMatch(source, /GoogleAds/);
  assert.doesNotMatch(source, /CredentialResolver/);
  assert.match(source, /this\.actions\.execute\(context, actionId\)/);
  assert.match(source, /requirePermissions\(context, \['marketing:admin', 'workflow:execute', 'integration:admin'\]\)/);
});
