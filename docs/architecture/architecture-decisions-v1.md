# Architecture Decisions v1

> **Status:** Approved technical baseline for the full commercial AI Customer Acquisition Platform.
>
> **Scope:** Resolves the technical choices marked `[ARCHITECTURE DECISION REQUIRED]` in [Phase 2 Runtime Architecture](phase-2-runtime-architecture.md).
>
> **Business source of truth:** The Agent Intelligence Layer remains authoritative for business behavior: 71 specialist agents, 13 workstreams, the canonical dependency graph, handoff protocols, acceptance gates, human approval gates, failure/repair behavior, and `[NEEDS INPUT]` discipline. This document does not modify or reinterpret those artifacts.
>
> **No application code:** These are architecture decisions, not an implementation.

## Decision Record Format

Each decision states:

- **Chosen decision:** the baseline to implement.
- **Rationale:** why it fits the full commercial platform and existing runtime architecture.
- **Alternatives rejected:** options not selected for this baseline and why.
- **Future migration trigger:** evidence that would justify revisiting the choice.

Technical choices are platform decisions. They do not create customer data, pricing, market claims, case studies, performance claims, legal conclusions, or integrations that are absent from the Agent Intelligence Layer.

## 1. Backend Language / Runtime

**Chosen decision:** TypeScript on Node.js 22 LTS, with strict compiler settings and native ESM where supported by the selected framework.

**Rationale:** One typed language can be shared across backend contracts, frontend contracts, registry schemas, validation utilities, and SDKs. Node.js provides a mature asynchronous execution model for API requests, workflow commands, streaming AI responses, and integration webhooks. TypeScript makes the registry, handoff, artifact, event, and state-machine contracts explicit.

**Alternatives rejected:** Python was not selected as the primary runtime because the platform needs one strongly typed contract language across the control plane and web client. Go was not selected because it would create a second primary language before scale requires it. Bun and Deno were not selected as the production baseline because the runtime and library compatibility surface is less conservative for this platform.

**Future migration trigger:** A measured workload or team constraint shows that a specific bounded subsystem requires another runtime for a material reason, such as specialized data processing. That subsystem must remain behind an API or worker contract rather than changing the platform default.

## 2. Backend Framework

**Chosen decision:** NestJS, pinned to a supported major release compatible with Node.js 22, using modules for identity, tenancy, registry, workflow commands, artifacts, handoffs, approvals, integrations, billing, and audit.

**Rationale:** NestJS supplies a structured modular boundary for a large commercial platform without forcing microservices. Dependency injection, guards, pipes, interceptors, OpenAPI integration, testing support, and background-worker integration fit the runtime architecture's control-plane responsibilities. The modular monolith remains deployable as one application while modules can later be extracted behind stable contracts.

**Alternatives rejected:** Express or Fastify alone were rejected as the architectural default because they provide less application structure and leave cross-cutting boundaries to convention. A microservice framework was rejected because the repository has no runtime and the first scaling problem is coordination correctness, not service count.

**Future migration trigger:** A module has an independently measurable scaling, availability, security, or deployment requirement that cannot be met in the modular monolith. Extraction must preserve API, event, artifact, and workflow contracts.

## 3. Frontend Framework

**Chosen decision:** Next.js App Router with React and TypeScript, using server-rendered pages where appropriate and client components for interactive workflow, artifact, approval, and operational views.

**Rationale:** The platform needs a commercial control-plane UI, not a marketing-only site: tenant administration, workflow status, dependency readiness, handoff inboxes, approval queues, artifact history, audit views, and issue repair. Next.js provides routing, server-side data access patterns, streaming/loading boundaries, and a single TypeScript contract with the backend. The frontend remains an API consumer and does not own workflow decisions.

**Alternatives rejected:** A client-only React/Vite application was rejected as the default because authenticated operational views benefit from server-side routing and controlled data access. A separate frontend framework was rejected to avoid a second UI stack before product requirements justify it.

**Future migration trigger:** The UI requires a separate deployment, rendering model, or product surface with materially different performance/security requirements. It must continue using the versioned API and shared domain contracts.

## 4. Database

**Chosen decision:** PostgreSQL 16 or newer supported major release as the transactional system of record.

**Rationale:** The platform requires relational integrity across tenants, engagements, workflows, graph snapshots, tasks, artifacts, handoffs, approvals, events, billing entitlements, and measurement records. PostgreSQL supports transactions, JSONB for evolving registry payloads, row-level security, full-text capabilities, advisory locking, partitioning, and mature backup tooling. It also supports an append-only event/audit design without introducing a second database at the start.

