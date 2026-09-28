# EPIC-03.1 PostgreSQL Evidence

## Status: REAL DISPOSABLE POSTGRESQL VERIFIED / PASS

Evidence received 2026-09-08 from the established fail-closed local disposable
PostgreSQL runner and verifier. The complete journal was applied from `0000`
through `0022_governed_external_marketing_actions`; no production database was
touched.

## Verified result

- `PHASE1_POSTGRES_RESULT.status=PASS`
- `migrationCount=23`; latest migration
  `0022_governed_external_marketing_actions`.
- Migration chain and migrations `0020`, `0021`, and `0022`: **PASS**.
- RLS, tenant isolation, and pooled-connection tenant reset: **PASS**.
- Existing pgvector and billing authority/concurrency/idempotency/rollback/
  cross-tenant isolation checks: **PASS**.
- `external_action_policies`, `external_action_policy_audit`,
  `external_marketing_actions`, `external_marketing_action_evidence`, and
  `external_action_workflow_outbox`: policy persistence/audit, RLS, outbox, and
  durable idempotency: **PASS**.
- Tenant A lifecycle access was proved; Tenant B and missing context were denied
  access to action, evidence, policy, and outbox: **PASS**.
- Restart recovery and repeated delivery acknowledgement were replay-safe:
  **PASS**.
- Real active-target concurrency: `workers=2`, `attempts=2`, `successes=1`,
  `conflicts=1`, `unexpectedDuplicates=0`.
- `PHASE1_LOCAL_RUNNER=PASS` and `PHASE1_EVIDENCE_VERIFICATION=PASS`.

## Scope boundary

This proof is database evidence only. It does not validate Google Ads
credentials, sandbox connectivity, live Google Ads mutation, cloud deployment,
or commercial production readiness.
