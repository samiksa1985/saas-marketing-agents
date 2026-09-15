/**
 * Disposable PostgreSQL evidence harness for Production Readiness Phase 1.
 *
 * It refuses non-disposable targets, recreates only the named Phase 1 database,
 * applies the exact Drizzle journal in order, and runs RLS, pgvector, and
 * billing concurrency checks with a non-owner, non-bypass application role.
 */
import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { AuthoritativeEntitlementAccess } from '../../billing-entitlements/src/authoritative-access.js';
import { PersistentBillingAuthorityRepository } from '../../marketing-os-persistence/src/billing-authority.js';
import { AtomicBillingUsageStore } from '../../marketing-os-persistence/src/billing-usage.js';
import {
  ExternalActionOutboxWorker,
  PersistentExternalActionReliabilityStore,
  PersistentProviderHealthMutationGate,
  PersistentExternalActionOutcomeStore,
  PersistentExternalActionPolicyStore,
  PersistentExternalActionStore,
  PersistentPerformanceOptimizationStore,
  PersistentCustomerAcquisitionRevenueStore,
  PersistentUnifiedCampaignStore,
} from '../../marketing-os-persistence/src/index.js';
import type { GovernedExternalAction } from '../../marketing-os-core/src/governed-external-action.js';
import type { TenantContext } from '../../contracts/src/index.js';
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from '../src/schema.js';
import {
  executePhase1Migration,
  Phase1MigrationExecutionError,
  type Phase1JournalEntry,
} from '../src/phase1-migration-diagnostics.js';
import {
  executePhase1ValidationCheck,
  Phase1ValidationExecutionError,
} from '../src/phase1-validation-diagnostics.js';
import {
  applyJournalMigrations,
  loadJournalMigrations,
  type JournalMigrationClient,
} from '../src/journal-migration-runner.js';

type Row = Record<string, unknown>;
type SqlClient = ReturnType<typeof postgres>;
type SqlRecorder = (source: string) => void;
type TenantSettingState = 'UNDEFINED' | 'EMPTY_SAFE_RESET' | 'TENANT_A_ACTIVE' | 'UNEXPECTED_NONEMPTY';
type TenantSettingSnapshot = { backendPid: number; tenantId: string | null; state: TenantSettingState };
type TenantSettingProof = {
  baseline: TenantSettingState;
  insideCommit: TenantSettingState;
  afterCommit: TenantSettingState;
  noContextAfterCommit: TenantSettingState;
  insideRollback: TenantSettingState;
  afterRollback: TenantSettingState;
  noContextAfterRollback: TenantSettingState;
  poolReuse: 'SAME_BACKEND_CONFIRMED' | 'DIFFERENT_BACKEND_NOT_CLAIMED';
};
type PgvectorProof = {
  extensionVersion: string;
  schema: string;
  table: string;
  column: string;
  columnType: string;
  typmod: number;
  dimensions: number;
  roundTripDimensions: number;
  invalidDimensionRejected: true;
  invalidDimensionCode: string | null;
  tenantIsolation: 'PASS';
};
type Epic03Proof = {
  policyVersion: number;
  actionId: string;
  outboxId: string;
  concurrency: { workers: number; attempts: number; successes: number; conflicts: number; unexpectedDuplicates: number };
};
type Epic05Proof = {
  migrationLedgerEntries: number;
  concurrentClaim: { workers: number; attempts: number; successfulClaims: number; skips: number; duplicateClaims: number };
  leaseRecovery: 'PASS';
  retry: 'PASS';
  deadLetter: 'PASS';
  replay: 'PASS';
  providerHealth: 'PASS';
  credentialHealth: 'PASS';
  operatorRecovery: 'PASS';
  workerBoundary: 'PASS';
  cleanup: 'PASS';
};
type Epic07Proof = {
  migrationLedgerEntries: number;
  rlsTables: number;
  idempotency: { attempts: number; created: number; duplicates: number };
  cleanup: 'PASS';
};
type Epic08Proof = {
  migrationLedgerEntries: number;
  rlsTables: number;
  observationIdempotency: { attempts: number; created: number; duplicates: number };
  learningIsolation: 'PASS';
  cleanup: 'PASS';
};
type Epic09Proof = {
  migrationLedgerEntries: number;
  rlsTables: number;
  leadIdempotency: { attempts: number; created: number; duplicates: number };
  identityDeduplication: { attempts: number; created: number; duplicates: number };
  crossTenantDenied: 'PASS';
  missingContextDenied: 'PASS';
  revenueEventIdempotency: 'PASS';
  cleanup: 'PASS';
};
type Epic10Proof = {
  migrationLedgerEntries: number;
  rlsTables: number;
  conversationIngestion: { attempts: number; created: number; duplicates: number };
  receptionistIngestion: { attempts: number; created: number; duplicates: number };
  crossTenantDenied: 'PASS';
  missingContextDenied: 'PASS';
  cleanup: 'PASS';
};

const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';
const appRole = 'phase1_app';
const marketingTablesAddedBy0019 = [
  'marketing_memory_records',
  'marketing_os_plan_snapshots',
  'marketing_outcome_events',
] as const;
const marketingTables = [
  ...marketingTablesAddedBy0019,
  'marketing_os_execution_records',
] as const;
const migrationDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function rows(value: unknown): Row[] {
  return Array.from(value as Iterable<Row>);
}

function one(value: unknown): Row {
  const row = rows(value)[0];
  assert.ok(row, 'expected one row');
  return row;
}

async function validationUnsafe(
  client: SqlClient,
  source: string,
  recordSql: SqlRecorder,
): Promise<unknown> {
  recordSql(source);
  return client.unsafe(source);
}

async function validationTransactionUnsafe(
  transaction: any,
  source: string,
  parameters: unknown[],
  recordSql: SqlRecorder,
): Promise<unknown> {
  recordSql(source);
  return transaction.unsafe(source, parameters);
}

function stringValue(row: Row, name: string): string {
  const value = row[name];
  assert.equal(typeof value, 'string', `expected ${name} to be a string`);
  return value as string;
}

async function expectRlsDenied(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    assert.ok(
      candidate.code === '42501' ||
        /row-level security|permission denied/i.test(candidate.message ?? ''),
      `expected an RLS denial, received: ${candidate.message ?? String(error)}`,
    );
    return;
  }
  assert.fail('expected the statement to be denied by RLS');
}

async function expectRejected(operation: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert.match((error as Error).message, pattern);
    return;
  }
  assert.fail(`expected operation to reject with ${pattern}`);
}

async function expectVectorDimensionRejected(operation: () => Promise<unknown>): Promise<string | null> {
  try {
    await operation();
  } catch (error) {
    const candidate = error as { code?: unknown; message?: unknown };
    assert.match(
      String(candidate.message ?? error),
      /expected \d+ dimensions|different vector dimensions/i,
      'pgvector must reject an incorrectly sized vector',
    );
    return candidate.code === undefined ? null : String(candidate.code);
  }
  assert.fail('pgvector accepted an incorrectly sized vector');
}

function databaseName(url: string): string {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^[A-Za-z0-9_]+$/.test(name) || !/phase1/i.test(name)) {
    throw new Error('PHASE1_DATABASE_URL must name a disposable database containing "phase1"');
  }
  return name;
}

async function close(client: SqlClient | undefined): Promise<void> {
  if (client) await client.end({ timeout: 5 });
}

async function withAppTransaction<T>(
  databaseUrl: string,
  tenantId: string | undefined,
  operation: (transaction: any) => Promise<T>,
): Promise<T> {
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    return (await client.begin(async (transaction) => {
      await transaction.unsafe(`SET LOCAL ROLE ${quoteIdentifier(appRole)}`);
      await transaction`SELECT set_config('app.tenant_id', ${tenantId ?? ''}, true)`;
      const context = one(
        await transaction`SELECT current_user AS role_name, current_setting('app.tenant_id', true) AS tenant_id`,
      );
      assert.equal(context.role_name, appRole, 'CRUD must use the non-owner application role');
      assert.equal(
        context.tenant_id,
        tenantId ?? '',
        'tenant context must be set on the same transaction as CRUD',
      );
      return operation(transaction);
    })) as T;
  } finally {
    await close(client);
  }
}

async function loadJournal(): Promise<Phase1JournalEntry[]> {
  const journal = JSON.parse(
    await readFile(join(migrationDirectory, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ idx: number; tag: string }> };
  assert.ok(journal.entries.length > 0, 'Drizzle journal must not be empty');
  assert.deepEqual(
    journal.entries.map((entry) => entry.idx),
    [...journal.entries.keys()],
    'Drizzle journal indexes must be contiguous',
  );
  return journal.entries;
}

async function applyJournal(client: SqlClient, entries: Phase1JournalEntry[]): Promise<void> {
  for (const entry of entries) {
    const file = `${entry.tag}.sql`;
    await executePhase1Migration(client, {
      entry,
      absolutePath: join(migrationDirectory, file),
      relativePath: `packages/db/drizzle/${file}`,
    });
  }
}

async function recreateDatabase(adminUrl: string, targetName: string): Promise<void> {
  const admin = postgres(adminUrl, { max: 1, prepare: false });
  try {
    const adminName = decodeURIComponent(new URL(adminUrl).pathname.replace(/^\//, ''));
    assert.notEqual(
      adminName,
      targetName,
      'PHASE1_ADMIN_DATABASE_URL must not point at the disposable target',
    );
    await admin`SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${targetName} AND pid <> pg_backend_pid()`;
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(targetName)}`);
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(targetName)}`);
  } finally {
    await close(admin);
  }
}

async function prepareApplicationRole(owner: SqlClient): Promise<void> {
  const currentUser = stringValue(one(await owner`SELECT current_user AS name`), 'name');
  await owner.unsafe(`DROP ROLE IF EXISTS ${quoteIdentifier(appRole)}`);
  await owner.unsafe(
    `CREATE ROLE ${quoteIdentifier(appRole)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  await owner.unsafe(`GRANT ${quoteIdentifier(appRole)} TO ${quoteIdentifier(currentUser)}`);
  await owner.unsafe(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(appRole)}`);
  await owner.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(appRole)}`,
  );
  await owner.unsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdentifier(appRole)}`,
  );
  const role = one(
    await owner`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ${appRole}`,
  );
  assert.equal(role.rolsuper, false, 'application test role must not be superuser');
  assert.equal(role.rolbypassrls, false, 'application test role must not bypass RLS');
}

async function assertMarketingRlsWasAddedOnlyBy0019(
  owner: SqlClient,
  before0019: boolean,
): Promise<void> {
  const state = rows(
    await owner.unsafe(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           EXISTS (
             SELECT 1 FROM pg_policy policy
             WHERE policy.polrelid = c.oid
           ) AS has_policy
    FROM pg_class c
    JOIN pg_namespace namespace ON namespace.oid = c.relnamespace
    WHERE namespace.nspname = 'public'
      AND c.relname IN ('marketing_memory_records', 'marketing_os_plan_snapshots', 'marketing_outcome_events')
    ORDER BY c.relname
  `),
  );
  assert.equal(
    state.length,
    marketingTablesAddedBy0019.length,
    'all Marketing OS tables introduced before 0020 must exist',
  );
  for (const table of state) {
    assert.equal(
      table.rls_enabled,
      !before0019,
      `${String(table.table_name)} RLS state is unexpected`,
    );
    assert.equal(
      table.has_policy,
      !before0019,
      `${String(table.table_name)} policy state is unexpected`,
    );
  }
}

async function assertRlsCoverage(owner: SqlClient): Promise<void> {
  const coverage = rows(
    await owner.unsafe(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS force_rls_enabled,
           EXISTS (
             SELECT 1 FROM pg_policy policy
             WHERE policy.polrelid = c.oid AND policy.polcmd = '*'
           ) AS has_all_command_policy
    FROM pg_class c
    JOIN pg_namespace namespace ON namespace.oid = c.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = c.oid
    WHERE namespace.nspname = 'public'
      AND c.relkind = 'r'
      AND attribute.attname = 'tenant_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY c.relname
  `),
  );
  assert.ok(coverage.length > 0, 'expected tenant-scoped tables');
  assert.ok(
    coverage.every((table) => typeof table.force_rls_enabled === 'boolean'),
    'PostgreSQL catalog must expose the pg_class force-RLS flag',
  );
  const missing = coverage.filter(
    (table) => table.rls_enabled !== true || table.has_all_command_policy !== true,
  );
  assert.deepEqual(missing, [], `tenant RLS coverage missing: ${JSON.stringify(missing)}`);
}

async function assertSchemaInvariants(owner: SqlClient, recordSql: SqlRecorder): Promise<void> {
  const tables = rows(
    await validationUnsafe(owner, `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'tenants', 'users', 'tenant_members',
        'marketing_memory_records', 'marketing_os_plan_snapshots', 'marketing_os_execution_records',
        'marketing_os_approval_records',
        'marketing_outcome_events',
        'knowledge_documents', 'knowledge_document_chunks', 'knowledge_document_citations',
        'billing_plans', 'billing_plan_entitlements', 'billing_subscriptions',
        'billing_organization_entitlements', 'billing_usage_counters', 'billing_usage_events',
        'billing_invoices', 'billing_payments', 'financial_forecast_snapshots',
        'external_action_policies', 'external_action_policy_audit',
        'external_marketing_actions', 'external_marketing_action_evidence',
        'external_action_workflow_outbox', 'external_provider_health',
        'external_provider_credential_health', 'external_action_operational_events',
        'unified_campaigns', 'unified_campaign_execution_steps',
        'unified_campaign_performance_snapshots', 'unified_campaign_recommendations',
        'campaign_performance_observations', 'campaign_performance_aggregates',
        'campaign_performance_diagnostics', 'campaign_performance_anomalies',
        'campaign_optimization_recommendations', 'campaign_optimization_simulations',
        'campaign_optimization_outcomes', 'campaign_optimization_learning',
        'customer_identities', 'customer_identity_identifiers', 'customer_identity_edges', 'customer_identity_aliases',
        'customer_leads', 'customer_lead_capture_quarantine', 'customer_lead_sources', 'customer_lead_identity_links', 'customer_lead_engagement_signals',
        'customer_lead_qualification_assessments', 'customer_conversation_threads', 'customer_conversation_participants',
        'revenue_opportunities', 'revenue_events', 'revenue_attribution_assessments', 'customer_funnel_transitions',
        'acquisition_revenue_diagnostics', 'lead_routing_recommendations', 'acquisition_data_quality_assessments',
        'customer_provider_capabilities',
        'customer_conversation_events', 'customer_conversation_turns', 'customer_conversation_states', 'customer_conversation_intents', 'customer_conversation_summaries',
        'conversation_buying_signals', 'lead_engagement_assessments', 'response_recommendations', 'contactability_assessments',
        'ai_receptionist_profiles', 'ai_receptionist_sessions', 'ai_receptionist_turns', 'ai_receptionist_action_recommendations', 'ai_receptionist_handoffs', 'ai_receptionist_outcomes',
        'customer_handoff_recommendations', 'customer_handoff_records', 'customer_meeting_intents', 'customer_follow_up_recommendations', 'customer_commitments', 'business_commitments', 'conversation_diagnostics'
      )
  `, recordSql),
  );
  assert.equal(tables.length, 82, 'required canonical tables are missing');
  const minorUnits = rows(
    await validationUnsafe(owner, `
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('billing_plans', 'price_monthly_minor'),
        ('billing_plans', 'price_yearly_minor'),
        ('billing_invoices', 'amount_due_minor'),
        ('billing_invoices', 'amount_paid_minor'),
        ('billing_payments', 'amount_minor')
      )
  `, recordSql),
  );
  assert.equal(minorUnits.length, 5, 'minor-unit money columns are missing');
  assert.ok(minorUnits.every((column) => column.data_type === 'integer'));
  const eventIdempotency = rows(
    await validationUnsafe(owner, `
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'billing_usage_events_tenant_idempotency_uidx'
  `, recordSql),
  );
  assert.equal(eventIdempotency.length, 1, 'billing tenant/idempotency unique index is missing');
  const usagePeriod = rows(
    await validationUnsafe(owner, `
    SELECT pg_get_constraintdef(catalog_constraint.oid) AS definition
    FROM pg_constraint catalog_constraint
    WHERE catalog_constraint.contype = 'u'
      AND catalog_constraint.conrelid = 'billing_usage_counters'::regclass
  `, recordSql),
  );
  assert.ok(
    usagePeriod.some((catalogConstraint) =>
      /UNIQUE \(tenant_id, key, period_start, period_end\)/i.test(String(catalogConstraint.definition)),
    ),
    'billing tenant/key/period uniqueness constraint is missing',
  );
  const subscriptionIndexes = rows(
    await validationUnsafe(owner, `
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('billing_subscriptions_tenant_status_idx', 'billing_subscriptions_tenant_period_idx')
  `, recordSql),
  );
  assert.equal(subscriptionIndexes.length, 2, 'billing subscription lookup indexes are missing');
  const marketingForeignKeys = rows(
    await validationUnsafe(owner, `
    SELECT conrelid::regclass::text AS table_name
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = 'tenants'::regclass
      AND conrelid IN (
        'marketing_memory_records'::regclass,
        'marketing_os_plan_snapshots'::regclass,
        'marketing_os_execution_records'::regclass,
        'marketing_os_approval_records'::regclass,
        'marketing_outcome_events'::regclass,
        'external_action_policies'::regclass,
        'external_action_policy_audit'::regclass,
        'external_marketing_actions'::regclass,
        'external_marketing_action_evidence'::regclass,
        'external_action_workflow_outbox'::regclass,
        'external_provider_health'::regclass,
        'external_provider_credential_health'::regclass,
        'external_action_operational_events'::regclass,
        'campaign_performance_observations'::regclass,
        'campaign_performance_aggregates'::regclass,
        'campaign_performance_diagnostics'::regclass,
        'campaign_performance_anomalies'::regclass,
        'campaign_optimization_recommendations'::regclass,
        'campaign_optimization_simulations'::regclass,
        'campaign_optimization_outcomes'::regclass,
        'campaign_optimization_learning'::regclass
      )
  `, recordSql),
  );
  assert.equal(marketingForeignKeys.length, 21, 'Marketing OS tenant foreign keys are missing');
  const governedIndexes = rows(
    await validationUnsafe(owner, `
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'external_marketing_actions_active_target_uidx',
        'external_action_workflow_outbox_tenant_idempotency_uidx',
        'external_action_workflow_outbox_tenant_ready_idx'
      )
    `, recordSql),
  );
  assert.equal(governedIndexes.length, 3, 'governed action concurrency or outbox idempotency index is missing');
}

async function testDurableApprovalRlsLegacy(owner: SqlClient, databaseUrl: string): Promise<void> {
  const ownId = 'phase1-approval-tenant-a';
  const foreignId = 'phase1-approval-tenant-b';
  await owner.unsafe(
    `INSERT INTO marketing_os_approval_records
      (id, tenant_id, artifact_id, requested_at, creation_idempotency_key)
     VALUES ($1, $2::uuid, 'phase1-artifact-a', now(), 'phase1-approval-a')`,
    [ownId, tenantA],
  );
  await owner.unsafe(
    `INSERT INTO marketing_os_approval_records
      (id, tenant_id, artifact_id, requested_at, creation_idempotency_key)
     VALUES ($1, $2::uuid, 'phase1-artifact-b', now(), 'phase1-approval-b')`,
    [foreignId, tenantB],
  );
  await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
    const visible = rows(
      await transaction.unsafe(
        `SELECT id, tenant_id::text FROM marketing_os_approval_records WHERE id IN ($1, $2)`,
        [ownId, foreignId],
      ),
    );
    assert.deepEqual(visible.map((row) => row.tenant_id), [tenantA]);
    await expectRlsDenied(() =>
      transaction.unsafe(
        `INSERT INTO marketing_os_approval_records
          (id, tenant_id, artifact_id, requested_at, creation_idempotency_key)
         VALUES ('phase1-approval-denied', $1::uuid, 'denied', now(), 'phase1-approval-denied')`,
        [tenantB],
      ),
    );
    const updated = rows(
      await transaction.unsafe(
        `UPDATE marketing_os_approval_records SET status = 'APPROVED' WHERE id = $1 RETURNING id`,
        [ownId],
      ),
    );
    assert.equal(updated.length, 1, 'tenant approval update must succeed');
    const foreignUpdate = rows(
      await transaction.unsafe(
        `UPDATE marketing_os_approval_records SET status = 'APPROVED' WHERE id = $1 RETURNING id`,
        [foreignId],
      ),
    );
    assert.equal(foreignUpdate.length, 0, 'foreign approval update must be filtered');
  });
}

