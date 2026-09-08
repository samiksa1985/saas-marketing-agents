import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

function source(name: string): string {
  return readFileSync(fileURLToPath(new URL(`drizzle/${name}`, root)), 'utf8');
}

test('0019 repairs RLS for each tenant-owned Marketing OS table only', () => {
  const migration = source('0019_marketing_os_rls_repairs.sql');

  for (const table of [
    'marketing_memory_records',
    'marketing_os_plan_snapshots',
    'marketing_outcome_events',
  ]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }

  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /WITH CHECK \(tenant_id = NULLIF\(current_setting/);
  assert.doesNotMatch(migration, /'users'/);
  const schema = source('../src/schema.ts');
  assert.match(schema, /export const users = pgTable\([\s\S]*?subject: text\('subject'\)/);
  assert.doesNotMatch(
    schema.match(/export const users = pgTable\([\s\S]*?\n\);/)?.[0] ?? '',
    /tenantId/,
  );
  assert.match(schema, /export const tenantMembers = pgTable\([\s\S]*?tenantId: tenant/);
});

test('Drizzle journal has the complete canonical forward chain and omits legacy foundation', () => {
  const journal = JSON.parse(source('meta/_journal.json')) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const tags = journal.entries.map((entry) => entry.tag);

  assert.deepEqual(tags, [
    '0000_odd_killmonger',
    '0001_tenant_rls',
    '0002_workflow_states',
    '0003_durable_execution',
    '0004_durable_execution_rls',
    '0005_marketing_os',
    '0006_knowledge_layer',
    '0007_sales_intelligence',
    '0008_company_icp_intelligence',
    '0009_market_intelligence',
    '0010_strategy_intelligence',
    '0011_customer_success_intelligence',
    '0012_cfo_intelligence',
    '0013_analytics_experiments',
    '0014_billing_entitlements',
    '0015_automation_engine',
    '0016_marketing_execution',
    '0017_admin_governance',
    '0018_reconciliation_forward_repairs',
    '0019_marketing_os_rls_repairs',
    '0020_persistent_marketing_os_runtime',
    '0021_durable_marketing_os_approvals',
  ]);
  assert.equal(tags.includes('0000_foundation'), false);
  assert.deepEqual(
    journal.entries.map((entry) => entry.idx),
    [...tags.keys()],
  );
});

test('0020 adds tenant-scoped Marketing OS plan and execution persistence forward-only', () => {
  const migration = source('0020_persistent_marketing_os_runtime.sql');
  const schema = source('../src/schema.ts');

  assert.match(migration, /ADD COLUMN IF NOT EXISTS plan_id varchar\(255\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS acquisition jsonb/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS marketing_os_execution_records/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /WITH CHECK \(tenant_id = NULLIF\(current_setting/);
  assert.match(schema, /planId: varchar\('plan_id', \{ length: 255 \}\)\.notNull\(\)/);
  assert.match(schema, /export const marketingOsExecutionRecords = pgTable/);
  assert.match(schema, /marketing_os_execution_tenant_idempotency_uidx/);
});

test('0021 extends canonical approvals and records embedding provenance without rewriting 0020', () => {
  const migration = source('0021_durable_marketing_os_approvals.sql');
  const schema = source('../src/schema.ts');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS marketing_os_approval_records/);
  assert.match(migration, /marketing_os_approval_tenant_creation_idempotency_uidx/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS embedding_provider/);
  assert.match(migration, /embedding_model varchar\(255\)/);
  assert.match(migration, /knowledge_document_chunks_tenant_document_fkey/);
  assert.match(migration, /knowledge_documents_tenant_id_id_uidx/);
  assert.match(schema, /export const marketingOsApprovalRecords = pgTable/);
  assert.match(schema, /embeddingProvider: varchar\('embedding_provider'/);
  assert.match(schema, /knowledge_chunks_tenant_embedding_provenance_idx/);
  assert.match(schema, /uniqueIndex\('knowledge_documents_tenant_id_id_uidx'\)/);
});

test('knowledge embedding dimensions use the canonical 1536 database contract', () => {
  const migration = source('0006_knowledge_layer.sql');
  const schema = source('../src/schema.ts');
  const persistence = readFileSync(
    fileURLToPath(new URL('../../marketing-os-persistence/src/knowledge.ts', import.meta.url)),
    'utf8',
  );

  assert.match(migration, /"embedding_vector" vector\(1536\)/);
  assert.match(schema, /export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536/);
  assert.match(schema, /dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS/);
  assert.match(persistence, /KNOWLEDGE_EMBEDDING_DIMENSIONS, type createDb/);
  assert.match(persistence, /result\.vector\.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS/);
});

test('billing plan schema keeps monetary values in integer minor units', () => {
  const schema = source('../src/schema.ts');
  const billingMigration = source('0014_billing_entitlements.sql');

  assert.match(schema, /priceMonthlyMinor: integer\('price_monthly_minor'\)/);
  assert.match(schema, /priceYearlyMinor: integer\('price_yearly_minor'\)/);
  assert.doesNotMatch(schema, /priceMonthly: real\('price_monthly'\)/);
  assert.match(billingMigration, /price_monthly_minor integer/);
  assert.match(billingMigration, /price_yearly_minor integer/);
});