**Alternatives rejected:** A document database was rejected as the primary store because dependency, approval, handoff, and billing relationships need transactional integrity. A graph database was rejected because graph traversal is bounded by the dependency snapshot and can be represented relationally. A distributed SQL database was rejected until geographic distribution or scale requires it.

**Future migration trigger:** A measured workload requires distributed writes, geographic data placement beyond the selected PostgreSQL deployment, or a query pattern that cannot be served by PostgreSQL with indexing/partitioning/read replicas.

## 5. ORM / Data Access

**Chosen decision:** Drizzle ORM with SQL-first access, typed schema definitions, explicit transactions, and a repository/service boundary around persistence.

**Rationale:** The platform has relational workflows, JSONB registry payloads, append-only events, row-level security, and reporting queries. Drizzle keeps SQL visible while providing TypeScript types and lightweight mapping. A repository boundary prevents ORM types from leaking into API or workflow contracts and preserves the option to use hand-written SQL for critical queries.

**Alternatives rejected:** Prisma was rejected for the baseline because the platform needs SQL-visible control over RLS, event partitions, locking, and reporting queries. TypeORM was rejected because its runtime behavior and abstraction surface can obscure query and migration behavior in a system where data correctness is central. Direct SQL everywhere was rejected because it would give up useful typed schema ergonomics.

**Future migration trigger:** Drizzle materially limits required PostgreSQL features, migration safety, query performance, or team delivery. The domain repository interfaces must make replacement local rather than cross-platform.

## 6. Migration System

**Chosen decision:** Drizzle Kit migrations, reviewed in pull requests, executed by a dedicated migration job before application rollout. Destructive migrations use expand-and-contract sequencing.

**Rationale:** Schema changes, RLS policies, indexes, partitions, constraints, and event schemas must be versioned alongside application code. A dedicated migration job prevents every application replica from racing to migrate. Expand-and-contract protects long-running workflow workers and supports rolling deployments.

**Alternatives rejected:** Ad hoc SQL run manually was rejected because it is not reproducible or auditable. ORM auto-sync was rejected for production. Flyway and Liquibase were rejected to avoid a second migration language and toolchain for a TypeScript platform.

**Future migration trigger:** Database operations require a polyglot migration platform, independent data engineering ownership, or a database beyond PostgreSQL. Migration files remain the authoritative history during transition.

## 7. Queue / Worker Architecture

**Chosen decision:** Temporal for durable workflow orchestration, with TypeScript workers deployed separately from the API process. Use PostgreSQL-backed application commands and an outbox for short-lived internal events; do not use a general-purpose queue as the workflow source of truth.

**Rationale:** Agent work includes long-running tasks, human approval waits, tool calls, retries, timers, repair loops, and dependency-aware execution. Temporal provides durable workflow state, activity retries, task queues, signals, timers, cancellation, and recovery from worker restarts. The modular monolith remains a codebase boundary while API, worker, and scheduler processes scale independently.

**Alternatives rejected:** Redis/BullMQ was rejected as the durable workflow authority because it would require rebuilding durable timers, human waits, replay, and workflow state semantics. Kafka was rejected as the primary workflow engine because an event log is not by itself a human-aware workflow runtime. Synchronous HTTP execution was rejected because it cannot safely hold agent and approval work.

**Future migration trigger:** Workflow volume, isolation, regional execution, or operational requirements justify multiple workflow domains or a separate orchestration platform. Workflow definitions and activity contracts must remain versioned and replay-safe.

## 8. Workflow Execution Model

**Chosen decision:** Durable, asynchronous, command-driven execution using Temporal workflows and activities. API requests create commands and return workflow/task identifiers; they do not execute agent work inline.

**Rationale:** The runtime architecture explicitly requires dependency-aware parallelism, sequential handoffs, pause/resume, human approval, retries, repair, and auditability. Temporal workflows own orchestration decisions; activities perform side effects and external calls. Each engagement receives an immutable graph snapshot so later repository changes do not silently alter a running workflow.

**Alternatives rejected:** Request/response execution was rejected for timeout, retry, and approval reasons. A database-only state machine was rejected as the sole mechanism because durable timers, worker recovery, and replay would need to be recreated. Fully autonomous agent routing was rejected because the dependency graph and approval gates are declarative controls.

**Future migration trigger:** A bounded workload proves that a simpler execution mode is sufficient without reducing durability, human approval, auditability, or repair behavior. Such a mode must remain an explicit workflow type.

