# Phase 2 Runtime Architecture

> **Status:** Architecture specification only. No production runtime exists in this repository.
>
> **Business context source:** The runtime consumes the existing Agent Intelligence Layer: 71 specialist agents, 13 Saudi B2B customer-acquisition workstreams, workstream contracts, the canonical dependency graph, handoff protocols, acceptance gates, human approval gates, and `[NEEDS INPUT]` discipline.
>
> **Technical decision boundary:** This document proposes runtime responsibilities and interfaces. It does not select a framework, cloud, database, queue, AI provider, integration vendor, or deployment topology. Those choices are marked `[ARCHITECTURE DECISION REQUIRED]`.

## 1. Architectural Principles

1. **Intelligence before execution:** Existing repository artifacts define agent responsibilities, workstream behavior, handoffs, gates, and evidence boundaries. Runtime code orchestrates and records them; it does not silently rewrite them.
2. **Evidence-bounded operation:** Unknown business facts remain `[NEEDS INPUT]`. The runtime must prevent unsupported claims, fabricated customer data, pricing, market statistics, proof, or performance claims from being promoted to approved output.
3. **Explicit state transitions:** Work progresses through declared workstream stages, handoffs, acceptance gates, approvals, repairs, and terminal outcomes. No implicit “done” state.
4. **Human accountability:** Human approval is required wherever the intelligence layer declares it, especially for public claims, legal/privacy decisions, language review, commercial scope, launch, and continuation.
5. **Tenant isolation by construction:** Every runtime object and event is tenant-scoped. Cross-tenant reads, writes, prompts, artifacts, and logs are denied by default.
6. **Provider neutrality:** AI providers, tools, storage, queues, and integrations are replaceable behind adapters. Provider behavior is not business truth.
7. **Auditability:** Every material decision, handoff, approval, repair, tool call, AI generation, and state change is attributable and replayable.
8. **Idempotent orchestration:** Retries must not duplicate work, sends, approvals, artifacts, or downstream side effects.
9. **Narrow MVP:** Implement one complete vertical slice of the existing Saudi B2B acquisition workflow before broadening the runtime surface.
10. **Fail closed for risk:** Missing consent, unresolved legal/privacy questions, unsupported claims, missing approval, tenant ambiguity, or failed validation blocks the affected action.

## 2. Boundary Between Agent Intelligence Layer and Runtime

### Agent Intelligence Layer

The repository is the source of declarative intelligence:

- Agent definitions and specialist responsibilities.
- Workstream objectives, inputs, owners, outputs, handoffs, acceptance criteria, first-14-day actions, and `[NEEDS INPUT]` registers.
- Canonical dependency graph and execution order.
- CATALYST phases: Discovery, Strategy, Foundation, Build, Launch, Optimize.
- Handoff specification and feedback-loop conventions.
- Evidence labels, approval boundaries, failure/repair behavior, and business funnel terminology.

### Runtime

The runtime is responsible for:

- Loading and versioning intelligence artifacts.
- Resolving a workflow against a tenant, engagement, workstream, and input artifacts.
- Scheduling executable tasks in dependency order.
- Calling agents, tools, and AI providers through controlled adapters.
- Persisting workflow state, artifacts, handoffs, approvals, events, retries, and errors.
- Enforcing tenant, authorization, consent, validation, and approval boundaries.
- Presenting blocked work and `[NEEDS INPUT]` items to humans.

The runtime must not infer missing business facts, invent approvals, replace the declared dependency graph with hidden routing logic, or treat model output as approved evidence.

`[ARCHITECTURE DECISION REQUIRED: declarative artifact format and loader strategy, such as Markdown parsing, structured companion manifests, or a versioned registry format]`.

## 3. Agent Registry

The Agent Registry is the runtime's versioned index of the repository's 71 specialist agents. It references, rather than duplicates, each agent definition.

Minimum fields:

