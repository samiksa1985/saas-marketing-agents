# Integration and tool catalog

| Classification | Current boundary |
| --- | --- |
| IMPLEMENTED INTERNAL | Registry, Agent Runtime, approvals, workflow abstraction, Tool Gateway, domain logic, persistence adapters, audit/entitlement contracts. |
| ADAPTER AVAILABLE | Temporal runtime/reader interfaces, authoritative billing repository interface, AI gateway/provider abstraction, Tool Gateway adapter interface. |
| CONFIGURATION REQUIRED | PostgreSQL, OIDC, artifact bucket/endpoint, AI provider/model, Temporal address/namespace. |
| EXTERNAL PROVIDER REQUIRED | Payment, CRM, analytics ingestion, market research/search, publishing, email, object storage, embeddings/vector ingestion, production LLMs. |
| FUTURE | Provider-specific webhooks, external tool implementations, production performance/evals. |

Tool Gateway has actual `READ`, `WRITE`, and `EXTERNAL_SIDE_EFFECT` risk classes. It checks tenant match, permission, idempotency, registered tool, and approval for side effects. No external provider is asserted live.
