# External Integration Backlog

External systems are not treated as live merely because a package, configuration variable, or tool boundary exists. Every write-capable integration must traverse the approved tool/approval/idempotency/audit boundary.

| Integration class | Product purpose | Required readiness evidence | Freeze state |
| --- | --- | --- | --- |
| OIDC identity provider | Authentication and authorization claims. | Discovery/JWKS, issuer/audience, role/tenant claims, key rotation, negative tests. | NOT VERIFIED |
| PostgreSQL | Transactional persistence. | Migration, isolation, backup/restore, capacity, and credential review. | NOT VERIFIED |
| Temporal | Durable orchestration. | Namespace, workers, retries, recovery, metrics, and incident exercise. | NOT VERIFIED |
| Artifact/object storage | Evidence and generated artifacts. | Tenant prefixes/policies, encryption, retention, signed access, recovery test. | NOT VERIFIED |
| AI/LLM provider | Model completion/tool planning. | Contract/privacy review, credential rotation, model pinning, safety and regression evaluation. | NOT VERIFIED |
| Embedding/vector service | Retrieval and memory support when enabled. | Tenant filter proof, deletion/retention, quality tests, outage behaviour. | NOT VERIFIED |
| CRM | Sales intelligence/context sync. | Sandbox contract, field map, dedupe, webhook validation, approval/idempotency/audit. | NOT VERIFIED |
| Payment provider | Billing/entitlement events. | Sandbox/live webhook verification, signature handling, replay/race/refund/dispute exercises. | NOT VERIFIED |
| Analytics/measurement | Attribution and reporting. | Event schema, consent/privacy, dedupe, reconciliation, retention. | NOT VERIFIED |
| Publishing/ad platform | Marketing execution side effects. | Sandbox/draft mode, account scoping, approval, idempotency, rate limits, kill switch. | NOT VERIFIED |
| Research/data provider | Market/company enrichment. | License, provenance, rate limits, PII review, cache/retention, fallback. | NOT VERIFIED |
| Email/notification provider | Approval and operational notifications. | Template review, recipient scoping, unsubscribe/compliance, retries, audit. | NOT VERIFIED |

## Enablement checklist

For each provider, name an owner; register only necessary scopes; store secrets outside the repository; validate tenant scope; require approval for side effects; use a stable idempotency key; record request/outcome/audit correlation; test failure/replay/timeout; document disable and credential-revocation steps; and attach environment-specific evidence to G9-G11 as applicable.
