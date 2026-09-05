# Migration readiness report

No migration was executed for this reconciliation. The classifications below are
source-readiness assessments only. A `BLOCKED` item needs a new, controlled
forward migration for databases that have already recorded the historical file;
editing a historical source file does not alter an existing database.

| Migration | Status | Source review | Required controlled production action |
| --- | --- | --- | --- |
| `0006_knowledge_layer.sql` | BLOCKED | Added missing RLS enablement and tenant policies for documents, chunks and citations. UUID defaults, tenant FKs and indexes are present. | Apply equivalent forward RLS policy migration after confirming existing table ownership and access roles; verify `vector`/HNSW availability. |
| `0007_sales_intelligence.sql` | READY | Tenant FKs, UUID defaults, indexes and dynamic RLS policy are present. | Execute only through the deployment migration workflow. |
| `0008_company_icp_intelligence.sql` | BLOCKED | Added `gen_random_uuid()` defaults to all four IDs to match schema; tenant FKs, indexes and RLS are present. | Add defaults with a forward migration for databases where `0008` already ran; validate existing explicit IDs. |
| `0009_market_intelligence.sql` | READY | Separate tenant tables, cascade FKs, indexes and per-table policies are present. | Execute only through the deployment migration workflow. |
| `0010_strategy_intelligence.sql` | READY | Version uniqueness, tenant indexes, FKs and `WITH CHECK` RLS policies are present. | Execute only through the deployment migration workflow. |
| `0011_customer_success_intelligence.sql` | READY | Tenant FKs, UUID defaults, indexes and `WITH CHECK` RLS policies are present. | Execute only through the deployment migration workflow. |
| `0012_cfo_intelligence.sql` | BLOCKED | Added tenant FKs to align source schema and tables; RLS policies are present. Scenario tables are not a deterministic forecast implementation. | Validate orphan-free tenant IDs, then add tenant FKs through a forward migration. |
| `0013_analytics_experiments.sql` | BLOCKED | Added missing policies after the existing RLS enablement; UUID defaults, FKs and indexes are present. | Apply equivalent forward policy migration and verify with two tenant sessions. |
| `0014_billing_entitlements.sql` | BLOCKED | Schema and source now use integer `amount_due_minor`, `amount_paid_minor`, and `amount_minor`; usage-event idempotency index is present. | Design and validate a data conversion for any deployed real-valued payment amount before changing columns. |
| `0015_automation_engine.sql` | BLOCKED | Added tenant FKs to align source schema; idempotency index and RLS policies are present. | Validate existing rows, then add FKs with a forward migration. |
| `0016_marketing_execution.sql` | BLOCKED | Added tenant FKs to align source schema; artifact/binding FKs, uniqueness and RLS are present. | Validate existing rows, then add FKs with a forward migration. |
| `0017_admin_governance.sql` | READY | Reuses canonical `audit_events`, has tenant FKs, indexes, approval-gated request records and RLS policies. | Execute only through the deployment migration workflow. |

## Cross-cutting findings

- Migration order is monotonic from `0006` through `0017`; no duplicate table
  names were found in this range.
- `billing_plans` and `billing_plan_entitlements` are intentionally global plan
  catalog tables. Tenant data begins at subscriptions/overrides/usage and is RLS
  protected.
- The canonical source has RLS policy expressions based on
  `current_setting('app.tenant_id', true)`. Application transactions must call
  `withTenantScope` on the same database connection before tenant-bound work.
- The reconciled source has not been applied or run against PostgreSQL, so this
  report is not evidence of live schema state, data validity, RLS enforcement or
  concurrent locking behavior.

## Forward-only reconciliation update (0018)

`0018_reconciliation_forward_repairs.sql` is generated but was **not
executed**. It creates the CFO forecast snapshot, applies idempotent source
repairs for selected RLS/default drift, and adds ICP foreign keys as `NOT VALID`.
It deliberately excludes deployed billing real-value conversion.

Before controlled deployment: back up schema/affected tables; compare recorded
migration history; run read-only orphan, tenant-ownership, duplicate-event and
minor-unit representability checks; apply through the normal runner; validate
each named `NOT VALID` constraint only after zero violations; then verify RLS
using two tenant sessions and inspect CFO provenance/evidence records. Rollback
is schema-only (drop new table/policies or unvalidated constraints) before data
writes; export forecast writes before any rollback. Billing needs a separately
approved reversible conversion with reconciliation totals.
