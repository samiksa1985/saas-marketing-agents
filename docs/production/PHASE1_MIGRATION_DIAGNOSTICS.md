# Phase 1 Migration Diagnostics

## Evidence contract

`packages/db/scripts/phase1-postgres.ts` emits `PHASE1_MIGRATION_START` before
each journaled SQL file and `PHASE1_MIGRATION_PASS` only after PostgreSQL
accepts it. A migration failure emits one structured
`PHASE1_POSTGRES_RESULT` object with status, timestamp, phase, journal
migration number/order, file, relative and absolute paths, PostgreSQL code,
message, position, routine, and a bounded SQL context.

The local PowerShell runner captures both harness stdout and stderr, then writes
the structured `*.result.json` result before handling the Node exit code. That
JSON is the verifier's sole source of truth; the verifier accepts only
`status: "PASS"` and fails closed for `FAIL`, missing, or malformed evidence.

## Current real PostgreSQL evidence

A fresh disposable PostgreSQL run has accepted every journal entry through
`0021_durable_marketing_os_approvals.sql`, including `0018`, `0019`, `0020`, and
`0021`. The migrations are therefore not the source of the subsequent
`syntax error at or near "constraint"` result.

Inspection identified the exact post-migration statement in the
`schema_invariants` check: it used `constraint` as the unquoted alias for
`pg_constraint`. PostgreSQL parses `CONSTRAINT` as grammar in that position.
The harness now uses the semantic `catalog_constraint` alias. No migration from
`0000` through `0021` was changed.

Each validation now emits `PHASE1_CHECK_START=<check>` and
`PHASE1_CHECK_PASS=<check>`. If it fails, its structured result has
`phase: "validation"`, the exact `check`, PostgreSQL code/message/position/
routine, and bounded SQL context. Phase 1 is still **not PASS** until a fresh
real run completes all validation checks and the fail-closed verifier accepts
the persisted PASS result.

## Latest post-migration RLS evidence

The newest real local run passed `schema_invariants`, `rls_coverage`, and
`marketing_crud_rls` after the complete `0000`–`0021` migration chain.
`marketing_crud_rls` proved the four canonical Marketing OS tables under the
non-owner `phase1_app` role. It records `PHASE1_RLS_STEP=<step>`, verifies
`current_user` and `current_setting('app.tenant_id', true)` on the exact
transaction object that executes CRUD, and runs expected write rejections in
isolated rollback transactions. No policy or migration was weakened to obtain
that result.

## Latest durable approval RLS evidence

The same real local run also passed `durable_approval_rls`. Its evidence covered
policy metadata, tenant A insert/read/transition, cross-tenant insert and
mutation denials, tenant B read/update denials, missing-context read/insert
denials, and durable recovery from a fresh client. The harness checks the exact
`marketing_os_approval_records_tenant_policy`, emits
`PHASE1_APPROVAL_STEP=<step>`, and isolates expected rejections in rollback
transactions. No `0022` migration is created: the `0021` policy is strict and
the prior issue was a harness transaction pattern, not a schema defect.

## Transaction-local tenant-context evidence