## 9. API Style

**Chosen decision:** Versioned REST APIs documented with OpenAPI 3.1, with command endpoints for state changes and cursor-based pagination. Internal module calls use typed application services; external consumers do not call providers directly.

**Rationale:** REST is broadly interoperable for tenant administration, workflow control, artifact access, handoffs, approvals, integrations, billing, and operational dashboards. OpenAPI supports generated clients, contract tests, and external integration without exposing persistence details. Long-running commands return `202 Accepted` with a resource or operation identifier.

**Alternatives rejected:** GraphQL was rejected as the public default because workflow commands, authorization, audit, and cache behavior are clearer with resource-oriented REST. gRPC was rejected for browser and external partner compatibility. An event-only public API was rejected because users need discoverable control-plane resources.

**Future migration trigger:** A measured client or internal domain requires high-volume bidirectional streaming or a strongly typed internal RPC boundary. REST remains the external compatibility contract unless a new version is deliberately published.

## 10. Authentication

**Chosen decision:** OIDC/OAuth 2.1-compatible authentication with Authorization Code + PKCE for browser users, short-lived access tokens, rotating refresh tokens, and service-to-service workload identity. Use a managed OIDC provider initially behind an identity adapter.

**Rationale:** OIDC avoids coupling the platform to one identity vendor while supporting tenant users, invitations, MFA, passwordless or enterprise login options, and service identities. PKCE protects browser authorization flows. The adapter lets the platform preserve its internal user/tenant model if the provider changes.

**Alternatives rejected:** Building passwords, MFA, recovery, and identity federation in the application was rejected as unnecessary security risk. API keys as the primary user authentication method were rejected because they lack interactive identity, rotation, and scope semantics. Provider-specific SDK calls throughout the codebase were rejected.

**Future migration trigger:** Enterprise customers require a different federation protocol, regional identity hosting, customer-managed identity, or a dedicated identity deployment. The internal identity adapter and subject mapping remain stable.

## 11. Authorization / RBAC

**Chosen decision:** Hybrid authorization: coarse-grained RBAC plus tenant-scoped resource and policy checks. Roles are platform-defined and tenant-configurable within bounded permissions; every sensitive action also checks resource ownership, workflow state, approval state, and tenant policy.

Initial role families reflect the runtime architecture and existing approval boundaries: platform administrator, tenant administrator, engagement owner, workstream operator, agent/service identity, reviewer/approver, sales/commercial operator, finance/billing operator, and read-only auditor. Exact tenant-facing role labels require product validation `[ARCHITECTURE DECISION REQUIRED]`.

**Rationale:** RBAC makes common UI/API authorization understandable, while resource and state checks prevent a role from bypassing a workstream gate or accessing another engagement. Approval authority must be distinct from artifact production where the intelligence layer requires it.

**Alternatives rejected:** Role-only checks were rejected because they cannot express tenant, engagement, artifact, and approval conditions. Fully custom policy language from the beginning was rejected as unnecessary complexity; policy checks can be introduced behind a service boundary.

**Future migration trigger:** Customers require attribute-based policies, delegated administration, fine-grained external authorization, or policy decision points shared across products. Preserve authorization decisions as auditable records.

## 12. Multi-Tenancy Model

**Chosen decision:** Shared PostgreSQL database and shared schema with mandatory `tenant_id`, PostgreSQL row-level security, application authorization, tenant-scoped object prefixes, and tenant-scoped encryption/key policy. Use separate Temporal namespaces or equivalent logical isolation per environment, with tenant identity carried in workflow context.

**Rationale:** Shared schema is operationally efficient for a full commercial platform while RLS provides a database-level defense against application mistakes. Application checks remain necessary for business authorization. Tenant IDs are required in all tenant-owned tables, events, artifacts, prompts, caches, queues, and external side-effect records.

**Alternatives rejected:** Database-per-tenant was rejected as the default because it increases provisioning, migration, backup, and operational complexity before isolation requirements demand it. Schema-per-tenant was rejected for similar reasons. Application-only tenant filters were rejected because they lack a database enforcement layer.

**Future migration trigger:** A tenant requires dedicated residency, encryption keys, network isolation, noisy-neighbor protection, contractual isolation, or workload scale that shared infrastructure cannot meet. Support a tiered dedicated-tenant deployment without changing domain contracts.

## 13. Artifact Storage

