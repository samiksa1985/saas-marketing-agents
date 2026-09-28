# Deployment and DevOps runbook

Prerequisites: supported Node/npm, locked dependencies, configured environment values, PostgreSQL with required extensions/backup policy, Temporal deployment, OIDC, artifact storage, AI provider, observability, and secret manager. Install with `npm install`; validate with `npm run typecheck`, `npm test`, `npm --workspace @platform/api test`, `npm --workspace @platform/web test`, and `npm --workspace @platform/web run build`.

Use a controlled database migration pipeline: backup, preflight, rehearsal, apply ordered migrations including 0018, validate RLS/constraints, smoke test, and retain rollback/export plan. Start API/web/worker only with production configuration and Temporal adapter/read model. Health endpoints are `/health` and `/ready`; readiness is not proof of external dependency health.

Release rollback is application artifact rollback plus controlled schema/data rollback according to the migration plan. Do not run this runbook from documentation automation; see `POSTGRESQL_VERIFICATION_PLAN.md` and `PRODUCTION_READINESS_GATES.md`.
