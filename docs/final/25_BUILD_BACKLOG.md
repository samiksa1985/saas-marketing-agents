# Build Backlog

This backlog contains release-enabling or production-hardening work that remains outside this documentation freeze. It does not reopen reconciled source changes without a new code task.

| Priority | Item | Acceptance evidence | Owner area |
| --- | --- | --- | --- |
| P0 | Complete production-like PostgreSQL rehearsal and change approval. | Phase 1 disposable migration/RLS/concurrency baseline is PASS; add approved target-environment rehearsal, backup/restore, and change record. | Data platform |
| P0 | Deploy and prove Temporal workers. | Namespace, worker registration, workflow execution/retry/cancel, alerting, and recovery evidence. | Platform |
| P0 | Complete production identity validation. | OIDC discovery/JWKS, audience/issuer, role mapping, tenant-claim negative tests, and break-glass review. | Security/platform |
| P0 | Establish secret management and rotation. | Vault/secret-manager references, no plaintext deployment secret, rotation drill, and access review. | Security/platform |
| P0 | Perform backup and restore drill. | Restored tenant data, RPO/RTO measurement, and signed operational record. | Data platform |
| P0 | Complete Google Ads real-provider readiness before enabling writes. | Managed-secret wiring, approved least-privilege account, adapter transport implementation, sandbox mutation/verification, provider idempotency/timeout proof, worker/outbox recovery, disable and rollback exercise. EPIC-03 mock/dry-run proof is not this evidence. | Integration owners |
| P1 | Verify each other external provider before enabling writes. | Contract test, sandbox test, webhook verification, approval/idempotency proof, rollback/disable procedure. | Integration owners |
| P1 | Operate dashboards and alerts. | SLOs, error/queue/approval/side-effect alerts, owner routing, and incident drill. | Observability |
| P1 | Create a capability enablement ceremony. | Per-capability evidence, owner approval, feature/config state, and rollback owner. | Product/governance |
| P1 | Run security release assessment. | Threat model, SAST/dependency/secrets reports, penetration findings disposition, and incident contacts. | Security |
| P2 | Automate release-gate evidence collection. | Reproducible report linked to commit, environment, and artifacts. | Developer experience |
| P2 | Add performance/load baselines. | API, worker, database, and queue load results with capacity conclusions. | Platform |
| P2 | Add data retention and deletion operating procedures. | Tenant-request test, retention jobs, legal hold route, and audit record. | Governance/data |

## Backlog rule

An item may move to complete only when its evidence is available for the exact target environment. Configuration presence or a passing unit test is insufficient for an operational production gate.
