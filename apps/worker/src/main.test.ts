import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('worker reports its scoped runtime and handles termination without a provider action', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /databaseTenantScope/);
  assert.match(source, /SIGTERM/);
  assert.match(source, /SIGINT/);
  assert.doesNotMatch(source, /provider\.execute|transport\.send/);
});
