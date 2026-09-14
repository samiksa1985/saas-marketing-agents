import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  executePhase1ValidationCheck,
  Phase1ValidationExecutionError,
} from './phase1-validation-diagnostics.js';

test('validation failure identifies the exact check and preserves PostgreSQL metadata', async () => {
  const markers: string[] = [];
  const source = `SELECT pg_get_constraintdef(catalog_constraint.oid)\nFROM pg_constraint catalog_constraint`;

  await assert.rejects(
    () =>
      executePhase1ValidationCheck(
        'schema_invariants',
        async (recordSql) => {
          recordSql(source);
          throw {
            code: '42601',
            message: 'syntax error at or near "constraint"',
            position: String(source.indexOf('catalog_constraint') + 1),
            routine: 'scanner_yyerror',
          };
        },
        (marker) => markers.push(marker),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Phase1ValidationExecutionError);
      assert.deepEqual(error.evidence, {
        status: 'FAIL',
        phase: 'validation',
        check: 'schema_invariants',
        postgresCode: '42601',
        message: 'syntax error at or near "constraint"',
        position: String(source.indexOf('catalog_constraint') + 1),
        routine: 'scanner_yyerror',
        sqlContext: source.replace(/\s+/g, ' '),
      });
      return true;
    },
  );
  assert.deepEqual(markers, ['PHASE1_CHECK_START=schema_invariants']);
});

test('a passing validation emits ordered start and pass markers', async () => {
  const markers: string[] = [];
  const value = await executePhase1ValidationCheck(
    'rls_coverage',
    async () => 'PASS',
    (marker) => markers.push(marker),
  );
  assert.equal(value, 'PASS');
  assert.deepEqual(markers, [
    'PHASE1_CHECK_START=rls_coverage',
    'PHASE1_CHECK_PASS=rls_coverage',
  ]);
});

test('a validation failure persists the active RLS step', async () => {
  const markers: string[] = [];
  await assert.rejects(
    () =>
      executePhase1ValidationCheck(
        'marketing_crud_rls',
        async (_recordSql, recordStep) => {
          recordStep('tenant_a_insert');
          throw { code: '42501', message: 'new row violates row-level security policy' };
        },
        (marker) => markers.push(marker),
        { stepMarker: 'PHASE1_RLS_STEP' },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Phase1ValidationExecutionError);
      assert.equal(error.evidence.check, 'marketing_crud_rls');
      assert.equal(error.evidence.step, 'tenant_a_insert');
      assert.equal(error.evidence.postgresCode, '42501');
      return true;
    },
  );
  assert.deepEqual(markers, [
    'PHASE1_CHECK_START=marketing_crud_rls',
    'PHASE1_RLS_STEP=tenant_a_insert',
  ]);
});

test('a validation failure persists the observed tenant-setting classification', async () => {
  const markers: string[] = [];
  await assert.rejects(
    () =>
      executePhase1ValidationCheck(
        'transaction_local_tenant_setting',
        async (_recordSql, recordStep, recordObservation) => {
          recordStep('after_commit');
          recordObservation('after_commit:EMPTY_SAFE_RESET');
          throw { code: 'ERR_ASSERTION', message: 'test failure' };
        },
        (marker) => markers.push(marker),
        {
          stepMarker: 'PHASE1_TENANT_SETTING_STEP',
          observationMarker: 'PHASE1_TENANT_SETTING_STATE',
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Phase1ValidationExecutionError);
      assert.equal(error.evidence.step, 'after_commit');
      assert.equal(error.evidence.observedState, 'after_commit:EMPTY_SAFE_RESET');
      return true;
    },
  );
  assert.deepEqual(markers, [
    'PHASE1_CHECK_START=transaction_local_tenant_setting',
    'PHASE1_TENANT_SETTING_STEP=after_commit',
    'PHASE1_TENANT_SETTING_STATE=after_commit:EMPTY_SAFE_RESET',
  ]);
});

test('a validation failure preserves pgvector metadata diagnostics', async () => {
  await assert.rejects(
    () =>
      executePhase1ValidationCheck(
        'pgvector',
        async (_recordSql, recordStep, _recordObservation, recordDiagnostics) => {
          recordStep('column_metadata');
          recordDiagnostics({
            table: 'knowledge_document_chunks',
            column: 'embedding_vector',
            observedColumnType: 'vector(1536)',
            observedTypmod: 1536,
            expectedDimension: 1536,
            observedDimension: 1536,
          });
          throw { code: 'ERR_ASSERTION', message: 'intentional pgvector failure' };
        },
        () => {},
      ),
    (error: unknown) => {
      assert.ok(error instanceof Phase1ValidationExecutionError);
      assert.equal(error.evidence.check, 'pgvector');
      assert.deepEqual(error.evidence.diagnostics, {
        table: 'knowledge_document_chunks',
        column: 'embedding_vector',
        observedColumnType: 'vector(1536)',
        observedTypmod: 1536,
        expectedDimension: 1536,
        observedDimension: 1536,
      });
      return true;
    },
  );
});

