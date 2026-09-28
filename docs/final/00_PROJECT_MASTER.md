# AI Marketing OS — Project Master

AI Marketing OS is one tenant-aware product for planning, executing, governing, and measuring marketing-to-revenue work. SMB, enterprise, and government are configuration, packaging, and entitlement variants of one architecture. Users include tenant administrators, domain operators, reviewers, approvers, and auditors.

The control plane is the Nest API, shared contracts, RBAC, approvals, workflow abstraction, Tool Gateway, registry, and audit boundaries. The Next product shell has 23 typed surfaces. Domain packages cover intelligence, strategy, sales, customer success, CFO, analytics, automation, knowledge, marketing execution, billing, and governance.

Marketing Commander and workflow orchestration select registered leaders and specialists. Agent Runtime produces evidence-bearing drafts and handoffs; it cannot self-approve. Tool Gateway enforces tenant identity, permissions, idempotency, and approval for external side effects. CFO forecasting is a deterministic period calculation separate from scenario modeling.

There is one frontend, backend/control plane, `TenantContext`, RBAC model, agent runtime, workflow abstraction, database, billing architecture, and product shell. Migrations exist through `0018`, but this freeze executes none. Production still needs migration rehearsal, PostgreSQL RLS/concurrency checks, Temporal, OIDC, secrets, storage, embeddings/ingestion, observability, and real adapters.