async function assertDurableApprovalRlsPolicy(
  owner: SqlClient,
  recordSql: SqlRecorder,
): Promise<void> {
  const policies = rows(
    await validationUnsafe(
      owner,
      `
      SELECT c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS force_rls_enabled,
             policy.polcmd AS policy_command,
             pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
             pg_get_expr(policy.polwithcheck, policy.polrelid) AS with_check_expression
      FROM pg_class c
      JOIN pg_namespace namespace ON namespace.oid = c.relnamespace
      JOIN pg_policy policy ON policy.polrelid = c.oid
      WHERE namespace.nspname = 'public'
        AND c.relname = 'marketing_os_approval_records'
        AND policy.polname = 'marketing_os_approval_records_tenant_policy'
    `,
      recordSql,
    ),
  );
  assert.equal(policies.length, 1, 'durable approval tenant policy is missing');
  const policy = policies[0];
  assert.equal(policy.rls_enabled, true, 'durable approvals must enable RLS');
  assert.equal(typeof policy.force_rls_enabled, 'boolean');
  assert.equal(policy.policy_command, '*', 'durable approvals must use an ALL policy');
  for (const expression of [policy.using_expression, policy.with_check_expression]) {
    const text = String(expression);
    assert.match(text, /current_setting\('app\.tenant_id'(?:\s*::\s*text)?\s*,\s*true\)/);
    assert.match(text, /::uuid/);
  }
}

async function testDurableApprovalRls(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
): Promise<void> {
  const ownId = 'phase1-approval-tenant-a';
  const foreignId = 'phase1-approval-tenant-b';

  recordStep('policy_metadata');
  await assertDurableApprovalRlsPolicy(owner, recordSql);
  const runApprovalSql = (transaction: any, source: string, parameters: unknown[] = []) =>
    validationTransactionUnsafe(transaction, source, parameters, recordSql);

  recordStep('tenant_a_insert');
  const own = await withAppTransaction(databaseUrl, tenantA, async (transaction) =>
    one(
      await runApprovalSql(
        transaction,
        `INSERT INTO marketing_os_approval_records
          (id, tenant_id, artifact_id, workflow_id, requested_by_user_id, requested_at, creation_idempotency_key)
         VALUES ($1, $2::uuid, 'phase1-artifact-a', 'phase1-workflow-a', 'phase1-requester-a', now(), 'phase1-approval-a')
         RETURNING id, status, decision`,
        [ownId, tenantA],
      ),
    ),
  );

  recordStep('tenant_b_insert');
  const foreign = await withAppTransaction(databaseUrl, tenantB, async (transaction) =>
    one(
      await runApprovalSql(
        transaction,
        `INSERT INTO marketing_os_approval_records
          (id, tenant_id, artifact_id, workflow_id, requested_by_user_id, requested_at, creation_idempotency_key)
         VALUES ($1, $2::uuid, 'phase1-artifact-b', 'phase1-workflow-b', 'phase1-requester-b', now(), 'phase1-approval-b')
         RETURNING id, status, decision`,
        [foreignId, tenantB],
      ),
    ),
  );

  recordStep('tenant_a_read');
  await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
    const read = one(
      await runApprovalSql(
        transaction,
        `SELECT id, status, decision FROM marketing_os_approval_records WHERE id = $1`,
        [own.id],
      ),
    );
    assert.equal(read.id, own.id, 'tenant A must read its created approval');
    assert.equal(read.status, 'PENDING');
    assert.equal(read.decision, null);
  });

  recordStep('tenant_a_transition');
  await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
    const decided = one(
      await runApprovalSql(
        transaction,
        `UPDATE marketing_os_approval_records
         SET status = 'APPROVED',
             decision = 'approved',
             approver_user_id = 'phase1-approver-a',
             decided_at = now(),
             decision_idempotency_key = 'phase1-approval-decision-a'
         WHERE id = $1
           AND status = 'PENDING'
           AND decision IS NULL
         RETURNING id, status, decision, decision_idempotency_key`,
        [own.id],
      ),
    );
    assert.equal(decided.status, 'APPROVED');
    assert.equal(decided.decision, 'approved');
    assert.equal(decided.decision_idempotency_key, 'phase1-approval-decision-a');
  });

  // The rejection escapes the callback so postgres.js rolls back the isolated
  // transaction rather than leaving a later approval assertion aborted.
  recordStep('cross_tenant_insert_denied');
  await expectRlsDenied(() =>
    withAppTransaction(databaseUrl, tenantA, (transaction) =>
      runApprovalSql(
        transaction,
        `INSERT INTO marketing_os_approval_records
          (id, tenant_id, artifact_id, requested_at, creation_idempotency_key)
         VALUES ('phase1-approval-cross-tenant', $1::uuid, 'denied', now(), 'phase1-approval-cross-tenant')`,
        [tenantB],
      ),
    ),
  );

  recordStep('cross_tenant_mutation_denied');
  await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
    const updated = rows(
      await runApprovalSql(
        transaction,
        `UPDATE marketing_os_approval_records
         SET status = 'REJECTED'
         WHERE id = $1
         RETURNING id`,
        [foreign.id],
      ),
    );
    assert.equal(updated.length, 0, 'tenant A must not mutate tenant B approval');
  });

  recordStep('tenant_b_read_denied');
  await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
    const hidden = rows(
      await runApprovalSql(
        transaction,
        `SELECT id FROM marketing_os_approval_records WHERE id = $1`,
        [own.id],
      ),
    );
    assert.equal(hidden.length, 0, 'tenant B must not read tenant A approval');
  });

  recordStep('tenant_b_update_denied');
  await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
    const updated = rows(
      await runApprovalSql(
        transaction,
        `UPDATE marketing_os_approval_records
         SET status = 'REJECTED'
         WHERE id = $1
         RETURNING id`,
        [own.id],
      ),
    );
    assert.equal(updated.length, 0, 'tenant B must not update tenant A approval');
  });

  recordStep('missing_context_read_denied');
  await withAppTransaction(databaseUrl, undefined, async (transaction) => {
    const hidden = rows(
      await runApprovalSql(
        transaction,
        `SELECT id FROM marketing_os_approval_records WHERE id = $1`,
        [own.id],
      ),
    );
    assert.equal(hidden.length, 0, 'missing context must not read durable approvals');
  });

  recordStep('missing_context_insert_denied');
  await expectRlsDenied(() =>
    withAppTransaction(databaseUrl, undefined, (transaction) =>
      runApprovalSql(
        transaction,
        `INSERT INTO marketing_os_approval_records
          (id, tenant_id, artifact_id, requested_at, creation_idempotency_key)
         VALUES ('phase1-approval-missing-context', $1::uuid, 'denied', now(), 'phase1-approval-missing-context')`,
        [tenantA],
      ),
    ),
  );

  // This runs after the original write and transition transactions have closed,
  // with a fresh PostgreSQL client and transaction rather than process memory.
  recordStep('durable_recovery');
  await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
    const recovered = one(
      await runApprovalSql(
        transaction,
        `SELECT id, status, decision, decision_idempotency_key
         FROM marketing_os_approval_records
         WHERE id = $1`,
        [own.id],
      ),
    );
    assert.equal(recovered.id, own.id, 'fresh client must recover durable approval');
    assert.equal(recovered.status, 'APPROVED');
    assert.equal(recovered.decision, 'approved');
    assert.equal(recovered.decision_idempotency_key, 'phase1-approval-decision-a');
  });
}

type MarketingFixture = { id: string; tenantId: string };

async function assertMarketingCrudRlsPolicy(
  owner: SqlClient,
  recordSql: SqlRecorder,
): Promise<void> {
  const policies = rows(
    await validationUnsafe(
      owner,
      `
      SELECT c.relname AS table_name,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS force_rls_enabled,
             policy.polcmd AS policy_command,
             pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
             pg_get_expr(policy.polwithcheck, policy.polrelid) AS with_check_expression
      FROM pg_class c
      JOIN pg_namespace namespace ON namespace.oid = c.relnamespace
      JOIN pg_policy policy ON policy.polrelid = c.oid
      WHERE namespace.nspname = 'public'
        AND c.relname IN (
          'marketing_memory_records',
          'marketing_os_plan_snapshots',
          'marketing_os_execution_records',
          'marketing_outcome_events'
        )
        AND policy.polname = c.relname || '_tenant_policy'
      ORDER BY c.relname
    `,
      recordSql,
    ),
  );
  assert.equal(policies.length, marketingTables.length, 'Marketing OS RLS policies are missing');
  for (const policy of policies) {
    assert.equal(policy.rls_enabled, true, `${String(policy.table_name)} must enable RLS`);
    assert.equal(typeof policy.force_rls_enabled, 'boolean');
    assert.equal(policy.policy_command, '*', `${String(policy.table_name)} must use an ALL policy`);
    for (const expression of [policy.using_expression, policy.with_check_expression]) {
      const text = String(expression);
      assert.match(text, /current_setting\('app\.tenant_id'(?:\s*::\s*text)?\s*,\s*true\)/);
      assert.match(text, /::uuid/);
    }
  }
}

