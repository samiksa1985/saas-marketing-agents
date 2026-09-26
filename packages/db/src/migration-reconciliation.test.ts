import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function migration(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../drizzle/${name}`, import.meta.url)), 'utf8');
}

test('knowledge migration protects every tenant table with RLS policies', () => {
  const source = migration('0006_knowledge_layer.sql');

  for (const table of [
    'knowledge_documents',
    'knowledge_document_chunks',
    'knowledge_document_citations',
  ]) {
    assert.match(source, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(source, new RegExp(`'${table}'`));
  }

  assert.match(source, /WITH CHECK \(tenant_id = NULLIF\(current_setting/);
});

test('analytics migration defines RLS policies, not only RLS enablement', () => {
  const source = migration('0013_analytics_experiments.sql');

  for (const table of [
    'marketing_experiments',
    'marketing_experiment_variants',
    'marketing_attribution_snapshots',
  ]) {
    assert.match(source, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(source, new RegExp(`'${table}'`));
  }

  assert.match(source, /WITH CHECK \(tenant_id = NULLIF\(current_setting/);
});

test('Company/ICP migration uses database UUID defaults and billing stores minor-unit amounts', () => {
  const company = migration('0008_company_icp_intelligence.sql');
  const billing = migration('0014_billing_entitlements.sql');

  assert.equal((company.match(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/g) ?? []).length, 4);
  assert.match(billing, /amount_due_minor integer NOT NULL/);
  assert.match(billing, /amount_paid_minor integer NOT NULL DEFAULT 0/);
  assert.match(billing, /amount_minor integer NOT NULL/);
});

test('forward reconciliation migration adds forecast storage without rewriting billing history', () => {
  const forward = migration('0018_reconciliation_forward_repairs.sql');

  assert.match(forward, /CREATE TABLE IF NOT EXISTS financial_forecast_snapshots/);
  assert.match(forward, /financial_forecast_tenant_period_idx/);
  assert.match(forward, /knowledge_document_chunks/);
  assert.match(forward, /WITH CHECK \(tenant_id = NULLIF\(current_setting/);
  assert.match(forward, /NOT VALID/);
  assert.match(forward, /Deliberately excluded: deployed billing real-valued money columns/);
  assert.doesNotMatch(forward, /ALTER TABLE billing_payments/);
});