| Field | Requirement |
|---|---|
| `agent_id` | Stable runtime identifier mapped to the repository agent. |
| `name` / `specialty` | Repository terminology and specialist scope. |
| `source_path` | Existing repository path and source revision. |
| `category` | Existing CATALYST discipline/category where available. |
| `capabilities` | Declared responsibilities, not inferred tool access. |
| `input_contract` | Required inputs and `[NEEDS INPUT]` conditions. |
| `output_contract` | Expected artifacts and acceptance criteria. |
| `approval_requirements` | Declared human approvals or `[NEEDS INPUT]`. |
| `active` / `version` | Registry lifecycle state and source version. |

The registry must distinguish a specialist that can produce an artifact from a specialist authorized to approve it. A model provider is not an agent identity.

`[ARCHITECTURE DECISION REQUIRED: whether registry entries are generated at build time, loaded at runtime, or maintained in a separate versioned manifest]`.

## 4. Workstream Registry

The Workstream Registry is the runtime index of the 13 existing workstreams. The canonical source is [dependency-graph.md](../../strategy/orchestration/dependency-graph.md); each workstream file remains authoritative for its own contract.

Minimum fields:

- `workstream_id` from `01` through `13`.
- Name, source path, source revision, owner declaration, objective, input references, output definitions, and acceptance criteria.
- Declared upstream and downstream references.
- Blocking and optional dependencies.
- Human approval gates.
- `[NEEDS INPUT]` dependencies and current resolution status.
- CATALYST phase mapping where explicitly available.

The runtime must reject a registry entry that points to a missing source artifact unless the contract explicitly records the reference as `[NEEDS INPUT]`.

## 5. Artifact Registry

The Artifact Registry records every input, output, handoff packet, decision record, approval record, validation report, repair revision, and evidence register item.

Minimum fields:

| Field | Description |
|---|---|
| `artifact_id` | Stable identifier. |
| `tenant_id` / `engagement_id` | Isolation and business context boundary. |
| `artifact_type` | Workstream output, source context, handoff, claim/proof, decision, approval, validation, or repair. |
| `source_path` / `source_revision` | Repository source when applicable. |
| `artifact_version` | Immutable version identifier. |
| `status` | Draft, Directional, Hypothesis, Blocked, Approved, Approved with conditions, Expired, Superseded, or `[NEEDS INPUT]`. |
| `evidence_status` | Observed, Reported, Inferred, Hypothesis, Unknown, or Approved proof where applicable. |
| `owner_id` / `approver_id` | Responsible producer and decision authority. |
| `dependencies` | Artifact IDs and dependency status. |
| `content_pointer` | Encrypted object/content location; not necessarily inline database content. |
| `created_at` / `updated_at` / `expires_at` | Lifecycle and review controls. |

Artifacts are immutable after publication. A repair creates a new version linked to the prior version; it does not erase the audit trail.

## 6. Dependency Graph Consumption

At workflow creation, the runtime loads the canonical dependency graph and resolves the selected workstream subset against the tenant's available inputs.

Resolution steps:

1. Select graph version and source revision.
2. Validate that every referenced workstream file exists or is explicitly marked `[NEEDS INPUT]`.
3. Create a dependency snapshot for the engagement; later graph changes do not silently mutate a running workflow.
4. Classify each edge as blocking, optional, informational, or unresolved `[NEEDS INPUT]` according to the canonical specification.
5. Create runnable tasks only when all blocking dependencies are accepted and required approvals are present.
6. Keep optional dependencies visible without blocking unless a workstream contract promotes them to required for the selected path.
7. Recalculate downstream readiness after each artifact acceptance, repair, approval, or dependency resolution.

`[ARCHITECTURE DECISION REQUIRED: graph representation and cycle detection implementation]`.

## 7. Workflow Execution Model

A workflow is a tenant-scoped execution of one engagement against a selected workstream graph.

```text
Workflow
  -> Workstream run
    -> Task
      -> Agent execution
        -> Tool/provider calls
          -> Artifact and event records
      -> Validation
      -> Handoff
      -> Human approval, if required
    -> Gate decision
  -> Continuation, repair, pause, or terminal decision
```

The scheduler should support:

- Dependency-aware parallel tasks.
- Sequential handoffs where an output blocks the next task.
- Continuous integration of analytics and QA signals.
- Explicit pause, resume, cancel, retry, repair, and stop actions.
- Human work queues for approvals and unresolved `[NEEDS INPUT]` items.
- Tenant-configured timeouts and escalation policies, subject to platform defaults.

