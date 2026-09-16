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

test('EPIC08 separates provider-snapshot concurrency from idempotency replay so neither can race into the other constraint', () => {
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
  const naturalStart = concurrency.indexOf("recordStep('observation_idempotency_concurrency')");
  const replayStart = concurrency.indexOf("recordStep('observation_idempotency_replay')");
  const natural = concurrency.slice(naturalStart, replayStart);
  const replay = concurrency.slice(replayStart);
  assert.doesNotMatch(natural, /ON CONFLICT \(tenant_id, idempotency_key\) DO NOTHING/);
  assert.match(natural, /\$\{naturalKey\}-\$\{attempt\}/);
  assert.match(replay, /ON CONFLICT \(tenant_id, idempotency_key\) DO NOTHING RETURNING id/);
  assert.match(replay, /provider-campaign-\$\{attempt\}/);
  assert.match(replay, /snapshot-\$\{attempt\}/);
  assert.match(concurrency, /assert\.equal\(attempts\.length, 2/);
  assert.match(concurrency, /assert\.equal\(Number\(canonical\.total\), 1/);
  assert.match(natural, /assert\.equal\(Number\(canonical\.persisted_idempotency_keys\), 1/);
  assert.match(replay, /assert\.equal\(Number\(idempotencyCanonical\.total\), 1/);
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

test('EPIC10 harness uses distinct natural keys, proves singleton records, scopes RLS, and cleans fixtures in reverse', () => {
  const harness = readFileSync(fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)), 'utf8');
  const start = harness.indexOf('async function testEpic10CustomerConversationsAiReceptionist(');
  const end = harness.indexOf('\nasync function main()', start);
  const epic10 = harness.slice(start, end);
  assert.ok(start >= 0 && end > start, 'EPIC10 harness must exist');
  assert.match(epic10, /recordStep\('conversation_ingestion_idempotency'\)/);
  assert.match(epic10, /ON CONFLICT \(tenant_id, idempotency_key\) DO NOTHING RETURNING id/);
  assert.match(epic10, /concurrent-message-\$\{attempt\}/);
  assert.match(epic10, /assert\.equal\(Number\(canonicalConversation\.count\), 1/);
  assert.match(epic10, /recordStep\('receptionist_idempotency'\)/);
  assert.match(epic10, /assert\.equal\(Number\(canonicalSession\.count\), 1/);
  assert.match(epic10, /withAppTransaction\(databaseUrl, undefined/);
  assert.match(epic10, /for \(const table of \[\.\.\.tables\]\.reverse\(\)\)/);
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

test('EPIC11 harness and evidence verifier require every journey proof before reporting pass', () => {
  const harness = readFileSync(fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)), 'utf8');
  const verifier = readFileSync(fileURLToPath(new URL('../../../scripts/verify-phase1-postgres-evidence.ps1', import.meta.url)), 'utf8');
  assert.match(harness, /epic11_customer_journey_lifecycle_orchestration/); assert.match(harness, /PHASE1_EPIC11_STEP/);
  for (const step of ['schema_and_migration_ledger', 'seed_tenant_rows', 'tenant_rls_cross_tenant_and_missing_context', 'journey_event_idempotency', 'next_best_action_idempotency', 'journey_outcome_idempotency', 'journey_learning_isolation', 'fixture_cleanup']) assert.match(harness, new RegExp(`recordStep\\('${step}'\\)`));
  assert.match(harness, /ON CONFLICT \(tenant_id, idempotency_key\) DO NOTHING RETURNING id/); assert.match(harness, /ON CONFLICT \(tenant_id, deterministic_key\) DO NOTHING RETURNING id/);
  for (const check of ['migration0028', 'epic11Persistence', 'epic11Rls', 'epic11JourneyEventIdempotency', 'epic11NextBestActionIdempotency', 'epic11JourneyOutcomeIdempotency', 'epic11CrossTenantDenial', 'epic11MissingContextDenial', 'epic11LearningIsolation', 'epic11FixtureCleanup']) assert.match(verifier, new RegExp(check));
  assert.match(verifier, /migrationCount -ne 31/); assert.match(verifier, /PHASE1_EVIDENCE_VERIFICATION=PASS/);
});

test('EPIC12 harness and evidence verifier fail closed on every activation proof', () => {
  const harness = readFileSync(fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)), 'utf8'); const verifier = readFileSync(fileURLToPath(new URL('../../../scripts/verify-phase1-postgres-evidence.ps1', import.meta.url)), 'utf8');
  assert.match(harness, /epic12_governed_lifecycle_activation/); assert.match(harness, /PHASE1_EPIC12_STEP/);
  for (const step of ['schema_and_migration_ledger','seed_tenant_rows','tenant_rls_cross_tenant_and_missing_context','activation_plan_idempotency','activation_candidate_idempotency','activation_execution_idempotency','activation_outcome_idempotency','learning_isolation','fixture_cleanup']) assert.match(harness,new RegExp(`recordStep\\('${step}'\\)`));
  for (const check of ['migration0029','epic12Persistence','epic12Rls','epic12ActivationPlanIdempotency','epic12ActivationCandidateIdempotency','epic12ActivationExecutionIdempotency','epic12ActivationOutcomeIdempotency','epic12CrossTenantDenial','epic12MissingContextDenial','epic12LearningIsolation','epic12FixtureCleanup']) assert.match(verifier,new RegExp(check)); assert.match(verifier,/migrationCount -ne 31/);
  const start = harness.indexOf('async function testEpic12GovernedLifecycleActivation('); const end = harness.indexOf('\nasync function testEpic13CustomerGrowthDecisioning(', start); const epic12 = harness.slice(start, end); assert.ok(start >= 0 && end > start); assert.doesNotMatch(epic12, /\bconcurrent\(/); assert.match(epic12, /withAppTransaction\(databaseUrl, tenantA/); for (const fixture of ['`${plan}-${attempt}`','`${candidate}-${attempt}`','`${execution}-${attempt}`','`${outcome}-${attempt}`']) assert.match(epic12, new RegExp(fixture.replace(/[${}]/g, '\\$&')));
  assert.equal((epic12.match(/rows\(await transaction\.unsafe\(/g) ?? []).length, 4, 'each EPIC12 idempotency RETURNING result must be awaited before row classification'); assert.equal((epic12.match(/DO NOTHING RETURNING id/g) ?? []).length, 4, 'each EPIC12 race must classify created versus duplicate from RETURNING id');
});

test('EPIC13 harness and evidence verifier fail closed with schema-correct single-authority cleanup and idempotency proofs', () => {
  const harness = readFileSync(fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)), 'utf8');
  const verifier = readFileSync(fileURLToPath(new URL('../../../scripts/verify-phase1-postgres-evidence.ps1', import.meta.url)), 'utf8');
  const migration = readFileSync(fileURLToPath(new URL('../drizzle/0030_customer_growth_decisioning.sql', import.meta.url)), 'utf8');
  const start = harness.indexOf('async function testEpic13CustomerGrowthDecisioning('); const end = harness.indexOf('\nasync function main()', start); const epic13 = harness.slice(start, end);
  assert.ok(start >= 0 && end > start, 'EPIC13 harness must exist');
  for (const step of ['schema_and_migration_ledger','seed_tenant_rows','tenant_rls_cross_tenant_and_missing_context','decision_context_idempotency','candidate_idempotency','recommendation_idempotency','verified_outcome_idempotency','learning_isolation','fixture_cleanup']) assert.match(epic13, new RegExp(`recordStep\\('${step}'\\)`));
  for (const table of ['growth_decision_contexts','growth_action_candidates','growth_candidate_eligibility_assessments','growth_decision_conflict_assessments','growth_decision_scores','growth_decision_recommendations','growth_decision_outcomes','growth_decision_learning_records']) { assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`)); assert.match(epic13, new RegExp(table)); }
  assert.equal((epic13.match(/DO NOTHING RETURNING id/g) ?? []).length, 4, 'each EPIC13 race must classify created versus duplicate from RETURNING id');
  assert.doesNotMatch(epic13, /\bid LIKE\b|::text\s+LIKE/i);
  assert.match(epic13, /growth_decision_learning_records[\s\S]*?growth_decision_outcomes[\s\S]*?growth_decision_recommendations/);
  for (const check of ['migration0030','epic13Persistence','epic13Rls','epic13DecisionContextIdempotency','epic13CandidateIdempotency','epic13RecommendationIdempotency','epic13VerifiedOutcomeIdempotency','epic13CrossTenantDenial','epic13MissingContextDenial','epic13LearningIsolation','epic13FixtureCleanup']) assert.match(verifier, new RegExp(check));
  assert.match(verifier, /migrationCount -ne 31/);
});

test('EPIC11 cleanup map covers every 0028 table with schema-correct keys and child-before-parent deletion', () => {
  const harness = readFileSync(fileURLToPath(new URL('../scripts/phase1-postgres.ts', import.meta.url)), 'utf8');
  const migration = readFileSync(fileURLToPath(new URL('../drizzle/0028_customer_journey_lifecycle_orchestration.sql', import.meta.url)), 'utf8');
  const start = harness.indexOf('async function testEpic11CustomerJourneyLifecycleOrchestration(');
  const end = harness.indexOf('\nasync function main()', start);
  const epic11 = harness.slice(start, end);
  assert.ok(start >= 0 && end > start, 'EPIC11 harness must exist');
  const cleanupStart = epic11.indexOf('const cleanupMap: CleanupEntry[] = [');
  const cleanupEnd = epic11.indexOf('const cleanupFixtures = async () =>', cleanupStart);
  const cleanup = epic11.slice(cleanupStart, cleanupEnd);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart, 'EPIC11 fixture cleanup helper must exist');
  assert.doesNotMatch(cleanup, /\bid LIKE\b/);
  assert.doesNotMatch(cleanup, /DELETE FROM \$\{table\}/);
  const expected = new Map<string, string[]>([
    ['customer_journey_plan_steps', ['tenant_id', 'plan_id']], ['customer_journey_plans', ['tenant_id', 'identity_id']], ['customer_journey_events', ['tenant_id', 'identity_id', 'idempotency_key']], ['customer_lifecycle_assessments', ['tenant_id', 'identity_id']], ['customer_journey_stage_assessments', ['tenant_id', 'identity_id']], ['journey_triggers', ['tenant_id', 'identity_id']], ['action_eligibility_assessments', ['tenant_id', 'identity_id']], ['next_best_action_recommendations', ['tenant_id', 'identity_id']], ['nurture_recommendations', ['tenant_id', 'identity_id']], ['reengagement_assessments', ['tenant_id', 'identity_id']], ['retention_risk_assessments', ['tenant_id', 'identity_id']], ['renewal_assessments', ['tenant_id', 'identity_id']], ['expansion_opportunity_assessments', ['tenant_id', 'identity_id']], ['customer_journey_health_assessments', ['tenant_id', 'identity_id']], ['journey_blocker_diagnostics', ['tenant_id', 'identity_id']], ['contact_frequency_assessments', ['tenant_id', 'identity_id']], ['journey_orchestration_states', ['tenant_id', 'identity_id']], ['journey_action_outcomes', ['tenant_id', 'identity_id']], ['journey_learning_records', ['tenant_id', 'identity_id']],
  ]);
  assert.equal(expected.size, 19);
  for (const [table, columns] of expected) {
    const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\);`))?.[1] ?? '';
    assert.ok(definition, `${table} must exist in 0028`);
    assert.match(cleanup, new RegExp(`table: '${table}'`));
    for (const column of columns) { assert.match(definition, new RegExp(`\\b${column}\\b`)); assert.match(cleanup, new RegExp(`'${column}'`)); }
  }
  assert.doesNotMatch(migration.match(/CREATE TABLE IF NOT EXISTS customer_journey_plan_steps \([\s\S]*?\);/)?.[0] ?? '', /identity_id/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS customer_health_assessments/);
  assert.ok(cleanup.indexOf("table: 'customer_journey_plan_steps'") < cleanup.indexOf("table: 'customer_journey_plans'"));
  assert.match(epic11, /assertFixturesClean/);
  assert.match(epic11, /EPIC11 acceptance fixtures must be removed/);
});