test('a validation failure preserves the original JavaScript error classification and stack', async () => {
  await assert.rejects(
    () =>
      executePhase1ValidationCheck(
        'billing_authority',
        async (_recordSql, recordStep) => {
          recordStep('driver_setup');
          throw new TypeError('Cannot read properties of undefined (reading \'parsers\')');
        },
        () => {},
      ),
    (error: unknown) => {
      assert.ok(error instanceof Phase1ValidationExecutionError);
      assert.equal(error.evidence.errorName, 'TypeError');
      assert.match(error.evidence.stack ?? '', /TypeError: Cannot read properties/);
      assert.equal(error.evidence.step, 'driver_setup');
      return true;
    },
  );
});

test('schema invariants identify the failing check and use PostgreSQL 16 catalog fields safely', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)),
    'utf8',
  );

  assert.match(harness, /'schema_invariants'/);
  assert.match(harness, /FROM pg_constraint catalog_constraint/);
  assert.doesNotMatch(harness, /FROM\s+pg_constraint\s+constraint\b/i);
  assert.doesNotMatch(harness, /\bAS\s+constraint\b/i);
  assert.doesNotMatch(harness, /\bpg_tables\b/i);
  assert.match(harness, /FROM pg_class c/);
  assert.match(harness, /c\.relrowsecurity AS rls_enabled/);
  assert.match(harness, /c\.relforcerowsecurity AS force_rls_enabled/);
});

test('EPIC08 schema validation passes the SQL recorder as validationUnsafe third argument', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)),
    'utf8',
  );
  const start = harness.indexOf('async function testEpic08CrossChannelPerformanceOptimization(');
  const end = harness.indexOf('\nasync function main()', start);
  const epic08 = harness.slice(start, end);

  assert.ok(start >= 0 && end > start, 'EPIC08 harness must exist');
  assert.match(epic08, /validationUnsafe\(owner,\s*`[\s\S]*?campaign_optimization_learning[\s\S]*?`, recordSql\)/);
  assert.doesNotMatch(epic08, /validationUnsafe\([\s\S]*?ANY\(\$1::text\[\]\)[\s\S]*?\[tables\], recordSql\)/);
});

