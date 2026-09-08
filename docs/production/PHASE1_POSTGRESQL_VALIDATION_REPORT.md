# Production Readiness Phase 1 — PostgreSQL Validation Report

## Status

Fresh disposable PostgreSQL evidence has verified the complete migration chain
through `0021`, `schema_invariants`, `rls_coverage`, `marketing_crud_rls`,
`durable_approval_rls`, `transaction_local_tenant_setting`, and `pgvector`.
The tenant check confirmed same-backend pooled reuse with an empty safe
custom-GUC reset, not a Tenant A leak; pgvector confirmed `vector(1536)`, a
1536-dimensional round trip, an invalid-dimension rejection, and RLS reads.
The former billing-authority harness construction defect and the production
raw-SQL timestamp-binding defect are repaired. A fresh full local run and the
fail-closed verifier have now passed. See
`PHASE1_POSTGRES_FINAL_EVIDENCE.md` for the final evidence record. The JSON
result emitted by `npm --workspace @platform/db run phase1:postgres` against
disposable PostgreSQL 16 + pgvector remains the only PASS authority for this
Phase 1 baseline.

## Scope

- Clean canonical migration chain through `0021_durable_marketing_os_approvals.sql`.
- Non-owner, `NOBYPASSRLS` role testing for RLS reads and writes.
- Transaction-local tenant-setting and pooled-connection leakage checks.
- `vector(1536)`, HNSW index, lexical retrieval, and tenant isolation.
- Billing authority resolution and real PostgreSQL atomic-usage contention.

## Repository findings

| Finding                                                    | Disposition                                                     | Evidence source                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `marketing_memory_records` lacks RLS after `0005`          | Forward repair in `0019`; real verification passed              | `packages/db/drizzle/0005_marketing_os.sql`, `0019_marketing_os_rls_repairs.sql` |
| `marketing_os_plan_snapshots` lacks RLS after `0005`       | Forward repair in `0019`; real verification passed              | same                                                                             |
| `marketing_outcome_events` lacks RLS after `0005`          | Forward repair in `0019`; real verification passed              | same                                                                             |
| Durable plan IDs / acquisition snapshot / execution binding | Forward addition in `0020`; migration-chain verification passed | `0020_persistent_marketing_os_runtime.sql`                                     |
| Durable canonical approval records / embedding provenance | Forward addition in `0021`; approval RLS verification passed | `0021_durable_marketing_os_approvals.sql` |
| pgvector typmod inspection                                  | Harness repaired; real verification passed                       | `packages/db/scripts/phase1-postgres.ts`                                       |
| Billing authority adapter                                   | Harness construction and production raw-SQL timestamp binding repaired; real verification passed | `packages/db/scripts/phase1-postgres.ts`, `packages/marketing-os-persistence/src/billing-usage.ts` |
| `users` was seen with `tenant_id` in a legacy raw baseline | Expected legacy difference; no RLS added                        | Canonical schema models global identities and `tenant_members` membership        |
| Drizzle journal listed only `0000`                         | Journal now declares the canonical forward files through `0021` | `packages/db/drizzle/meta/_journal.json`                                         |

No production migration, deployment, or production action was performed by
this Phase 1 repository work. This sandbox cannot call Docker; it does not
replace the supplied local PostgreSQL evidence. That evidence is now complete
and includes the pgvector and billing reruns.

## Required evidence

Return the full `PHASE1_POSTGRES_RESULT=...` line plus the preceding command output. Do not put database URLs or passwords in the evidence.
