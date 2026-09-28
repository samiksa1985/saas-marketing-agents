# Final Project 2 disposition matrix

This is an audit of the checked-in repository, not an assertion that the Project 2
reference material is executable. `docs/project2-reference/` is provenance only;
it is not a workspace package and no active source imports its former Next, Prisma,
or orchestrator runtime.

| Project 2 asset / capability | Source | Canonical destination | Disposition | Reason and checked test coverage | Remaining production dependency |
| --- | --- | --- | --- | --- | --- |
| Next dashboard, sidebar, onboarding and login sketches | `app/`, `components/` in the source manifest | `apps/web` product shell and `/[surface]` routes | REPLACED | One frontend, typed product model and six product-model tests; old Next runtime is reference only. | Session/API composition for live data. |
| Next API routes | `app/api/*` | `apps/api` Nest control plane | REPLACED | API has canonical auth, registry, workflow, approval, and Marketing OS controllers; Project 2 routes are documentation only. | Domain package endpoints are still intentionally uncomposed. |
| Prisma schema, seed and tenant helpers | `prisma/`, `lib/db/*` | `packages/db` Drizzle schema and SQL migrations | REJECTED | No active Prisma import or dependency; db schema and migration tests cover canonical source. | Controlled PostgreSQL migration execution. |
| Project 2 tenant/RBAC contracts | `lib/agents/types.ts`, `docs/RBAC.md` | `@platform/contracts`, `@platform/auth`, `@platform/governance` | MERGED | Domain now re-exports canonical `TenantContext`; auth and governance tests validate permission and tenant boundaries. | OIDC production settings. |
| Project 2 agent roster and registry | `config/agent-registry.json`, `docs/agents/*` | `packages/registry`, `packages/agent-runtime` | MERGED | Canonical registry loaders and agent-runtime tests own execution contracts. | Provider/model credentials and durable execution. |
| Project 2 orchestrator and marketing workflow | `lib/orchestrator.ts`, `lib/workflows/*`, `docs/ORCHESTRATOR.md` | `packages/workflow-runtime`, `packages/marketing-os-core` | REPLACED | One workflow abstraction and a compatibility-only Marketing OS execution package. | Temporal adapter plus durable API query/read model. |
| AI core and provider use | `lib/ai.ts`, AI core reference docs | `packages/agent-runtime`, `packages/ai-gateway` | MERGED | Agent execution keeps policy, artifact and provenance boundaries. | Configured AI provider. |
| Tool permissions and external side effects | `lib/tools/*`, AI tool governance docs | `packages/tool-gateway` | MERGED | Tool-gateway tests require capability, permission and approved approval id. | Concrete external tool adapters. |
| Context builder, memory and knowledge/RAG | `lib/context-builder.ts`, architecture docs | `packages/context-engine`, `packages/db` knowledge tables | MERGED | Canonical context builder and RLS-protected knowledge migration source. | Object storage, embeddings and a real retriever. |
| CRM, lead scoring, sales forecast and proposals | CRM/Sales reference docs | `packages/sales-intelligence`, canonical contracts/persistence | MERGED | Deterministic scoring/forecast tests and canonical tables; no Prisma runtime. | CRM data ingestion/API composition. |
| Company and ICP intelligence | Project 2 business-intelligence material | `packages/company-intelligence`, `@platform/contracts` | MERGED | Duplicate profile/assessment shapes were reconciled to contracts; migration and persistence use the same model. | Controlled rollout of changed historical migration defaults. |
| Market intelligence | market research agent and analytics docs | `packages/market-intelligence` | MERGED | Canonical evidence-bearing snapshots and persistence tests. | Research data connectors. |
| Strategy intelligence | marketing strategist material | `packages/strategy-intelligence` | MERGED | Canonical strategy contracts and approval-aware workflow boundaries. | API composition and human approvals at runtime. |
| Customer Success and CFO | customer-success-cfo docs | `packages/customer-success-intelligence`, `packages/cfo-intelligence` | MERGED | Health/profitability/scenario logic is deterministic and tested. | CFO forecasting is not implemented; persistent/API composition is pending. |
| Analytics, attribution and experiments | `analytics/*` reference docs | `packages/measurement-engine` | MERGED | Provenance statuses, weighted pipeline, chronological ordinal time-decay and experiment limits are tested. | Event ingestion and statistical test implementation if required. |
| Billing, entitlements and admin hardening | `v2/*`, `v2.1/*` reference docs | `packages/billing-entitlements`, `packages/governance`, persistence | MERGED | Integer minor-unit schema, atomic usage SQL, governance and auth tests. | Authoritative subscription adapter, PostgreSQL concurrency verification, payment provider. |
| Automation | automation agent/reference docs | `packages/automation-engine` | MERGED | Canonical definitions/execution contracts and tests. | Trigger scheduler and durable workflow binding. |
| Marketing execution agents | campaign/content/creative/SEO docs | `packages/marketing-execution`, `packages/agent-runtime` | MERGED | Artifact validation, approval bindings and publish-readiness tests keep publishing behind Tool Gateway. | External publishing adapters and API composition. |
| Business mentor | `agents/ai-business-mentor.md` | `packages/business-mentor` | MERGED | Advisory-only, evidence/confidence and handoff tests own this behavior. | LLM localization/provider integration; Arabic output is not deterministic. |
| RESTORED-BACKUP and duplicate Project 2 runtime | residual-source scans | none | REJECTED | No active source dependency found; only provenance/docs searches may mention Project 2 paths. | None. |

## Company/ICP boundary

`CompanyEvidence`, `CompanyIntelligenceProfile`, and `ICPAssessment` are
canonical `@platform/contracts` types. They describe evidence-backed company
assessment and a deterministic fit result. The advanced `ICPProfile` and
`Account` runtime contracts remain separate: they define executable ICP criteria
and account state. This preserves the distinction without inventing buyer roles,
ownership, or evidence.

## Reconciliation update

| Capability | Canonical disposition | Repository evidence | Remaining dependency |
| --- | --- | --- | --- |
| CFO forecasting | MERGED | Deterministic period forecast contracts, tests and snapshot persistence. | PostgreSQL application only. |
| Billing authority | MERGED | Subscription/plan/override/usage adapter derives quota before atomic reservation. | PostgreSQL concurrency and payment provider. |
| Tenant DB scope | MERGED | API/worker transaction façades invoke local tenant scope with structural tests. | PostgreSQL RLS verification. |
| Durable workflow reads | MERGED | Injectable in-memory/Temporal runtime and query selection; API reads query boundary. | Temporal service/read model deployment. |
| Product UX composition | MERGED | 23 typed product routes with permission-aware state adapters. | Tenant records and external sources. |