test('EPIC08 observation concurrency handles only the canonical provider snapshot duplicate and proves one replay result', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)),
    'utf8',
  );
  const start = harness.indexOf("recordStep('observation_idempotency_concurrency')");
  const end = harness.indexOf("recordStep('persistence_store_contract')", start);
  const concurrency = harness.slice(start, end);

  assert.ok(start >= 0 && end > start, 'EPIC08 observation concurrency harness must exist');
  assert.match(
    concurrency,
    /ON CONFLICT ON CONSTRAINT campaign_performance_observation_tenant_provider_snapshot_uidx\s+DO NOTHING RETURNING id/,
  );
  assert.doesNotMatch(concurrency, /ON CONFLICT \(tenant_id, idempotency_key\) DO NOTHING/);
  assert.match(concurrency, /assert\.equal\(attempts\.length, 2/);
  assert.match(concurrency, /assert\.equal\(Number\(canonical\.total\), 1/);
  assert.match(concurrency, /assert\.equal\(Number\(canonical\.idempotency_matches\), 1/);
});

test('EPIC09 harness seeds the persistence adapter with canonical lead data and proves idempotency through database context', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)),
    'utf8',
  );
  const start = harness.indexOf('async function testEpic09CustomerAcquisitionRevenueIntelligence(');
  const end = harness.indexOf('\nasync function main()', start);
  const epic09 = harness.slice(start, end);

  assert.ok(start >= 0 && end > start, 'EPIC09 harness must exist');
  assert.match(epic09, /const leadPayload = \(tenantId: string, item: ReturnType<typeof fixture>\)/);
  assert.match(epic09, /JSON\.stringify\(leadPayload\(tenantId, item\)\)/);
  assert.match(epic09, /JSON\.stringify\(leadPayload\(tenantA, concurrentLead\)\)/);
  assert.match(epic09, /assert\.equal\(Number\(canonicalLead\.total\), 1/);
  assert.match(epic09, /assert\.equal\(Number\(canonicalIdentifier\.total\), 1/);
  assert.match(epic09, /assert\.equal\(Number\(canonicalLink\.total\), 1/);
  assert.match(epic09, /assert\.equal\(Number\(canonicalRevenue\.total\), 1/);
  assert.match(epic09, /caller-provided Tenant B context must not bypass Tenant A database RLS context/);
});

test('marketing CRUD harness scopes each RLS operation to a transaction and reports its step', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)),
    'utf8',
  );
  const start = harness.indexOf('async function testMarketingCrudRls(');
  const end = harness.indexOf('async function testTransactionLocalTenantSetting', start);
  const marketingCrud = harness.slice(start, end);

  assert.ok(start >= 0 && end > start, 'marketing CRUD harness must exist');
  assert.match(harness, /await client\.begin\(async \(transaction\) =>/);
  assert.match(harness, /current_user AS role_name, current_setting\('app\.tenant_id', true\) AS tenant_id/);
  assert.match(harness, /tenant context must be set on the same transaction as CRUD/);
  assert.match(marketingCrud, /assertMarketingCrudRlsPolicy\(owner, recordSql\)/);
  assert.match(marketingCrud, /withAppTransaction\(databaseUrl, tenantA/);
  assert.match(marketingCrud, /withAppTransaction\(databaseUrl, tenantB/);
  assert.match(marketingCrud, /withAppTransaction\(databaseUrl, undefined/);
  for (const step of [
    'tenant_a_insert',
    'tenant_a_select',
    'cross_tenant_insert_denied',
    'tenant_b_select_denied',
    'tenant_b_update_denied',
    'tenant_b_delete_denied',
    'missing_context_insert_denied',
  ]) {
    assert.match(marketingCrud, new RegExp(`recordStep\\('${step}'\\)`));
  }
  assert.match(harness, /\{ stepMarker: 'PHASE1_RLS_STEP' \}/);
});

test('durable approval harness uses a fresh scoped PostgreSQL context and reports its step', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)),
    'utf8',
  );
  const start = harness.indexOf('async function testDurableApprovalRls(');
  const end = harness.indexOf('type MarketingFixture', start);
  const approvals = harness.slice(start, end);

  assert.ok(start >= 0 && end > start, 'durable approval harness must exist');
  assert.match(approvals, /assertDurableApprovalRlsPolicy\(owner, recordSql\)/);
  assert.match(approvals, /SET status = 'APPROVED'/);
  assert.match(approvals, /AND status = 'PENDING'/);
  assert.match(approvals, /fresh PostgreSQL client and transaction rather than process memory/);
  for (const step of [
    'policy_metadata',
    'tenant_a_insert',
    'tenant_a_read',
    'tenant_a_transition',
    'cross_tenant_insert_denied',
    'cross_tenant_mutation_denied',
    'tenant_b_read_denied',
    'tenant_b_update_denied',
    'missing_context_read_denied',
    'missing_context_insert_denied',
    'durable_recovery',
  ]) {
    assert.match(approvals, new RegExp(`recordStep\\('${step}'\\)`));
  }
  assert.match(harness, /\{ stepMarker: 'PHASE1_APPROVAL_STEP' \}/);
});

test('tenant-setting harness accepts only safe reset states and proves no-context RLS boundaries', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)),
    'utf8',
  );
  const start = harness.indexOf('async function testTransactionLocalTenantSetting(');
  const end = harness.indexOf('async function testPgvector(', start);
  const tenantSetting = harness.slice(start, end);

  assert.ok(start >= 0 && end > start, 'tenant-setting harness must exist');
  assert.match(tenantSetting, /max: 1, prepare: false/);
  assert.match(harness, /snapshot\.tenantId === null \|\| snapshot\.tenantId === ''/);
  assert.match(harness, /assert\.notEqual\(\s*snapshot\.tenantId,\s*tenantA/);
  assert.match(harness, /current_setting\('app\.tenant_id', true\)/);
  assert.match(tenantSetting, /SELECT set_config\('app\.tenant_id', \$1, true\)/);
  assert.match(tenantSetting, /PHASE1 intentional tenant-context rollback/);
  assert.match(harness, /no-context transaction must not read Tenant A protected rows/);
  assert.match(harness, /no-context transaction must not update Tenant A protected rows/);
  assert.match(harness, /no-context tenant write must fail/);
  for (const step of [
    'baseline',
    'inside_commit_transaction',
    'after_commit',
    'no_context_after_commit',
    'inside_rollback_transaction',
    'after_rollback',
    'no_context_after_rollback',
    'pool_reuse',
  ]) {
    assert.match(tenantSetting, new RegExp(`recordStep\\('${step}'\\)`));
  }
  assert.match(harness, /\{\s*stepMarker: 'PHASE1_TENANT_SETTING_STEP',\s*observationMarker: 'PHASE1_TENANT_SETTING_STATE'/);
});

