# Phase 1 RLS Coverage

## Tenant model

- `users`: global identity record; it does not carry `tenant_id` in the canonical Drizzle schema.
- `tenant_members`: tenant membership and role assignment; it is tenant-scoped and protected.
- Tables with a canonical `tenant_id`: must have RLS enabled and an `ALL` policy using the transaction-local `app.tenant_id` predicate.

## Required predicate

```sql
tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
```

Both `USING` and `WITH CHECK` are required so that reads, inserts, updates (including attempted tenant reassignment), and deletes fail closed.

## Runtime coverage harness

`packages/db/scripts/phase1-postgres.ts` validates every public base table that actually has `tenant_id` through `pg_class`, `pg_attribute`, and `pg_policy`. It fails when RLS is disabled or no `ALL` policy exists. It separately proves Select/Insert/Update/Delete behavior, absent-context denial, and transaction-local reset for the three `0019`-repaired Marketing OS tables and the `0020` execution-binding table.

Status: **REAL POSTGRESQL VERIFIED / PASS** in the final disposable Phase 1
baseline, including non-owner application-role CRUD, cross-tenant denials,
missing-context denials, and transaction-local tenant reset. See
`PHASE1_POSTGRES_FINAL_EVIDENCE.md`.