async function insertMarketingFixture(
  client: any,
  table: (typeof marketingTables)[number],
  tenantId: string,
): Promise<MarketingFixture> {
  const id = randomUUID();
  const scopeId = randomUUID();
  if (table === 'marketing_memory_records') {
    await client.unsafe(
      `INSERT INTO marketing_memory_records (id, tenant_id, scope, scope_id, statement)
       VALUES ($1::uuid, $2::uuid, 'phase1', $3::uuid, 'phase1 fixture')`,
      [id, tenantId, scopeId],
    );
  } else if (table === 'marketing_os_plan_snapshots') {
    await client.unsafe(
      `INSERT INTO marketing_os_plan_snapshots
       (id, tenant_id, plan_id, goal, objective, plan, context, acquisition, readiness)
       VALUES ($1::uuid, $2::uuid, $3, 'phase1 goal', 'phase1', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
      [id, tenantId, `phase1-${id}`],
    );
  } else if (table === 'marketing_os_execution_records') {
    await client.unsafe(
      `INSERT INTO marketing_os_execution_records
       (id, tenant_id, plan_id, engagement_id, locale, idempotency_key, status, approved, reasons)
       VALUES ($1::uuid, $2::uuid, $3, 'phase1-engagement', 'en', $4, 'PREPARED', true, '[]'::jsonb)`,
      [id, tenantId, `phase1-${id}`, `phase1-${id}`],
    );
  } else {
    await client.unsafe(
      `INSERT INTO marketing_outcome_events
       (id, tenant_id, type, metric, value, source_entity_id, occurred_at, attributes)
       VALUES ($1::uuid, $2::uuid, 'phase1', 'phase1.metric', 1, $3::uuid, now(), '{}'::jsonb)`,
      [id, tenantId, scopeId],
    );
  }
  return { id, tenantId };
}

async function testMarketingCrudRlsLegacy(owner: SqlClient, databaseUrl: string): Promise<void> {
  for (const table of marketingTables) {
    const own = await insertMarketingFixture(owner, table, tenantA);
    const foreign = await insertMarketingFixture(owner, table, tenantB);

    await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
      const visible = rows(
        await transaction.unsafe(
          `SELECT id::text, tenant_id::text FROM ${table} WHERE id IN ($1::uuid, $2::uuid) ORDER BY id`,
          [own.id, foreign.id],
        ),
      );
      assert.deepEqual(
        visible.map((row) => row.tenant_id),
        [tenantA],
      );

      const inserted = await insertMarketingFixture(transaction, table, tenantA);
      await expectRlsDenied(() => insertMarketingFixture(transaction, table, tenantB));

      const updateOwn = rows(
        await transaction.unsafe(
          `UPDATE ${table} SET updated_at = now() WHERE id = $1::uuid RETURNING id`,
          [own.id],
        ),
      );
      assert.equal(updateOwn.length, 1, `${table} owner update must succeed`);
      const updateForeign = rows(
        await transaction.unsafe(
          `UPDATE ${table} SET updated_at = now() WHERE id = $1::uuid RETURNING id`,
          [foreign.id],
        ),
      );
      assert.equal(updateForeign.length, 0, `${table} foreign update must be filtered`);
      await expectRlsDenied(() =>
        transaction.unsafe(`UPDATE ${table} SET tenant_id = $2::uuid WHERE id = $1::uuid`, [
          own.id,
          tenantB,
        ]),
      );

      const deletedOwn = rows(
        await transaction.unsafe(`DELETE FROM ${table} WHERE id = $1::uuid RETURNING id`, [
          inserted.id,
        ]),
      );
      assert.equal(deletedOwn.length, 1, `${table} owner delete must succeed`);
      const deletedForeign = rows(
        await transaction.unsafe(`DELETE FROM ${table} WHERE id = $1::uuid RETURNING id`, [
          foreign.id,
        ]),
      );
      assert.equal(deletedForeign.length, 0, `${table} foreign delete must be filtered`);
    });

    const remains = rows(
      await owner.unsafe(`SELECT id FROM ${table} WHERE id = $1::uuid`, [foreign.id]),
    );
    assert.equal(remains.length, 1, `${table} foreign row must remain`);

    await withAppTransaction(databaseUrl, undefined, async (transaction) => {
      const noContextRows = rows(
        await transaction.unsafe(`SELECT id FROM ${table} WHERE id = $1::uuid`, [own.id]),
      );
      assert.equal(noContextRows.length, 0, `${table} must deny reads without tenant context`);
      await expectRlsDenied(() => insertMarketingFixture(transaction, table, tenantA));
    });
  }
}

async function testMarketingCrudRls(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
): Promise<void> {
  recordStep('policy_metadata');
  await assertMarketingCrudRlsPolicy(owner, recordSql);

  for (const table of marketingTables) {
    console.log(`PHASE1_RLS_TABLE=${table}`);

    recordStep('tenant_a_insert');
    const { own, deletable } = await withAppTransaction(databaseUrl, tenantA, async (transaction) => ({
      own: await insertMarketingFixture(transaction, table, tenantA),
      deletable: await insertMarketingFixture(transaction, table, tenantA),
    }));

    recordStep('tenant_b_insert');
    const foreign = await withAppTransaction(databaseUrl, tenantB, (transaction) =>
      insertMarketingFixture(transaction, table, tenantB),
    );

    recordStep('tenant_a_select');
    await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
      const visible = rows(
        await transaction.unsafe(
          `SELECT id::text, tenant_id::text FROM ${table} WHERE id IN ($1::uuid, $2::uuid) ORDER BY id`,
          [own.id, foreign.id],
        ),
      );
      assert.deepEqual(
        visible.map((row) => row.tenant_id),
        [tenantA],
      );

      recordStep('tenant_a_update');
      const updated = rows(
        await transaction.unsafe(
          `UPDATE ${table} SET updated_at = now() WHERE id = $1::uuid RETURNING id`,
          [own.id],
        ),
      );
      assert.equal(updated.length, 1, `${table} tenant A update must succeed`);

      recordStep('tenant_a_delete');
      const deleted = rows(
        await transaction.unsafe(`DELETE FROM ${table} WHERE id = $1::uuid RETURNING id`, [
          deletable.id,
        ]),
      );
      assert.equal(deleted.length, 1, `${table} tenant A delete must succeed`);
    });

    // Expected RLS rejections must escape their transaction so postgres.js can
    // roll it back; catching an error inside a transaction leaves it aborted.
    recordStep('cross_tenant_insert_denied');
    await expectRlsDenied(() =>
      withAppTransaction(databaseUrl, tenantA, (transaction) =>
        insertMarketingFixture(transaction, table, tenantB),
      ),
    );

    recordStep('cross_tenant_update_denied');
    await expectRlsDenied(() =>
      withAppTransaction(databaseUrl, tenantA, (transaction) =>
        transaction.unsafe(`UPDATE ${table} SET tenant_id = $2::uuid WHERE id = $1::uuid`, [
          own.id,
          tenantB,
        ]),
      ),
    );

    recordStep('tenant_b_select_denied');
    await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
      const rowsForB = rows(
        await transaction.unsafe(`SELECT id FROM ${table} WHERE id = $1::uuid`, [own.id]),
      );
      assert.equal(rowsForB.length, 0, `${table} tenant B must not read tenant A rows`);
    });

    recordStep('tenant_b_update_denied');
    await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
      const updated = rows(
        await transaction.unsafe(
          `UPDATE ${table} SET updated_at = now() WHERE id = $1::uuid RETURNING id`,
          [own.id],
        ),
      );
      assert.equal(updated.length, 0, `${table} tenant B must not update tenant A rows`);
    });

    recordStep('tenant_b_delete_denied');
    await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
      const deleted = rows(
        await transaction.unsafe(`DELETE FROM ${table} WHERE id = $1::uuid RETURNING id`, [own.id]),
      );
      assert.equal(deleted.length, 0, `${table} tenant B must not delete tenant A rows`);
    });

    recordStep('tenant_a_row_survives');
    await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
      const remains = rows(
        await transaction.unsafe(`SELECT id FROM ${table} WHERE id = $1::uuid`, [own.id]),
      );
      assert.equal(remains.length, 1, `${table} tenant A row must survive tenant B operations`);
    });

    recordStep('missing_context_select_denied');
    await withAppTransaction(databaseUrl, undefined, async (transaction) => {
      const noContextRows = rows(
        await transaction.unsafe(`SELECT id FROM ${table} WHERE id = $1::uuid`, [own.id]),
      );
      assert.equal(noContextRows.length, 0, `${table} must deny reads without tenant context`);
    });

    recordStep('missing_context_insert_denied');
    await expectRlsDenied(() =>
      withAppTransaction(databaseUrl, undefined, (transaction) =>
        insertMarketingFixture(transaction, table, tenantA),
      ),
    );
  }
}

function tenantSettingState(tenantId: string | null): TenantSettingState {
  if (tenantId === null) return 'UNDEFINED';
  if (tenantId === '') return 'EMPTY_SAFE_RESET';
  if (tenantId === tenantA) return 'TENANT_A_ACTIVE';
  return 'UNEXPECTED_NONEMPTY';
}

function assertTenantContextIsCleared(snapshot: TenantSettingSnapshot, boundary: string): void {
  assert.notEqual(
    snapshot.tenantId,
    tenantA,
    `${boundary}: Tenant A context leaked across a transaction boundary`,
  );
  assert.ok(
    snapshot.tenantId === null || snapshot.tenantId === '',
    `${boundary}: no-context transaction must not inherit a non-empty tenant setting (${snapshot.state})`,
  );
}

async function tenantSettingSnapshot(
  client: any,
  recordSql: SqlRecorder,
): Promise<TenantSettingSnapshot> {
  const snapshot = one(
    await validationTransactionUnsafe(
      client,
      `SELECT pg_backend_pid()::int AS backend_pid,
              current_setting('app.tenant_id', true) AS tenant_id`,
      [],
      recordSql,
    ),
  );
  const candidateTenantId = snapshot.tenant_id;
  assert.ok(
    candidateTenantId === null || typeof candidateTenantId === 'string',
    'tenant setting must be string or NULL',
  );
  const tenantId = candidateTenantId as string | null;
  const backendPid = Number(snapshot.backend_pid);
  assert.ok(Number.isInteger(backendPid) && backendPid > 0, 'PostgreSQL backend PID must be present');
  return { backendPid, tenantId, state: tenantSettingState(tenantId) };
}

async function setPhase1ApplicationRole(transaction: any, recordSql: SqlRecorder): Promise<void> {
  await validationTransactionUnsafe(
    transaction,
    `SET LOCAL ROLE ${quoteIdentifier(appRole)}`,
    [],
    recordSql,
  );
  const role = one(
    await validationTransactionUnsafe(transaction, 'SELECT current_user AS role_name', [], recordSql),
  );
  assert.equal(role.role_name, appRole, 'tenant-context check must use the non-owner application role');
}

async function withNoTenantContext<T>(
  client: SqlClient,
  recordSql: SqlRecorder,
  operation: (transaction: any) => Promise<T>,
): Promise<T> {
  return (await client.begin(async (transaction) => {
    await setPhase1ApplicationRole(transaction, recordSql);
    return operation(transaction);
  })) as T;
}

async function assertNoContextCannotAccessTenantA(
  client: SqlClient,
  boundary: string,
  recordSql: SqlRecorder,
  recordObservation: (observation: string) => void,
): Promise<TenantSettingSnapshot> {
  const snapshot = await withNoTenantContext(client, recordSql, async (transaction) => {
    const current = await tenantSettingSnapshot(transaction, recordSql);
    recordObservation(`${boundary}:${current.state}`);
    assertTenantContextIsCleared(current, boundary);

    const visible = one(
      await validationTransactionUnsafe(
        transaction,
        `SELECT count(*)::int AS count FROM marketing_memory_records WHERE tenant_id = $1::uuid`,
        [tenantA],
        recordSql,
      ),
    );
    assert.equal(
      Number(visible.count),
      0,
      `${boundary}: no-context transaction must not read Tenant A protected rows`,
    );

    const updates = rows(
      await validationTransactionUnsafe(
        transaction,
        `UPDATE marketing_memory_records
         SET updated_at = now()
         WHERE tenant_id = $1::uuid
         RETURNING id`,
        [tenantA],
        recordSql,
      ),
    );
    assert.equal(
      updates.length,
      0,
      `${boundary}: no-context transaction must not update Tenant A protected rows`,
    );
    return current;
  });

  // A denied insert complements the invisible SELECT/UPDATE checks above: it
  // proves that a no-context request cannot write a new row attributed to A.
  await expectRlsDenied(() =>
    withNoTenantContext(client, recordSql, (transaction) =>
      validationTransactionUnsafe(
        transaction,
        `INSERT INTO marketing_memory_records (id, tenant_id, scope, scope_id, statement)
         VALUES ($1::uuid, $2::uuid, 'phase1', $3::uuid, 'no-context tenant write must fail')`,
        [randomUUID(), tenantA, randomUUID()],
        recordSql,
      ),
    ),
  );
  return snapshot;
}

async function testTransactionLocalTenantSetting(
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
  recordObservation: (observation: string) => void,
): Promise<TenantSettingProof> {
  // max: 1 makes this the strongest deterministic reuse boundary postgres.js
  // exposes here. Backend PIDs are compared below; a changed PID is reported,
  // not misrepresented as physical connection reuse.
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    recordStep('baseline');
    const baseline = await tenantSettingSnapshot(client, recordSql);
    recordObservation(`baseline:${baseline.state}`);
    assertTenantContextIsCleared(baseline, 'baseline');

    recordStep('inside_commit_transaction');
    const insideCommit = await client.begin(async (transaction) => {
      await setPhase1ApplicationRole(transaction, recordSql);
      await validationTransactionUnsafe(
        transaction,
        `SELECT set_config('app.tenant_id', $1, true)`,
        [tenantA],
        recordSql,
      );
      const current = await tenantSettingSnapshot(transaction, recordSql);
      recordObservation(`inside_commit_transaction:${current.state}`);
      assert.equal(current.tenantId, tenantA, 'Tenant A context must be active inside its transaction');
      const visible = one(
        await validationTransactionUnsafe(
          transaction,
          `SELECT count(*)::int AS count FROM marketing_memory_records WHERE tenant_id = $1::uuid`,
          [tenantA],
          recordSql,
        ),
      );
      assert.ok(Number(visible.count) > 0, 'Tenant A fixture rows must be visible inside its transaction');
      return current;
    });

    recordStep('after_commit');
    const afterCommit = await tenantSettingSnapshot(client, recordSql);
    recordObservation(`after_commit:${afterCommit.state}`);
    assertTenantContextIsCleared(afterCommit, 'after commit');

    recordStep('no_context_after_commit');
    const noContextAfterCommit = await assertNoContextCannotAccessTenantA(
      client,
      'no_context_after_commit',
      recordSql,
      recordObservation,
    );

    recordStep('inside_rollback_transaction');
    await assert.rejects(
      () =>
        client.begin(async (transaction) => {
          await setPhase1ApplicationRole(transaction, recordSql);
          await validationTransactionUnsafe(
            transaction,
            `SELECT set_config('app.tenant_id', $1, true)`,
            [tenantA],
            recordSql,
          );
          const current = await tenantSettingSnapshot(transaction, recordSql);
          recordObservation(`inside_rollback_transaction:${current.state}`);
          assert.equal(current.tenantId, tenantA, 'Tenant A context must be active before rollback');
          throw new Error('PHASE1 intentional tenant-context rollback');
        }),
      /PHASE1 intentional tenant-context rollback/,
    );

    recordStep('after_rollback');
    const afterRollback = await tenantSettingSnapshot(client, recordSql);
    recordObservation(`after_rollback:${afterRollback.state}`);
    assertTenantContextIsCleared(afterRollback, 'after rollback');

    recordStep('no_context_after_rollback');
    const noContextAfterRollback = await assertNoContextCannotAccessTenantA(
      client,
      'no_context_after_rollback',
      recordSql,
      recordObservation,
    );

    recordStep('pool_reuse');
    const poolSnapshot = await assertNoContextCannotAccessTenantA(
      client,
      'pool_reuse',
      recordSql,
      recordObservation,
    );
    const sameBackend = insideCommit.backendPid === poolSnapshot.backendPid;
    const poolReuse = sameBackend ? 'SAME_BACKEND_CONFIRMED' : 'DIFFERENT_BACKEND_NOT_CLAIMED';
    console.log(`PHASE1_TENANT_SETTING_POOL_REUSE=${poolReuse}`);

    return {
      baseline: baseline.state,
      insideCommit: insideCommit.state,
      afterCommit: afterCommit.state,
      noContextAfterCommit: noContextAfterCommit.state,
      insideRollback: 'TENANT_A_ACTIVE',
      afterRollback: afterRollback.state,
      noContextAfterRollback: noContextAfterRollback.state,
      poolReuse,
    };
  } finally {
    await close(client);
  }
}

function deterministicVectorLiteral(dimensions: number, value: string): string {
  return `[${new Array(dimensions).fill(value).join(',')}]`;
}

function dimensionFromCanonicalVectorType(columnType: string): number {
  const match = /^vector\(([1-9]\d*)\)$/.exec(columnType);
  assert.ok(match, `pgvector column must render as vector(n), received ${columnType}`);
  return Number(match[1]);
}

async function testPgvector(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
  recordObservation: (observation: string) => void,
  recordDiagnostics: (diagnostics: Record<string, string | number | boolean | null>) => void,
): Promise<PgvectorProof> {
  const table = 'knowledge_document_chunks';
  const column = 'embedding_vector';
  recordDiagnostics({ table, column, expectedDimension: KNOWLEDGE_EMBEDDING_DIMENSIONS });

  recordStep('extension');
  const extension = one(
    await validationUnsafe(
      owner,
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
      recordSql,
    ),
  );
  const extensionVersion = stringValue(extension, 'extversion');

  recordStep('column_metadata');
  const metadata = one(
    await validationUnsafe(
      owner,
      `
      SELECT namespace.nspname AS schema_name,
             relation.relname AS table_name,
             attribute.attname AS column_name,
             pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS column_type,
             attribute.atttypmod AS typmod,
             data_type.typname AS type_name
      FROM pg_catalog.pg_attribute attribute
      JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_type data_type ON data_type.oid = attribute.atttypid
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'knowledge_document_chunks'
        AND attribute.attname = 'embedding_vector'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
      `,
      recordSql,
    ),
  );
  const schemaName = stringValue(metadata, 'schema_name');
  const tableName = stringValue(metadata, 'table_name');
  const columnName = stringValue(metadata, 'column_name');
  const columnType = stringValue(metadata, 'column_type');
  const typeName = stringValue(metadata, 'type_name');
  const typmod = Number(metadata.typmod);
  const dimensions = dimensionFromCanonicalVectorType(columnType);
  recordObservation(`column_metadata:${columnType}`);
  recordDiagnostics({
    schema: schemaName,
    table: tableName,
    column: columnName,
    observedColumnType: columnType,
    observedTypmod: typmod,
    observedDimension: dimensions,
  });
  console.log(`PHASE1_PGVECTOR_COLUMN_TYPE=${columnType}`);
  console.log(`PHASE1_PGVECTOR_TYPMOD=${typmod}`);
  assert.equal(schemaName, 'public');
  assert.equal(tableName, table);
  assert.equal(columnName, column);
  assert.equal(typeName, 'vector', 'embedding column must use the pgvector type');
  assert.equal(
    dimensions,
    KNOWLEDGE_EMBEDDING_DIMENSIONS,
    'canonical PostgreSQL vector type must match the application embedding contract',
  );

  const index = one(
    await validationUnsafe(
      owner,
      `
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'knowledge_document_chunks'
        AND indexname = 'knowledge_chunks_embedding_vector_hnsw_idx'
      `,
      recordSql,
    ),
  );
  assert.match(String(index.indexdef), /USING hnsw/i, 'pgvector HNSW index must exist');

  const expectedVector = deterministicVectorLiteral(KNOWLEDGE_EMBEDDING_DIMENSIONS, '0.01');
  recordStep('roundtrip');
  const fixture = await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
    const documentId = randomUUID();
    const chunkId = randomUUID();
    await validationTransactionUnsafe(
      transaction,
      `INSERT INTO knowledge_documents (id, tenant_id, name, mime_type, storage_path, status)
       VALUES ($1::uuid, $2::uuid, 'phase1 vector', 'text/plain', 'phase1/vector', 'ready')`,
      [documentId, tenantA],
      recordSql,
    );
    await validationTransactionUnsafe(
      transaction,
      `INSERT INTO knowledge_document_chunks (id, tenant_id, document_id, chunk_index, text, embedding_vector)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 'phase1 semantic alpha', $4::vector)`,
      [chunkId, tenantA, documentId, expectedVector],
      recordSql,
    );
    const roundTrip = one(
      await validationTransactionUnsafe(
        transaction,
        `SELECT id::text, text, vector_dims(embedding_vector)::int AS dimensions
         FROM knowledge_document_chunks
         WHERE id = $1::uuid`,
        [chunkId],
        recordSql,
      ),
    );
    assert.equal(roundTrip.id, chunkId, 'pgvector round trip must return the inserted row');
    assert.equal(roundTrip.text, 'phase1 semantic alpha');

    const semantic = rows(
      await validationTransactionUnsafe(
        transaction,
        `SELECT id::text, text
         FROM knowledge_document_chunks
         WHERE document_id = $1::uuid
         ORDER BY embedding_vector <=> $2::vector
         LIMIT 1`,
        [documentId, expectedVector],
        recordSql,
      ),
    );
    assert.equal(semantic[0]?.id, chunkId, 'vector retrieval must return the exact nearest chunk');
    assert.equal(semantic[0]?.text, 'phase1 semantic alpha');

    const lexical = rows(
      await validationTransactionUnsafe(
        transaction,
        `SELECT id FROM knowledge_document_chunks
         WHERE document_id = $1::uuid
           AND to_tsvector('simple', text) @@ plainto_tsquery('simple', 'semantic alpha')`,
        [documentId],
        recordSql,
      ),
    );
    assert.equal(lexical.length, 1, 'lexical retrieval must return the matching chunk');
    return { documentId, chunkId, dimensions: Number(roundTrip.dimensions) };
  });

  recordStep('dimension');
  recordObservation(`roundtrip:${fixture.dimensions}`);
  recordDiagnostics({ roundTripDimension: fixture.dimensions });
  assert.equal(
    fixture.dimensions,
    KNOWLEDGE_EMBEDDING_DIMENSIONS,
    'vector_dims must confirm the stored vector dimension',
  );

  recordStep('invalid_dimension');
  const invalidDimensionCode = await expectVectorDimensionRejected(() =>
    withAppTransaction(databaseUrl, tenantA, async (transaction) => {
      const documentId = randomUUID();
      await validationTransactionUnsafe(
        transaction,
        `INSERT INTO knowledge_documents (id, tenant_id, name, mime_type, storage_path, status)
         VALUES ($1::uuid, $2::uuid, 'phase1 invalid vector', 'text/plain', 'phase1/vector-invalid', 'ready')`,
        [documentId, tenantA],
        recordSql,
      );
      return validationTransactionUnsafe(
        transaction,
        `INSERT INTO knowledge_document_chunks (id, tenant_id, document_id, chunk_index, text, embedding_vector)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 'phase1 invalid vector', $4::vector)`,
        [
          randomUUID(),
          tenantA,
          documentId,
          deterministicVectorLiteral(KNOWLEDGE_EMBEDDING_DIMENSIONS - 1, '0.02'),
        ],
        recordSql,
      );
    }),
  );
  recordDiagnostics({ invalidDimension: KNOWLEDGE_EMBEDDING_DIMENSIONS - 1, invalidDimensionCode });
  console.log('PHASE1_PGVECTOR_INVALID_DIMENSION=REJECTED');

  recordStep('tenant_isolation');
  await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
    const rowsForB = rows(
      await validationTransactionUnsafe(
        transaction,
        `SELECT id FROM knowledge_document_chunks WHERE id = $1::uuid`,
        [fixture.chunkId],
        recordSql,
      ),
    );
    assert.equal(rowsForB.length, 0, 'Tenant B must not read Tenant A embedding');
  });
  await withAppTransaction(databaseUrl, undefined, async (transaction) => {
    const rowsWithoutContext = rows(
      await validationTransactionUnsafe(
        transaction,
        `SELECT id FROM knowledge_document_chunks WHERE id = $1::uuid`,
        [fixture.chunkId],
        recordSql,
      ),
    );
    assert.equal(rowsWithoutContext.length, 0, 'missing tenant context must not read Tenant A embedding');
  });

  return {
    extensionVersion,
    schema: schemaName,
    table: tableName,
    column: columnName,
    columnType,
    typmod,
    dimensions,
    roundTripDimensions: fixture.dimensions,
    invalidDimensionRejected: true,
    invalidDimensionCode,
    tenantIsolation: 'PASS',
  };
}

/**
 * Drizzle's postgres-js adapter must be constructed from the outer Sql client,
 * whose options include parser/serializer maps. A raw postgres.js transaction
 * callback object deliberately does not expose that options object, so passing
 * it to drizzle(transaction) fails before SQL at client.options.parsers.
 */
async function withAppDrizzleTransaction<T>(
  databaseUrl: string,
  tenantId: string | undefined,
  recordSql: SqlRecorder,
  operation: (transaction: any) => Promise<T>,
): Promise<T> {
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    recordSql('<driver: drizzle(postgres.js outer client)>');
    const database = drizzle(client);
    return await database.transaction(async (transaction) => {
      const roleStatement = `SET LOCAL ROLE ${quoteIdentifier(appRole)}`;
      recordSql(roleStatement);
      await transaction.execute(sql.raw(roleStatement));
      recordSql(`SELECT set_config('app.tenant_id', $1, true)`);
      await transaction.execute(sql`SELECT set_config('app.tenant_id', ${tenantId ?? ''}, true)`);
      recordSql(`SELECT current_user AS role_name, current_setting('app.tenant_id', true) AS tenant_id`);
      const context = one(
        await transaction.execute(
          sql`SELECT current_user AS role_name, current_setting('app.tenant_id', true) AS tenant_id`,
        ),
      );
      assert.equal(context.role_name, appRole, 'billing checks must use the non-owner application role');
      assert.equal(
        context.tenant_id,
        tenantId ?? '',
        'billing tenant context must be set on the same Drizzle transaction',
      );
      return operation(transaction);
    });
  } finally {
    await close(client);
  }
}

async function seedBillingAuthority(owner: SqlClient): Promise<void> {
  const planId = '33333333-3333-3333-3333-333333333333';
  await owner.unsafe(
    `INSERT INTO tenants (id, name) VALUES ($1::uuid, 'Phase 1 tenant A'), ($2::uuid, 'Phase 1 tenant B')`,
    [tenantA, tenantB],
  );
  await owner.unsafe(
    `INSERT INTO billing_plans (id, code, name, currency) VALUES ($1::uuid, 'phase1', 'Phase 1', 'USD')`,
    [planId],
  );
  await owner.unsafe(
    `INSERT INTO billing_plan_entitlements (plan_id, key, value) VALUES ($1::uuid, 'phase1.authoritative', '10'::jsonb)`,
    [planId],
  );
  await owner.unsafe(
    `INSERT INTO billing_plan_entitlements (plan_id, key, value) VALUES ($1::uuid, 'phase1.authoritative-higher', '3'::jsonb)`,
    [planId],
  );
  await owner.unsafe(
    `
    INSERT INTO billing_subscriptions
      (tenant_id, plan_id, status, billing_cycle, started_at, current_period_start, current_period_end)
    VALUES ($1::uuid, $2::uuid, 'ACTIVE', 'MONTHLY', now() - interval '1 day', now() - interval '1 day', now() + interval '1 day')
  `,
    [tenantA, planId],
  );
  await owner.unsafe(
    `
    INSERT INTO billing_organization_entitlements (tenant_id, key, value, reason)
    VALUES ($1::uuid, 'phase1.authoritative', '3'::jsonb, 'Phase 1 override')
  `,
    [tenantA],
  );
  await owner.unsafe(
    `
    INSERT INTO billing_organization_entitlements (tenant_id, key, value, reason)
    VALUES ($1::uuid, 'phase1.authoritative-higher', '10'::jsonb, 'Phase 1 higher override')
  `,
    [tenantA],
  );
}

async function testBillingAuthority(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
  recordDiagnostics: (diagnostics: Record<string, string | number | boolean | null>) => void,
): Promise<void> {
  const now = () => new Date().toISOString();
  const createAuthority = (transaction: any) =>
    new AuthoritativeEntitlementAccess(
      new PersistentBillingAuthorityRepository(transaction),
      new AtomicBillingUsageStore(transaction),
      { now, source: 'phase1-harness' },
    );
  recordStep('driver_setup');
  recordDiagnostics({
    adapter: 'drizzle(postgres.js outer client)',
    malformedAdapterAvoided: 'drizzle(raw postgres.js transaction)',
  });

  recordStep('authority_metadata');
  const monetaryColumns = rows(
    await validationUnsafe(
      owner,
      `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'billing_plans' AND column_name IN ('price_monthly_minor', 'price_yearly_minor'))
          OR (table_name = 'billing_invoices' AND column_name IN ('amount_due_minor', 'amount_paid_minor'))
          OR (table_name = 'billing_payments' AND column_name = 'amount_minor')
        )
      ORDER BY table_name, column_name
      `,
      recordSql,
    ),
  );
  assert.equal(monetaryColumns.length, 5, 'canonical billing minor-unit columns are missing');
  assert.ok(
    monetaryColumns.every((column) => column.data_type === 'integer'),
    'billing money must be stored as integer minor units',
  );

  for (const parameter of [
    'billing_usage_events.period_start',
    'billing_usage_events.period_end',
    'billing_usage_counters.period_start',
    'billing_usage_counters.period_end',
  ]) {
    console.log(
      `PHASE1_BILLING_PARAM=${parameter}:DATE expectedColumnType=timestamp with time zone drizzleMode=date runtimeType=Date`,
    );
  }
  recordDiagnostics({
    billingUsageEventsPeriodStart: 'DATE|timestamp with time zone|date',
    billingUsageEventsPeriodEnd: 'DATE|timestamp with time zone|date',
    billingUsageCountersPeriodStart: 'DATE|timestamp with time zone|date',
    billingUsageCountersPeriodEnd: 'DATE|timestamp with time zone|date',
    timestampBinding: 'Drizzle column encoder',
  });

  recordStep('tenant_a');
  const decision = await withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, async (transaction) => {
    const access = createAuthority(transaction);
    const resolved = await access.authorize(tenantA, 'phase1.authoritative');
    await access.consume(tenantA, 'phase1.authoritative', 1, 'phase1-authoritative-consume');
    return resolved;
  });
  assert.equal(decision.allowed, true, 'active subscription with override must authorize');
  assert.equal(
    decision.source,
    'ORGANIZATION_OVERRIDE',
    'organization override must beat plan entitlement',
  );
  assert.equal(
    decision.entitlementValue,
    3,
    'resolved entitlement must be authoritative override value',
  );

  recordStep('override_precedence');
  const higher = await withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, (transaction) =>
    createAuthority(transaction).authorize(tenantA, 'phase1.authoritative-higher'),
  );
  assert.equal(higher.allowed, true);
  assert.equal(higher.source, 'ORGANIZATION_OVERRIDE');
  assert.equal(higher.entitlementValue, 10, 'higher override policy must resolve authoritatively');

  recordStep('tenant_b_denied');
  const denied = await withAppDrizzleTransaction(databaseUrl, tenantB, recordSql, async (transaction) => {
    const repository = new PersistentBillingAuthorityRepository(transaction);
    const hiddenTenantA = await repository.getActiveSubscription(tenantA, now());
    assert.equal(hiddenTenantA, null, 'Tenant B must not read Tenant A billing subscription');
    const access = createAuthority(transaction);
    return access.authorize(tenantB, 'phase1.authoritative');
  });
  assert.equal(denied.allowed, false, 'missing subscription must default deny');
  assert.equal(denied.source, 'DEFAULT_DENY', 'missing subscription must not use caller input');

  recordStep('missing_context_denied');
  const missingContext = await withAppDrizzleTransaction(
    databaseUrl,
    undefined,
    recordSql,
    async (transaction) => {
      const repository = new PersistentBillingAuthorityRepository(transaction);
      const hiddenTenantA = await repository.getActiveSubscription(tenantA, now());
      assert.equal(hiddenTenantA, null, 'missing context must not read Tenant A billing subscription');
      return createAuthority(transaction).authorize(tenantA, 'phase1.authoritative');
    },
  );
  assert.equal(missingContext.allowed, false, 'missing tenant context must default deny');
  assert.equal(missingContext.source, 'DEFAULT_DENY');

  recordStep('persistent_usage');
  const persistedUsage = await withAppDrizzleTransaction(
    databaseUrl,
    tenantA,
    recordSql,
    async (transaction) => {
      const repository = new PersistentBillingAuthorityRepository(transaction);
      const subscription = await repository.getActiveSubscription(tenantA, now());
      assert.ok(subscription, 'Tenant A subscription must remain persistent after consumption');
      return repository.getUsageCounter(
        tenantA,
        'phase1.authoritative',
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
      );
    },
  );
  assert.ok(persistedUsage, 'application-role repository must read the persistent usage counter');
  assert.equal(persistedUsage.used, 1);
  assert.equal(persistedUsage.limit, 3, 'persisted usage limit must be the authoritative override');

  const usage = one(
    await validationTransactionUnsafe(
      owner,
      `
    SELECT used, "limit" FROM billing_usage_counters
    WHERE tenant_id = $1::uuid AND key = 'phase1.authoritative'
  `,
      [tenantA],
      recordSql,
    ),
  );
  assert.equal(Number(usage.used), 1);
  assert.equal(Number(usage.limit), 3, 'stored limit must come from authoritative override');
}

async function consumeUsage(
  databaseUrl: string,
  tenantId: string,
  key: string,
  idempotencyKey: string,
  limit: number,
  recordSql: SqlRecorder,
): Promise<unknown> {
  return withAppDrizzleTransaction(databaseUrl, tenantId, recordSql, async (transaction) => {
    const store = new AtomicBillingUsageStore(transaction);
    return store.consume({
      tenantId,
      key,
      amount: 1,
      limit,
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-10-01T00:00:00.000Z',
      idempotencyKey,
      source: 'phase1-concurrency',
    });
  });
}

async function testBillingConcurrency(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
): Promise<void> {
  recordStep('concurrency');
  const key = 'phase1.concurrent';
  const attempts = 100;
  const workers = 20;
  const concurrent = await Promise.all(
    Array.from({ length: workers }, async (_, worker) => {
      const results: unknown[] = [];
      for (let attempt = 0; attempt < attempts / workers; attempt += 1) {
        results.push(
          await consumeUsage(
            databaseUrl,
            tenantA,
            key,
            `phase1-unique-${worker}-${attempt}`,
            attempts,
            recordSql,
          ),
        );
      }
      return results;
    }),
  );
  const flattened = concurrent.flat();
  assert.equal(flattened.length, attempts);
  assert.ok(
    flattened.every((result: any) => result.consumed === true && result.duplicate === false),
  );
  await expectRejected(
    () => consumeUsage(databaseUrl, tenantA, key, 'phase1-over-limit', attempts, recordSql),
    /quota exhausted/i,
  );
  const counter = one(
    await owner.unsafe(
      `
    SELECT used, "limit" FROM billing_usage_counters
    WHERE tenant_id = $1::uuid AND key = $2
  `,
      [tenantA, key],
    ),
  );
  assert.equal(Number(counter.used), attempts, 'atomic counter must not overshoot its limit');
  assert.equal(Number(counter.limit), attempts);
  const events = one(
    await owner.unsafe(
      `
    SELECT count(*)::int AS count FROM billing_usage_events
    WHERE tenant_id = $1::uuid AND key = $2
  `,
      [tenantA, key],
    ),
  );
  assert.equal(
    Number(events.count),
    attempts,
    'one unique event must be recorded per successful attempt',
  );

  recordStep('idempotency');
  const replayKey = 'phase1.idempotent';
  const replayResults = await Promise.all(
    Array.from({ length: workers }, () =>
      consumeUsage(databaseUrl, tenantA, replayKey, 'phase1-same-request', 10, recordSql),
    ),
  );
  assert.equal(replayResults.filter((result: any) => result.consumed === true).length, 1);
  assert.equal(
    replayResults.filter((result: any) => result.duplicate === true).length,
    workers - 1,
  );
  const replayCounter = one(
    await owner.unsafe(
      `
    SELECT used FROM billing_usage_counters WHERE tenant_id = $1::uuid AND key = $2
  `,
      [tenantA, replayKey],
    ),
  );
  assert.equal(Number(replayCounter.used), 1, 'replayed idempotency key must consume once');

  await consumeUsage(
    databaseUrl,
    tenantA,
    'phase1.provider-failure',
    'phase1-provider-reservation',
    2,
    recordSql,
  );
  // This simulates the canonical ordering: reservation commits before a later
  // provider failure, so the reserved unit intentionally remains consumed.
  const providerReservation = one(
    await owner.unsafe(
      `
    SELECT used FROM billing_usage_counters
    WHERE tenant_id = $1::uuid AND key = 'phase1.provider-failure'
  `,
      [tenantA],
    ),
  );
  assert.equal(
    Number(providerReservation.used),
    1,
    'provider failure semantics retain the reservation',
  );

  await Promise.all([
    consumeUsage(databaseUrl, tenantA, 'phase1.cross-tenant', 'phase1-shared-key', 2, recordSql),
    consumeUsage(databaseUrl, tenantB, 'phase1.cross-tenant', 'phase1-shared-key', 2, recordSql),
  ]);
  const isolatedEvents = rows(
    await owner.unsafe(`
    SELECT tenant_id::text FROM billing_usage_events
    WHERE key = 'phase1.cross-tenant' AND idempotency_key = 'phase1-shared-key'
    ORDER BY tenant_id
  `),
  );
  assert.deepEqual(
    isolatedEvents.map((event) => event.tenant_id),
    [tenantA, tenantB],
  );

  await expectRejected(
    () =>
      withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, async (transaction) => {
        const store = new AtomicBillingUsageStore(transaction);
        await store.consume({
          tenantId: tenantA,
          key: 'phase1.rollback',
          amount: 1,
          limit: 2,
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: '2026-10-01T00:00:00.000Z',
          idempotencyKey: 'phase1-rollback',
          source: 'phase1-concurrency',
        });
        throw new Error('intentional phase1 transaction rollback');
      }),
    /intentional phase1 transaction rollback/,
  );
  const rolledBack = one(
    await owner.unsafe(
      `
    SELECT count(*)::int AS count FROM billing_usage_events
    WHERE tenant_id = $1::uuid AND key = 'phase1.rollback'
  `,
      [tenantA],
    ),
  );
  assert.equal(
    Number(rolledBack.count),
    0,
    'rolled-back transaction must not create phantom usage',
  );
}

function epic03Context(tenantId: string): TenantContext {
  return {
    tenantId,
    userId: `phase1-policy-admin-${tenantId}`,
    roles: ['tenant_admin'],
    permissions: ['security_policy:manage'],
    locale: 'en',
  };
}

function epic03Action(
  id: string,
  policyId: string,
  policyVersion: number,
): GovernedExternalAction {
  const timestamp = '2026-09-08T00:00:00.000Z';
  return {
    id,
    tenantId: tenantA,
    planId: 'phase1-epic03-recommendation',
    workflowId: 'phase1-epic03-workflow',
    type: 'UPDATE_CAMPAIGN_BUDGET',
    idempotencyKey: 'phase1-epic03-action-idempotency',
    status: 'PROPOSED',
    requestedAt: timestamp,
    updatedAt: timestamp,
    proposal: {
      actionId: id,
      tenantId: tenantA,
      organizationId: 'phase1-org-a',
      actor: 'phase1-operator-a',
      agentIdentity: 'phase1-governed-agent',
      workflowRunId: 'phase1-epic03-workflow',
      recommendationId: 'phase1-epic03-recommendation',
      provider: 'GOOGLE_ADS',
      accountId: 'phase1-account-a',
      campaignId: 'phase1-campaign-a',
      actionType: 'UPDATE_CAMPAIGN_BUDGET',
      requestedPayload: { dailyBudget: 120 },
      reason: 'Phase 1 governed persistence proof.',
      expectedOutcome: 'Controlled sandbox budget update.',
      estimatedImpact: { conversions: 1 },
      estimatedCost: 20,
      currency: 'USD',
      riskLevel: 'MEDIUM',
      policyContext: { source: 'phase1-postgres-harness' },
      approvalRequirement: 'REQUIRED',
      idempotencyKey: 'phase1-epic03-action-idempotency',
      requestedAt: timestamp,
      metadata: { proof: true },
      evidence: [{ id: 'phase1-epic03-reference', source: 'phase1', summary: 'durable evidence proof' }],
      confidence: 0.9,
      rollback: { strategy: 'restore daily budget', before: { dailyBudget: 100 } },
    },
    policyDecision: {
      outcome: 'REQUIRE_APPROVAL',
      reasons: [],
      evaluatedAt: timestamp,
      policyId,
      policyVersion,
      requiredApprovalRole: 'tenant_admin',
      dryRunOnly: true,
    },
    evidence: [{ id: 'phase1-epic03-evidence', type: 'PROPOSAL_CREATED', occurredAt: timestamp, payload: { proof: true } }],
    version: 0,
  };
}

/** Real PostgreSQL proof for 0022 persistence, RLS, replay, and locking. */
async function testEpic03GovernedExternalActions(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
  recordDiagnostics: (diagnostics: Record<string, string | number | boolean | null>) => void,
): Promise<Epic03Proof> {
  const policyUpdate = {
    organizationId: 'phase1-org-a',
    enabled: true,
    executionMode: 'DRY_RUN' as const,
    allowedActionTypes: ['UPDATE_CAMPAIGN_BUDGET'],
    allowedAccounts: ['phase1-account-a'],
    deniedAccounts: [],
    allowedCampaigns: ['phase1-campaign-a'],
    deniedCampaigns: [],
    maxAbsoluteBudgetDelta: 50,
    maxPercentageBudgetDelta: 25,
    monthlySpendCeiling: 1000,
    minimumConfidence: 0.8,
    requiredEvidence: true,
    approvalMode: 'HUMAN' as const,
    requiredApprovalRole: 'tenant_admin',
    killSwitch: false,
    dryRunOnly: true,
  };
  const contextA = epic03Context(tenantA);
  const actionId = 'phase1-epic03-action-a';

  recordStep('durable_policy_and_action');
  const persisted = await withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, async (transaction) => {
    const policies = new PersistentExternalActionPolicyStore(transaction);
    const createdPolicy = await policies.upsert(contextA, 'GOOGLE_ADS', policyUpdate);
    const revisedPolicy = await policies.upsert(contextA, 'GOOGLE_ADS', {
      ...policyUpdate,
      monthlySpendCeiling: 900,
    });
    assert.equal(createdPolicy.version, 1, 'new durable policy must begin at version 1');
    assert.equal(revisedPolicy.version, 2, 'policy update must create the next durable revision');

    const actions = new PersistentExternalActionStore(transaction);
    const created = await actions.create(contextA, epic03Action(actionId, revisedPolicy.id, revisedPolicy.version));
    const replay = await actions.create(contextA, epic03Action(actionId, revisedPolicy.id, revisedPolicy.version));
    assert.equal(replay.id, created.id, 'API proposal retry must resolve to the same durable action');
    const verified = await actions.save(contextA, {
      ...created,
      status: 'VERIFIED',
      updatedAt: '2026-09-08T00:00:01.000Z',
      verification: {
        status: 'VERIFIED',
        observedState: { dailyBudget: 120 },
        reasons: [],
        verifiedAt: '2026-09-08T00:00:01.000Z',
      },
    });
    const pending = await new PersistentExternalActionOutcomeStore(transaction).listPending(contextA);
    assert.equal(pending.length, 1, 'terminal action must create exactly one durable workflow outcome');
    assert.equal(pending[0]?.externalActionId, verified.id);
    return { policy: revisedPolicy, action: verified, outboxId: pending[0]!.id };
  });
  recordDiagnostics({ policyVersion: persisted.policy.version, policyAuditExpected: 2, terminalOutboxExpected: 1 });

  recordStep('policy_version_and_audit');
  recordSql('SELECT external action policy version and policy audit count');
  const policyEvidence = one(await owner.unsafe(
    `
      SELECT action.policy_version::int AS policy_version,
             (SELECT count(*)::int FROM external_action_policy_audit WHERE policy_id = $1) AS audit_count
      FROM external_marketing_actions action
      WHERE action.id = $2
    `,
    [persisted.policy.id, actionId],
  ));
  // This query is owner-only evidence inspection; app-role checks below prove RLS.
  assert.equal(Number(policyEvidence.policy_version), 2, 'action must retain the policy revision used for its decision');
  assert.equal(Number(policyEvidence.audit_count), 2, 'each policy change must create an audit revision');

  recordStep('restart_replay_safe_outbox');
  await withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, async (transaction) => {
    const outcomes = new PersistentExternalActionOutcomeStore(transaction);
    const pending = await outcomes.listPending(contextA, 'phase1-epic03-workflow');
    assert.equal(pending.length, 1, 'a new worker connection must recover the pending durable outcome');
    const delivered = await outcomes.markDelivered(contextA, persisted.outboxId);
    assert.equal(delivered.deliveryStatus, 'DELIVERED');
  });
  await withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, async (transaction) => {
    const replay = await new PersistentExternalActionOutcomeStore(transaction).markDelivered(contextA, persisted.outboxId);
    assert.equal(replay.deliveryStatus, 'DELIVERED', 'worker acknowledgement replay must not duplicate an outcome');
    const restored = await new PersistentExternalActionStore(transaction).get(contextA, actionId);
    assert.equal(restored?.id, actionId, 'a restarted API process must recover the same durable action identity');
  });

  recordStep('tenant_rls_and_missing_context');
  await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
    const visible = rows(await validationTransactionUnsafe(
      transaction,
      `SELECT id FROM external_marketing_actions WHERE id = $1`,
      [actionId],
      recordSql,
    ));
    assert.equal(visible.length, 0, 'Tenant B must not read Tenant A action');
    const policyRows = rows(await validationTransactionUnsafe(
      transaction,
      `SELECT id FROM external_action_policies WHERE provider = 'GOOGLE_ADS'`,
      [],
      recordSql,
    ));
    assert.equal(policyRows.length, 0, 'Tenant B must not read Tenant A policy');
    const evidenceRows = rows(await validationTransactionUnsafe(
      transaction,
      `SELECT id FROM external_marketing_action_evidence WHERE action_id = $1`,
      [actionId],
      recordSql,
    ));
    assert.equal(evidenceRows.length, 0, 'Tenant B must not read Tenant A evidence');
    const outboxRows = rows(await validationTransactionUnsafe(
      transaction,
      `SELECT id FROM external_action_workflow_outbox WHERE external_action_id = $1`,
      [actionId],
      recordSql,
    ));
    assert.equal(outboxRows.length, 0, 'Tenant B must not read Tenant A workflow outcome');
    const mutations = rows(await validationTransactionUnsafe(
      transaction,
      `UPDATE external_marketing_actions SET status = 'APPROVED' WHERE id = $1 RETURNING id`,
      [actionId],
      recordSql,
    ));
    assert.equal(mutations.length, 0, 'Tenant B must not approve or execute Tenant A action');
  });
  await withAppTransaction(databaseUrl, undefined, async (transaction) => {
    const visible = rows(await validationTransactionUnsafe(
      transaction,
      `SELECT id FROM external_marketing_actions WHERE id = $1`,
      [actionId],
      recordSql,
    ));
    assert.equal(visible.length, 0, 'missing tenant context must not read governed actions');
  });
  await expectRlsDenied(() =>
    withAppTransaction(databaseUrl, undefined, (transaction) =>
      validationTransactionUnsafe(
        transaction,
        `INSERT INTO external_action_policies
          (id, tenant_id, organization_id, provider, max_absolute_budget_delta, max_percentage_budget_delta,
           monthly_spend_ceiling, minimum_confidence, created_by, updated_by)
         VALUES ('phase1-epic03-no-context', $1::uuid, 'org-a', 'GOOGLE_ADS', 1, 1, 1, 0.5, 'test', 'test')`,
        [tenantA],
        recordSql,
      ),
    ),
  );

  recordStep('real_concurrency');
  const attempts = await Promise.allSettled(
    ['phase1-epic03-concurrent-a', 'phase1-epic03-concurrent-b'].map((id) =>
      withAppTransaction(databaseUrl, tenantA, (transaction) =>
        validationTransactionUnsafe(
          transaction,
          `INSERT INTO external_marketing_actions
            (id, tenant_id, organization_id, actor, agent_identity, workflow_run_id, recommendation_id,
             provider, account_id, campaign_id, action_type, target_lock_key, proposal, status,
             idempotency_key, requested_at)
           VALUES ($1, $2::uuid, 'phase1-org-a', 'operator-a', 'agent-a', 'workflow-a', 'recommendation-a',
             'GOOGLE_ADS', 'phase1-account-a', 'phase1-campaign-concurrent', 'UPDATE_CAMPAIGN_BUDGET',
             'phase1-epic03-concurrency-lock', '{}'::jsonb, 'PROPOSED', $1, now())`,
          [id, tenantA],
          recordSql,
        ),
      ),
    ),
  );
  const successes = attempts.filter((result) => result.status === 'fulfilled').length;
  const conflicts = attempts.filter((result) =>
    result.status === 'rejected' && (result.reason as { code?: string }).code === '23505',
  ).length;
  const unexpectedDuplicates = attempts.length - successes - conflicts;
  assert.equal(successes, 1, 'exactly one concurrent active target mutation may acquire the lock');
  assert.equal(conflicts, 1, 'the competing target mutation must conflict at PostgreSQL');
  assert.equal(unexpectedDuplicates, 0, 'no unexpected concurrent result is acceptable');
  const owned = one(await owner.unsafe(
    `SELECT count(*)::int AS count FROM external_marketing_actions
     WHERE target_lock_key = 'phase1-epic03-concurrency-lock' AND status = 'PROPOSED'`,
  ));
  assert.equal(Number(owned.count), 1, 'database must contain one active mutation owner after concurrency race');

  return {
    policyVersion: persisted.policy.version,
    actionId,
    outboxId: persisted.outboxId,
    concurrency: { workers: 2, attempts: attempts.length, successes, conflicts, unexpectedDuplicates },
  };
}

function epic05Context(tenantId: string): TenantContext {
  return {
    tenantId,
    userId: `epic05-operator-${tenantId}`,
    roles: ['operations_manager'],
    permissions: ['system_health:read', 'security_policy:manage', 'integration:admin'],
    locale: 'en',
  };
}

async function seedEpic05Outbox(
  owner: SqlClient,
  tenantId: string,
  suffix: string,
  availableAt: Date,
): Promise<{ actionId: string; outboxId: string }> {
  const actionId = `epic05-acceptance-action-${suffix}`;
  const outboxId = `epic05-acceptance-outbox-${suffix}`;
  await owner.unsafe(
    `INSERT INTO external_marketing_actions
      (id, tenant_id, organization_id, actor, agent_identity, workflow_run_id, recommendation_id,
       provider, account_id, campaign_id, action_type, target_lock_key, proposal, status,
       idempotency_key, requested_at)
     VALUES ($1, $2::uuid, 'epic05-org', 'epic05-harness', 'epic05-worker', 'epic05-workflow',
       'epic05-recommendation', 'EPIC05_TEST', 'epic05-account', 'epic05-campaign',
       'TEST_WORKFLOW_CONTINUATION', $3, '{}'::jsonb, 'VERIFIED', $4, $5::timestamptz)`,
    [actionId, tenantId, `epic05-target-${suffix}`, `epic05-idempotency-${suffix}`, availableAt],
  );
  await owner.unsafe(
    `INSERT INTO external_action_workflow_outbox
     (id, tenant_id, workflow_run_id, external_action_id, event_type, state, provider, account_id,
       campaign_id, correlation_id, idempotency_key, payload, delivery_status, delivery_attempts,
       occurred_at, next_attempt_at)
     VALUES ($1, $2::uuid, 'epic05-workflow', $3, 'EXTERNAL_ACTION_VERIFIED', 'VERIFIED',
       'EPIC05_TEST', 'epic05-account', 'epic05-campaign', $3, $4, '{}'::jsonb, 'PENDING', 0,
       $5::timestamptz, $5::timestamptz)`,
    [outboxId, tenantId, actionId, `epic05-outbox-idempotency-${suffix}`, availableAt],
  );
  return { actionId, outboxId };
}

async function bootstrapMigrationLedger(
  client: SqlClient,
  migrations: Awaited<ReturnType<typeof loadJournalMigrations>>,
): Promise<void> {
  await client.unsafe('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await client.unsafe(
    `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
    )`,
  );
  for (const migration of migrations) {
    await client.unsafe(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
       SELECT $1, $2 WHERE NOT EXISTS (
         SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE created_at = $2
       )`,
      [migration.hash, migration.entry.when],
    );
  }
}

