# PostgreSQL Verification Plan

## Status and scope

This is an executable verification plan only. No migration, data mutation, or database connection was performed for the documentation freeze. The migration source is `packages/db/drizzle` through `0018_reconciliation_forward_repairs.sql`.

## Preconditions

- Approved non-production PostgreSQL instance with production-like version and extensions.
- Disposable tenant-scoped seed data and a verified backup snapshot.
- Restricted migration principal, separate application principal, and audit-capable observer account.
- Approved change record, maintenance/rollback owner, and expected migration checksum inventory.

## Verification sequence

1. Capture database version, enabled extensions, schema-only baseline, role grants, migration ledger, and backup reference.
2. Apply all pending migrations using the repository's approved migration runner; record exact migration IDs and elapsed time.
3. Compare actual schema to Drizzle source and inspect forward repair `0018` effects.
4. Run application/API regression tests against the isolated database where supported.
5. Test tenant isolation using two tenants: each tenant can read/write only its own rows; direct and joined cross-tenant reads/writes must fail.
6. Test transaction boundaries, idempotency keys, approval-linked state transitions, task claim/retry/cancel flows, and audit events.
7. Test billing/entitlement concurrency with duplicate/replayed events and simultaneous quota consumption.
8. Test artifact, memory/knowledge, vector/retrieval, retention, and deletion paths for tenant scope and expected indexes.
9. Measure slow queries, lock waits, connection exhaustion, and representative rollback/retry behaviour.
10. Restore the pre-test backup to a separate instance and prove data readability plus tenant isolation.

## Rollback and failure policy

Stop on checksum mismatch, unexpected destructive DDL, cross-tenant result, unrecoverable lock, or application regression. Preserve logs and schema snapshots. Prefer a forward corrective migration after review; only restore the isolated test database under the approved recovery plan. Never edit already-applied migration files.

## Evidence required to close G3-G5

Migration log, schema diff, test results/counts, RLS/policy negative-test output, role/grant review, concurrency result, backup/restore result, performance observations, rollback decision, environment identity, timestamps, and approver record.
