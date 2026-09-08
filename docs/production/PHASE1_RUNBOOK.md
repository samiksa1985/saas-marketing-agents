# Phase 1 Disposable PostgreSQL Runbook

## Safety boundary

Run only against a disposable local PostgreSQL database. The harness requires both a database name containing `phase1` and `PHASE1_CONFIRM_DISPOSABLE=YES`, then drops and recreates only that named database through the supplied admin URL. It never reads `DATABASE_URL` and does not operate on production.

## Required environment

| Variable                    | Purpose                                             | Secret |
| --------------------------- | --------------------------------------------------- | ------ |
| `PHASE1_POSTGRES_PASSWORD`  | Compose-only local database password                | Yes    |
| `PHASE1_POSTGRES_PORT`      | Optional host port; default 55432                   | No     |
| `PHASE1_DATABASE_URL`       | Disposable target database                          | Yes    |
| `PHASE1_ADMIN_DATABASE_URL` | Same local server, connected to `postgres` database | Yes    |
| `PHASE1_CONFIRM_DISPOSABLE` | Must equal `YES`                                    | No     |

## Execution

Run the repository-owned fail-closed runner from a local PowerShell terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-phase1-postgres-local.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-phase1-postgres-evidence.ps1
```

It uses `infra/docker/docker-compose.phase1.yml`, waits for health, uses a
fresh password generated only in shell memory, does not create an `.env` file,
and writes sanitized result evidence under `artifacts/phase1-postgres/`.
It removes exactly one leading UTF-8 BOM (`U+FEFF`) from each migration before
PostgreSQL execution; it does not edit migrations or alter any other character.
The persisted `*.result.json` file is written for both `PASS` and `FAIL`, even
when the Node harness exits non-zero. The verifier reads that result file and
rejects any status other than `PASS`.

Each migration emits `PHASE1_MIGRATION_START=<filename>` and then
`PHASE1_MIGRATION_PASS=<filename>`. Migration failures carry the journal
number/order, filename/path, PostgreSQL error metadata, and bounded SQL context
in the persisted result; PostgreSQL `NOTICE` messages do not fail the run.

The Marketing OS CRUD RLS check also emits `PHASE1_RLS_STEP=<step>` and the
current table name. Its transaction first proves that `current_user` is the
non-owner `phase1_app` role and that `app.tenant_id` has the expected value on
the same transaction object that performs CRUD. A failed CRUD RLS result
includes its active step; expected rejection cases run in separate transactions
so their required rollback cannot invalidate later assertions.

The durable-approval RLS check emits `PHASE1_APPROVAL_STEP=<step>`. It uses the
same transaction-local non-owner role and tenant-context assertion, while its
create/read/decision/recovery operations use a fresh PostgreSQL transaction
after the original write context has closed. Expected cross-tenant and
missing-context write denials run in
isolated transactions, so the required PostgreSQL rollback cannot invalidate a
subsequent approval lifecycle assertion.

The transaction-local tenant-context check emits
`PHASE1_TENANT_SETTING_STEP=<step>` and
`PHASE1_TENANT_SETTING_STATE=<step>:<classification>`. PostgreSQL may represent
a transaction-local custom GUC reset as `''` instead of SQL `NULL`; both are
safe only when the previous tenant UUID is absent. The check therefore requires
`NULL` or `''`, rejects any non-empty tenant context, and proves under
`phase1_app` that a following no-context transaction cannot read, update, or
insert Tenant A rows. It tests both commit and deliberate rollback, uses a
`max: 1` client for the strongest deterministic postgres.js reuse boundary, and
reports a same-backend result only when PostgreSQL backend PIDs actually match.

The pgvector check emits `PHASE1_PGVECTOR_STEP=<step>` for extension,
column-metadata, round-trip, dimension, invalid-dimension, and tenant-isolation
proofs. It reads `pg_catalog.format_type(atttypid, atttypmod)` instead of
subtracting a generic varlena offset from `atttypmod`; the rendered
`vector(1536)` type is the authoritative storage contract. The raw typmod is
logged only as evidence through `PHASE1_PGVECTOR_TYPMOD`, while
`PHASE1_PGVECTOR_COLUMN_TYPE` gives the canonical PostgreSQL type.

The check uses only deterministic synthetic vectors. It writes and reads a
1536-dimensional Tenant A vector, verifies its stored size with pgvector's
`vector_dims`, confirms nearest-neighbor retrieval, and requires PostgreSQL to
reject a 1535-dimensional insert in an isolated rollback transaction. It then
proves Tenant B and a missing tenant context cannot read the Tenant A chunk.
Any failure persists the current step plus table, column, rendered type, raw
typmod, expected dimension, and observed dimension where available.

The billing-authority check emits `PHASE1_BILLING_STEP` for `driver_setup`,
`authority_metadata`, `tenant_a`, `override_precedence`, `persistent_usage`,
`tenant_b_denied`, and `missing_context_denied`. It constructs Drizzle only
from an outer postgres.js client; a raw
postgres.js callback transaction must never be passed to `drizzle(...)` because
it lacks the driver option maps needed by the adapter. The resulting Drizzle
transaction receives the same transaction-local application role and tenant
setting as the rest of the harness, then is passed to the persistent billing
repository and atomic usage store.

This check verifies integer minor-unit columns, authoritative organization
override precedence, persistent usage reads, Tenant B isolation, and
missing-context default denial. Before the tenant-A operation it emits safe
`PHASE1_BILLING_PARAM` classifications for the four raw-SQL usage period
parameters; all are `Date` values for a `timestamp with time zone`, Drizzle
`date`-mode column and are bound through that column encoder. Billing
concurrency, idempotency, quota, and rollback remain in the later dedicated
`billing_concurrency` check; they are not duplicated by the authority check. A
JavaScript driver failure includes its error class and a bounded stack in
fail-closed evidence without exposing a connection URL or password.

## Evidence handling

Preserve the full terminal output and return it without credentials. A result is valid only when the final line contains `PHASE1_POSTGRES_RESULT=` with JSON `status` equal to `PASS`. A missing required assertion, failed migration, unavailable extension, or command failure is a blocker.

The current journal includes `0020_persistent_marketing_os_runtime` and
`0021_durable_marketing_os_approvals`. The harness applies `0019` after
verifying the pre-repair state, then applies `0020` and `0021` before schema,
RLS, pgvector, approval, and billing checks. It must not print a pass record
after a failed migration or failed assertion.

The final local disposable evidence passed the harness and verifier. Its
complete bounded scope is recorded in `PHASE1_POSTGRES_FINAL_EVIDENCE.md`; the
runbook remains for a future reproducible disposable rerun, not as a production
deployment procedure.

## Disposal

After evidence is captured, stop and remove the container and volume explicitly:

```powershell
docker compose -f infra/docker/docker-compose.phase1.yml down -v
```

This action removes only the named Phase 1 Compose resources.
