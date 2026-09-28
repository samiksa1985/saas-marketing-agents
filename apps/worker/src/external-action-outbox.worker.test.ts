import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('worker outbox boundary requires an explicit provider-neutral delivery adapter', async () => {
  const source = await readFile(new URL('../src/external-action-outbox.worker.ts', import.meta.url), 'utf8');
  assert.match(source, /delivery: OutboxDelivery/);
  assert.match(source, /new ExternalActionOutboxWorker/);
  assert.match(source, /WorkerTenantDatabase/);
  assert.doesNotMatch(source, /GoogleAds|@platform\/tool-gateway|\.mutate\(|CredentialResolver/);
  assert.match(source, /new PersistentExternalActionReliabilityStore\(transaction\)/);
});
