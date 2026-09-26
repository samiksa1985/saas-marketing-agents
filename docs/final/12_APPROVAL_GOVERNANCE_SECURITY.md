# Approval, governance, and security

`TenantContext` is canonical in contracts and carries tenant, user, roles, permissions, and locale. Auth normalizes OIDC identity to canonical roles/permissions. RBAC uses explicit permissions; feature flags never grant authorization. API guards derive tenant identity from verified bearer tokens.

Approvals are tenant-scoped, idempotent, human-decision records. Agent outputs remain drafts. Tool Gateway requires matching tenant context, permissions, idempotency, and an approved approval ID for external side effects. Governance supports organization overrides, retention policies, feature flags, export requests, deletion requests, and append-oriented audit; deletion remains request/approval state, not physical deletion control.

Database tenant context uses `withTenantScope` and transaction-local `set_config(..., true)`. API/worker façades are unit-tested, but real PostgreSQL RLS integration verification is a production gate. Secrets are supplied via environment variables; documentation never records secret values.
