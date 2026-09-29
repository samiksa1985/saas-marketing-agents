# Backup / Restore / Disaster Recovery Runbook (WS-PROD-03)

Scope: V1 commercial production for the FIRST controlled customer cohort —
single-region PostgreSQL, few tenants, controlled launch. This document defines
practical targets, not enterprise SLAs. A local drill result is evidence of
procedure, never a production guarantee.

## Tooling

| Script | Mode | Purpose |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------ |
| `scripts/backup-postgres.ps1` | `pg_dump -Fc --no-owner --no-privileges` + `pg_restore --list` structural validation + SHA-256 manifest | Scheduled/on-demand logical backup |
| `scripts/restore-postgres-isolated.ps1` | `pg_restore --exit-on-error --no-owner --no-privileges` into an isolated database only | DR restore into a safe target |
| `npm --workspace packages/db run restore:verify` | TypeScript checks: ledger, schema, pgvector, RLS, policies, data, ownership | Post-restore proof |
| `npm --workspace packages/db run provision:production-roles` | Idempotent role/grant/default-privilege convergence | Post-restore security re-establishment |
| `npm --workspace packages/db run production:verify` | Runtime role safety + cross-tenant probes | Cutover gate |

Tool resolution order in both scripts: `PG_DUMP_PATH` / `PG_RESTORE_PATH` /
`PG_PSQL_PATH` env vars, then PATH, then `PG_DOCKER_CONTAINER` exec
(**local drill only** — the Growth OS container; never for production).

### Fail-closed gates (all scripts exit non-zero)

- Backup requires `NAWA_BACKUP_CONFIRM=YES`.
- Restore requires `NAWA_ISOLATED_RESTORE_CONFIRM=YES`, a target URL whose
  decoded database name contains `restore|recovery|acceptance`, and a target
  database distinct from both canonical names and the source database. Marker
  text in a username, hostname, or query does not qualify. These guards run
  before database creation or `pg_restore --clean`; differing credentials do
  not make the same database an isolated target.
- Backup fails if `pg_dump` fails, the artifact is missing/suspiciously small,
  or `pg_restore --list` cannot parse it. A partial backup never reports PASS.
- `restore:verify` refuses canonical database names (`ai_marketing_phase1`,
  `platform`, `postgres`) outright.

### Backup artifact safety

- Custom-format dump (`-Fc`), compressed, schema + data, pgvector included,
  migration ledger included.
- Artifact name: `nawa-backup-<db>-<yyyyMMddTHHmmssZ>.dump` — no credentials.
- Sidecar manifest (`<file>.manifest.json`): UTC timestamp, database name,
  host, size, SHA-256, `pg_dump` version, mode. Never contains passwords or
  connection URLs with credentials.
- `backups/`, `*.dump`, `*.dump.manifest.json` are git-ignored. Backups may
  contain tenant data (PII) and must never be committed or sent off the
  controlled environment by automated tooling.

## Roles and restores

Logical dumps intentionally exclude ownership and privileges
(`--no-owner --no-privileges`):

- **Roles are cluster-global and are NOT in a database dump.** On a fresh DR
  cluster, `codecore_owner` (bootstrap/migration authority) must exist before
  or be created during recovery; `codecore_app` is created/converged by
  `provision:production-roles`.
- Restored objects are owned by the restoring identity (the migration
  authority), which preserves the WS-PROD-02 ownership model.
- Grants and default privileges are **re-provisioned deliberately** after
  restore via `provision:production-roles` — never accidentally recovered from
  an application dump.
- Restore order: restore data first (restoring identity = migration
  authority), then provision roles/grants, then verify.

## RPO / RTO (V1 targets)

| Metric | TARGET | Mechanism |
| --- | --- | --- |
| **RPO** | **24 hours** | Daily logical backup (`backup-postgres.ps1`) |
| **RTO** | **4 business hours** | Manual restore runbook + verified scripts |

Measured local drill (WS-PROD-03 evidence, pilot-sized database): backup
~1.6 s, restore ~6 s, artifact ~0.7 MB. This is a procedure validation
measurement on a local disposable cluster, **not** a production SLA.

**Not yet guaranteed:** point-in-time recovery, sub-hour RPO, automatic
failover, cross-region copies. Those require future managed/PITR
infrastructure (e.g. WAL archiving / managed PostgreSQL PITR) and remain
explicitly out of V1 scope.

## Retention (V1)

- Daily backups; keep **14 daily + 4 weekly + 3 monthly** copies.
- Keep tooling portable: no cloud-vendor-specific storage in V1 scripts.
- Storage separation expectation: encrypted at rest (volume or bucket SSE),
  outside the database host, access-restricted to the backup operator role;
  transfers encrypted in transit (TLS/SSH). Expiry deletes oldest first and is
  logged by the operator procedure.

## Operator flows

### New production database

1. Infrastructure PostgreSQL available; TLS enforced (`sslmode=verify-full`).
2. Migration authority identity (`codecore_owner` or bootstrap equivalent)
   available.
3. `provision:production-roles` (owner connection; sets `codecore_app`).
4. `migrate` with `MIGRATION_DATABASE_URL` (owner identity).
5. `provision:production-roles` again if migrations added objects (idempotent).
6. `production:verify` as the **runtime** identity (`codecore_app`),
   `NODE_ENV=production`.
7. Application connects only after step 6 prints `status: ready`.

### Normal release migration

1. `backup-postgres.ps1` — fresh verified backup first.
2. `MIGRATION_DATABASE_URL` set to migration authority.
3. `scripts/production-migrate.ps1` (requires `NODE_ENV=production`,
   `NAWA_PRODUCTION_MIGRATION_CONFIRM=APPLY`).
4. `production:verify` runs automatically as the runtime identity.
5. Runtime health endpoints (`/health`, `/ready`) green before traffic.

### Disaster restore

1. Provision a NEW isolated/empty target (fresh cluster or new database;
   never the live database).
2. Restore: `restore-postgres-isolated.ps1 -BackupFile <latest verified>`
   (`ISOLATED_RESTORE_DATABASE_URL`).
3. Re-establish security identities: `provision:production-roles` with
   `MIGRATION_DATABASE_URL=<restored-owner>` (+ `CODECORE_APP_PASSWORD` from
   the secret store).
4. `restore:verify` with the restored owner URL.
5. `production:verify` as `codecore_app`:
   cross-tenant SELECT + WRITE probes must both report `enforced`.
6. Cut the application over to the restored endpoint ONLY after step 5 passes.
