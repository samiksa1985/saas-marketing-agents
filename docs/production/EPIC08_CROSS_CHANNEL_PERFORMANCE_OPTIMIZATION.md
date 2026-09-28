# EPIC08 — Cross-Channel Performance Intelligence & Governed Optimization

## Scope and non-autonomy boundary

EPIC08 adds a provider-neutral intelligence layer above EPIC07 Unified Campaign
Orchestration. Its flow is deliberately bounded:

```text
Observe → normalize → attribute → diagnose → detect → recommend → simulate
→ existing policy/budget/approval/action pipeline → independent verification
→ measure outcome → tenant-scoped learning evidence
```

The layer has no provider SDK, credential resolver, gateway lookup, approval
authority, action executor, worker dispatch, or bypass endpoint. A
recommendation is not authorization or execution. The only consequential bridge
creates an existing `ExternalMarketingActionProposal`; the existing EPIC03–07
control plane retains entitlement, budget, policy, durable approval, outbox,
provider health and credential gates, execution enablement, independent
verification, evidence, audit, and governed rollback.

The defaults remain fail-closed:

```text
GOOGLE_ADS_EXECUTION_MODE=DISABLED
GOOGLE_ADS_EXECUTION_ENABLED=false
META_ADS_EXECUTION_MODE=DISABLED
META_ADS_EXECUTION_ENABLED=false
```

No provider connection or mutation is performed by EPIC08.

## Canonical performance semantics

`ProviderPerformanceObservationInput` is a read-only adapter boundary, not a
Google or Meta DTO. An explicit `ProviderPerformanceMetricMapping` converts
declared source keys to canonical identity, time, delivery, engagement, cost,
conversion, provenance, verification, freshness, completeness, confidence, and
normalization-version fields.

- `spendMinor` and `conversionValueMinor` are finite integer minor units; no
  authoritative monetary value uses floating point.
- Currency and currency scale travel with money. There is no inferred FX.
- Missing or unsupported metrics remain `UNKNOWN`; zero remains `0`; stale
  remains stale.
- Non-numeric, negative, or non-integer count/money telemetry is rejected and
  returned as a quarantine-safe normalization rejection rather than repaired.
- The tenant/provider/campaign/snapshot/mapping-version identity is deterministic
  and the database also enforces tenant idempotency.

Aggregation only produces blended totals/CTR/CPC/CPM/CPA/conversion rate/ROAS
when evidence is fresh, verified, complete for the requested metric, and
semantically comparable. Currency conflicts, incompatible conversion/value
semantics, stale telemetry, verification mismatch, and missing required metric
inputs are explicit reason codes; unsafe derived values remain `UNKNOWN`.

## Attribution, diagnostics, and anomalies

Attribution V1 records the chosen provider-reported, first-touch, last-touch,
assisted, or unattributed model, window, channel contributions, confidence,
evidence references, limitations, and unknowns. It explicitly does **not**
claim causal, multi-touch, MMM, incrementality, Meridian, GeoX, Robyn, or
PyMC-Marketing attribution. Those are future-compatible analytical contracts,
not integrations.

Deterministic diagnostics cover spend without conversions, rising CPA, falling
ROAS, CTR degradation, CPC/CPM inflation, conversion-rate degradation, budget
under-use/exhaustion, stale telemetry, verification mismatch, insufficient
evidence, and prior-window deterioration. Each includes an evidence set,
baseline, observed value, confidence, severity, reason codes, and timestamp.

Anomaly V1 uses a transparent rolling mean, percentage threshold, and standard
deviation check. It detects spend spikes/drops, CPC/CPA spikes, ROAS drops,
conversion collapse, and traffic anomalies only after a configurable minimum
sample size; it guards missing data, stale/non-comparable inputs, zero baselines,
and false precision.

## Recommendations, simulation, and budgets

The deterministic engine only emits a provider action when the existing
capability registry declares it. Unsupported actions fail closed. Every
recommendation has a stable ID, campaign/channel/provider scope, current and
proposed state, rationale, diagnostics/evidence, confidence, expected impact,
risk, reversibility, capability proof, expiration, and `requiresApproval: true`.
`OBSERVE_ONLY` and `REQUEST_MORE_EVIDENCE` remain non-consequential.