async function assertEpic05Schema(owner: SqlClient): Promise<void> {
  const tables = rows(await owner.unsafe(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
           EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polcmd = '*') AS has_all_policy
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (
      'external_action_workflow_outbox', 'external_provider_health',
      'external_provider_credential_health', 'external_action_operational_events'
    ) ORDER BY c.relname
  `));
  assert.equal(tables.length, 4, 'EPIC05 tables must exist');
  assert.ok(tables.every((row) => row.rls_enabled === true && row.has_all_policy === true), 'EPIC05 tables require RLS ALL policies');
  const indexes = rows(await owner.unsafe(`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'external_action_workflow_outbox_tenant_ready_idx',
      'external_provider_health_tenant_provider_uidx',
      'external_provider_credential_health_tenant_provider_uidx',
      'external_action_operational_events_tenant_provider_occurred_idx'
    )
  `));
  assert.equal(indexes.length, 4, 'EPIC05 indexes are missing');
  const constraint = one(await owner.unsafe(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'external_action_workflow_outbox'::regclass
      AND conname = 'external_action_workflow_outbox_delivery_status_check'
  `));
  assert.match(String(constraint.definition), /PROCESSING.*DEAD_LETTER/i, 'outbox state constraint is incomplete');
  const role = one(await owner.unsafe(`
    SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
    FROM pg_roles WHERE rolname = $1
  `, [appRole]));
  assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
}

