# EPIC07 — Unified Campaign Orchestration

## Scope and safety boundary

EPIC07 adds provider-neutral, tenant-scoped campaign orchestration for
existing Google Ads and Meta Ads campaign resources. It creates durable
campaign intent, deterministic plans, governed-action proposals, read models,
and recommendations. It does **not** create provider campaign assets, send a
provider mutation, enable either provider, introduce a second approval/policy/
outbox system, or grant an agent authority to execute an action.

The effective defaults remain:

```text
GOOGLE_ADS_EXECUTION_MODE=DISABLED
GOOGLE_ADS_EXECUTION_ENABLED=false
META_ADS_EXECUTION_MODE=DISABLED
META_ADS_EXECUTION_ENABLED=false
```

`GOOGLE_ADS` and `META_ADS` are initial registrations, not a closed provider
set. A future provider supplies one gateway plus a declared capability and
budget-unit contract; it does not require a planner branch.

## Domain, lifecycle, planning, and budgets

`@platform/marketing-os-core` owns `UnifiedCampaign`, channel allocation,
campaign budget/target/schedule/references, execution plan/steps/outcomes,
performance snapshots, and recommendations. The Growth domain retains these
models because objective, campaign intelligence, allocation rationale,
marketing evidence, and provider campaign semantics are product IP.

Valid lifecycle transitions are explicit. The normal path is:

```text
DRAFT → PLANNED → SIMULATED → AWAITING_APPROVAL → APPROVED → EXECUTING
      → ACTIVE | PARTIALLY_ACTIVE | PAUSED | DEGRADED | FAILED
```

`COMPLETED` is terminal. Invalid state jumps fail closed. `SIMULATED` here is
the deterministic plan validation phase; each proposed channel action still
requires its existing provider-aware simulation before it can request approval
or execute.

The planner requires a positive integer-minor-unit budget, an explicit
minor-unit scale and ISO currency (including `SAR`), valid schedule, target
market/language, evidence, unique channels, and a complete allocation. It
supports fixed or percentage allocation but rejects mixed declarations on one
channel, over-allocation, incomplete allocation, invalid rounding, and unsafe
integer ranges. Largest-remainder rounding is deterministic by channel ID.
There is no implicit FX, fallback provider, or external provider call.

Provider budget semantics are declared data: Google currently accepts the
planner's major-unit value and Meta accepts its minor-unit value. Mixed-currency
performance is `UNKNOWN`, never converted from an inferred exchange rate.

## Governed channel decomposition and outcomes

`POST /campaigns/unified/:campaignId/submit` creates a workflow binding and
one `ExternalMarketingActionProposal` per channel. Every proposal is high-risk
and `approvalRequirement: REQUIRED`, carries allocation/capability evidence,
has a deterministic action/idempotency identity, and only references governed
rollback derivation.

The existing `/marketing-os/external-actions` control plane remains the only
place to simulate, authorize against billing/entitlement, evaluate policy,
request/decide durable approval, execute, independently verify, write evidence,
and process its durable outbox. EPIC07 has no unified execute endpoint and no
raw gateway or credential path.

When a channel is verified while another fails, is unavailable, mismatched, or
unknown, aggregate state is `DEGRADED`; it is never incorrectly `ACTIVE`.
Verified-plus-pending is `PARTIALLY_ACTIVE`; no verified channel with all
failed outcomes is `FAILED`; every intentionally paused channel is `PAUSED`.
Compensation creates idempotent references to the existing governed rollback
proposal path for verified steps only. It never performs a hidden or automatic
provider rollback.

## Persistence, evidence, observability, and APIs

Forward-only migration `0024_unified_campaign_orchestration` adds:

- `unified_campaigns` with tenant/idempotency uniqueness and lifecycle check;
- `unified_campaign_execution_steps` with one tenant/campaign/channel step;
- `unified_campaign_performance_snapshots`; and
- `unified_campaign_recommendations`.

Every table has mandatory `tenant_id` and `USING`/`WITH CHECK` RLS. It stores
no provider credential or raw credential response. Execution steps reference
the authoritative external-action record; EPIC05 operational/provider-health
signals remain the observability mechanism. Outcome aggregation surfaces
unavailable, mismatch, unknown, and partial channel states rather than hiding
them.

Snapshots retain provider/provenance/verification/freshness. Aggregation
returns `UNKNOWN` or `UNAVAILABLE` rather than inventing metrics. V1 creates
only deterministic, evidence-backed, approval-required recommendations (for
example `SHIFT_BUDGET`); recommendations have no execution capability.

All routes use the normal API guard and tenant context:

| Route | Required permission(s) | Effect |
| --- | --- | --- |
| `POST /campaigns/unified` | `marketing:admin`, `workflow:execute` | Creates durable intent only. |
| `POST /:id/plan` | `marketing:admin`, `workflow:execute` | Produces deterministic plan. |
| `POST /:id/simulate` | `marketing:admin` | Validates the deterministic plan only. |
| `POST /:id/submit` | `marketing:admin`, `workflow:execute` | Decomposes governed proposals; no dispatch. |
| `GET /:id`, `/performance`, `/recommendations` | `artifact:read` | Tenant-scoped read. |
| `GET /:id/execution` | `artifact:read`, `audit:read` | Aggregated governed outcome/evidence references. |

The workflow binding records create, validate, plan, simulate, governance,
channel execution, verification, aggregate outcome, performance observation,
and recommendation stages using the existing workflow abstraction. This is not
a claim that Temporal is deployed.

## Validation and readiness status

Code-level coverage includes validation/rounding, capability and entitlement
gates, deterministic planning, lifecycle aggregation, compensation,
tenant/idempotency behavior, normalized/stale/unknown performance,
recommendation non-execution, API/RBAC boundary, migration schema/RLS, and
Google/Meta/config regressions. The Phase-1 harness now contains a disposable
0024 migration, non-owner RLS, tenant isolation, concurrent idempotency,
ledger, and fixture-cleanup proof.

Run the disposable gate only from an operator terminal with Docker access:

```powershell
Set-Location C:\Users\MBUZZ\saas-marketing-agents
.\scripts\run-phase1-postgres-local.ps1
.\scripts\verify-phase1-postgres-evidence.ps1
```

EPIC07 is **CODE/DB READY PENDING A FRESH DISPOSABLE POSTGRESQL RESULT** until
those commands produce and verify a persisted `PASS` for migration 0024. It
does not claim live Google Ads, live Meta Ads, external provider connectivity,
provider mutation, cloud deployment, commercial production readiness, or a
production database migration.