`[ARCHITECTURE DECISION REQUIRED: synchronous API execution versus durable job/queue execution; recommended runtime property is durable asynchronous execution for agent and tool tasks]`.

## 8. Agent Execution Lifecycle

Each execution follows a durable state machine:

1. `created`: task exists with a dependency snapshot.
2. `ready`: blocking inputs and permissions are satisfied.
3. `claimed`: an agent execution lease is acquired.
4. `running`: the agent receives a scoped prompt/context and may create proposed artifacts.
5. `awaiting_tool`: execution is waiting on an approved tool/provider adapter.
6. `awaiting_validation`: output exists but has not passed automated or specialist validation.
7. `awaiting_human`: a declared human approval is required.
8. `accepted`: output and handoff are accepted.
9. `blocked`: missing input, failed gate, policy issue, or unresolved dependency.
10. `repair_required`: a specific defect was returned to the producer.
11. `retryable_failure`: execution may retry under policy.
12. `failed`: retry budget exhausted or non-retryable failure recorded.
13. `cancelled` / `superseded`: execution is no longer current.

Each transition requires an event, actor, reason, timestamp, and idempotency key. An agent may propose an artifact; it cannot self-approve a human gate.

## 9. State Management

State is split by responsibility:

- **Definition state:** agent/workstream/graph source revisions and registry versions.
- **Engagement state:** tenant, engagement, selected graph snapshot, objective, scope, and client context.
- **Execution state:** task status, dependency readiness, leases, attempts, and deadlines.
- **Artifact state:** immutable versions, evidence status, validation, approval, and supersession.
- **Handoff state:** sender, recipient, packet, acceptance/rejection, defect, and feedback date.
- **Human decision state:** approval request, decision, conditions, expiry, and approver.
- **Measurement state:** account IDs, funnel stages, events, source taxonomy, cohorts, and data-quality status as defined by Workstream 11.
- **Audit state:** append-only event history and actor attribution.

`[ARCHITECTURE DECISION REQUIRED: relational database, document database, or hybrid persistence model]`. The MVP should use one transactional source of truth for workflow state and an object store or equivalent for large artifacts, subject to selection.

## 10. Handoff Mechanism

Handoffs implement [Handoff Protocols](../../strategy/coordination/handoff-protocols.md) and the receiving workstream's declared contract.

A handoff packet contains:

- From/to workstream and owner.
- Engagement, task, artifact, and source revisions.
- Date, CATALYST phase, priority, and dependency level.
- Executive summary and decision required.
- Input artifact references and limitations.
- Expected output, acceptance criteria, due date, and owner.
- Context, decisions, assumptions, risks, and constraints.
- Blocking/optional dependencies and `[NEEDS INPUT]` items.
- Required approval and feedback date.

The receiving owner must `accept`, `reject`, or `block` the handoff. Rejection requires a structured defect. Acceptance advances only the declared downstream tasks. Handoffs are versioned and idempotent.

## 11. Validation and Repair Loop

Validation occurs at four layers:

1. **Schema validation:** required artifact fields, source references, status values, tenant scope, and version metadata.
2. **Contract validation:** workstream objective, input/output contract, handoff fields, acceptance criteria, and dependency readiness.
3. **Evidence/policy validation:** `[NEEDS INPUT]` markers, claims/proof status, consent/suppression, language review, data/AI controls, and public-use restrictions.
4. **Human validation:** specialist review, qualified legal/privacy review, commercial approval, language approval, or executive gate as declared.

Repair behavior:

- The validator records a defect against the artifact version and task.
- The runtime marks the affected task/artifact `repair_required` or `blocked`.
- The producer receives the defect, evidence, owner, due date, and acceptance rule.
- A repair creates a new artifact revision and new validation attempt.
- Downstream work remains blocked until the repaired handoff is accepted.
- Unresolvable work is parked, retired, or stopped with a recorded reason and reconsideration condition.

The runtime must never “repair” missing facts by generating a plausible replacement.

## 12. Human Approval Gates

Human gates are derived from existing workstream contracts and must remain explicit:

