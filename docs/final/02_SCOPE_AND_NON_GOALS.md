# Scope and non-goals

The frozen scope is one product with shared contracts, frontend, control plane, runtimes, Tool Gateway, context/RAG boundary, database, billing/entitlements, approvals, and governance. Documentation can clarify code but cannot introduce a parallel architecture.

Non-goals: running migrations; deployment; commit/push/tag; Prisma; a second backend/workflow engine; duplicate `TenantContext`/RBAC/billing/context; live claims for payments, CRM, publishing, research, embeddings, storage, LLM, Temporal, or PostgreSQL; fabricated metrics or automatic approval/external action. Empty/unavailable UI state is intentional when data or an external dependency is absent.
