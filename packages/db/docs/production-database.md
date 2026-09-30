# Production PostgreSQL Database Runbook (WS-PROD-02)

## Role architecture

Production enforces a two-identity trust boundary:

| Role            | Purpose                         | Attributes                                              |
| --------------- | ------------------------------- | ------------------------------------------------------- |
| `codecore_owner` | Migration / schema authority    | Privileged (superuser or CREATEDB+CREATEROLE). Created at environment bootstrap. **Never** used by application runtime. |
| `codecore_app`   | Application runtime identity    | `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT` |

`codecore_app`:

- must never own protected (tenant-scoped) application tables;
- must have no direct or transitive role memberships, preventing `SET ROLE`
  escalation;
- reads global identity/RBAC tables (`tenants`, `users`, `roles`, `permissions`,
  `role_permissions`, `tenant_members`) but cannot mutate them;
- receives DML only on explicitly enumerated operational tables. Future tables
  receive SELECT only by default until provisioning explicitly grants writes;
- receives sequence `USAGE/SELECT` and read-only access to the Drizzle ledger.

## Environment variables

| Variable | Purpose |
| ------------------------ | ---------------------------------------------------------------- |
| `DATABASE_URL`           | Runtime application connection. In production this MUST authenticate as `codecore_app`. Never printed. |
| `MIGRATION_DATABASE_URL` | Connection used solely by schema migration / provisioning. In production this MUST be explicit and authenticate as a privileged migration authority (`codecore_owner` or bootstrap equivalent); no fallback to `DATABASE_URL`. Never printed. |
| `CODECORE_APP_PASSWORD` | Password applied to `codecore_app` during provisioning. Inject from a managed secret store. Never logged, never committed. |
| `PRODUCTION_VERIFY_REQUIRE_OWNER_ROLE` | Optional. When `true`, production verification additionally requires the canonical `codecore_owner` role to exist and be privileged. Default `false` tolerates bootstrap-named owners (e.g. the local pilot's `phase1_owner`). |

## Provisioning (idempotent, safe to repeat)

```powershell
$env:MIGRATION_DATABASE_URL = '<migration-authority-url>'
$env:CODECORE_APP_PASSWORD = '<from secret store>'
npm --workspace packages/db run provision:production-roles
```

Provisioning verifies migration authority, converges role attributes and
membership, applies least-privilege table/default grants, and runs an ownership
guard. It does not transfer existing table ownership and never echoes the
password.

## Migrations with authority separation

```powershell
.\scripts\production-migrate.ps1
```

- Requires `NODE_ENV=production` and `NAWA_PRODUCTION_MIGRATION_CONFIRM=APPLY`.
- `packages/db/src/migrate.ts` requires `MIGRATION_DATABASE_URL` and verifies
  both runtime and migration authority before applying migrations.
- Post-migration verification connects with the **runtime** identity from
  `DATABASE_URL`; its rolled-back RLS fixture setup separately uses the
  explicit migration identity from `MIGRATION_DATABASE_URL`.

## Verification

```powershell
npm --workspace packages/db run production:verify
```

Base checks (all environments): migration ledger is current, `pgvector`
extension present, every tenant-scoped table has RLS enabled.

When `NODE_ENV=production`, API startup and the verifier fail closed unless the
runtime connection identity:

- is not superuser, not `BYPASSRLS`, not `CREATEDB`, not `CREATEROLE`, and is
  exactly `codecore_app` with `NOINHERIT`;
- owns no protected tenant tables and has no direct or transitive role
  memberships;
- uses RLS on every tenant table with applicable ALL-command policies whose
  `USING` and `WITH CHECK` expressions reference tenant context;
- passes a rolled-back real PostgreSQL probe for cross-tenant SELECT, INSERT,
  UPDATE, and DELETE behavior under `SET LOCAL ROLE codecore_app`.

Development/local pilot behavior is unchanged; the strict block above only
activates in production.

## Pool safety

`createDb` applies bounded production settings only when
`NODE_ENV=production`: `max: 10`, `prepare: false` (transaction-pooler safe),
`idle_timeout: 20s`, `max_lifetime: 3600s`, and server-side
`statement_timeout: 30000ms`. Local development behavior is unchanged.

## TLS

Production `DATABASE_URL` and `MIGRATION_DATABASE_URL` values MUST each include
exactly one `?sslmode=verify-full` parameter. Configuration, migration URL
resolution, and production PostgreSQL client creation reject a missing or
weaker mode, including the restore verifier and PostgreSQL command-line
boundary. Do not use `disable`, `allow`, `prefer`, `require`, or `verify-ca`
in production.

`verify-full` validates the server certificate chain and hostname. Node's
system trust store is used unless `DATABASE_SSL_CA_FILE` points to an
operator-managed CA bundle; when set, the file is loaded as the verified TLS
trust root and an unreadable or empty file fails closed. The production Compose
example mounts that external file at `/run/secrets/postgres_ca` and configures
PostgreSQL with separately injected server certificate and private-key files.
No certificate or key material belongs in the repository, image, URL, or logs.

## Backup / Restore / DR

See [disaster-recovery.md](./disaster-recovery.md) for backup tooling,
isolated restore procedure, role/grant re-provisioning after restore, RPO/RTO
targets, retention, and the operator flows for new databases, release
migrations, and disaster recovery.