- Positioning/public-use approval by the designated executive sponsor `[NEEDS INPUT]`.
- Message, capability, proof/permission, legal/QA, and surface-owner approval before public claims.
- Qualified Saudi Arabic review for customer-facing Arabic; legal/privacy review for relevant wording.
- Channel legality, consent, privacy, and suppression decisions by qualified owners `[NEEDS INPUT]`.
- Email sending/deliverability readiness.
- Sales proposal or paid sprint approval by the commercial owner, with Delivery, Finance, and Legal/Privacy inputs.
- Measurement definition and source-system owner acceptance.
- Campaign scope, budget, launch, and continuation decisions by the client sponsor `[NEEDS INPUT]`.
- QA/Compliance launch readiness approval.

Approval records must include approver identity, role, scope, artifact versions, decision, conditions, expiry/review date, timestamp, and reason. Silence is not approval.

## 13. Tool/Integration Abstraction

Tools are invoked through a capability-based adapter interface, not directly from agent prompts.

An adapter declares:

- `tool_id`, version, provider, capabilities, tenant availability, and environment.
- Input/output schema and data classification.
- Required scopes and authorization owner.
- Rate limits, timeout, retry policy, and idempotency behavior.
- Audit/redaction policy and retention.
- Failure mapping and human escalation path.

Potential capability classes are derived from existing artifacts: repository/artifact storage, account/CRM records, email/ESP, analytics/event capture, search/web access, publishing/CMS, sales workflow, finance/reconciliation, consent/suppression, and AI providers. No specific vendor integration is established by the repository.

`[ARCHITECTURE DECISION REQUIRED: first integration set, adapter protocol, secret manager, OAuth strategy, and webhook/event ingestion approach]`.

## 14. Tenant Isolation Requirements

Every request, job, prompt context, artifact, tool credential, event, approval, and log must carry a tenant boundary.

Requirements:

- Authorize `tenant_id` at API, service, repository, queue, tool, and artifact layers.
- Prevent cross-tenant retrieval in prompts, vector/search indexes, caches, logs, and analytics.
- Scope encryption keys, secrets, data retention, exports, deletion, and backups by tenant policy.
- Treat tenant-provided brand context, customer/prospect data, suppression records, and proof as confidential tenant data.
- Make cross-tenant aggregation opt-in, anonymized, and approved; default is prohibited.
- Record tenant and engagement context in every audit event.
- Test tenant isolation with negative authorization cases before MVP release.

`[ARCHITECTURE DECISION REQUIRED: shared schema with row-level security, schema-per-tenant, database-per-tenant, or hybrid isolation model]`.

## 15. Audit/Event Logging

Use an append-only event log for material runtime actions. Events should include:

- `event_id`, `tenant_id`, `engagement_id`, `workflow_id`, `task_id`, `artifact_id` where relevant.
- Event type, actor type/id, source service, correlation ID, idempotency key, timestamp, and schema version.
- Prior/new state or decision, reason, dependency snapshot, approval context, and error details.
- Data classification and redaction status.

Minimum event families:

- Registry and graph loaded/versioned.
- Workflow/task created, scheduled, claimed, started, paused, resumed, retried, cancelled, failed, repaired, or accepted.
- Tool/provider invoked, returned, timed out, or was denied.
- Artifact created, validated, approved, rejected, superseded, expired, or deleted under policy.
- Handoff sent, accepted, rejected, or blocked.
- Human approval requested, granted, denied, expired, or revoked.
- Consent/suppression decision and propagation result.
- Gate passed, conditionally passed, held, or failed.

Do not log raw secrets, credentials, unrestricted contact lists, private account research, or unnecessary prompt data. `[ARCHITECTURE DECISION REQUIRED: event store, retention schedule, immutable storage, and audit export format]`.

## 16. Retry/Idempotency Requirements

- Every workflow command, task attempt, handoff, approval action, tool call, event write, and external side effect receives an idempotency key.
- Task leases expire and can be safely reclaimed by one worker.
- Retries use bounded attempts, exponential backoff, jitter, and error classification.
- Retry only transient failures; do not retry policy denials, missing approvals, invalid inputs, or deterministic contract failures.
- External sends, uploads, CRM mutations, and payment/revenue records require provider-specific idempotency or an outbox/confirmation protocol.
- Artifact creation is content/version aware; a retry must not create duplicate current outputs.
- At-least-once event delivery must be deduplicated by consumer; exactly-once behavior is not assumed.
- Human approvals are not automatically retried or reissued without preserving the prior request and expiry.

