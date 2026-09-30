# Backup and restore runbook

Use the managed provider's encrypted, point-in-time backups as the primary control. Set retention according to the customer agreement; the v1 recommendation is daily logical verification, at least 30 days retention, RPO no greater than 24 hours, and an RTO agreed with the operator before pilot admission.

`scripts/backup-postgres.ps1` creates a PostgreSQL custom-format dump and verifies it with `pg_restore --list`. It requires explicit confirmation and approved `pg_dump`/`pg_restore` paths. It never prints the database URL.

`scripts/restore-postgres-isolated.ps1` restores only to a separately named `restore`, `recovery`, or `acceptance` target, requires `NAWA_ISOLATED_RESTORE_CONFIRM=YES`, and rejects a target equal to `DATABASE_URL`. Never restore over the active production database. After restore, run `npm --workspace packages/db run production:verify`, application readiness, and tenant-scoped RLS checks against the isolated target.

For host PostgreSQL clients, both scripts invoke the credential boundary in `scripts/postgres-cli.mjs`. It accepts `DATABASE_URL_FILE` (and `ISOLATED_RESTORE_DATABASE_URL_FILE` for the restore target), passes connection identity separately, writes any URL password to a temporary permission-restricted `PGPASSFILE`, starts the client with a filtered environment, and removes the temporary file after success or failure. Do not put a connection URL in a command argument or enable shell tracing around these operations. Docker-exec local drills continue to use the container's own PostgreSQL client and must not receive a URL password through arguments.

The operator supplies URL values through the deployment secret manager or external files. A non-empty `*_FILE` reference takes precedence over a direct value; missing, unreadable, or empty referenced files fail closed. Follow the secret rotation and emergency revocation procedure in `SECURITY_OPERATIONS_RUNBOOK.md`; restart long-running consumers after replacement. Backup artifacts and manifests must remain in approved encrypted storage with access and retention controls.

Automatic destructive rollback is prohibited. A failed deployment stops traffic progression, preserves logs/evidence, and uses a new forward repair or isolated restore after human incident approval.
