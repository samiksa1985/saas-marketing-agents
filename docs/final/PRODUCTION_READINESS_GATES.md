# Production Readiness Gates

Passing source tests is necessary but not sufficient for a production release.
The repository-owned disposable PostgreSQL Phase 1 baseline is now PASS; no
target production environment was deployed or inspected, so production gates
remain deliberately conservative.

| Gate | Evidence required | Freeze status |
| --- | --- | --- |
| G1 Repository regression | Root typecheck, root tests, API/frontend tests, frontend build, focused regressions, clean diff check. | PASS |
| G2 Release artifact provenance | Immutable build artifact, SBOM, source/commit attestation, and approved release record. | NOT VERIFIED |
| G3 PostgreSQL migration | Disposable Phase 1 chain through `0022_governed_external_marketing_actions` is PASS, including policy/action/evidence/outbox RLS and real target-lock concurrency. Production change approval and target-environment rehearsal remain required. | DISPOSABLE POSTGRESQL PASS / PRODUCTION NOT VERIFIED |
| G4 PostgreSQL tenant isolation | Disposable RLS and cross-tenant negative tests are PASS; deployed-environment verification remains required. | PHASE 1 PASS / PRODUCTION NOT VERIFIED |
| G5 Backup and recovery | Encrypted backup policy and successful restore drill with RPO/RTO evidence. | NOT VERIFIED |
| G6 Temporal | Namespace, workers, retries, cancellation, persistence, and recovery/failover proof. | NOT VERIFIED |
| G7 Identity and authorization | OIDC discovery/JWKS, issuer/audience, roles, tenant claims, and negative authorization tests. | NOT VERIFIED |
| G8 Secrets and key rotation | Managed secrets, least privilege, rotation drill, and no plaintext runtime secrets. | NOT VERIFIED |
| G9 External side effects | EPIC-03 mock/dry-run proof covers durable policy/RBAC, approval, idempotency, verification, audit evidence, timeout reconciliation, rollback proposal, durable outbox, and disable-by-default configuration. Provider sandbox/live acceptance, managed secrets, real transport, deployed worker recovery, and disable/rollback exercise remain required. | NOT VERIFIED |
| G10 Billing/entitlements | Provider webhook, quota/race, reconciliation, refund/dispute, and tenant entitlement evidence. | NOT VERIFIED |
| G11 AI and RAG | Provider safety/retention review, prompt/tool evaluation, data-boundary and retrieval-isolation proof. | NOT VERIFIED |
| G12 Observability | Logs, traces, metrics, dashboards, alerts, retention, and on-call routing verified in target environment. | NOT VERIFIED |
| G13 Security assessment | Threat model, dependency/SAST/secrets scan, vulnerability disposition, penetration assessment, incident contacts. | NOT VERIFIED |
| G14 Privacy/compliance | Data inventory, retention/deletion, DPA/subprocessor review, regional obligations, and access review. | NOT VERIFIED |
| G15 Performance/capacity | Load test, queue/database capacity, rate limits, and degradation behaviour. | NOT VERIFIED |
| G16 Runbook exercise | Deployment, rollback, incident, provider outage, and approval-escalation exercises. | NOT VERIFIED |
| G17 Change approval | Authorized production change ticket and explicit release owner approval. | NOT VERIFIED |
| G18 Post-deploy validation | Smoke tests, business KPI baseline, error budget review, and rollback readiness. | NOT VERIFIED |

## Gate policy

`READY` in the documentation validation means the documentation can be committed and tagged in a later authorized action. It is not permission to deploy. A production deployment requires G1 through G18 evidence accepted by the accountable release owners.
