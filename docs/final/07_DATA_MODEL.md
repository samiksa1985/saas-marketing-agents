# Data model

`packages/db/src/schema.ts` exports approximately 85 Drizzle tables covering tenant/users/roles/permissions, engagements/workflows/tasks/artifacts/handoffs/audit, memory/knowledge, company/ICP, market/strategy, sales, customer success, CFO, analytics, billing, automation, marketing execution, and governance. Tenant-owned tables use `tenant_id`, indexes, and migration RLS policy strategy; global billing plans are intentionally not tenant rows.

Knowledge uses document, chunk, citation records and PostgreSQL vector-oriented migration source. Sales persists score/forecast/proposal snapshots. CFO persists profitability and scenario snapshots; `0018_reconciliation_forward_repairs.sql` adds financial forecast snapshots with provenance/evidence fields. Billing stores integer minor-unit invoice/payment amounts plus counters/events. Governance includes feature flags, export/deletion requests, retention, organization overrides, and audit reuse.

Migration source sequence is `0000` foundation through `0018`; 0018 is forward-only reconciliation. No migration execution is asserted. RLS relies on `current_setting('app.tenant_id', true)` and transaction-local `withTenantScope`; real PostgreSQL verification remains a release gate.