/** Real PostgreSQL acceptance for the EPIC05 persistence and worker boundary. */
async function testEpic05ExternalActionReliability(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
  recordDiagnostics: (diagnostics: Record<string, string | number | boolean | null>) => void,
): Promise<Epic05Proof> {
  const contextA = epic05Context(tenantA);
  const contextB = epic05Context(tenantB);
  const base = new Date('2026-09-12T00:00:00.000Z');
  const fixturePrefix = 'epic05-acceptance-';
  const tx = <T>(context: TenantContext, operation: (store: PersistentExternalActionReliabilityStore) => Promise<T>) =>
    withAppDrizzleTransaction(databaseUrl, context.tenantId, recordSql, (transaction) =>
      operation(new PersistentExternalActionReliabilityStore(transaction)),
    );
  let cleanup = false;
  try {
    recordStep('schema_and_migration_ledger');
    await assertEpic05Schema(owner);
    const ledger = one(await owner.unsafe(`
      SELECT count(*)::int AS count FROM "drizzle"."__drizzle_migrations"
      WHERE created_at = 1788629864178
    `));
    assert.equal(Number(ledger.count), 1, 'migration 0023 must have exactly one ledger record');

    recordStep('concurrent_claim');
    const concurrent = await seedEpic05Outbox(owner, tenantA, 'concurrent', base);
    const claimResults = await Promise.all(
      ['epic05-worker-a', 'epic05-worker-b'].map((leaseOwner) =>
        tx(contextA, (store) => store.claimNext(contextA, { leaseOwner, now: base })),
      ),
    );
    const claimed = claimResults.filter((item) => item !== undefined);
    assert.equal(claimed.length, 1, 'exactly one concurrent worker may own an eligible lease');
    assert.ok(claimed[0]?.leaseId);
    await tx(contextA, (store) => store.markDelivered(contextA, concurrent.outboxId, claimed[0]!.leaseId));

    recordStep('lease_crash_recovery');
    const lease = await seedEpic05Outbox(owner, tenantA, 'lease', base);
    const firstLease = await tx(contextA, (store) =>
      store.claimNext(contextA, { leaseOwner: 'epic05-crashed-worker', leaseDurationMs: 1_000, now: base }),
    );
    assert.ok(firstLease?.leaseId);
    const early = await tx(contextA, (store) =>
      store.claimNext(contextA, { leaseOwner: 'epic05-recovery-worker', now: new Date(base.getTime() + 999) }),
    );
    assert.equal(early, undefined, 'an unexpired lease must not be stolen');
    const recovered = await tx(contextA, (store) =>
      store.claimNext(contextA, { leaseOwner: 'epic05-recovery-worker', now: new Date(base.getTime() + 1_001) }),
    );
    assert.ok(recovered?.leaseId && recovered.leaseId !== firstLease?.leaseId, 'expired lease must be recovered with a new identity');
    await expectRejected(
      () => tx(contextA, (store) => store.markDelivered(contextA, lease.outboxId, firstLease?.leaseId)),
      /LEASE_NOT_OWNED/,
    );
    await tx(contextA, (store) => store.markDelivered(contextA, lease.outboxId, recovered!.leaseId));
    const recoveryEvents = one(await owner.unsafe(
      `SELECT count(*)::int AS count FROM external_action_operational_events
       WHERE outbox_event_id = $1 AND event_type = 'OUTBOX_LEASE_RECOVERED'`,
      [lease.outboxId],
    ));
    assert.equal(Number(recoveryEvents.count), 1, 'expired lease recovery must be auditable exactly once');

    recordStep('retry_backoff_and_retry_after');
    const retry = await seedEpic05Outbox(owner, tenantA, 'retry', base);
    const retryClaim = await tx(contextA, (store) =>
      store.claimNext(contextA, { leaseOwner: 'epic05-retry-worker', now: base }),
    );
    const scheduled = await tx(contextA, (store) => store.recordDeliveryFailure(contextA, retry.outboxId, {
      leaseId: retryClaim!.leaseId,
      code: 'EPIC05_RATE_LIMIT',
      reason: 'Authorization: Bearer fixture-sensitive-marker',
      retryable: true,
      retryAfterMs: 60_000,
      now: base,
    }));
    assert.equal(scheduled.deliveryStatus, 'PENDING');
    assert.equal(scheduled.deliveryAttempts, 1);
    assert.equal(scheduled.nextAttemptAt, '2026-09-12T00:01:00.000Z');
    assert.equal(scheduled.failureReason?.includes('fixture-sensitive-marker'), false, 'retry diagnostic must be redacted');
    const beforeRetry = await tx(contextA, (store) =>
      store.claimNext(contextA, { leaseOwner: 'epic05-retry-worker', now: new Date(base.getTime() + 59_999) }),
    );
    assert.equal(beforeRetry, undefined, 'backoff must delay the next attempt');
    const retrySuccess = await tx(contextA, (store) =>
      store.claimNext(contextA, { leaseOwner: 'epic05-retry-worker', now: new Date(base.getTime() + 60_000) }),
    );
    const retryDelivered = await tx(contextA, (store) => store.markDelivered(contextA, retry.outboxId, retrySuccess!.leaseId));
    assert.equal(retryDelivered.deliveryStatus, 'DELIVERED');
    const retryDuplicateAck = await tx(contextA, (store) => store.markDelivered(contextA, retry.outboxId, retrySuccess!.leaseId));
    assert.equal(retryDuplicateAck.deliveryStatus, 'DELIVERED', 'retry success must have one idempotent delivery outcome');

    recordStep('dead_letter_and_replay');
    const deadLetter = await seedEpic05Outbox(owner, tenantA, 'dead-letter', base);
    let attemptAt = base;
    let dead = undefined as Awaited<ReturnType<PersistentExternalActionReliabilityStore['recordDeliveryFailure']>> | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const leaseAttempt = await tx(contextA, (store) =>
        store.claimNext(contextA, { leaseOwner: `epic05-dead-worker-${attempt}`, now: attemptAt }),
      );
      dead = await tx(contextA, (store) => store.recordDeliveryFailure(contextA, deadLetter.outboxId, {
        leaseId: leaseAttempt!.leaseId,
        code: 'EPIC05_TRANSIENT_FAILURE',
        reason: 'token=acceptance-only-secret',
        retryable: true,
        now: attemptAt,
      }));
      attemptAt = new Date(dead.nextAttemptAt);
    }
    assert.equal(dead?.deliveryStatus, 'DEAD_LETTER');
    assert.equal(dead?.failureCode, 'EPIC05_TRANSIENT_FAILURE');
    assert.equal(dead?.failureReason?.includes('acceptance-only-secret'), false);
    assert.equal(
      await tx(contextA, (store) => store.claimNext(contextA, { leaseOwner: 'epic05-no-more-retry', now: attemptAt })),
      undefined,
      'dead-letter entries must not execute automatically',
    );
    await expectRejected(() => tx(contextB, (store) => store.replay(contextB, deadLetter.outboxId)), /NOT_FOUND_OR_ACCESS_DENIED/);
    const replayed = await tx(contextA, (store) => store.replay(contextA, deadLetter.outboxId, attemptAt));
    const replayedAgain = await tx(contextA, (store) => store.replay(contextA, deadLetter.outboxId, attemptAt));
    assert.equal(replayed.id, replayedAgain.id, 'operator replay must be idempotent');
    assert.equal(replayed.deliveryStatus, 'PENDING');
    assert.equal(replayed.externalActionId, deadLetter.actionId, 'replay must retain its original governed action context');
    let deliveryCalls = 0;
    await withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, async (transaction) => {
      const worker = new ExternalActionOutboxWorker(
        new PersistentExternalActionReliabilityStore(transaction),
        { deliver: async (_context, event) => { deliveryCalls += 1; assert.equal(event.idempotencyKey, replayed.idempotencyKey); } },
      );
      const result = await worker.processNext(contextA, 'epic05-approved-workflow-delivery');
      assert.equal(result.outcome, 'DELIVERED');
    });
    assert.equal(deliveryCalls, 1, 'replay must deliver one existing workflow continuation only');
    const replayEvents = one(await owner.unsafe(
      `SELECT count(*)::int AS count FROM external_action_operational_events
       WHERE outbox_event_id = $1 AND event_type = 'OUTBOX_REPLAYED'`,
      [deadLetter.outboxId],
    ));
    assert.equal(Number(replayEvents.count), 1, 'duplicate replay requests must produce one replay lineage event');

    recordStep('tenant_rls_and_operational_state');
    await tx(contextA, async (store) => {
      await store.recordProviderFailure(contextA, 'EPIC05_RATE', 'RATE_LIMITED', 60_000, base);
      await store.recordProviderFailure(contextA, 'EPIC05_AUTH', 'INVALID_GRANT', undefined, base);
      await store.recordProviderFailure(contextA, 'EPIC05_UNAVAILABLE', 'PROVIDER_TIMEOUT', undefined, base);
      await store.recordProviderFailure(contextA, 'EPIC05_DEGRADED', 'PROVIDER_UNKNOWN', undefined, base);
      await store.recordCredentialHealth(contextA, 'EPIC05_VALID', { status: 'VALID', now: base });
      await store.recordCredentialHealth(contextA, 'EPIC05_EXPIRING', { status: 'EXPIRING', now: base });
      await store.recordCredentialHealth(contextA, 'EPIC05_EXPIRED', { status: 'EXPIRED', now: base });
      await store.recordCredentialHealth(contextA, 'EPIC05_INVALID', { status: 'INVALID', now: base });
      await store.recordCredentialHealth(contextA, 'EPIC05_MISSING', { status: 'MISSING', now: base });
      await store.recordCredentialHealth(contextA, 'EPIC05_UNKNOWN', { status: 'UNKNOWN', now: base });
      await store.recordEvent(contextA, {
        provider: 'EPIC05_RATE', eventType: 'OUTBOX_REPLAYED', correlationId: `epic05-acceptance:${deadLetter.actionId}`,
        externalActionId: deadLetter.actionId, details: { accessToken: 'acceptance-only-secret' }, occurredAt: base.toISOString(),
      });
    });
    await tx(contextB, async (store) => {
      assert.equal((await store.listOutbox(contextB)).some((event) => event.id.startsWith(fixturePrefix)), false);
      assert.equal(await store.claimNext(contextB, { leaseOwner: 'epic05-tenant-b-worker', now: base }), undefined);
      assert.equal(await store.getProviderHealth(contextB, 'EPIC05_RATE'), undefined);
      assert.equal(await store.getCredentialHealth(contextB, 'EPIC05_VALID'), undefined);
      await store.recordProviderFailure(contextB, 'EPIC05_ISOLATED', 'PROVIDER_TIMEOUT', undefined, base);
    });
    assert.equal(await tx(contextA, (store) => store.getProviderHealth(contextA, 'EPIC05_ISOLATED')), undefined);
    await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
      const visible = rows(await transaction.unsafe(
        `SELECT id FROM external_action_operational_events WHERE correlation_id = $1`,
        [`epic05-acceptance:${deadLetter.actionId}`],
      ));
      assert.equal(visible.length, 0, 'tenant B must not read tenant A operational events');
    });
    await expectRlsDenied(() => withAppTransaction(databaseUrl, tenantA, (transaction) =>
      transaction.unsafe(
        `INSERT INTO external_provider_health (id, tenant_id, provider, status)
         VALUES ('epic05-cross-tenant-denied', $1::uuid, 'EPIC05_DENIED', 'HEALTHY')`,
        [tenantB],
      ),
    ));
    const health = await tx(contextA, (store) => store.getProviderHealth(contextA, 'EPIC05_RATE'));
    const credentials = await tx(contextA, (store) => store.getCredentialHealth(contextA, 'EPIC05_AUTH'));
    assert.equal(health?.status, 'RATE_LIMITED');
    assert.equal(credentials?.status, 'REVOKED');
    for (const [provider, expected] of [
      ['EPIC05_VALID', 'VALID'], ['EPIC05_EXPIRING', 'EXPIRING'], ['EPIC05_EXPIRED', 'EXPIRED'],
      ['EPIC05_INVALID', 'INVALID'], ['EPIC05_MISSING', 'MISSING'], ['EPIC05_UNKNOWN', 'UNKNOWN'],
    ]) {
      const state = await tx(contextA, (store) => store.getCredentialHealth(contextA, provider));
      assert.equal(state?.status, expected, `${provider} credential lifecycle state must persist`);
    }
    const gateBlocked = await tx(contextA, (store) =>
      new PersistentProviderHealthMutationGate(store).allowMutation(contextA, { provider: 'EPIC05_RATE' }, base),
    );
    assert.deepEqual(gateBlocked, { allowed: false, code: 'PROVIDER_HEALTH_COOLDOWN_ACTIVE' });
    const authBlocked = await tx(contextA, (store) =>
      new PersistentProviderHealthMutationGate(store).allowMutation(contextA, { provider: 'EPIC05_AUTH' }, base),
    );
    assert.deepEqual(authBlocked, { allowed: false, code: 'PROVIDER_AUTH_HEALTH_BLOCKED' });
    const recoveryProbe = await tx(contextA, (store) =>
      new PersistentProviderHealthMutationGate(store).allowMutation(
        contextA,
        { provider: 'EPIC05_RATE' },
        new Date(base.getTime() + 60_001),
      ),
    );
    assert.deepEqual(recoveryProbe, { allowed: true });
    const firstProbe = await tx(contextA, (store) =>
      new PersistentProviderHealthMutationGate(store).allowMutation(
        contextA,
        { provider: 'EPIC05_RATE' },
        new Date(base.getTime() + 60_001),
      ),
    );
    assert.deepEqual(firstProbe, { allowed: false, code: 'PROVIDER_RECOVERY_PROBE_IN_PROGRESS' });
    await tx(contextA, (store) =>
      store.recordProviderSuccess(contextA, 'EPIC05_RATE', new Date(base.getTime() + 60_002)),
    );
    assert.equal((await tx(contextA, (store) => store.getProviderHealth(contextA, 'EPIC05_RATE')))?.status, 'HEALTHY');
    const secretRows = rows(await owner.unsafe(`
      SELECT details::text AS payload
      FROM external_action_operational_events
      WHERE correlation_id LIKE 'epic05-acceptance:%'
      UNION ALL
      SELECT COALESCE(failure_reason, '') AS payload
      FROM external_action_workflow_outbox
      WHERE id = $1
    `, [deadLetter.outboxId]));
    assert.equal(JSON.stringify(secretRows).includes('acceptance-only-secret'), false, 'acceptance secrets must never persist');
    recordDiagnostics({ workers: 2, attempts: 2, successfulClaims: 1, skips: 1, duplicateClaims: 0, deliveryCalls });

    return {
      migrationLedgerEntries: Number(ledger.count),
      concurrentClaim: { workers: 2, attempts: 2, successfulClaims: 1, skips: 1, duplicateClaims: 0 },
      leaseRecovery: 'PASS', retry: 'PASS', deadLetter: 'PASS', replay: 'PASS', providerHealth: 'PASS',
      credentialHealth: 'PASS', operatorRecovery: 'PASS', workerBoundary: 'PASS', cleanup: 'PASS',
    };
  } finally {
    await owner.unsafe(`DELETE FROM external_action_operational_events WHERE correlation_id LIKE 'epic05-acceptance:%' OR provider LIKE 'EPIC05_%'`);
    await owner.unsafe(`DELETE FROM external_provider_credential_health WHERE provider LIKE 'EPIC05_%'`);
    await owner.unsafe(`DELETE FROM external_provider_health WHERE provider LIKE 'EPIC05_%'`);
    await owner.unsafe(`DELETE FROM external_action_workflow_outbox WHERE id LIKE 'epic05-acceptance-%'`);
    await owner.unsafe(`DELETE FROM external_marketing_actions WHERE id LIKE 'epic05-acceptance-%'`);
    const remaining = one(await owner.unsafe(`
      SELECT (
        (SELECT count(*) FROM external_action_operational_events WHERE provider LIKE 'EPIC05_%') +
        (SELECT count(*) FROM external_provider_credential_health WHERE provider LIKE 'EPIC05_%') +
        (SELECT count(*) FROM external_provider_health WHERE provider LIKE 'EPIC05_%') +
        (SELECT count(*) FROM external_action_workflow_outbox WHERE id LIKE 'epic05-acceptance-%') +
        (SELECT count(*) FROM external_marketing_actions WHERE id LIKE 'epic05-acceptance-%')
      )::int AS count
    `));
    assert.equal(Number(remaining.count), 0, 'EPIC05 acceptance fixtures must be removed');
    cleanup = true;
    assert.equal(cleanup, true);
  }
}