**Chosen decision:** S3-compatible object storage for artifact payloads, encrypted at rest, with PostgreSQL metadata, immutable artifact versions, tenant/engagement prefixes, signed access URLs, lifecycle policies, and versioning. Use S3 as the initial production implementation; keep an object-storage adapter.

**Rationale:** Workstream outputs, handoff packets, reports, source documents, and generated files can exceed relational row sizes and need immutable versioning and controlled access. PostgreSQL remains the source of metadata, status, dependency, approval, and audit state.

**Alternatives rejected:** Storing all artifact bodies in PostgreSQL was rejected for large files and retention cost. Local filesystem storage was rejected for multi-instance deployment and recovery. A vendor-specific document platform was rejected as the system of record.

**Future migration trigger:** Residency, cost, retrieval, immutability, or customer-managed-key requirements require another object store. The artifact content-pointer contract must remain storage-neutral.

## 14. Event / Audit Architecture

**Chosen decision:** Transactional outbox in PostgreSQL plus append-only audit/event tables, consumed by internal workers and exported through OpenTelemetry/log pipelines. Partition high-volume event tables by time and tenant access policy. Add Kafka-compatible streaming only when throughput or external event consumers justify it.

**Rationale:** The platform needs atomic recording of state changes and reliable publication of events without introducing a distributed broker before it is necessary. The outbox prevents a database transaction from succeeding while its event publication is lost. Audit records preserve actor, tenant, prior/new state, reason, approval context, and correlation IDs.

**Alternatives rejected:** Direct fire-and-forget event publication was rejected because it loses audit reliability. Kafka as the first dependency was rejected because the initial platform needs transactional correctness more than high-throughput streaming. Logs alone were rejected because logs are not a domain audit trail.

**Future migration trigger:** Event volume, replay, analytics consumers, cross-service fan-out, or retention requirements exceed PostgreSQL event infrastructure. Keep event schemas versioned and publish through an adapter.

## 15. AI Provider Abstraction

**Chosen decision:** A provider-neutral `AIProvider` interface in the AI Gateway, with structured-output support, streaming where available, usage metadata, safety/refusal results, model identity, policy metadata, and tenant/provider configuration. Initial implementations target OpenAI-compatible and Anthropic-compatible adapters, each separately configurable and tested.

**Rationale:** The Agent Intelligence Layer must remain independent of model vendors. Two initial adapters reduce single-provider dependency while the interface keeps agent prompts, validation, artifacts, and workflow state provider-neutral. Generated content remains untrusted until validation and approval.

**Alternatives rejected:** A single provider SDK embedded in agents was rejected because it couples business execution to vendor APIs. A self-hosted model as the initial default was rejected because operating model serving, capacity, evaluation, and safety infrastructure would distract from the platform control plane. A generic gateway with no provider-specific policy metadata was rejected because data handling and refusal behavior must be auditable.

**Future migration trigger:** A provider fails quality, policy, availability, region, cost, or data-handling requirements; a self-hosted model meets a documented workload and governance case; or a third adapter provides materially better capability. Provider adapters must pass the same contract/evaluation suite.

## 16. Model Routing Policy

**Chosen decision:** Policy-based routing, not autonomous model selection. Each agent/workstream task resolves a tenant-approved model policy containing primary model, permitted fallback models, data classification, maximum spend, context limit, latency class, and required structured-output capability.

Fallback is allowed only for classified transient failure or explicit policy route. A fallback must preserve the task contract and be recorded. No provider may receive tenant data unless tenant and data policy permit it. Human approval and validation requirements never change based on model choice.

**Rationale:** Deterministic policy is explainable and auditable. It avoids silently routing sensitive data or changing output behavior through opaque optimization. It also permits future cost/quality optimization after comparable evaluation data exists.

**Alternatives rejected:** Per-request autonomous routing was rejected because it makes data handling, cost, and output comparability difficult to audit. Single-model pinning was rejected because it creates avoidable availability and capability concentration.

**Future migration trigger:** A measured evaluation set supports automated routing with documented quality, safety, cost, and tenant-policy constraints. Routing must remain policy-bounded and replayable.

## 17. Prompt / Version Management

**Chosen decision:** Prompts are versioned source artifacts in a dedicated runtime prompt package, reviewed in Git, hashed, and registered in PostgreSQL at deployment. Each AI invocation stores prompt version, agent version, graph snapshot, model/provider, input artifact references, and validation result. Tenant overrides are structured configuration, not arbitrary prompt replacement, unless explicitly approved.

