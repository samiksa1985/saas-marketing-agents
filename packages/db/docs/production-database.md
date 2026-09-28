# Production PostgreSQL Database Runbook (WS-PROD-02)

## Role architecture

Production enforces a two-identity trust boundary:

| Role            | Purpose                         | Attributes                                              |
| --------------- | ------------------------------- | ------------------------------------------------------- |
| `codecore_owner` | Migration / schema authority    | Privileged (superuser or CREATEDB+CREATEROLE). Created at environment bootstrap. **Never** used by application runtime. |
| `codecore_app`   | Application runtime identity    | `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` |

`codecore_app`:

- must never own protected (tenant-scoped) application tables;
- receives only bounded privileges: schema `USAGE`, table DML
  (`SELECT/INSERT/UPDATE/DELETE`), sequence `USAGE/SELECT`, and read-only
  access to the Drizzle migration ledger;
- inherits future grants via `ALTER DEFAULT PRIVILEGES` on the owner role.

## Environment variables

| Variable | Purpose |
| ------------------------ | ---------------------------------------------------------------- |
| `DATABASE_URL`           | Runtime application connection. In production this MUST authenticate as `codecore_app`. Never printed. |
| `MIGRATION_DATABASE_URL` | Connection used solely by schema migration / provisioning. In production this MUST authenticate as the migration owner (`codecore_owner` or bootstrap equivalent). Falls back to `DATABASE_URL`. Never printed. |
| `CODECORE_APP_PASSWORD` | Password applied to `codecore_app` during provisioning. Inject from a managed secret store. Never logged, never committed. |
| `PRODUCTION_VERIFY_REQUIRE_OWNER_ROLE` | Optional. When `true`, production verification additionally requires the canonical `codecore_owner` role to exist and be privileged. Default `false` tolerates bootstrap-named owners (e.g. the local pilot's `phase1_owner`). |

## Provisioning (idempotent, safe to repeat)

```powershell
$env:DATABASE_URL = '<owner-or-migration-url>'       # or set MIGRATION_DATABASE_URL
$env:CODECORE_APP_PASSWORD = '<from secret store>'
npm --workspace packages/db run provision:production-roles
```

Provisioning converges role attributes, bounded grants, default privileges,
and runs an ownership guard that fails if `codecore_app` owns any protected
tenant table. It does not transfer existing table ownership and never echoes
the password.

## Migrations with authority separation

```powershell
.\scripts\production-migrate.ps1
```

- Requires `NODE_ENV=production` and `NAWA_PRODUCTION_MIGRATION_CONFIRM=APPLY`.
- `packages/db/src/migrate.ts` connects with
  `process.env.MIGRATION_DATABASE_URL || config.databaseUrl`.
- Post-migration verification connects with the **runtime** identity from
  `DATABASE_URL`.

## Verification

```powershell
npm --workspace packages/db run production:verify
```

Base checks (all environments): migration ledger is current, `pgvector`
extension present, every tenant-scoped table has RLS enabled.

When `NODE_ENV=production`, the verifier additionally fails closed unless the
runtime connection identity:

- is not superuser, not `BYPASSRLS`, not `CREATEDB`, not `CREATEROLE`, and is
  not the migration owner role;
- owns no protected tenant tables;
- `codecore_app` exists with the exact safe attribute set;
- every RLS-enabled tenant table carries an ALL-command tenant policy;
- a real cross-tenant probe (always rolled back, no persistent data) proves
  cross-tenant SELECT invisibility and WITH CHECK write denial (SQLSTATE
  `42501`) under `SET LOCAL ROLE codecore_app`.

Development/local pilot behavior is unchanged; the strict block above only
activates in production.

## Pool safety

`createDb` applies bounded production settings only when
`NODE_ENV=production`: `max: 10`, `prepare: false` (transaction-pooler safe),
`idle_timeout: 20s`, `max_lifetime: 3600s`, and server-side
`statement_timeout: 30000ms`. Local development behavior is unchanged.

## TLS

Production connections MUST use TLS with full certificate verification,
either via the URL (`?sslmode=verify-full`) or the equivalent `ssl:
'verify-full'` postgres.js connection option, with the CA certificate
provided by the platform secret store. Never use `sslmode=disable`,
`allow`, or `prefer` in production.

## Backup / Restore / DR

See [disaster-recovery.md](./disaster-recovery.md) for backup tooling,
isolated restore procedure, role/grant re-provisioning after restore, RPO/RTO
targets, retention, and the operator flows for new databases, release
migrations, and disaster recovery.
