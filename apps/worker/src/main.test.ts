import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('worker is a bounded PostgreSQL durable runtime loop with safe shutdown and no provider action', async () => {
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /PostgresWorkflowRuntime/);
  assert.match(source, /claimNext/);
  assert.match(source, /recoverExpiredLeases/);
  assert.match(source, /SIGTERM/);
  assert.match(source, /SIGINT/);
  assert.match(source, /await sleep\(1000\)/);
  assert.doesNotMatch(source, /Temporal|provider\.execute|transport\.send|listen\(/);
});