**Rationale:** Prompt behavior is part of runtime behavior and must be reproducible, reviewable, rollbackable, and linked to the Agent Intelligence Layer source. The database registry makes deployed versions queryable without duplicating the repository's intelligence.

**Alternatives rejected:** Prompts stored only in database text were rejected because review and rollback become less transparent. Prompts embedded in code were rejected because they are harder to version independently. Unbounded tenant prompt editing was rejected because it can bypass evidence and approval controls.

**Future migration trigger:** Prompt experiments require a dedicated evaluation service, remote registry, or tenant-specific prompt governance. The immutable prompt hash and invocation record remain mandatory.

## 18. Tool Gateway

**Chosen decision:** A centralized Tool Gateway module with capability-based adapters, policy checks, schema validation, tenant authorization, rate limits, idempotency, human approval for side effects, and redacted audit events. Agents never receive arbitrary network or credential access.

Tool categories follow existing runtime artifacts: repository/artifact storage, CRM/account records, email/ESP, analytics/event capture, web/search, CMS/publishing, sales workflow, finance/reconciliation, consent/suppression, and AI providers. Initial tool actions are read-only or simulated until the relevant approval and QA gates pass.

**Rationale:** Centralization protects tenant boundaries, makes integrations replaceable, and prevents an agent prompt from becoming an unrestricted execution environment. Side effects such as sends, uploads, CRM mutations, or billing changes require explicit policies and idempotency.

**Alternatives rejected:** Direct tool calls from agents were rejected for security and audit reasons. A general-purpose “execute code” tool was rejected. Separate bespoke integration logic inside every workstream was rejected because it would duplicate policy and credentials.

**Future migration trigger:** Tool volume, ownership, or scale requires a separately deployed integration service. The capability, authorization, and audit contracts remain stable.

## 19. Integration Model

**Chosen decision:** Adapter-based integrations using OAuth 2.1 where supported, signed webhooks for inbound events, polling with cursors where webhooks are unavailable, and an outbox/inbox pattern for reliable delivery. Every integration has a canonical internal object/event mapping and a reconciliation job.

Integrations are optional capabilities per tenant and engagement. A missing integration is represented as unavailable or `[NEEDS INPUT]`; the runtime does not invent connectivity. External systems remain authoritative for their own records where declared, while the platform stores references, sync state, and audit history.

**Rationale:** This model supports CRM, ESP, analytics, publishing, finance, consent, and partner systems without coupling the domain model to one vendor. Webhooks reduce polling delay; inbox deduplication and reconciliation handle retries and drift.

**Alternatives rejected:** Direct vendor objects in the core domain were rejected for lock-in. One universal sync method was rejected because external systems differ. Real-time synchronization everywhere was rejected because it adds complexity where eventual consistency is sufficient.

**Future migration trigger:** A domain requires real-time guarantees, bidirectional conflict resolution, customer-managed connectors, or a dedicated integration platform. Keep adapter contracts and canonical internal events stable.

## 20. Secrets Management

**Chosen decision:** Managed cloud secrets manager for production credentials, with workload identity for runtime access and no long-lived credentials in source, images, Markdown, prompts, or logs. Use `.env.example` only for names and local-development values; local secrets remain untracked.

**Rationale:** The runtime will hold AI provider keys, OIDC credentials, database credentials, webhook signing secrets, billing keys, and integration tokens. Central rotation, access policy, audit, and environment separation are mandatory.

**Alternatives rejected:** Repository secrets or plaintext deployment variables were rejected. A self-built secrets service was rejected. Developer machine credentials shared across environments were rejected.

**Future migration trigger:** Deployment platform, residency, customer-managed keys, or security policy requires another secret manager. Application code must use a secrets-provider interface.

## 21. Observability

**Chosen decision:** OpenTelemetry for traces, metrics, and structured logs; Prometheus-compatible metrics; Grafana-compatible dashboards; and an error tracking service behind an adapter. Correlate API requests, Temporal workflows, tasks, agent executions, tool calls, AI invocations, artifacts, handoffs, approvals, and external webhooks.

Required operational signals include workflow/task latency, queue age, retries, failures, blocked `[NEEDS INPUT]` counts, approval age, handoff acceptance time, provider refusal/error rate, token/usage cost, tenant isolation errors, integration lag, event outbox backlog, and data-quality gate failures.

**Alternatives rejected:** Provider-specific metrics alone were rejected because they cannot correlate business workflow state. Logs without traces were rejected for multi-step agent execution. A custom metrics protocol was rejected.

