# EPIC-02 — Persistent Marketing OS Runtime

## Before

`MarketingOsController` constructed its own in-memory memory repository,
knowledge retriever, workflow runtime, context builder, graph map, and an
execution service backed by a process-local `Map`. Generated plans and
execution bindings disappeared on process restart, and run reads reached the
concrete in-memory runtime.

## After

- `MarketingOsController` authenticates, checks a supplied-plan tenant boundary,
  and delegates to `MarketingOsApplicationService`.
- Nest composes one `WorkflowRuntimeSelection` and shares it with
  `WorkflowApiService` and Marketing OS. Production cannot select a non-durable
  provider, and Temporal selection still fails closed without adapter plus read
  model.
- `MarketingOSExecutionService` accepts `WorkflowRuntime`,
  `WorkflowRuntimeQuery`, a workflow-start coordinator, and a
  `MarketingOSExecutionRecordRepository`. It has no in-memory default and no
  process-local execution map.
- `MarketingOSPlanStore` is now a tenant-scoped plan repository. In durable
  mode it uses `ApiTenantDatabase` transactions, persists the Commander plan,
  context, acquisition snapshot, and readiness snapshot, and looks up by the
  stable application `plan_id`.
- `PersistentMarketingOSExecutionRecordRepository` persists only the execution
  binding: tenant, plan, engagement, locale, idempotency key, workflow ID,
  approval ID, status, approval state, reasons, and timestamps. Workflow state
  remains owned by the selected workflow query/read model.
- `GET /marketing-os/runs/:planId` reads workflow, tasks, artifacts, and audits
  through `WorkflowRuntimeQuery`.
- In-memory plan/memory/knowledge/execution adapters are constructed only by the
  explicit development composition path, never by the controller or production
  composition.

## Durable schema ownership

Forward migration `0020_persistent_marketing_os_runtime.sql` adds:

- `marketing_os_plan_snapshots.plan_id` with tenant/plan uniqueness;
- `acquisition` snapshot storage;
- `marketing_os_execution_records` with tenant/plan and tenant/idempotency
  uniqueness, timestamps, and RLS policy.

It does not edit historical migrations. It was executed successfully as part
of the final disposable PostgreSQL Phase 1 baseline; see
`PHASE1_POSTGRES_FINAL_EVIDENCE.md`.

## Governance and safety

Preparation remains idempotent for a tenant, plan, and idempotency key. It
creates the workflow and then delegates approval creation to the canonical
`ApprovalApiService`; before an approval decision, `start()` returns
`APPROVAL_REQUIRED`. After approval, start calls the selected runtime's
provider-neutral `start()` operation.

The durable record preserves the approval ID across Marketing OS service
reconstruction. EPIC-02.5 extends the same canonical `ApprovalApiService` with
a tenant-bound durable repository in production/durable composition, so a
fresh API service instance reads approval state from PostgreSQL instead of a
process-local map. See `EPIC025_DURABLE_GOVERNANCE_KNOWLEDGE.md`.

The persistent knowledge adapter is selected in durable mode. Its
provider-neutral embedding contract requires external or local provider
identity plus model/version provenance and fails closed when no real provider
is composed; it never silently substitutes in-memory retrieval.

## Validation evidence

- **STATIC VERIFIED:** TypeScript checks for Marketing OS core, persistence,
  and API passed after this change.
- **EXECUTED VERIFIED:** direct Node test execution passed: Core 6/6,
  persistence 39/39, API 45/45, DB 14/14.
- `tsx` package scripts are **NOT RUN to completion** in the sandbox because
  Node's `os.userInfo()` fails before test discovery (`uv_os_get_passwd`,
  `ENOMEM`). Direct Node execution used the TypeScript-emitted test files and
  produced the counts above.
- Real PostgreSQL persistence/RLS proof is **PASS** in the repository-owned
  disposable baseline; see `PHASE1_POSTGRES_FINAL_EVIDENCE.md`.

## Remaining production blockers

1. Supply a real persistent embedding provider to durable application
   composition.
2. Configure and operationally test the selected embedding provider before
   production plan generation.