/** Real PostgreSQL acceptance for EPIC07's tenant-scoped orchestration state. */
async function testEpic07UnifiedCampaignOrchestration(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
  recordDiagnostics: (diagnostics: Record<string, string | number | boolean | null>) => void,
): Promise<Epic07Proof> {
  const prefix = 'epic07-acceptance-';
  const campaignA = `${prefix}campaign-a`;
  const campaignB = `${prefix}campaign-b`;
  let cleanup = false;
  try {
    recordStep('schema_and_migration_ledger');
    const tables = rows(await validationUnsafe(owner, `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN (
        'unified_campaigns', 'unified_campaign_execution_steps',
        'unified_campaign_performance_snapshots', 'unified_campaign_recommendations'
      )
    `, recordSql));
    assert.equal(tables.length, 4, 'EPIC07 orchestration tables are missing');
    const ledger = one(await owner.unsafe(`
      SELECT count(*)::int AS count FROM "drizzle"."__drizzle_migrations"
      WHERE created_at = 1788629864179
    `));
    assert.equal(Number(ledger.count), 1, 'migration 0024 must have exactly one ledger record');

    recordStep('seed_tenant_rows');
    for (const [campaignId, tenantId] of [[campaignA, tenantA], [campaignB, tenantB]] as const) {
      await owner.unsafe(
        `INSERT INTO unified_campaigns
          (id, tenant_id, idempotency_key, organization_id, objective, goal, locale, currency,
           total_budget_minor, minor_unit_scale, lifecycle, definition, evidence_references)
         VALUES ($1, $2::uuid, $3, 'epic07-org', 'LEAD_GENERATION', 'Acceptance', 'ar', 'SAR',
                 100000, 2, 'PLANNED', '{}'::jsonb, '[]'::jsonb)`,
        [campaignId, tenantId, `${prefix}${tenantId}`],
      );
      await owner.unsafe(
        `INSERT INTO unified_campaign_execution_steps
          (id, tenant_id, campaign_id, channel_id, provider, account_id, campaign_resource_id,
           idempotency_key, allocation, proposal, status)
         VALUES ($1, $2::uuid, $3, 'google', 'GOOGLE_ADS', 'account', 'resource', $4,
                 '{}'::jsonb, '{}'::jsonb, 'PLANNED')`,
        [`${campaignId}-step`, tenantId, campaignId, `${campaignId}-step-key`],
      );
      await owner.unsafe(
        `INSERT INTO unified_campaign_performance_snapshots
          (id, tenant_id, campaign_id, channel_id, provider, currency, metrics, provenance,
           verification, captured_at, freshness_expires_at)
         VALUES ($1, $2::uuid, $3, 'google', 'GOOGLE_ADS', 'SAR', '{}'::jsonb, '[]'::jsonb,
                 'UNKNOWN', now(), now() + interval '1 hour')`,
        [`${campaignId}-snapshot`, tenantId, campaignId],
      );
      await owner.unsafe(
        `INSERT INTO unified_campaign_recommendations
          (id, tenant_id, campaign_id, type, recommendation, requires_approval)
         VALUES ($1, $2::uuid, $3, 'REVIEW_TARGET_CPA', '{}'::jsonb, true)`,
        [`${campaignId}-recommendation`, tenantId, campaignId],
      );
    }

    recordStep('tenant_rls');
    for (const table of [
      'unified_campaigns',
      'unified_campaign_execution_steps',
      'unified_campaign_performance_snapshots',
      'unified_campaign_recommendations',
    ]) {
      await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
        const visible = rows(await validationTransactionUnsafe(
          transaction,
          `SELECT tenant_id::text FROM ${table} WHERE id LIKE $1 ORDER BY id`,
          [`${prefix}%`],
          recordSql,
        ));
        assert.deepEqual(visible.map((row) => row.tenant_id), [tenantA], `${table} must isolate tenant A`);
      });
      await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
        const visible = rows(await validationTransactionUnsafe(
          transaction,
          `SELECT tenant_id::text FROM ${table} WHERE id LIKE $1 ORDER BY id`,
          [`${prefix}%`],
          recordSql,
        ));
        assert.deepEqual(visible.map((row) => row.tenant_id), [tenantB], `${table} must isolate tenant B`);
      });
    }
    await expectRlsDenied(() => withAppTransaction(databaseUrl, tenantA, (transaction) =>
      transaction.unsafe(
        `INSERT INTO unified_campaigns
          (id, tenant_id, idempotency_key, organization_id, objective, goal, locale, currency,
           total_budget_minor, minor_unit_scale, lifecycle, definition, evidence_references)
         VALUES ('epic07-cross-tenant', $1::uuid, 'epic07-cross-tenant', 'org', 'LEAD_GENERATION',
                 'denied', 'en', 'SAR', 1, 2, 'DRAFT', '{}'::jsonb, '[]'::jsonb)`,
        [tenantB],
      ),
    ));

    recordStep('idempotency_concurrency');
    const idempotency = `${prefix}concurrent`;
    const results = await Promise.all([0, 1].map((attempt) => withAppTransaction(
      databaseUrl,
      tenantA,
      async (transaction) => rows(await transaction.unsafe(
        `INSERT INTO unified_campaigns
          (id, tenant_id, idempotency_key, organization_id, objective, goal, locale, currency,
           total_budget_minor, minor_unit_scale, lifecycle, definition, evidence_references)
         VALUES ($1, $2::uuid, $3, 'org', 'LEAD_GENERATION', 'concurrent', 'en', 'SAR',
                 1, 2, 'DRAFT', '{}'::jsonb, '[]'::jsonb)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [`${prefix}concurrent-${attempt}`, tenantA, idempotency],
      )),
    )));
    const created = results.filter((result) => result.length === 1).length;
    assert.equal(created, 1, 'exactly one concurrent orchestration intent may persist');
    const count = one(await owner.unsafe(
      `SELECT count(*)::int AS count FROM unified_campaigns WHERE tenant_id = $1::uuid AND idempotency_key = $2`,
      [tenantA, idempotency],
    ));
    assert.equal(Number(count.count), 1, 'tenant idempotency uniqueness must survive concurrent attempts');
    recordDiagnostics({ epic07IdempotencyAttempts: 2, epic07IdempotencyCreated: created });

    recordStep('persistence_store_contract');
    await withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, async (transaction) => {
      const store = new PersistentUnifiedCampaignStore(transaction);
      const campaign = await store.findByIdempotencyKey(epic05Context(tenantA), idempotency);
      assert.equal(campaign?.tenantId, tenantA, 'persistent campaign store must read only scoped intent');
    });

    recordStep('fixture_cleanup');
    await owner.unsafe(`DELETE FROM unified_campaigns WHERE id LIKE $1`, [`${prefix}%`]);
    const remaining = one(await owner.unsafe(
      `SELECT count(*)::int AS count FROM unified_campaigns WHERE id LIKE $1`,
      [`${prefix}%`],
    ));
    assert.equal(Number(remaining.count), 0, 'EPIC07 acceptance fixtures must be removed');
    cleanup = true;
    return {
      migrationLedgerEntries: 1,
      rlsTables: tables.length,
      idempotency: { attempts: 2, created, duplicates: 2 - created },
      cleanup: 'PASS',
    };
  } finally {
    if (!cleanup) await owner.unsafe(`DELETE FROM unified_campaigns WHERE id LIKE $1`, [`${prefix}%`]);
  }
}

/** Real PostgreSQL acceptance for EPIC08 canonical telemetry and decision records. */
async function testEpic08CrossChannelPerformanceOptimization(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
  recordDiagnostics: (diagnostics: Record<string, string | number | boolean | null>) => void,
): Promise<Epic08Proof> {
  const prefix = 'epic08-acceptance-';
  const campaignA = `${prefix}campaign-a`;
  const campaignB = `${prefix}campaign-b`;
  const actionA = `${prefix}action-a`;
  const actionB = `${prefix}action-b`;
  let cleanup = false;
  const tables = [
    'campaign_performance_observations', 'campaign_performance_aggregates',
    'campaign_performance_diagnostics', 'campaign_performance_anomalies',
    'campaign_optimization_recommendations', 'campaign_optimization_simulations',
    'campaign_optimization_outcomes', 'campaign_optimization_learning',
  ] as const;
  try {
    recordStep('schema_and_migration_ledger');
    const found = rows(await validationUnsafe(owner, `
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
      AND table_name IN (
        'campaign_performance_observations', 'campaign_performance_aggregates',
        'campaign_performance_diagnostics', 'campaign_performance_anomalies',
        'campaign_optimization_recommendations', 'campaign_optimization_simulations',
        'campaign_optimization_outcomes', 'campaign_optimization_learning'
      )
    `, recordSql));
    assert.equal(found.length, tables.length, 'EPIC08 performance optimization tables are missing');
    const ledger = one(await owner.unsafe(`
      SELECT count(*)::int AS count FROM "drizzle"."__drizzle_migrations" WHERE created_at = 1788629864180
    `));
    assert.equal(Number(ledger.count), 1, 'migration 0025 must have exactly one ledger record');

    recordStep('seed_tenant_rows');
    for (const [campaignId, actionId, tenantId] of [[campaignA, actionA, tenantA], [campaignB, actionB, tenantB]] as const) {
      await owner.unsafe(
        `INSERT INTO unified_campaigns
          (id, tenant_id, idempotency_key, organization_id, objective, goal, locale, currency, total_budget_minor, minor_unit_scale, lifecycle, definition, evidence_references)
         VALUES ($1, $2::uuid, $3, 'epic08-org', 'LEAD_GENERATION', 'Acceptance', 'en', 'SAR', 100000, 2, 'ACTIVE', '{}'::jsonb, '[]'::jsonb)`,
        [campaignId, tenantId, `${campaignId}-key`],
      );
      await owner.unsafe(
        `INSERT INTO external_marketing_actions
          (id, tenant_id, organization_id, actor, agent_identity, workflow_run_id, recommendation_id, provider, account_id, campaign_id, action_type, target_lock_key, proposal, status, idempotency_key, requested_at)
         VALUES ($1, $2::uuid, 'epic08-org', 'harness', 'harness', 'workflow', 'recommendation', 'EPIC08', 'account', 'campaign', 'PAUSE_CAMPAIGN', $3, '{}'::jsonb, 'VERIFIED', $4, now())`,
        [actionId, tenantId, `${actionId}-target`, `${actionId}-key`],
      );
      await owner.unsafe(
        `INSERT INTO campaign_performance_observations
          (id, tenant_id, unified_campaign_id, channel_id, provider, provider_campaign_id, snapshot_id, idempotency_key, observation, period_start, period_end, collected_at, verification_state, freshness_state, normalization_version)
         VALUES ($1, $2::uuid, $3, 'channel', 'EPIC08', 'provider-campaign', 'snapshot', $4, '{}'::jsonb, now() - interval '1 hour', now(), now(), 'VERIFIED', 'FRESH', 'v1')`,
        [`${campaignId}-observation`, tenantId, campaignId, `${campaignId}-observation-key`],
      );
      await owner.unsafe(
        `INSERT INTO campaign_performance_aggregates (id, tenant_id, unified_campaign_id, aggregate, generated_at)
         VALUES ($1, $2::uuid, $3, '{}'::jsonb, now())`, [`${campaignId}-aggregate`, tenantId, campaignId]);
      await owner.unsafe(
        `INSERT INTO campaign_performance_diagnostics (id, tenant_id, unified_campaign_id, type, diagnostic, generated_at)
         VALUES ($1, $2::uuid, $3, 'INSUFFICIENT_EVIDENCE', '{}'::jsonb, now())`, [`${campaignId}-diagnostic`, tenantId, campaignId]);
      await owner.unsafe(
        `INSERT INTO campaign_performance_anomalies (id, tenant_id, unified_campaign_id, type, anomaly, generated_at)
         VALUES ($1, $2::uuid, $3, 'SPEND_SPIKE', '{}'::jsonb, now())`, [`${campaignId}-anomaly`, tenantId, campaignId]);
      await owner.unsafe(
        `INSERT INTO campaign_optimization_recommendations (id, tenant_id, unified_campaign_id, action_type, recommendation, requires_approval, expires_at)
         VALUES ($1, $2::uuid, $3, 'PAUSE_CAMPAIGN', '{}'::jsonb, true, now() + interval '1 day')`, [`${campaignId}-recommendation`, tenantId, campaignId]);
      await owner.unsafe(
        `INSERT INTO campaign_optimization_simulations (id, tenant_id, unified_campaign_id, recommendation_id, simulation)
         VALUES ($1, $2::uuid, $3, $4, '{}'::jsonb)`, [`${campaignId}-simulation`, tenantId, campaignId, `${campaignId}-recommendation`]);
      await owner.unsafe(
        `INSERT INTO campaign_optimization_outcomes (id, tenant_id, unified_campaign_id, recommendation_id, external_action_id, outcome, measured_at)
         VALUES ($1, $2::uuid, $3, $4, $5, '{}'::jsonb, now())`, [`${campaignId}-outcome`, tenantId, campaignId, `${campaignId}-recommendation`, actionId]);
      await owner.unsafe(
        `INSERT INTO campaign_optimization_learning (id, tenant_id, unified_campaign_id, recommendation_id, learning, rule_version)
         VALUES ($1, $2::uuid, $3, $4, '{}'::jsonb, 'V1')`, [`${campaignId}-learning`, tenantId, campaignId, `${campaignId}-recommendation`]);
    }

    recordStep('tenant_rls_and_learning_isolation');
    for (const table of tables) {
      await withAppTransaction(databaseUrl, tenantA, async (transaction) => {
        const visible = rows(await validationTransactionUnsafe(transaction, `SELECT tenant_id::text FROM ${table} WHERE id LIKE $1 ORDER BY id`, [`${prefix}%`], recordSql));
        assert.deepEqual(visible.map((row) => row.tenant_id), [tenantA], `${table} must isolate tenant A`);
      });
      await withAppTransaction(databaseUrl, tenantB, async (transaction) => {
        const visible = rows(await validationTransactionUnsafe(transaction, `SELECT tenant_id::text FROM ${table} WHERE id LIKE $1 ORDER BY id`, [`${prefix}%`], recordSql));
        assert.deepEqual(visible.map((row) => row.tenant_id), [tenantB], `${table} must isolate tenant B`);
      });
    }
    await expectRlsDenied(() => withAppTransaction(databaseUrl, tenantA, (transaction) => transaction.unsafe(
      `INSERT INTO campaign_optimization_learning (id, tenant_id, unified_campaign_id, recommendation_id, learning, rule_version)
       VALUES ('epic08-cross-tenant-learning', $1::uuid, $2, $3, '{}'::jsonb, 'V1')`,
      [tenantB, campaignB, `${campaignB}-recommendation`],
    )));

    recordStep('observation_idempotency_concurrency');
    const idempotencyKey = `${prefix}concurrent-observation`;
    const attempts = await Promise.all([0, 1].map((attempt) => withAppTransaction(databaseUrl, tenantA, async (transaction) => rows(await transaction.unsafe(
      `INSERT INTO campaign_performance_observations
        (id, tenant_id, unified_campaign_id, channel_id, provider, provider_campaign_id, snapshot_id, idempotency_key, observation, period_start, period_end, collected_at, verification_state, freshness_state, normalization_version)
       VALUES ($1, $2::uuid, $3, 'channel', 'EPIC08', 'concurrent', 'snapshot', $4, '{}'::jsonb, now(), now(), now(), 'VERIFIED', 'FRESH', 'v1')
       ON CONFLICT ON CONSTRAINT campaign_performance_observation_tenant_provider_snapshot_uidx
       DO NOTHING RETURNING id`,
      [`${prefix}concurrent-${attempt}`, tenantA, campaignA, idempotencyKey],
    )))));
    assert.equal(attempts.length, 2, 'EPIC08 must issue two concurrent observation attempts');
    const created = attempts.filter((result) => result.length === 1).length;
    assert.equal(created, 1, 'exactly one idempotent observation may persist concurrently');
    const canonical = one(await owner.unsafe(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE idempotency_key = $2)::int AS idempotency_matches
         FROM campaign_performance_observations
        WHERE tenant_id = $1::uuid
          AND provider = 'EPIC08'
          AND provider_campaign_id = 'concurrent'
          AND snapshot_id = 'snapshot'
          AND normalization_version = 'v1'`,
      [tenantA, idempotencyKey],
    ));
    assert.equal(Number(canonical.total), 1, 'the provider snapshot race must leave one canonical observation');
    assert.equal(Number(canonical.idempotency_matches), 1, 'the canonical observation must retain the replay idempotency key');
    recordDiagnostics({ epic08ObservationAttempts: attempts.length, epic08ObservationCreated: created });

    recordStep('persistence_store_contract');
    await withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, async (transaction) => {
      const store = new PersistentPerformanceOptimizationStore(transaction);
      const learning = await store.listLearning(epic05Context(tenantA), campaignA);
      assert.equal(learning.length, 1, 'persistent optimization store must read only tenant-scoped learning');
    });

    recordStep('fixture_cleanup');
    for (const table of [...tables].reverse()) await owner.unsafe(`DELETE FROM ${table} WHERE id LIKE $1`, [`${prefix}%`]);
    await owner.unsafe(`DELETE FROM external_marketing_actions WHERE id LIKE $1`, [`${prefix}%`]);
    await owner.unsafe(`DELETE FROM unified_campaigns WHERE id LIKE $1`, [`${prefix}%`]);
    const remaining = one(await owner.unsafe(`
      SELECT (${tables.map((table) => `(SELECT count(*) FROM ${table} WHERE id LIKE '${prefix}%')`).join(' + ')})::int AS count
    `));
    assert.equal(Number(remaining.count), 0, 'EPIC08 acceptance fixtures must be removed');
    cleanup = true;
    return { migrationLedgerEntries: 1, rlsTables: tables.length, observationIdempotency: { attempts: 2, created, duplicates: 2 - created }, learningIsolation: 'PASS', cleanup: 'PASS' };
  } finally {
    if (!cleanup) {
      for (const table of [...tables].reverse()) await owner.unsafe(`DELETE FROM ${table} WHERE id LIKE $1`, [`${prefix}%`]);
      await owner.unsafe(`DELETE FROM external_marketing_actions WHERE id LIKE $1`, [`${prefix}%`]);
      await owner.unsafe(`DELETE FROM unified_campaigns WHERE id LIKE $1`, [`${prefix}%`]);
    }
  }
}