**Future migration trigger:** Scale or compliance requires a different telemetry backend. OpenTelemetry instrumentation and semantic attributes remain portable.

## 22. Deployment Architecture

**Chosen decision:** Containerized modular monolith deployed on AWS ECS Fargate with separate API, Temporal worker, scheduler/maintenance, and migration task processes. Use managed PostgreSQL, S3, secrets manager, load balancing, and a managed OIDC provider. Temporal Cloud is the initial workflow service, accessed through the Temporal SDK and kept replaceable by an OSS-compatible deployment path.

**Rationale:** This supports a production-grade commercial platform without requiring Kubernetes operations on day one. API and workers can scale independently; managed stateful services reduce operational burden. The application remains a modular monolith in one repository and can later extract modules.

**Alternatives rejected:** Kubernetes was rejected as the initial deployment baseline because it adds operational overhead before workload evidence requires it. Serverless functions were rejected for long-running workers and workflow activity control. A single VM was rejected for isolation, scaling, and recovery. A fully managed proprietary application platform was rejected for portability.

**Future migration trigger:** Regional deployment, workload density, custom networking, cost, or service isolation requires Kubernetes or another platform. Containers, IaC, externalized state, and provider adapters keep migration feasible.

## 23. CI/CD

**Chosen decision:** GitHub Actions with pull-request checks, protected main branch, build/test/lint/security jobs, container image signing, Terraform plan/apply separation, database migration review, and progressive deployment to development, staging, and production.

Deployment order: validate source and contracts, build immutable images, run migrations in an explicit job, deploy API/workers compatibly, run smoke checks, then enable the release. Workflow and activity versioning must support in-flight workflow compatibility.

**Alternatives rejected:** Manual production deployment was rejected for auditability and repeatability. Direct deployment from developer machines was rejected. A separate CI vendor was rejected for the baseline because GitHub Actions matches the repository hosting and review model.

**Future migration trigger:** Compliance, scale, or enterprise delivery requires another CI control plane. Keep pipeline stages and signed artifacts portable.

## 24. Testing Strategy

**Chosen decision:** Layered testing with contract-first fixtures:

- Unit tests for domain rules, dependency readiness, state transitions, authorization, idempotency, and validation.
- Repository/integration tests against PostgreSQL, RLS, migrations, outbox, and artifact metadata.
- Temporal workflow tests with deterministic time, retries, signals, approval waits, cancellation, and replay compatibility.
- Adapter contract tests for AI providers, tools, identity, object storage, billing, and external integrations.
- API contract tests generated from OpenAPI.
- End-to-end tests for tenant onboarding, graph loading, workstream execution, handoff, approval, repair, and continuation decision.
- Security tests for cross-tenant access, prompt/data leakage, injection, secrets, webhook signatures, and privilege escalation.
- AI evaluation tests for structured output, evidence preservation, refusal behavior, citation/source references, and regression against approved fixtures. Evaluation fixtures contain no unapproved customer data.
- Load and resilience tests for queue depth, worker failure, provider timeout, event replay, and database failover.

**Rationale:** The largest risks are orchestration correctness, data isolation, approval bypass, and durable recovery, not only endpoint correctness.

**Alternatives rejected:** End-to-end-only testing was rejected because failures would be slow and hard to localize. Model-output spot checks alone were rejected because they cannot establish workflow or policy correctness. Performance testing only at launch was rejected.

**Future migration trigger:** A subsystem becomes independently deployed or regulated and requires a dedicated test program, while retaining contract and tenant-isolation suites.

## 25. Security Baseline

**Chosen decision:** Use OWASP ASVS Level 2 as the application baseline, threat modeling for each major capability, least privilege, secure headers, CSRF protection where cookie flows exist, strict input/schema validation, output encoding, rate limits, webhook signature verification, dependency/SAST/secret scanning, container scanning, encryption in transit and at rest, audit logging, and incident response.

AI-specific controls include prompt injection defenses, untrusted-output treatment, tool allowlists, data minimization, model policy enforcement, redaction, provider policy capture, and human approval for side effects. The platform must preserve the repository's prohibition on secrets and private operational data in prompts or public artifacts.

**Alternatives rejected:** “Provider security” alone was rejected because application tenant and workflow boundaries remain the platform's responsibility. A compliance certification claim was rejected because certification is not established by the repository. A minimal OWASP checklist without threat modeling was rejected for an agent/tool platform.

**Future migration trigger:** Customer or regulatory requirements require a higher assurance framework, independent audit, regional controls, or formal certification. The baseline remains the minimum until superseded by an approved security decision.