The persisted simulation is conservative: it records exact budget delta and
spend exposure in minor units, a performance range, downside/upside scenarios,
assumptions, limitations, evidence, and confidence. Zero-confidence evidence
cannot cross the proposal bridge.

`CrossChannelBudgetRecommendation` uses deterministic largest-remainder
allocation in exact minor units, validates a single currency, preserves the
existing unified-campaign total exactly, and marks every reallocation as
approval-required. A total-budget increase is not silently represented as a
rebalance and must be an explicit governed action.

## Outcomes, learning, persistence, and RLS

Only an action that the existing control plane reports as `VERIFIED` may be
measured. An `OptimizationOutcomeMeasurement` compares before/after windows and
classifies `IMPROVED`, `DEGRADED`, `NEUTRAL`, or `UNKNOWN`; it never claims
causality. The related `OptimizationLearningRecord` stores recommendation,
approval/execution state, measured outcome, tenant/campaign context, evidence,
confidence, and rule version. It is learning evidence, not unrestricted or
cross-tenant model training.

Forward-only migration `0025_cross_channel_performance_optimization` adds:

- `campaign_performance_observations` and `campaign_performance_aggregates`;
- `campaign_performance_diagnostics` and `campaign_performance_anomalies`;
- `campaign_optimization_recommendations` and `campaign_optimization_simulations`;
- `campaign_optimization_outcomes` and `campaign_optimization_learning`.

All eight have `tenant_id`, foreign keys, indexed tenant scope, timestamps, and
`USING` plus `WITH CHECK` RLS. Observation snapshots and recommendation/action
relationships have deterministic database uniqueness constraints. No credential
material is persisted.

## API and health gates

All `/campaigns/unified/:campaignId/performance/*` routes use the existing API
guard and authenticated tenant context. Reads require `artifact:read` (outcomes
and learning also require `audit:read`); telemetry ingestion and deterministic
recommendation generation require `marketing:admin`; proposal creation also
requires `workflow:execute`. The routes provide intelligence, diagnostics,
anomalies, recommendations, simulation, the governed-proposal bridge, outcomes,
and learning history. There is no EPIC08 execute route.

Provider unavailability, invalid credentials, stale telemetry, verification
mismatch, insufficient evidence, unsupported capability, or unknown campaign
state cannot progress a consequential change to execution. Read-only diagnosis
may still show the known limitation. Existing provider health/credential gates
are evaluated immediately before any existing control-plane execution.

## Future capability contracts

The core declares design-only, provider-neutral identifiers for CRM, lead
management, customer conversations, AI receptionist, reputation/reviews, local
presence, and multi-location growth. A future provider may represent Vendasta,
Dynamics 365, Salesforce, HubSpot, or a custom CRM without changing the core
optimization engine. EPIC08 does not implement a CRM, Vendasta, conversation,
receptionist, review, or location integration and does not move Growth-domain
IP to NAWA Core.

## Acceptance and readiness

Code-level coverage proves normalization/rejection/idempotency, exact money,
unknown handling, incompatible aggregation, attribution limits, diagnostics,
small-sample anomaly protection, capability rejection, exact rebalance,
simulation, governed proposal shape, no direct execution surface, outcomes,
learning isolation, API/RBAC, migration layout, and fail-closed evidence
verification. The Phase1 disposable PostgreSQL harness is extended to prove
the 0000–0025 chain, 0025 ledger/schema, eight-table RLS, non-owner tenant
isolation, idempotent observation concurrency, learning isolation, and fixture
cleanup.

**EPIC08 is CODE/DB READY PENDING A REAL DISPOSABLE POSTGRESQL 0025 RUN.**
Until the repository-owned runner and verifier persist a PASS result, no claim
is made about PostgreSQL migration success, live Google/Meta connectivity,
provider mutation, cloud deployment, or full product production readiness.
