import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('nine commercial surfaces have specific canonical read workspaces and honest states', async () => {
  const source = await readFile('app/commercial-surface.tsx', 'utf8');
  for (const surface of ['campaigns', 'customers', 'conversations', 'journeys', 'approvals', 'analytics', 'integrations', 'reports', 'admin']) {
    assert.match(source, new RegExp(`${surface}:\\s*\\{`));
  }
  for (const state of ['loading', 'empty', 'unavailable', 'error', 'permission-denied', 'entitlement-unavailable']) {
    assert.match(source, new RegExp(state));
  }
  assert.match(source, /GET \/revenue-intelligence/);
  assert.match(source, /GET \/leads/);
  assert.match(source, /GET \/customer-engagement\/conversations/);
  assert.match(source, /GET \/approvals/);
  assert.match(source, /Provider execution remains disabled/);
  assert.match(source, /Customers are not inferred/);
  assert.match(source, /Export unavailable/);
  assert.doesNotMatch(source, /sendEmail|sendSms|sendMessage|executeConsequential/);
});

test('the dynamic route loads the mapped canonical source before rendering a surface', async () => {
  const source = await readFile('app/[surface]/page.tsx', 'utf8');
  assert.match(source, /loadProductSurface/);
  assert.match(source, /pilotDataState=\{dataState\}/);
  assert.doesNotMatch(source, /return <ProductShell initialView=\{view.id\} \/>/);
});