## 26. Billing Architecture

**Chosen decision:** Billing is an internal domain with provider adapters. Use Stripe Billing as the initial payment provider, while storing internal products, prices, subscriptions, entitlements, invoices, payment status, and provider references in PostgreSQL. Stripe webhooks are verified, idempotently processed, and reconciled.

Billing state controls platform entitlements, not the Agent Intelligence Layer's business claims. Prices, packages, terms, currencies, taxes, and commercial commitments remain `[NEEDS INPUT]` until supplied and approved by the commercial owner.

**Rationale:** A billing adapter permits a commercial subscription/product model without coupling workflow authorization to Stripe objects. Local state supports tenant entitlements, audit, reconciliation, and future provider replacement.

**Alternatives rejected:** Building payment processing was rejected for security, compliance, and operational risk. Provider objects as the only source of entitlement state were rejected. Billing directly inside workstream logic was rejected.

**Future migration trigger:** Saudi/local payment requirements, enterprise invoicing, customer procurement, regional tax needs, payment method coverage, or commercial scale require another provider or multiple providers. The internal billing domain and webhook contract remain stable.

## 27. Environment Strategy

**Chosen decision:** Separate development, staging, and production environments with separate databases, object-storage prefixes/buckets, secrets, identity clients, Temporal namespaces, telemetry, billing test/live modes, and integration credentials. No production data is copied into lower environments without an approved, redacted process.

**Rationale:** Tenant isolation and approval behavior must be tested without allowing development code or credentials to reach production. Staging must exercise migrations, workflow versioning, integrations, and human gates against safe fixtures.

**Alternatives rejected:** One shared environment was rejected for data leakage and deployment risk. A local/staging-only strategy was rejected because workflow and provider failures need production-like validation. Production credentials in staging were rejected.

**Future migration trigger:** Regional deployment, customer-dedicated environments, or compliance requires additional environment tiers. The environment contract must retain independent identities and secrets.

## 28. Local Development Strategy

**Chosen decision:** Docker Compose for PostgreSQL, object storage emulator, Temporal development server, mail catcher, local telemetry, and optional OIDC mock. Run the API, web client, workers, and migration commands with documented scripts. Provide deterministic fixtures derived from repository contracts, with no real customer/prospect data.

**Rationale:** Contributors need a full workflow loop locally: load registries, create a tenant, execute tasks, produce artifacts, wait for approval, repair a handoff, and inspect audit events. Local emulators avoid mandatory cloud accounts while preserving adapter contracts.

**Alternatives rejected:** Cloud-only development was rejected for iteration speed, cost, and data safety. A bespoke local platform was rejected; standard containers are easier to reproduce. Real credentials in local development were rejected.

**Future migration trigger:** Local startup becomes too slow or an integration cannot be emulated accurately. Keep a contract-test mode and a safe remote development environment rather than requiring real production access.

## 29. Data Retention / Deletion

**Chosen decision:** Retention is policy-driven, tenant-scoped, and legally configurable. Baseline platform defaults are:

- Prompt and model input/output payloads: 90 days unless the tenant policy requires less; store hashes, metadata, and artifact references longer where needed for audit.
- Draft and operational artifacts: 24 months after engagement closure unless a shorter tenant policy applies.
- Audit, approval, handoff, billing, and security events: 24 months minimum platform default, subject to legal/contractual requirements.
- Temporary files, caches, and signed URLs: shortest practical lifetime, with a maximum of 24 hours for signed download URLs unless a controlled workflow requires otherwise.
- Backups: governed by the backup schedule and not used as a reason to delay a deletion request beyond the documented recovery window.

Deletion is a workflow: verify tenant authority, create a deletion request, identify relational/object/event references, apply legal holds, delete or cryptographically render tenant content inaccessible, record a minimal deletion audit event, and verify propagation. Aggregated telemetry must be de-identified and must not retain tenant content.

**Rationale:** The platform handles potentially sensitive account, contact, suppression, proof, prompt, and workflow data. Explicit defaults prevent indefinite retention while allowing tenant and legal policy to control the final period.

**Alternatives rejected:** Indefinite retention was rejected for privacy and security risk. Immediate hard deletion of all events was rejected because it destroys required audit and incident evidence. A single global retention period was rejected because data classes differ.

**Future migration trigger:** Legal review, customer contracts, data residency, sector requirements, or observed storage/security risk require changed periods or tenant-specific schedules. Update policy and migration jobs through an ADR; do not silently change retention.