test('pgvector harness uses rendered type metadata and real dimension/RLS proofs', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)),
    'utf8',
  );
  const start = harness.indexOf('async function testPgvector(');
  const end = harness.indexOf('async function withAppDrizzleTransaction', start);
  const pgvector = harness.slice(start, end);

  assert.ok(start >= 0 && end > start, 'pgvector harness must exist');
  assert.doesNotMatch(harness, /atttypmod\s*-\s*4/);
  assert.match(pgvector, /pg_catalog\.format_type\(attribute\.atttypid, attribute\.atttypmod\)/);
  assert.match(pgvector, /vector_dims\(embedding_vector\)::int AS dimensions/);
  assert.match(pgvector, /PHASE1_PGVECTOR_COLUMN_TYPE=/);
  assert.match(pgvector, /expectVectorDimensionRejected/);
  assert.match(pgvector, /deterministicVectorLiteral\(KNOWLEDGE_EMBEDDING_DIMENSIONS - 1/);
  assert.match(pgvector, /Tenant B must not read Tenant A embedding/);
  assert.match(pgvector, /missing tenant context must not read Tenant A embedding/);
  for (const step of [
    'extension',
    'column_metadata',
    'roundtrip',
    'dimension',
    'invalid_dimension',
    'tenant_isolation',
  ]) {
    assert.match(pgvector, new RegExp(`recordStep\\('${step}'\\)`));
  }
  assert.match(harness, /\{ stepMarker: 'PHASE1_PGVECTOR_STEP' \}/);
});

test('billing harness builds Drizzle from the outer postgres client and preserves authority/concurrency boundaries', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)),
    'utf8',
  );
  const adapterStart = harness.indexOf('async function withAppDrizzleTransaction');
  const adapterEnd = harness.indexOf('async function seedBillingAuthority(', adapterStart);
  const authorityStart = harness.indexOf('async function testBillingAuthority(');
  const authorityEnd = harness.indexOf('async function consumeUsage(', authorityStart);
  const concurrencyStart = harness.indexOf('async function testBillingConcurrency(');
  const concurrencyEnd = harness.indexOf('async function main', concurrencyStart);
  const adapter = harness.slice(adapterStart, adapterEnd);
  const authority = harness.slice(authorityStart, authorityEnd);
  const concurrency = harness.slice(concurrencyStart, concurrencyEnd);

  assert.ok(adapterStart >= 0 && adapterEnd > adapterStart, 'billing Drizzle adapter must exist');
  assert.match(adapter, /const database = drizzle\(client\)/);
  assert.doesNotMatch(adapter, /drizzle\(transaction\)/);
  assert.match(adapter, /database\.transaction\(async \(transaction\)/);
  assert.match(adapter, /SET LOCAL ROLE/);
  assert.match(adapter, /set_config\('app\.tenant_id'/);
  assert.match(authority, /PersistentBillingAuthorityRepository\(transaction\)/);
  assert.match(authority, /AtomicBillingUsageStore\(transaction\)/);
  assert.match(authority, /Tenant B must not read Tenant A billing subscription/);
  assert.match(authority, /missing context must not read Tenant A billing subscription/);
  assert.match(authority, /canonical billing minor-unit columns are missing/);
  for (const step of [
    'driver_setup',
    'authority_metadata',
    'tenant_a',
    'override_precedence',
    'persistent_usage',
    'tenant_b_denied',
    'missing_context_denied',
  ]) {
    assert.match(authority, new RegExp(`recordStep\\('${step}'\\)`));
  }
  assert.match(authority, /PHASE1_BILLING_PARAM=\$\{parameter\}:DATE/);
  assert.match(authority, /timestampBinding: 'Drizzle column encoder'/);
  assert.match(harness, /billingAuthority: 'PASS'/);
  assert.match(concurrency, /recordStep\('concurrency'\)/);
  assert.match(concurrency, /recordStep\('idempotency'\)/);
  assert.match(harness, /\{ stepMarker: 'PHASE1_BILLING_STEP' \}/);
});