`[ARCHITECTURE DECISION REQUIRED: queue semantics, retry budgets, dead-letter handling, and outbox implementation]`.

## 17. Failure Handling

Failure classes and runtime behavior:

| Failure | Runtime behavior |
|---|---|
| Missing `[NEEDS INPUT]` | Block the narrowest dependent task; create a human resolution item; do not infer. |
| Contract/schema failure | Reject artifact or handoff; return field-level defects to producer. |
| Validation/policy failure | Block public use, send, upload, or launch; preserve evidence and route to QA/Legal/Privacy. |
| Human approval timeout | Hold or escalate according to declared SLA; never treat timeout as approval. |
| Tool/provider timeout | Retry if transient and idempotent; otherwise pause task and expose provider failure. |
| AI provider refusal or unsafe output | Record refusal/safety event; do not route unsafe output downstream; request human repair or alternate approved provider. |
| Data/identity/reconciliation failure | Mark affected measurements provisional; freeze interpretation and route to Analytics/Ops. |
| Tenant authorization failure | Deny request, emit security event, and reveal no cross-tenant data. |
| Dependency graph/version conflict | Preserve workflow snapshot; require explicit migration or restart decision `[ARCHITECTURE DECISION REQUIRED]`. |
| Scope or capacity change | Route to Campaign Project Management change control; no silent scope expansion. |
| Critical live issue | Pause affected activity, preserve evidence, escalate to qualified owners, and require written restart clearance. |

## 18. Security Boundaries

- API authentication and tenant-scoped authorization are mandatory for every runtime operation.
- Agent prompts receive only the minimum authorized context for the task and tenant.
- Secrets and provider credentials are held outside artifacts, prompts, logs, and source-controlled Markdown.
- Tool adapters enforce allowlists, scopes, egress restrictions, data classification, and human approval for sensitive actions.
- Customer/prospect records, consent/suppression data, private account research, and confidential proof are restricted operational data.
- Public artifacts may contain only approved claims, proof, language, disclosures, and links.
- AI-generated output is untrusted until validated against evidence, capability, policy, and approval controls.
- Admin, agent, human approver, and service identities require separate roles and least privilege.
- Security events include unauthorized access, data leakage, prompt injection, unsafe output, credential exposure, and cross-tenant access attempts.
- Backups, exports, deletion, retention, incident response, and regional processing require explicit policy.

`[ARCHITECTURE DECISION REQUIRED: identity provider, authorization model, encryption/key-management service, network boundary, secrets manager, and security testing standard]`.

## 19. AI Provider Abstraction

The runtime uses an `AIProvider` interface so agent execution is independent of a specific model vendor.

Minimum interface capabilities:

- Generate structured output against a declared schema.
- Stream or poll long-running generation where supported.
- Return provider/model/version, token or usage metadata where available, safety/refusal status, and correlation ID.
- Support tenant/provider policy, model allowlists, context limits, timeout, retry, and cancellation.
- Preserve input artifact references and evidence labels without treating generated text as proof.
- Support redaction and no-training/no-retention policy where available; record the actual provider policy state.
- Permit deterministic validation and human review before artifact publication or tool execution.

Provider selection must consider data handling, geographic processing, reliability, cost controls, quality, structured-output support, and tenant policy.

`[ARCHITECTURE DECISION REQUIRED: initial AI provider(s), model policy, routing/fallback strategy, prompt/version registry, evaluation harness, and spend limits]`.

## 20. MVP Vertical Slice

The MVP should prove one complete, auditable path to a first paid engagement without implementing every channel or every agent.

**Proposed slice:**

