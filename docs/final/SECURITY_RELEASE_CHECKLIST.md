# Security Release Checklist

This checklist is a release-evidence instrument, not an assertion that controls have been completed. Items remain NOT VERIFIED until an accountable owner attaches environment-specific proof.

| Control | Evidence required | Freeze state |
| --- | --- | --- |
| Threat model | Current trust boundaries, assets, abuse cases, mitigations, and residual-risk owner. | NOT VERIFIED |
| Authentication | OIDC issuer/JWKS/audience validation, expiration, clock skew, and failure handling. | NOT VERIFIED |
| Authorization | Role, tenant claim, object-level, and cross-tenant negative tests. | NOT VERIFIED |
| Tenant isolation | Database, API, worker, artifact, retrieval, and cache isolation proof. | NOT VERIFIED |
| Secrets | Managed storage, no plaintext source/runtime leakage, least privilege, rotation drill. | NOT VERIFIED |
| Supply chain | Locked dependencies, SBOM, dependency/SAST scan, signed/provenanced artifact. | NOT VERIFIED |
| Input/output safety | Validation, redaction, file/content limits, safe logging, and error handling. | NOT VERIFIED |
| AI/tool safety | Prompt/tool authorization, data-minimization, approval gates, idempotency, audit replay review. | NOT VERIFIED |
| Network | TLS, ingress/egress allow-list, service identity, segmentation, and rate limiting. | NOT VERIFIED |
| Data protection | Encryption, retention/deletion, backups, access logs, and recovery control. | NOT VERIFIED |
| Vulnerability response | Severity policy, remediation record, exception owner/expiry, and emergency patch runbook. | NOT VERIFIED |
| Monitoring and response | Alert routing, incident contacts, tabletop exercise, containment and notification procedure. | NOT VERIFIED |
| Privacy/legal | Data inventory, processors, consent/notice, regional obligations, and legal approval. | NOT VERIFIED |
| Penetration assessment | Scoped test and remediation verification for externally exposed deployment. | NOT VERIFIED |

## Code-level controls to preserve

The current tool gateway distinguishes read, write, and external-side-effect actions and checks tenant context/match, registered handlers, permissions, idempotency, and approval IDs for external effects. Future changes must not bypass those boundaries. Repository checks alone cannot close this checklist.

## Release sign-off record

Before an authorized production deployment, record target environment, artifact digest, commit, assessor, date, evidence links, accepted exceptions/expiry, security approver, platform approver, and incident commander contact. A documentation commit or tag is not security sign-off.