/** Real PostgreSQL acceptance for provider-neutral customer acquisition and revenue intelligence. */
async function testEpic09CustomerAcquisitionRevenueIntelligence(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
  recordDiagnostics: (diagnostics: Record<string, string | number | boolean | null>) => void,
): Promise<Epic09Proof> {
  const prefix = 'epic09-acceptance-';
  const tables = [
    'customer_identities', 'customer_identity_identifiers', 'customer_identity_edges', 'customer_identity_aliases',
    'customer_leads', 'customer_lead_capture_quarantine', 'customer_lead_sources', 'customer_lead_identity_links', 'customer_lead_engagement_signals',
    'customer_lead_qualification_assessments', 'customer_conversation_threads', 'customer_conversation_participants',
    'revenue_opportunities', 'revenue_events', 'revenue_attribution_assessments', 'customer_funnel_transitions',
    'acquisition_revenue_diagnostics', 'lead_routing_recommendations', 'acquisition_data_quality_assessments',
    'customer_provider_capabilities',
  ] as const;
  const fixture = (tenantId: string) => ({
    identity: `${prefix}${tenantId.slice(0, 8)}-identity`, lead: `${prefix}${tenantId.slice(0, 8)}-lead`,
    thread: `${prefix}${tenantId.slice(0, 8)}-thread`, opportunity: `${prefix}${tenantId.slice(0, 8)}-opportunity`, event: `${prefix}${tenantId.slice(0, 8)}-event`,
  });
  const leadPayload = (tenantId: string, item: ReturnType<typeof fixture>) => ({
    leadId: item.lead,
    tenantId,
    externalLeadIds: [`${item.lead}-external`],
    source: 'FORM',
    capturedAt: '2026-09-14T00:00:00.000Z',
    firstSeenAt: '2026-09-14T00:00:00.000Z',
    lastSeenAt: '2026-09-14T00:00:00.000Z',
    status: 'NEW',
    lifecycleStage: 'LEAD',
    sourceMetadata: { fixture: 'epic09' },
    consentState: 'UNKNOWN',
    consentEvidenceRefs: [],
    evidenceRefs: [],
    confidence: 1,
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
  });
  let cleanup = false;
  try {
    recordStep('schema_and_migration_ledger');
    const found = rows(await validationUnsafe(owner, `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${tables.map((table) => `'${table}'`).join(', ')})`, recordSql));
    assert.equal(found.length, tables.length, 'EPIC09 acquisition/revenue tables are missing');
    const ledger = one(await owner.unsafe(`SELECT count(*)::int AS count FROM "drizzle"."__drizzle_migrations" WHERE created_at = 1788629864181`));
    assert.equal(Number(ledger.count), 1, 'migration 0026 must have exactly one ledger record');

    recordStep('seed_tenant_rows');
    for (const tenantId of [tenantA, tenantB]) {
      const item = fixture(tenantId);
      await owner.unsafe(`INSERT INTO customer_identities (id, tenant_id, identity_type, identity) VALUES ($1, $2::uuid, 'PERSON', '{}'::jsonb)`, [item.identity, tenantId]);
      await owner.unsafe(`INSERT INTO customer_identity_identifiers (id, tenant_id, identity_id, identifier_type, normalized_value, identifier) VALUES ($1, $2::uuid, $3, 'EMAIL', $4, '{}'::jsonb)`, [`${item.identity}-identifier`, tenantId, item.identity, `${tenantId.slice(0, 8)}@example.test`]);
      await owner.unsafe(`INSERT INTO customer_identity_edges (id, tenant_id, from_identity_id, to_identity_id, resolution, reason, confidence, evidence_refs, resolver_version) VALUES ($1, $2::uuid, $3, $3, 'EXACT_MATCH', 'fixture', 1, '[]'::jsonb, 'V1')`, [`${item.identity}-edge`, tenantId, item.identity]);
      await owner.unsafe(`INSERT INTO customer_identity_aliases (id, tenant_id, identity_id, alias, reason, evidence_refs) VALUES ($1, $2::uuid, $3, 'alias', 'fixture', '[]'::jsonb)`, [`${item.identity}-alias`, tenantId, item.identity]);
      await owner.unsafe(`INSERT INTO customer_leads (id, tenant_id, idempotency_key, source, lead, captured_at) VALUES ($1, $2::uuid, $3, 'FORM', $4::jsonb, now())`, [item.lead, tenantId, `${item.lead}-key`, JSON.stringify(leadPayload(tenantId, item))]);
      await owner.unsafe(`INSERT INTO customer_lead_capture_quarantine (id, tenant_id, idempotency_key, code, reason, captured_at) VALUES ($1, $2::uuid, $3, 'LEAD_CAPTURE_MALFORMED', 'fixture', now())`, [`${item.lead}-quarantine`, tenantId, `${item.lead}-quarantine-key`]);
      await owner.unsafe(`INSERT INTO customer_lead_sources (id, tenant_id, lead_id, source, source_record, captured_at) VALUES ($1, $2::uuid, $3, 'FORM', '{}'::jsonb, now())`, [`${item.lead}-source`, tenantId, item.lead]);
      await owner.unsafe(`INSERT INTO customer_lead_identity_links (id, tenant_id, lead_id, identity_id, resolution, reason, confidence, evidence_refs, resolver_version) VALUES ($1, $2::uuid, $3, $4, 'EXACT_MATCH', 'fixture', 1, '[]'::jsonb, 'V1')`, [`${item.lead}-link`, tenantId, item.lead, item.identity]);
      await owner.unsafe(`INSERT INTO customer_lead_engagement_signals (id, tenant_id, lead_id, signal_type, source, occurred_at, confidence, evidence_refs) VALUES ($1, $2::uuid, $3, 'REQUESTED_DEMO', 'fixture', now(), 1, '[]'::jsonb)`, [`${item.lead}-signal`, tenantId, item.lead]);
      await owner.unsafe(`INSERT INTO customer_lead_qualification_assessments (id, tenant_id, lead_id, assessment, rule_version, assessed_at) VALUES ($1, $2::uuid, $3, '{}'::jsonb, 'QUALIFICATION_V1', now())`, [`${item.lead}-qualification`, tenantId, item.lead]);
      await owner.unsafe(`INSERT INTO customer_conversation_threads (id, tenant_id, channel, thread, started_at) VALUES ($1, $2::uuid, 'WEB_CHAT', '{}'::jsonb, now())`, [item.thread, tenantId]);
      await owner.unsafe(`INSERT INTO customer_conversation_participants (id, tenant_id, thread_id, identity_id, participant) VALUES ($1, $2::uuid, $3, $4, '{}'::jsonb)`, [`${item.thread}-participant`, tenantId, item.thread, item.identity]);
      await owner.unsafe(`INSERT INTO revenue_opportunities (id, tenant_id, provider, stage, status, amount_minor, currency, opportunity) VALUES ($1, $2::uuid, 'NAWA_NATIVE', 'PROSPECTING', 'OPEN', 1000, 'SAR', '{}'::jsonb)`, [item.opportunity, tenantId]);
      await owner.unsafe(`INSERT INTO revenue_events (id, tenant_id, opportunity_id, event_type, amount_minor, currency, idempotency_key, verification_state, event, occurred_at) VALUES ($1, $2::uuid, $3, 'BOOKED_REVENUE', 1000, 'SAR', $4, 'VERIFIED', '{}'::jsonb, now())`, [item.event, tenantId, item.opportunity, `${item.event}-key`]);
      await owner.unsafe(`INSERT INTO revenue_attribution_assessments (id, tenant_id, revenue_event_id, opportunity_id, model, confidence, assessment, assessed_at) VALUES ($1, $2::uuid, $3, $4, 'LEAD_SOURCE', 1, '{}'::jsonb, now())`, [`${item.event}-attribution`, tenantId, item.event, item.opportunity]);
      await owner.unsafe(`INSERT INTO customer_funnel_transitions (id, tenant_id, lead_id, opportunity_id, to_stage, transition, occurred_at) VALUES ($1, $2::uuid, $3, $4, 'LEAD', '{}'::jsonb, now())`, [`${item.lead}-transition`, tenantId, item.lead, item.opportunity]);
      await owner.unsafe(`INSERT INTO acquisition_revenue_diagnostics (id, tenant_id, diagnostic_type, severity, diagnostic, generated_at) VALUES ($1, $2::uuid, 'DATA_QUALITY', 'INFO', '{}'::jsonb, now())`, [`${item.lead}-diagnostic`, tenantId]);
      await owner.unsafe(`INSERT INTO lead_routing_recommendations (id, tenant_id, lead_id, kind, recommendation) VALUES ($1, $2::uuid, $3, 'NURTURE', '{}'::jsonb)`, [`${item.lead}-routing`, tenantId, item.lead]);
      await owner.unsafe(`INSERT INTO acquisition_data_quality_assessments (id, tenant_id, subject_type, subject_id, assessment, assessed_at) VALUES ($1, $2::uuid, 'LEAD', $3, '{}'::jsonb, now())`, [`${item.lead}-quality`, tenantId, item.lead]);
      await owner.unsafe(`INSERT INTO customer_provider_capabilities (id, tenant_id, provider, enabled, health_status, capabilities) VALUES ($1, $2::uuid, 'NAWA_NATIVE', true, 'HEALTHY', '{}'::jsonb)`, [`${item.lead}-capability`, tenantId]);
    }

    recordStep('tenant_rls_cross_tenant_and_missing_context');
    for (const table of tables) for (const tenantId of [tenantA, tenantB]) await withAppTransaction(databaseUrl, tenantId, async (transaction) => {
      const visible = rows(await validationTransactionUnsafe(transaction, `SELECT tenant_id::text FROM ${table} WHERE id LIKE $1 ORDER BY id`, [`${prefix}%`], recordSql));
      assert.deepEqual(visible.map((row) => row.tenant_id), [tenantId], `${table} must isolate ${tenantId}`);
    });
    await expectRlsDenied(() => withAppTransaction(databaseUrl, tenantA, (transaction) => transaction.unsafe(`INSERT INTO customer_leads (id, tenant_id, idempotency_key, source, lead, captured_at) VALUES ('epic09-cross-tenant', $1::uuid, 'denied', 'FORM', '{}'::jsonb, now())`, [tenantB])));
    await expectRlsDenied(() => withAppTransaction(databaseUrl, tenantA, (transaction) => transaction.unsafe(`INSERT INTO customer_lead_identity_links (id, tenant_id, lead_id, identity_id, resolution, reason, confidence, evidence_refs, resolver_version) VALUES ('epic09-cross-tenant-link', $1::uuid, $2, $3, 'EXACT_MATCH', 'denied', 1, '[]'::jsonb, 'V1')`, [tenantB, fixture(tenantB).lead, fixture(tenantB).identity])));
    await expectRlsDenied(() => withAppTransaction(databaseUrl, tenantA, (transaction) => transaction.unsafe(`INSERT INTO revenue_opportunities (id, tenant_id, provider, stage, status, opportunity) VALUES ('epic09-cross-tenant-crm-link', $1::uuid, 'CUSTOM', 'PROSPECTING', 'OPEN', '{}'::jsonb)`, [tenantB])));
    await expectRlsDenied(() => withAppTransaction(databaseUrl, undefined, (transaction) => transaction.unsafe(`INSERT INTO customer_leads (id, tenant_id, idempotency_key, source, lead, captured_at) VALUES ('epic09-missing-context', $1::uuid, 'missing', 'FORM', '{}'::jsonb, now())`, [tenantA])));

    recordStep('lead_and_identity_idempotency');
    const leadKey = `${prefix}concurrent-lead`;
    const leadAttempts = await Promise.all([0, 1].map((attempt) => {
      const concurrentLead = { ...fixture(tenantA), lead: `${prefix}concurrent-lead-${attempt}` };
      return withAppTransaction(databaseUrl, tenantA, async (transaction) => rows(await transaction.unsafe(
        `INSERT INTO customer_leads (id, tenant_id, idempotency_key, source, lead, captured_at)
         VALUES ($1, $2::uuid, $3, 'FORM', $4::jsonb, now())
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`,
        [concurrentLead.lead, tenantA, leadKey, JSON.stringify(leadPayload(tenantA, concurrentLead))],
      )));
    }));
    const leadCreated = leadAttempts.filter((result) => result.length === 1).length; assert.equal(leadCreated, 1, 'lead capture idempotency must create one row');
    const canonicalLead = one(await owner.unsafe(`SELECT count(*)::int AS total, count(*) FILTER (WHERE idempotency_key = $2)::int AS idempotency_matches FROM customer_leads WHERE tenant_id = $1::uuid AND idempotency_key = $2`, [tenantA, leadKey]));
    assert.equal(Number(canonicalLead.total), 1, 'lead idempotency must leave one canonical row');
    assert.equal(Number(canonicalLead.idempotency_matches), 1, 'canonical lead must retain its idempotency key');
    const concurrentIdentityId = `${prefix}concurrent-identity`;
    await owner.unsafe(`INSERT INTO customer_identities (id, tenant_id, identity_type, identity) VALUES ($1, $2::uuid, 'PERSON', '{}'::jsonb)`, [concurrentIdentityId, tenantA]);
    const identityAttempts = await Promise.all([0, 1].map((attempt) => withAppTransaction(databaseUrl, tenantA, async (transaction) => {
      return rows(await transaction.unsafe(`INSERT INTO customer_identity_identifiers (id, tenant_id, identity_id, identifier_type, normalized_value, identifier) VALUES ($1, $2::uuid, $3, 'EMAIL', 'dedupe@example.test', '{}'::jsonb) ON CONFLICT (tenant_id, identifier_type, normalized_value) DO NOTHING RETURNING id`, [`${concurrentIdentityId}-identifier-${attempt}`, tenantA, concurrentIdentityId]));
    })));
    const identityCreated = identityAttempts.filter((result) => result.length === 1).length; assert.equal(identityCreated, 1, 'exact normalized identity identifier must deduplicate');
    const canonicalIdentifier = one(await owner.unsafe(`SELECT count(*)::int AS total FROM customer_identity_identifiers WHERE tenant_id = $1::uuid AND identifier_type = 'EMAIL' AND normalized_value = 'dedupe@example.test'`, [tenantA]));
    assert.equal(Number(canonicalIdentifier.total), 1, 'identity deduplication must leave one normalized identifier');
    const linkAttempts = await Promise.all([0, 1].map((attempt) => withAppTransaction(databaseUrl, tenantA, async (transaction) => rows(await transaction.unsafe(`INSERT INTO customer_lead_identity_links (id, tenant_id, lead_id, identity_id, resolution, reason, confidence, evidence_refs, resolver_version) VALUES ($1, $2::uuid, $3, $4, 'EXACT_MATCH', 'concurrent-fixture', 1, '[]'::jsonb, 'V1') ON CONFLICT (tenant_id, lead_id, identity_id) DO NOTHING RETURNING id`, [`${prefix}concurrent-link-${attempt}`, tenantA, fixture(tenantA).lead, concurrentIdentityId])))));
    const linkCreated = linkAttempts.filter((result) => result.length === 1).length;
    assert.equal(linkCreated, 1, 'identity link idempotency must create one canonical link');
    const canonicalLink = one(await owner.unsafe(`SELECT count(*)::int AS total FROM customer_lead_identity_links WHERE tenant_id = $1::uuid AND lead_id = $2 AND identity_id = $3`, [tenantA, fixture(tenantA).lead, concurrentIdentityId]));
    assert.equal(Number(canonicalLink.total), 1, 'identity link idempotency must leave one persisted link');
    const revenueKey = `${prefix}concurrent-revenue`;
    const revenueAttempts = await Promise.all([0, 1].map((attempt) => withAppTransaction(databaseUrl, tenantA, async (transaction) => rows(await transaction.unsafe(`INSERT INTO revenue_events (id, tenant_id, event_type, idempotency_key, verification_state, event, occurred_at) VALUES ($1, $2::uuid, 'BOOKED_REVENUE', $3, 'VERIFIED', '{}'::jsonb, now()) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`, [`${prefix}concurrent-revenue-${attempt}`, tenantA, revenueKey])))));
    const revenueCreated = revenueAttempts.filter((result) => result.length === 1).length;
    assert.equal(revenueCreated, 1, 'revenue event idempotency must create one canonical event');
    const canonicalRevenue = one(await owner.unsafe(`SELECT count(*)::int AS total FROM revenue_events WHERE tenant_id = $1::uuid AND idempotency_key = $2`, [tenantA, revenueKey]));
    assert.equal(Number(canonicalRevenue.total), 1, 'revenue event idempotency must leave one persisted event');
    await withAppDrizzleTransaction(databaseUrl, tenantA, recordSql, async (transaction) => {
      const store = new PersistentCustomerAcquisitionRevenueStore(transaction);
      assert.equal((await store.listLeads(epic05Context(tenantA))).some((lead) => lead.leadId === fixture(tenantA).lead && lead.tenantId === tenantA), true, 'persistent acquisition store must return the canonical Tenant A lead shape');
      assert.deepEqual(await store.listLeads(epic05Context(tenantB)), [], 'caller-provided Tenant B context must not bypass Tenant A database RLS context');
    });
    recordDiagnostics({ epic09LeadAttempts: leadAttempts.length, epic09LeadCreated: leadCreated, epic09IdentityAttempts: identityAttempts.length, epic09IdentityCreated: identityCreated, epic09LinkAttempts: linkAttempts.length, epic09LinkCreated: linkCreated, epic09RevenueAttempts: revenueAttempts.length, epic09RevenueCreated: revenueCreated });

    recordStep('fixture_cleanup');
    for (const table of [...tables].reverse()) await owner.unsafe(`DELETE FROM ${table} WHERE id LIKE $1`, [`${prefix}%`]);
    const remaining = one(await owner.unsafe(`SELECT (${tables.map((table) => `(SELECT count(*) FROM ${table} WHERE id LIKE '${prefix}%')`).join(' + ')})::int AS count`));
    assert.equal(Number(remaining.count), 0, 'EPIC09 acceptance fixtures must be removed'); cleanup = true;
    return { migrationLedgerEntries: 1, rlsTables: tables.length, leadIdempotency: { attempts: 2, created: leadCreated, duplicates: 2 - leadCreated }, identityDeduplication: { attempts: 2, created: identityCreated, duplicates: 2 - identityCreated }, crossTenantDenied: 'PASS', missingContextDenied: 'PASS', revenueEventIdempotency: 'PASS', cleanup: 'PASS' };
  } finally { if (!cleanup) for (const table of [...tables].reverse()) await owner.unsafe(`DELETE FROM ${table} WHERE id LIKE $1`, [`${prefix}%`]); }
}