1. Tenant creates an engagement using the existing Saudi GTM context.
2. Runtime loads the dependency graph and starts Workstream 12 scope/control state.
3. Workstream 01 produces or imports a capacity-sized account set with owner, trigger, source/date, tier, suppression state, and next milestone.
4. Workstreams 02-04 produce a directional positioning/message package with evidence status and `[NEEDS INPUT]` markers preserved.
5. Workstream 08 creates one trigger-led outbound sequence and seller handoff packet; Workstream 09 may support approved follow-up/nurture only if permission and deliverability inputs are resolved.
6. Workstream 10 runs discovery, qualification, proposal/pilot preparation, and sales-to-delivery handoff.
7. Workstream 11 records account stages, handoffs, source fields, and data-quality status.
8. Workstream 13 validates claims, consent/suppression, data/AI controls, language, technical readiness, and launch approval.
9. Workstream 12 records the gate and continuation decision.

MVP exclusions: broad multi-channel activation, autonomous sending, unapproved integrations, cross-tenant learning, automated legal interpretation, guaranteed outcomes, and production-scale optimization.

`[ARCHITECTURE DECISION REQUIRED: exact MVP channel, first tenant onboarding path, operational user roles, and whether live external sends are in MVP or simulation/manual approval only]`.

## 21. Proposed Backend Architecture

A modular backend should separate:

- **API layer:** tenant/workflow/task/artifact/handoff/approval endpoints.
- **Orchestrator:** dependency resolution, scheduler, state transitions, gate enforcement, and repair routing.
- **Agent runner:** scoped context assembly, agent invocation, structured output parsing, and artifact proposal.
- **Validation service:** schema, contract, evidence, policy, language-review status, and acceptance checks.
- **Human approval service:** approval inbox, conditions, expiry, escalation, and decision audit.
- **Tool gateway:** capability adapters, authorization, rate limits, idempotency, and side-effect controls.
- **AI gateway:** provider abstraction, model policy, usage accounting, safety/refusal handling, and prompt versions.
- **Artifact service:** immutable versioning, content pointers, evidence status, and access control.
- **Event/audit service:** append-only event capture, correlation, query, and export.
- **Notification service:** human work queues and declared escalation channels `[ARCHITECTURE DECISION REQUIRED]`.
- **Scheduler/worker layer:** durable jobs, leases, retries, dead-letter handling, and concurrency limits.

This is a logical architecture, not a selected implementation stack.

`[ARCHITECTURE DECISION REQUIRED: language/runtime framework, service boundaries, deployment model, queue, object storage, and observability stack]`.

## 22. Proposed Database Entities

Minimum logical entities:

- `Tenant`, `TenantMember`, `Role`, `Permission`.
- `AgentDefinition`, `AgentVersion`, `AgentCapability`.
- `WorkstreamDefinition`, `WorkstreamVersion`, `DependencyEdge`, `GateDefinition`.
- `Engagement`, `Workflow`, `WorkflowGraphSnapshot`, `WorkflowRun`.
- `Task`, `TaskAttempt`, `TaskDependency`, `ExecutionLease`.
- `Artifact`, `ArtifactVersion`, `ArtifactDependency`, `ArtifactValidation`.
- `Handoff`, `HandoffItem`, `HandoffDecision`, `HandoffFeedback`.
- `ApprovalRequest`, `ApprovalDecision`, `ApprovalCondition`.
- `ToolDefinition`, `ToolConnection`, `ToolInvocation`, `ExternalSideEffect`.
- `AIProvider`, `ModelVersion`, `AIInvocation`, `PromptVersion`, `SafetyResult`.
- `Account`, `Person`, `Opportunity`, `FunnelStageEvent`, `SuppressionRecord`, `ConsentRecord` where the MVP stores operational measurement data.
- `Campaign`, `SourceRecord`, `Experiment`, `Cohort` where required by Workstream 11.
- `ValidationIssue`, `RepairAttempt`, `DecisionRecord`, `ChangeRequest`, `RiskIssue`.
- `AuditEvent`, `EventSchema`, `DataRetentionPolicy`.

All tenant-owned entities require `tenant_id`; immutable history requires version/event records rather than destructive updates.

`[ARCHITECTURE DECISION REQUIRED: exact schema, tenancy partitioning, event-store strategy, migration tooling, and whether CRM/account entities are owned by this runtime or referenced from an external system]`.

