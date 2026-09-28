# First-customer pilot runbook

1. Complete deployment, database verification, OIDC validation, backup verification, and reverse-proxy/WAF checks.
2. Run the explicit idempotent bootstrap command with a customer-supplied tenant UUID, tenant name, OIDC subject, and display name. It requires `PILOT_BOOTSTRAP_CONFIRM=YES`, requires a seeded `tenant_admin` role, writes a canonical audit event, and leaves providers unconfigured and disabled.
3. Sign in through production OIDC. Confirm the user receives only the intended tenant context and roles.
4. Open onboarding, record workspace/business/goals, and inspect integration readiness. Do not describe a provider as connected without the persisted binding/health evidence.
5. Review Overview, Growth Workspace, recommendation evidence, simulation, Approval Center, customer/journey context, analytics, reports, and audit/evidence.
6. For acceptance execution, use the existing safe mock/non-live governed path only. Confirm approval, execution, verification, uncertainty, and audit states. Do not send external communication or mutate a live provider.
7. Repeat a tenant-isolation check with a second test tenant: no cross-tenant read/write must succeed.

Record evidence, request IDs, release version, bootstrap correlation ID, and the result of every gate in the customer acceptance record.
