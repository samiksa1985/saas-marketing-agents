# Product requirements document

## Vision and users

Provide one governed operating system for marketing-to-revenue work. Tenant administrators, marketing/sales/finance/customer-success operators, reviewers, and auditors turn business context into traceable plans, drafts, workflows, decisions, and measurements without unapproved external effects.

| State | Requirement set |
| --- | --- |
| IMPLEMENTED | Tenant/RBAC, registry, artifacts/handoffs, approvals, Tool Gateway, workflow abstraction, 23 surfaces, deterministic domain logic, billing resolution and atomic usage reservation. |
| PRODUCTION CONFIGURATION REQUIRED | Database, OIDC, Temporal, object storage, AI provider/model, durable runtime adapter/read model. |
| EXTERNAL INTEGRATION REQUIRED | Payment, CRM, research, analytics ingestion, publishing, embeddings and knowledge ingestion. |
| FUTURE BACKLOG | Load tuning, commercial extensions, richer live records, localization/evaluations, provider-specific adapters. |

Functional requirements are tenant-bound data, explicit permissions and entitlements, approval gates, audit/evidence/confidence, deterministic tests, and honest empty/unavailable states. Arabic/English share the same RTL/LTR shell. Production release requires every hard gate in `PRODUCTION_READINESS_GATES.md`.