## 23. API Boundaries

The API should expose business capabilities, not provider-specific internals.

### Control plane

- `POST /tenants`, `GET /tenants/{tenant_id}`.
- `POST /engagements`, `GET /engagements/{engagement_id}`.
- `POST /workflows`, `GET /workflows/{workflow_id}`.
- `POST /workflows/{workflow_id}/start`, `/pause`, `/resume`, `/cancel`.
- `GET /workflows/{workflow_id}/readiness`.

### Registry and graph

- `GET /agents`, `GET /agents/{agent_id}`.
- `GET /workstreams`, `GET /workstreams/{workstream_id}`.
- `GET /graphs/{graph_version}`.
- `POST /workflows/{workflow_id}/graph-snapshot`.

### Execution and artifacts

- `GET /tasks`, `POST /tasks/{task_id}/retry`, `/repair`, `/cancel`.
- `GET /artifacts`, `GET /artifacts/{artifact_id}`, `POST /artifacts/{artifact_id}/validate`.
- `GET /handoffs`, `POST /handoffs/{handoff_id}/accept`, `/reject`, `/block`.
- `GET /approvals`, `POST /approvals/{approval_id}/decide`.

### Measurement and operations

- `POST /events` for validated event ingestion.
- `GET /workflows/{workflow_id}/audit-events`.
- `GET /workflows/{workflow_id}/metrics`.
- `GET /issues`, `POST /issues/{issue_id}/resolve`.

### Adapter boundaries

Tool, AI provider, CRM, ESP, paid-platform, and notification adapters must not be directly exposed as arbitrary user-controlled endpoints. They are invoked through authorized runtime commands with tenant policy and idempotency keys.

`[ARCHITECTURE DECISION REQUIRED: REST, GraphQL, RPC, event-only command API, authentication protocol, API versioning, pagination, and webhook signatures]`.

## 24. Phase 2 Implementation Order

1. **Confirm architecture decisions:** runtime language/framework, deployment, persistence, queue, identity, tenancy, artifact storage, AI provider policy, and first tool scope. Record decisions as ADRs. `[ARCHITECTURE DECISION REQUIRED]`.
2. **Define runtime contracts:** structured registry schema, graph snapshot schema, task state machine, artifact schema, handoff packet, approval record, event schema, and idempotency rules.
3. **Build the control plane:** tenant, engagement, workflow, graph loading, dependency readiness, task lifecycle, pause/resume, and audit events.
4. **Build artifact and handoff services:** immutable versions, validation status, acceptance/rejection/blocking, repair revisions, and feedback.
5. **Build human approval queues:** workstream/surface-specific gates, conditions, expiry, escalation, and audit history.
6. **Build the AI gateway:** provider interface, structured output, prompt versioning, safety/refusal capture, usage policy, and mocked provider for tests.
7. **Build one tool gateway adapter:** exact adapter `[ARCHITECTURE DECISION REQUIRED]`; begin with a non-destructive or simulated capability before side effects.
8. **Implement the MVP vertical slice:** 01 -> 02 -> 03 -> 04 -> 08 -> 10 -> 11 -> 13, coordinated by 12, with 09 only when permission/deliverability are resolved.
9. **Add tenant/security controls:** authorization tests, data classification, secret handling, prompt-context filtering, audit export, deletion/retention behavior, and cross-tenant negative tests.
10. **Validate failure behavior:** dependency blocks, missing `[NEEDS INPUT]`, rejected handoff, approval timeout, retry/idempotency, provider refusal, data-quality failure, tenant denial, and repair/re-run.
11. **Operate a manual-approval pilot:** no autonomous external sends or uploads until the declared human gates, consent/suppression, QA, and rollback controls pass.
12. **Measure and decide:** use Workstream 11's account-based stages and maturity rules; Workstream 12 records the MVP continuation decision; feed validated learning back into the Agent Intelligence Layer without modifying it implicitly.

The first implementation milestone is not “all agents are runnable.” It is a tenant-isolated, auditable workflow that can load the canonical graph, execute a bounded set of workstreams, produce versioned artifacts, require human approval, repair rejected work, and preserve every unresolved `[NEEDS INPUT]` item.
