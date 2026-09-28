# Phase 1 Schema Drift Report

## Canonical migration baseline

The active Drizzle baseline is `0000_odd_killmonger`, followed by `0001` through `0021` in `meta/_journal.json`. `0000_foundation.sql` is intentionally not journaled: it contains an incompatible, legacy `users.tenant_id` shape, while the canonical schema defines `users` as global identity and makes `tenant_members` the tenant-scoped association.

## Drift classification

| Object                                                             | Classification                      | Safe treatment                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users.tenant_id` in a legacy database                             | EXPECTED DIFFERENCE                 | Do not add RLS to canonical `users`; plan identity-data reconciliation separately if a database has this legacy column.                                                                                         |
| Three `0005` Marketing OS tables without RLS                       | FIXED / REAL VERIFIED | `0019_marketing_os_rls_repairs.sql` enables RLS and creates all-command tenant policies; real CRUD/RLS checks passed. |
| Durable Marketing OS plans/executions absent                        | FIXED / REAL VERIFIED | `0020_persistent_marketing_os_runtime.sql` adds plan IDs, acquisition snapshots, tenant-scoped execution records, unique idempotency, and RLS; the fresh chain passed. |
| Durable approval records / embedding provenance absent              | FIXED / REAL VERIFIED | `0021_durable_marketing_os_approvals.sql` adds tenant-scoped canonical approval records, RLS, and knowledge embedding provenance; approval RLS/recovery passed. |
| Drizzle journal containing only `0000`                             | FIXED / REAL VERIFIED | Canonical files are declared through `0021`; the harness applied that exact 22-entry journal. |
| Drizzle billing plan prices declared as real-valued legacy columns | FIXED / REAL VERIFIED | The schema uses `price_monthly_minor` / `price_yearly_minor` integers and real billing authority/concurrency checks passed. |
| `0018` recreates 0001 policy names without an existence guard      | REAL VERIFIED | The clean-chain harness completed through `0021`; historical files remain unmodified. |

## Migration-chain safety gate

The harness is fail-closed. It applies the journal only up to `0018`, verifies that the three Marketing tables remain unprotected, then applies `0019`, verifies RLS/policy presence, and applies `0020` plus `0021` before schema, RLS, approval, pgvector, and billing checks. A failure at any historical migration is evidence of a migration-chain blocker, not a result that may be converted into a PASS.

Historical SQL files were not edited during this work.
