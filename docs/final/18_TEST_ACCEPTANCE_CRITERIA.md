# Test acceptance criteria

Repository gates cover unit/domain tests, contracts/registry, tenant isolation, RBAC, approvals, Tool Gateway, billing authority/atomic usage, DB structural migrations, workflow provider/query behavior, API tests, frontend tests, root typecheck, and frontend build. Current verified baseline is recorded in `RELEASE_FREEZE_MANIFEST.md`; counts are evidence for this freeze, not permanent thresholds.

Production acceptance additionally requires clean migration rehearsal, PostgreSQL RLS/cross-tenant tests, billing concurrency, Temporal durability, OIDC/RBAC smoke tests, storage/embedding tests, real external adapter tests, dependency/security scanning, backup/restore, Arabic/English acceptance, load testing, and production smoke tests. Tests must never be weakened to satisfy a release gate.
