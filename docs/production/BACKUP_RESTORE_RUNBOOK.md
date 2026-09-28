# Backup and restore runbook

Use the managed provider's encrypted, point-in-time backups as the primary control. Set retention according to the customer agreement; the v1 recommendation is daily logical verification, at least 30 days retention, RPO no greater than 24 hours, and an RTO agreed with the operator before pilot admission.

`scripts/backup-postgres.ps1` creates a PostgreSQL custom-format dump and verifies it with `pg_restore --list`. It requires explicit confirmation and approved `pg_dump`/`pg_restore` paths. It never prints the database URL.

`scripts/restore-postgres-isolated.ps1` restores only to a separately named `restore`, `recovery`, or `acceptance` target, requires `NAWA_ISOLATED_RESTORE_CONFIRM=YES`, and rejects a target equal to `DATABASE_URL`. Never restore over the active production database. After restore, run `npm --workspace packages/db run production:verify`, application readiness, and tenant-scoped RLS checks against the isolated target.

Automatic destructive rollback is prohibited. A failed deployment stops traffic progression, preserves logs/evidence, and uses a new forward repair or isolated restore after human incident approval.
