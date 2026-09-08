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
        'billing_invoices', 'billing_payments', 'financial_forecast_snapshots'
      )
  `, recordSql),
  );
  assert.equal(tables.length, 20, 'required canonical tables are missing');
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
        'marketing_outcome_events'::regclass
      )
  `, recordSql),
  );
  assert.equal(marketingForeignKeys.length, 5, 'Marketing OS tenant foreign keys are missing');
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
  assert.equal(index0019, index0018 + 1, '0019 must directly follow 0018 in the canonical journal');
  assert.equal(index0020, index0019 + 1, '0020 must directly follow 0019 in the canonical journal');
  assert.equal(index0021, index0020 + 1, '0021 must directly follow 0020 in the canonical journal');

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
        },
        rlsTables: marketingTables,
        billing: { workers: 20, attempts: 100, idempotencyReplays: 20 },
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