## 30. Backup / Recovery

**Chosen decision:** Managed PostgreSQL point-in-time recovery with daily snapshots, object-storage versioning and lifecycle protection, encrypted backups, tested restore procedures, and infrastructure/database definitions in version control. Initial service objectives are RPO 15 minutes for transactional state and RTO 4 hours for the platform, subject to validation before production commitments.

Recovery must cover database, artifact metadata, object content, workflow state, secrets references, registry versions, and audit events. Temporal workflow history and application state must be recoverable or restartable according to the selected Temporal deployment policy. Restore tests run at least quarterly and after material backup architecture changes.

**Rationale:** Durable workflows and approval/audit history are more important than only restoring API code. Point-in-time recovery protects against logical errors; versioned object storage protects artifact history; tested recovery prevents backup existence from being confused with recoverability.

**Alternatives rejected:** Backup-only without restore tests was rejected. Cross-region active/active was rejected as the initial topology because it adds consistency and operational complexity before regional requirements exist. Manual export scripts were rejected as the primary recovery mechanism.

**Future migration trigger:** Contractual RPO/RTO, regional disaster recovery, tenant-dedicated recovery, data residency, or measured outage risk requires cross-region replicas, active/passive failover, or a second recovery region.

## Cross-Decision Constraints

These constraints apply to every implementation decision:

- The Agent Intelligence Layer remains declarative and versioned. Runtime code may load it, validate it, snapshot it, and execute it; runtime code must not silently rewrite it.
- Every workflow is tenant-scoped and tied to a graph snapshot, source revisions, artifact versions, and approval state.
- `[NEEDS INPUT]` is a durable state, not a prompt to guess. Missing business evidence blocks only the narrowest affected work unless the dependency graph marks it as broader blocking.
- Agents propose work. Human approvers and declared owners approve work. The AI provider never becomes an approver.
- Public claims, customer proof, local relevance, pricing, legal/privacy statements, language approval, sending, uploads, and launch remain governed by existing workstream gates.
- External side effects require a tool adapter, authorization, idempotency key, audit event, and applicable human gate.
- All migrations, provider changes, prompt changes, graph changes, schema changes, and retention changes are versioned and reviewable.

## Decision Implementation Order

1. Record these decisions as the v1 baseline and create follow-up ADRs for unresolved product-specific role labels, tenant policy details, and integration scope.
2. Define TypeScript domain contracts for registries, graph snapshots, artifacts, tasks, handoffs, approvals, events, AI invocations, tools, and billing.
3. Establish PostgreSQL schema, RLS policies, Drizzle migrations, artifact metadata, and outbox/audit events.
4. Establish NestJS API modules and Next.js control-plane shell with OIDC authentication and tenant-scoped authorization.
5. Establish Temporal workflows/workers and implement graph snapshot, dependency readiness, task lifecycle, approval wait, retry, repair, and audit behavior.
6. Implement AI provider adapters, prompt/version registry, structured-output validation, and provider policy enforcement.
7. Implement Tool Gateway and integration adapter contracts before any side-effecting connector.
8. Implement billing, entitlements, environment separation, observability, security automation, and backup/recovery operations.
9. Execute the full workstream graph progressively, preserving all 13 workstream contracts and human gates rather than replacing them with application-specific shortcuts.
10. Run contract, tenant-isolation, workflow-replay, failure-injection, security, and restore tests before production onboarding.

## Open Follow-Up Decisions

The platform baseline is selected, but these product or operational decisions still require accountable owners and are not technical guesses:

- `[ARCHITECTURE DECISION REQUIRED: tenant-facing role names, approval delegation, and enterprise admin model]`.
- `[ARCHITECTURE DECISION REQUIRED: first production region and data-residency policy]`.
- `[ARCHITECTURE DECISION REQUIRED: live integration sequence and accountable owner for each connector]`.
- `[ARCHITECTURE DECISION REQUIRED: commercial billing products, currencies, tax treatment, invoice process, and payment terms]`.
- `[ARCHITECTURE DECISION REQUIRED: tenant-specific retention overrides and legal-hold process]`.
- `[ARCHITECTURE DECISION REQUIRED: production launch policy for external sends, uploads, and autonomous actions]`.
- `[ARCHITECTURE DECISION REQUIRED: support/SLA model, incident severity targets, and customer-facing status process]`.

These follow-up decisions do not authorize changing existing workstream content. They must be resolved through later architecture or product decision records.