/** Real PostgreSQL acceptance for EPIC10 minimized conversation and AI receptionist records. */
async function testEpic10CustomerConversationsAiReceptionist(
  owner: SqlClient,
  databaseUrl: string,
  recordSql: SqlRecorder,
  recordStep: (step: string) => void,
  recordDiagnostics: (diagnostics: Record<string, string | number | boolean | null>) => void,
): Promise<Epic10Proof> {
  const prefix = 'epic10-acceptance-';
  const tables = ['customer_conversation_events', 'customer_conversation_turns', 'customer_conversation_states', 'customer_conversation_intents', 'customer_conversation_summaries', 'conversation_buying_signals', 'lead_engagement_assessments', 'response_recommendations', 'contactability_assessments', 'ai_receptionist_profiles', 'ai_receptionist_sessions', 'ai_receptionist_turns', 'ai_receptionist_action_recommendations', 'ai_receptionist_handoffs', 'ai_receptionist_outcomes', 'customer_handoff_recommendations', 'customer_handoff_records', 'customer_meeting_intents', 'customer_follow_up_recommendations', 'customer_commitments', 'business_commitments', 'conversation_diagnostics'] as const;
  const fixture = (tenantId: string) => ({ conversation: `${prefix}${tenantId.slice(0, 8)}-conversation`, event: `${prefix}${tenantId.slice(0, 8)}-event`, session: `${prefix}${tenantId.slice(0, 8)}-session`, profile: `${prefix}${tenantId.slice(0, 8)}-profile` });
  let cleanup = false;
  try {
    recordStep('schema_and_migration_ledger');
    const found = rows(await validationUnsafe(owner, `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${tables.map((table) => `'${table}'`).join(', ')})`, recordSql));
    assert.equal(found.length, tables.length, 'EPIC10 conversation tables are missing');
    const ledger = one(await owner.unsafe(`SELECT count(*)::int AS count FROM "drizzle"."__drizzle_migrations" WHERE created_at = 1788629864182`));
    assert.equal(Number(ledger.count), 1, 'migration 0027 must have exactly one ledger record');

    recordStep('seed_tenant_rows');
    for (const tenantId of [tenantA, tenantB]) {
      const item = fixture(tenantId); const event = { eventId: item.event, tenantId, conversationId: item.conversation, languageHints: ['ar-SA', 'en'], contentHash: 'fixture-hash' }; const session = { sessionId: item.session, tenantId, conversationId: item.conversation, profileId: item.profile, state: 'ACTIVE' };
      await owner.unsafe(`INSERT INTO customer_conversation_events (id, tenant_id, conversation_id, provider, channel, external_message_id, direction, idempotency_key, content_hash, consent_status, language_hints, event, occurred_at) VALUES ($1, $2::uuid, $3, 'EPIC10', 'WEB_CHAT', $4, 'INBOUND', $5, 'fixture-hash', 'ALLOWED', '["ar-SA","en"]'::jsonb, $6::jsonb, now())`, [item.event, tenantId, item.conversation, `${item.event}-message`, `${item.event}-key`, JSON.stringify(event)]);
      await owner.unsafe(`INSERT INTO customer_conversation_turns (id, tenant_id, conversation_id, event_id, direction, turn, occurred_at) VALUES ($1, $2::uuid, $3, $4, 'INBOUND', '{}'::jsonb, now())`, [`${item.event}-turn`, tenantId, item.conversation, item.event]);
      await owner.unsafe(`INSERT INTO customer_conversation_states (id, tenant_id, conversation_id, state, state_record, updated_at) VALUES ($1, $2::uuid, $3, 'ACTIVE', '{}'::jsonb, now())`, [item.conversation, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO customer_conversation_intents (id, tenant_id, conversation_id, primary_intent, intent, detected_at) VALUES ($1, $2::uuid, $3, 'PRICING', '{}'::jsonb, now())`, [`${item.conversation}-intent`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO customer_conversation_summaries (id, tenant_id, conversation_id, summary) VALUES ($1, $2::uuid, $3, '{}'::jsonb)`, [`${item.conversation}-summary`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO conversation_buying_signals (id, tenant_id, conversation_id, signal_type, signal, occurred_at) VALUES ($1, $2::uuid, $3, 'PRICING_REQUEST', '{}'::jsonb, now())`, [`${item.conversation}-signal`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO lead_engagement_assessments (id, tenant_id, lead_id, state, assessment, assessed_at) VALUES ($1, $2::uuid, $3, 'ENGAGED', '{}'::jsonb, now())`, [`${item.conversation}-engagement`, tenantId, `${item.conversation}-lead`]);
      await owner.unsafe(`INSERT INTO response_recommendations (id, tenant_id, conversation_id, action, expires_at, recommendation) VALUES ($1, $2::uuid, $3, 'HANDOFF_SALES', now() + interval '1 hour', '{}'::jsonb)`, [`${item.conversation}-recommendation`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO contactability_assessments (id, tenant_id, channel, purpose, status, assessment, assessed_at) VALUES ($1, $2::uuid, 'WEB_CHAT', 'SALES', 'ALLOWED', '{}'::jsonb, now())`, [`${item.conversation}-contactability`, tenantId]);
      await owner.unsafe(`INSERT INTO ai_receptionist_profiles (id, tenant_id, enabled, profile) VALUES ($1, $2::uuid, false, '{}'::jsonb)`, [item.profile, tenantId]);
      await owner.unsafe(`INSERT INTO ai_receptionist_sessions (id, tenant_id, conversation_id, profile_id, state, idempotency_key, session) VALUES ($1, $2::uuid, $3, $4, 'ACTIVE', $5, $6::jsonb)`, [item.session, tenantId, item.conversation, item.profile, `${item.session}-key`, JSON.stringify(session)]);
      await owner.unsafe(`INSERT INTO ai_receptionist_turns (id, tenant_id, session_id, idempotency_key, turn, occurred_at) VALUES ($1, $2::uuid, $3, $4, '{}'::jsonb, now())`, [`${item.session}-turn`, tenantId, item.session, `${item.session}-turn-key`]);
      await owner.unsafe(`INSERT INTO ai_receptionist_action_recommendations (id, tenant_id, session_id, action, recommendation) VALUES ($1, $2::uuid, $3, 'ESCALATE', '{}'::jsonb)`, [`${item.session}-action`, tenantId, item.session]);
      await owner.unsafe(`INSERT INTO ai_receptionist_handoffs (id, tenant_id, session_id, target, status, handoff) VALUES ($1, $2::uuid, $3, 'HUMAN_AGENT', 'RECOMMENDED', '{}'::jsonb)`, [`${item.session}-handoff`, tenantId, item.session]);
      await owner.unsafe(`INSERT INTO ai_receptionist_outcomes (id, tenant_id, session_id, outcome) VALUES ($1, $2::uuid, $3, '{}'::jsonb)`, [`${item.session}-outcome`, tenantId, item.session]);
      await owner.unsafe(`INSERT INTO customer_handoff_recommendations (id, tenant_id, conversation_id, target, recommendation) VALUES ($1, $2::uuid, $3, 'SALES', '{}'::jsonb)`, [`${item.conversation}-handoff-recommendation`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO customer_handoff_records (id, tenant_id, conversation_id, target, status, handoff) VALUES ($1, $2::uuid, $3, 'SALES', 'RECOMMENDED', '{}'::jsonb)`, [`${item.conversation}-handoff-record`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO customer_meeting_intents (id, tenant_id, conversation_id, meeting_intent) VALUES ($1, $2::uuid, $3, '{}'::jsonb)`, [`${item.conversation}-meeting`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO customer_follow_up_recommendations (id, tenant_id, conversation_id, expires_at, recommendation) VALUES ($1, $2::uuid, $3, now() + interval '1 hour', '{}'::jsonb)`, [`${item.conversation}-followup`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO customer_commitments (id, tenant_id, conversation_id, commitment) VALUES ($1, $2::uuid, $3, '{}'::jsonb)`, [`${item.conversation}-customer-commitment`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO business_commitments (id, tenant_id, conversation_id, commitment) VALUES ($1, $2::uuid, $3, '{}'::jsonb)`, [`${item.conversation}-business-commitment`, tenantId, item.conversation]);
      await owner.unsafe(`INSERT INTO conversation_diagnostics (id, tenant_id, conversation_id, severity, diagnostic, generated_at) VALUES ($1, $2::uuid, $3, 'WARNING', '{}'::jsonb, now())`, [`${item.conversation}-diagnostic`, tenantId, item.conversation]);
    }

    recordStep('tenant_rls_cross_tenant_and_missing_context');
    for (const table of tables) for (const tenantId of [tenantA, tenantB]) await withAppTransaction(databaseUrl, tenantId, async (transaction) => { const visible = rows(await validationTransactionUnsafe(transaction, `SELECT tenant_id::text FROM ${table} WHERE id LIKE $1 ORDER BY id`, [`${prefix}%`], recordSql)); assert.deepEqual(visible.map((row) => row.tenant_id), [tenantId], `${table} must isolate ${tenantId}`); });
    await expectRlsDenied(() => withAppTransaction(databaseUrl, tenantA, (transaction) => transaction.unsafe(`INSERT INTO customer_conversation_events (id, tenant_id, conversation_id, provider, channel, direction, idempotency_key, content_hash, consent_status, language_hints, event, occurred_at) VALUES ('epic10-cross-tenant-event', $1::uuid, 'denied', 'EPIC10', 'WEB_CHAT', 'INBOUND', 'denied', 'hash', 'ALLOWED', '[]'::jsonb, '{}'::jsonb, now())`, [tenantB])));
    await expectRlsDenied(() => withAppTransaction(databaseUrl, tenantA, (transaction) => transaction.unsafe(`INSERT INTO ai_receptionist_sessions (id, tenant_id, conversation_id, profile_id, state, idempotency_key, session) VALUES ('epic10-cross-tenant-session', $1::uuid, 'denied', 'denied', 'ACTIVE', 'denied', '{}'::jsonb)`, [tenantB])));
    await expectRlsDenied(() => withAppTransaction(databaseUrl, undefined, (transaction) => transaction.unsafe(`INSERT INTO customer_conversation_events (id, tenant_id, conversation_id, provider, channel, direction, idempotency_key, content_hash, consent_status, language_hints, event, occurred_at) VALUES ('epic10-missing-context', $1::uuid, 'denied', 'EPIC10', 'WEB_CHAT', 'INBOUND', 'missing', 'hash', 'ALLOWED', '[]'::jsonb, '{}'::jsonb, now())`, [tenantA])));

    recordStep('conversation_ingestion_idempotency');
    const conversationKey = `${prefix}concurrent-conversation`;
    const conversationAttempts = await Promise.all([0, 1].map((attempt) => withAppTransaction(databaseUrl, tenantA, async (transaction) => rows(await transaction.unsafe(`INSERT INTO customer_conversation_events (id, tenant_id, conversation_id, provider, channel, external_message_id, direction, idempotency_key, content_hash, consent_status, language_hints, event, occurred_at) VALUES ($1, $2::uuid, 'concurrent', 'EPIC10', 'WEB_CHAT', $3, 'INBOUND', $4, 'hash', 'ALLOWED', '[]'::jsonb, '{}'::jsonb, now()) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`, [`${prefix}concurrent-event-${attempt}`, tenantA, `${prefix}concurrent-message-${attempt}`, conversationKey])))));
    const conversationCreated = conversationAttempts.filter((result) => result.length === 1).length; assert.equal(conversationCreated, 1, 'conversation ingestion must create one canonical event');
    const canonicalConversation = one(await owner.unsafe(`SELECT count(*)::int AS count FROM customer_conversation_events WHERE tenant_id = $1::uuid AND idempotency_key = $2`, [tenantA, conversationKey])); assert.equal(Number(canonicalConversation.count), 1, 'conversation ingestion must leave one persisted event');

    recordStep('receptionist_idempotency');
    const sessionKey = `${prefix}concurrent-session`;
    const sessionAttempts = await Promise.all([0, 1].map((attempt) => withAppTransaction(databaseUrl, tenantA, async (transaction) => rows(await transaction.unsafe(`INSERT INTO ai_receptionist_sessions (id, tenant_id, conversation_id, profile_id, state, idempotency_key, session) VALUES ($1, $2::uuid, 'concurrent', 'profile', 'ACTIVE', $3, '{}'::jsonb) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`, [`${prefix}concurrent-session-${attempt}`, tenantA, sessionKey])))));
    const sessionCreated = sessionAttempts.filter((result) => result.length === 1).length; assert.equal(sessionCreated, 1, 'receptionist ingestion must create one canonical session');
    const canonicalSession = one(await owner.unsafe(`SELECT count(*)::int AS count FROM ai_receptionist_sessions WHERE tenant_id = $1::uuid AND idempotency_key = $2`, [tenantA, sessionKey])); assert.equal(Number(canonicalSession.count), 1, 'receptionist ingestion must leave one persisted session');

    recordStep('identity_and_conversation_isolation');
    await withAppTransaction(databaseUrl, tenantA, async (transaction) => { const blocked = rows(await validationTransactionUnsafe(transaction, `SELECT id FROM ai_receptionist_sessions WHERE id = $1`, [fixture(tenantB).session], recordSql)); assert.equal(blocked.length, 0, 'Tenant A must not read Tenant B receptionist state'); });
    recordStep('recommendation_and_handoff_isolation');
    await withAppTransaction(databaseUrl, tenantA, async (transaction) => { const blocked = rows(await validationTransactionUnsafe(transaction, `SELECT id FROM customer_handoff_records WHERE id = $1`, [`${fixture(tenantB).conversation}-handoff-record`], recordSql)); assert.equal(blocked.length, 0, 'Tenant A must not read Tenant B handoff state'); });
    recordDiagnostics({ epic10ConversationAttempts: conversationAttempts.length, epic10ConversationCreated: conversationCreated, epic10ReceptionistAttempts: sessionAttempts.length, epic10ReceptionistCreated: sessionCreated });

    recordStep('fixture_cleanup');
    for (const table of [...tables].reverse()) await owner.unsafe(`DELETE FROM ${table} WHERE id LIKE $1`, [`${prefix}%`]);
    const remaining = one(await owner.unsafe(`SELECT (${tables.map((table) => `(SELECT count(*) FROM ${table} WHERE id LIKE '${prefix}%')`).join(' + ')})::int AS count`)); assert.equal(Number(remaining.count), 0, 'EPIC10 acceptance fixtures must be removed'); cleanup = true;
    return { migrationLedgerEntries: 1, rlsTables: tables.length, conversationIngestion: { attempts: conversationAttempts.length, created: conversationCreated, duplicates: conversationAttempts.length - conversationCreated }, receptionistIngestion: { attempts: sessionAttempts.length, created: sessionCreated, duplicates: sessionAttempts.length - sessionCreated }, crossTenantDenied: 'PASS', missingContextDenied: 'PASS', cleanup: 'PASS' };
  } finally { if (!cleanup) for (const table of [...tables].reverse()) await owner.unsafe(`DELETE FROM ${table} WHERE id LIKE $1`, [`${prefix}%`]); }
}

async function main(): Promise<void> {
  assert.equal(process.env.PHASE1_CONFIRM_DISPOSABLE, 'YES', 'set PHASE1_CONFIRM_DISPOSABLE=YES');
  const databaseUrl = required('PHASE1_DATABASE_URL');
  const adminUrl = required('PHASE1_ADMIN_DATABASE_URL');
  const targetName = databaseName(databaseUrl);
  const journal = await loadJournal();
  const index0018 = journal.findIndex(
    (entry) => entry.tag === '0018_reconciliation_forward_repairs',
  );
  const index0019 = journal.findIndex((entry) => entry.tag === '0019_marketing_os_rls_repairs');
  const index0020 = journal.findIndex((entry) => entry.tag === '0020_persistent_marketing_os_runtime');
  const index0021 = journal.findIndex((entry) => entry.tag === '0021_durable_marketing_os_approvals');
  const index0022 = journal.findIndex((entry) => entry.tag === '0022_governed_external_marketing_actions');
  const index0023 = journal.findIndex((entry) => entry.tag === '0023_external_action_reliability');
  const index0024 = journal.findIndex((entry) => entry.tag === '0024_unified_campaign_orchestration');
  const index0025 = journal.findIndex((entry) => entry.tag === '0025_cross_channel_performance_optimization');
  const index0026 = journal.findIndex((entry) => entry.tag === '0026_customer_acquisition_revenue_intelligence');
  const index0027 = journal.findIndex((entry) => entry.tag === '0027_customer_conversations_ai_receptionist');
  assert.equal(index0019, index0018 + 1, '0019 must directly follow 0018 in the canonical journal');
  assert.equal(index0020, index0019 + 1, '0020 must directly follow 0019 in the canonical journal');
  assert.equal(index0021, index0020 + 1, '0021 must directly follow 0020 in the canonical journal');
  assert.equal(index0022, index0021 + 1, '0022 must directly follow 0021 in the canonical journal');
  assert.equal(index0023, index0022 + 1, '0023 must directly follow 0022 in the canonical journal');
  assert.equal(index0024, index0023 + 1, '0024 must directly follow 0023 in the canonical journal');
  assert.equal(index0025, index0024 + 1, '0025 must directly follow 0024 in the canonical journal');
  assert.equal(index0026, index0025 + 1, '0026 must directly follow 0025 in the canonical journal');
  assert.equal(index0027, index0026 + 1, '0027 must directly follow 0026 in the canonical journal');

  await recreateDatabase(adminUrl, targetName);
  let owner: SqlClient | undefined;
  try {
    owner = postgres(databaseUrl, { max: 1, prepare: false });
    await applyJournal(owner, journal.slice(0, index0018 + 1));
    await executePhase1ValidationCheck(
      'marketing_rls_before_0019',
      async () => assertMarketingRlsWasAddedOnlyBy0019(owner, true),
    );
    await applyJournal(owner, journal.slice(index0019, index0019 + 1));
    await executePhase1ValidationCheck(
      'marketing_rls_after_0019',
      async () => assertMarketingRlsWasAddedOnlyBy0019(owner, false),
    );
    await applyJournal(owner, journal.slice(index0020, index0020 + 1));
    await applyJournal(owner, journal.slice(index0021, index0021 + 1));
    await applyJournal(owner, journal.slice(index0022, index0022 + 1));
    const journalMigrations = await loadJournalMigrations(migrationDirectory);
    await bootstrapMigrationLedger(owner, journalMigrations.slice(0, index0023));
    await applyJournalMigrations(
      owner as unknown as JournalMigrationClient,
      journalMigrations.slice(index0023),
    );
    // A second canonical-runner invocation must safely observe the 0023/0025 ledger rows.
    await applyJournalMigrations(
      owner as unknown as JournalMigrationClient,
      journalMigrations.slice(index0023),
    );
    await prepareApplicationRole(owner);
    await seedBillingAuthority(owner);
    await executePhase1ValidationCheck(
      'schema_invariants',
      async (recordSql) => assertSchemaInvariants(owner, recordSql),
    );
    await executePhase1ValidationCheck(
      'rls_coverage',
      async () => assertRlsCoverage(owner),
    );
    await executePhase1ValidationCheck(
      'marketing_crud_rls',
      async (recordSql, recordStep) =>
        testMarketingCrudRls(owner, databaseUrl, recordSql, recordStep),
      console.log,
      { stepMarker: 'PHASE1_RLS_STEP' },
    );
    await executePhase1ValidationCheck(
      'durable_approval_rls',
      async (recordSql, recordStep) =>
        testDurableApprovalRls(owner, databaseUrl, recordSql, recordStep),
      console.log,
      { stepMarker: 'PHASE1_APPROVAL_STEP' },
    );
    const tenantSettingProof = await executePhase1ValidationCheck(
      'transaction_local_tenant_setting',
      async (recordSql, recordStep, recordObservation) =>
        testTransactionLocalTenantSetting(databaseUrl, recordSql, recordStep, recordObservation),
      console.log,
      {
        stepMarker: 'PHASE1_TENANT_SETTING_STEP',
        observationMarker: 'PHASE1_TENANT_SETTING_STATE',
      },
    );
    const pgvectorProof = await executePhase1ValidationCheck(
      'pgvector',
      async (recordSql, recordStep, recordObservation, recordDiagnostics) =>
        testPgvector(owner, databaseUrl, recordSql, recordStep, recordObservation, recordDiagnostics),
      console.log,
      { stepMarker: 'PHASE1_PGVECTOR_STEP' },
    );
    await executePhase1ValidationCheck(
      'billing_authority',
      async (recordSql, recordStep, _recordObservation, recordDiagnostics) =>
        testBillingAuthority(owner, databaseUrl, recordSql, recordStep, recordDiagnostics),
      console.log,
      { stepMarker: 'PHASE1_BILLING_STEP' },
    );
    await executePhase1ValidationCheck(
      'billing_concurrency',
      async (recordSql, recordStep) => testBillingConcurrency(owner, databaseUrl, recordSql, recordStep),
      console.log,
      { stepMarker: 'PHASE1_BILLING_STEP' },
    );
    const epic03Proof = await executePhase1ValidationCheck(
      'epic03_governed_external_actions',
      async (recordSql, recordStep, _recordObservation, recordDiagnostics) =>
        testEpic03GovernedExternalActions(owner, databaseUrl, recordSql, recordStep, recordDiagnostics),
      console.log,
      { stepMarker: 'PHASE1_EPIC03_STEP' },
    );
    const epic05Proof = await executePhase1ValidationCheck(
      'epic05_external_action_reliability',
      async (recordSql, recordStep, _recordObservation, recordDiagnostics) =>
        testEpic05ExternalActionReliability(owner, databaseUrl, recordSql, recordStep, recordDiagnostics),
      console.log,
      { stepMarker: 'PHASE1_EPIC05_STEP' },
    );
    const epic07Proof = await executePhase1ValidationCheck(
      'epic07_unified_campaign_orchestration',
      async (recordSql, recordStep, _recordObservation, recordDiagnostics) =>
        testEpic07UnifiedCampaignOrchestration(owner, databaseUrl, recordSql, recordStep, recordDiagnostics),
      console.log,
      { stepMarker: 'PHASE1_EPIC07_STEP' },
    );
    const epic08Proof = await executePhase1ValidationCheck(
      'epic08_cross_channel_performance_optimization',
      async (recordSql, recordStep, _recordObservation, recordDiagnostics) =>
        testEpic08CrossChannelPerformanceOptimization(owner, databaseUrl, recordSql, recordStep, recordDiagnostics),
      console.log,
      { stepMarker: 'PHASE1_EPIC08_STEP' },
    );
    const epic09Proof = await executePhase1ValidationCheck(
      'epic09_customer_acquisition_revenue_intelligence',
      async (recordSql, recordStep, _recordObservation, recordDiagnostics) =>
        testEpic09CustomerAcquisitionRevenueIntelligence(owner, databaseUrl, recordSql, recordStep, recordDiagnostics),
      console.log,
      { stepMarker: 'PHASE1_EPIC09_STEP' },
    );
    const epic10Proof = await executePhase1ValidationCheck(
      'epic10_customer_conversations_ai_receptionist',
      async (recordSql, recordStep, _recordObservation, recordDiagnostics) =>
        testEpic10CustomerConversationsAiReceptionist(owner, databaseUrl, recordSql, recordStep, recordDiagnostics),
      console.log,
      { stepMarker: 'PHASE1_EPIC10_STEP' },
    );
    console.log(
      `PHASE1_POSTGRES_RESULT=${JSON.stringify({
        status: 'PASS',
        timestamp: new Date().toISOString(),
        target: targetName,
        migrationCount: journal.length,
        latestMigration: journal.at(-1)?.tag,
        checks: {
          migrationChain: 'PASS',
          migration0020: 'PASS',
          migration0021: 'PASS',
          migration0022: 'PASS',
          migration0023: 'PASS',
          migration0024: 'PASS',
          migration0025: 'PASS',
          migration0026: 'PASS',
          migration0027: 'PASS',
          rls: 'PASS',
          forceRls: 'NOT_REQUIRED_NON_OWNER_ROLE',
          tenantIsolation: 'PASS',
          poolingLeak: 'PASS',
          tenantSetting: tenantSettingProof,
          pgvector: 'PASS',
          billingAuthority: 'PASS',
          billingConcurrency: 'PASS',
          billingIdempotency: 'PASS',
          billingRollback: 'PASS',
          billingCrossTenantIsolation: 'PASS',
          epic03PolicyPersistence: 'PASS',
          epic03PolicyAudit: 'PASS',
          epic03Rls: 'PASS',
          epic03Outbox: 'PASS',
          epic03Idempotency: 'PASS',
          epic03Concurrency: 'PASS',
          epic05MigrationLedger: 'PASS',
          epic05Rls: 'PASS',
          epic05ConcurrentClaim: 'PASS',
          epic05LeaseRecovery: 'PASS',
          epic05Retry: 'PASS',
          epic05DeadLetter: 'PASS',
          epic05Replay: 'PASS',
          epic05ProviderHealth: 'PASS',
          epic05CredentialHealth: 'PASS',
          epic05OperatorRecovery: 'PASS',
          epic05WorkerBoundary: 'PASS',
          epic05SecretSafety: 'PASS',
          epic05FixtureCleanup: 'PASS',
          epic07Persistence: 'PASS',
          epic07Rls: 'PASS',
          epic07Idempotency: 'PASS',
          epic07FixtureCleanup: 'PASS',
          epic08Persistence: 'PASS',
          epic08Rls: 'PASS',
          epic08ObservationIdempotency: 'PASS',
          epic08LearningIsolation: 'PASS',
          epic08FixtureCleanup: 'PASS',
          epic09Persistence: 'PASS',
          epic09Rls: 'PASS',
          epic09LeadIdempotency: 'PASS',
          epic09IdentityDeduplication: 'PASS',
          epic09CrossTenantDenial: 'PASS',
          epic09MissingContextDenial: 'PASS',
          epic09RevenueEventIdempotency: 'PASS',
          epic09FixtureCleanup: 'PASS',
          epic10Persistence: 'PASS',
          epic10Rls: 'PASS',
          epic10ConversationIngestion: 'PASS',
          epic10ReceptionistIngestion: 'PASS',
          epic10CrossTenantDenial: 'PASS',
          epic10MissingContextDenial: 'PASS',
          epic10FixtureCleanup: 'PASS',
        },
        rlsTables: marketingTables,
        billing: { workers: 20, attempts: 100, idempotencyReplays: 20 },
        epic03: epic03Proof,
        epic05: epic05Proof,
        epic07: epic07Proof,
        epic08: epic08Proof,
        epic09: epic09Proof,
        epic10: epic10Proof,
        pgvector: {
          dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
          index: 'knowledge_chunks_embedding_vector_hnsw_idx',
          proof: pgvectorProof,
        },
      })}`,
    );
  } finally {
    await close(owner);
  }
}

main().catch((error) => {
  const result = error instanceof Phase1MigrationExecutionError
    ? { ...error.evidence, timestamp: new Date().toISOString() }
    : error instanceof Phase1ValidationExecutionError
      ? { ...error.evidence, timestamp: new Date().toISOString() }
    : {
        status: 'FAIL',
        timestamp: new Date().toISOString(),
        phase: 'harness',
        message: error instanceof Error ? error.message : String(error),
      };
  console.error(`PHASE1_POSTGRES_RESULT=${JSON.stringify(result)}`);
  process.exitCode = 1;
});