The next real check, `transaction_local_tenant_setting`, failed only because
the old harness expected `current_setting('app.tenant_id', true)` to become
SQL `NULL` after commit. PostgreSQL returned `''`. A custom GUC introduced with
transaction-local `set_config(..., true)` can remain defined while its value is
reset to an empty string; that state is not the Tenant A UUID. The RLS policies
already use `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, so an
empty reset has no tenant authorization.

The revised harness records `PHASE1_TENANT_SETTING_STEP` and
`PHASE1_TENANT_SETTING_STATE` for baseline, commit, rollback, no-context, and
pool-reuse boundaries. It accepts only `NULL` or `''` after a boundary, rejects
Tenant A or any other non-empty tenant setting, and then proves no-context
`phase1_app` transactions cannot read, update, or insert Tenant A
`marketing_memory_records`. It uses a `max: 1` postgres.js client and compares
backend PIDs: `SAME_BACKEND_CONFIRMED` is reported only when physical reuse is
observed; otherwise it reports `DIFFERENT_BACKEND_NOT_CLAIMED`.

The newest real run passed this check with `UNDEFINED` at baseline,
`TENANT_A_ACTIVE` inside both commit and rollback transactions, and
`EMPTY_SAFE_RESET` after each boundary and in each following no-context
transaction. It confirmed the same PostgreSQL backend PID after pooled reuse.

## pgvector metadata evidence

The next real check, `pgvector`, failed before any vector write because the old
harness derived dimensions as `atttypmod - 4`; the observed 1532 is exactly
1536 minus 4. The canonical historical migration
`0006_knowledge_layer.sql` declares `embedding_vector vector(1536)`, the
Drizzle schema declares the same dimension, and durable persistence rejects any
embedding vector whose length is not the canonical 1536 contract. This is a
harness introspection defect, not evidence that production schema is 1532.

The replacement uses `pg_catalog.format_type(atttypid, atttypmod)` as the
canonical rendered column type and records the raw typmod only as diagnostics;
it never subtracts a generic varlena header. It emits
`PHASE1_PGVECTOR_STEP`, `PHASE1_PGVECTOR_COLUMN_TYPE`, and the raw typmod, and
persists structured table/column/type/typmod/expected/observed dimension data
if it fails. The resulting real run passed with `vector(1536)` and typmod 1536,
a 1536-dimensional `vector_dims` round trip, an intentional 1535-dimension
rejection, and Tenant B/no-context RLS reads. No migration was created or
changed.

## Billing authority harness evidence

The next real check, `billing_authority`, failed before its first SQL statement
with `TypeError: Cannot read properties of undefined (reading 'parsers')`.
The former harness called `drizzle(transaction)` where `transaction` was a raw
postgres.js callback object. Drizzle's postgres.js adapter correctly expects an
outer `Sql` client and reads `client.options.parsers` while constructing its
session; the raw callback intentionally does not expose `options`.

The harness repair creates Drizzle from the same outer postgres.js client
configuration used by the rest of Phase 1, starts a Drizzle transaction, then
establishes `SET LOCAL ROLE phase1_app` and `app.tenant_id` on that exact
transaction. The persistent billing repository and atomic usage store receive
that Drizzle transaction, which is their canonical adapter boundary.

A subsequent real run reached the `tenant_a` authority operation and exposed a
separate production-adapter defect: `AtomicBillingUsageStore` interpolated
`new Date(request.periodStart)` and `new Date(request.periodEnd)` directly in
raw Drizzle SQL. The billing schema declares all four relevant columns as
`timestamp with time zone` with Drizzle's default `date` mode. Column-bound
repository predicates already encode `Date` to ISO strings; raw SQL has no
column encoder unless one is supplied explicitly. Drizzle's postgres.js driver
uses transparent timestamp serializers, so the unencoded `Date` reached the
postgres.js Bind stage and failed before SQL execution.

`AtomicBillingUsageStore` now binds each usage-event and usage-counter period
through `sql.param(date, canonicalTimestampColumn)`. This preserves the schema
contract and serializes the value at the production persistence boundary; it is
not a harness-only conversion and does not require a migration. The harness
emits safe `PHASE1_BILLING_PARAM` classifications before `tenant_a`, and its
fail-closed evidence includes the parameter contract and bounded JavaScript
stack. The final real run passed the repaired authority and subsequent
concurrency checks; see `PHASE1_POSTGRES_FINAL_EVIDENCE.md`.

## PostgreSQL 16 catalog compatibility

RLS coverage reads `pg_class.relrowsecurity` and
`pg_class.relforcerowsecurity`; it does not rely on `pg_tables` or a
nonexistent force-RLS column. Constraint inspection reads `pg_constraint` with
the safe `catalog_constraint` alias. The harness tests with a non-owner,
non-bypass application role, so force-RLS is observed as catalog metadata but
is not required to make the RLS test meaningful.

## NOTICE and identifier-name technical debt

PostgreSQL code `00000` notices, including `DROP POLICY IF EXISTS ... skipping`,
do not cause migration failure. PostgreSQL 63-byte identifier truncation notices
are likewise not errors. The baseline `0000_odd_killmonger.sql` contains seven
constraint names exceeding 63 bytes (lines 66, 354, 360, 372, 408, 432, and
558). They are retained as historical technical debt because truncation could
cause a future name collision; this task deliberately does not refactor
historical names.
