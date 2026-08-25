# Durable Execution Batch
Adds PostgreSQL-backed marketing memory, plan snapshots and outcome events, plus a readiness-gated bridge from Marketing OS plans to the existing Workflow Runtime.

Database migration: `packages/db/drizzle/0005_marketing_os.sql`.

The installer does not execute the migration automatically. It validates schema/typecheck/tests and leaves commit/push to the user.
