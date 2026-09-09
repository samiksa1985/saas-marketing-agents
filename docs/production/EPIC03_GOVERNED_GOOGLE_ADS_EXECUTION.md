# EPIC-03: Governed Google Ads Execution

## Status

**Repository implementation: complete for the governed mock/dry-run vertical slice.**

**Real Google Ads provider readiness: NOT VERIFIED.** No Google credentials were
used, no Google Ads API call was made, no provider sandbox was contacted, and no
live mutation was performed while implementing this work.

## Architecture and lifecycle

The canonical flow is:

```text
recommendation/proposal
  -> simulation
  -> authoritative entitlement and budget decision
  -> tenant policy decision
  -> durable approval request
  -> executor-only dispatch capability
  -> provider execution
  -> independent provider read-back verification
  -> tenant-scoped evidence and durable workflow outbox
```

`ExternalMarketingActionProposal` is provider-neutral. It holds the tenant,
organization, actor, agent/workflow/recommendation correlation, provider target,
reasoning, evidence, estimate, policy context, idempotency key, expiry, and
rollback-before state. It deliberately has no credential field or execution
method. Google Ads is represented by supported existing-campaign mutations:
pause/enable, budget, target CPA, and target ROAS.

`GovernedExternalActionExecutor` is the only mutation orchestration path. It
requires a simulation, rechecks authoritative billing/budget and policy directly
before execution, validates the durable approval immediately before the provider
boundary, persists every decision/result as sanitized evidence, then reads the
provider again to verify the requested state. Mismatch or partial verification is
not reported as verified and becomes `ROLLBACK_REQUIRED`. A rollback is a new
proposal that follows the same chain.

The executor passes the provider an opaque runtime dispatch capability. The
Google gateway verifies that capability before it will dispatch; a fabricated
`EXECUTING` action object from a controller, agent, workflow payload, or provider
caller is rejected. This is in addition to RBAC, tenant matching, approval, and
policy gates; it is not a replacement for them.

For an ambiguous provider timeout, the executor does not blindly call mutate a
second time. It first uses the provider read-back/reconciliation boundary. A
confirmed idempotency record or matching observed state proceeds directly to
independent verification. An inconclusive result is persisted as
`PROVIDER_OUTCOME_UNCERTAIN` and automated retry is blocked until a later
read-back can resolve it.

## Provider boundary and modes

The Google-specific code is isolated in `@platform/tool-gateway`. Its trust
metadata states provider, publisher, tool/version, write classification,
credential requirement, destination, permissions, and risk level for a future
registry/trust gateway.

| Mode | Behavior |
| --- | --- |
| `DISABLED` (default) | Simulation and execution fail closed. |
| `DRY_RUN` | Executes the governed lifecycle without a provider mutation; verification records the dry-run result. |
| `MOCK` | Deterministic test-only campaign reads, mutations, retries/timeouts, and read-back verification. Production configuration rejects this mode. |
| `REAL` | Uses the EPIC-04 REST provider adapter. It remains fail-closed unless valid secret resolution, an approved numeric customer ID, and an explicit numeric sandbox allowlist are present; mutation additionally requires `GOOGLE_ADS_EXECUTION_ENABLED=true`. |

Credential names are documented in `.env.example` and
`docs/final/ENVIRONMENT_VARIABLES.md`. The resolver is inside the provider
boundary. Diagnostics report only missing variable *names*; values are never
placed in action proposals, agent output, workflow payloads, evidence, logs, or
database records.

`GoogleAdsCredentialResolver` is the narrow provider-specific secret boundary.
The environment resolver is the local implementation; a future Core secret
adapter may implement the same boundary without moving Google Ads credential
semantics or secrets into action data.

## Durability, tenancy, idempotency, and concurrency

Forward migration `0022_governed_external_marketing_actions.sql` adds
`external_action_policies`, its append-only revision audit,
`external_marketing_actions`, append-only action evidence, and a durable
workflow-outbox table. All five tables have tenant RLS policies based on the
verified transaction-local `app.tenant_id` convention. The local policy source
contains provider enablement/mode, target allow/deny lists, spend ceilings,
confidence/evidence/approval controls, kill switch, dry-run constraint, actor
audit fields, and a monotonic version. The evaluated policy identity and version
are retained with the action decision. Missing, disabled, or killed policy
remains deny-by-default.

Policy administration is a separate guarded surface: `GET
/marketing-os/external-action-policies` requires `security_policy:read`, and
`PUT /marketing-os/external-action-policies/:provider` requires
`security_policy:manage`. Marketing/workflow permissions alone cannot enable a
provider or change a kill switch. An action-specific policy approver role is
checked again before the existing Phase-1 durable approval can be decided.

The outbox is not a second workflow engine. `VERIFIED`, `FAILED`, `REJECTED`,
`CANCELLED`, `ROLLBACK_REQUIRED`, and `ROLLED_BACK` each enqueue a tenant-scoped,
idempotent continuation event. The current persistent outcome store lists
pending work and acknowledges delivery replay-safely; the canonical workflow
runtime remains the eventual consumer.

The provider receives a stable idempotency key. A retry is not a direct replay:
the action transitions from `FAILED` to `APPROVED`, then re-enters budget,
policy, durable-approval, dispatch, and verification checks. The mock explicitly
covers a timeout after a mutation and returns the original idempotent provider
result on retry. The persistent store provides database uniqueness and optimistic
version checks; no process-local store is used in API composition.

The 0022 rehearsal applied the complete journal through 0022 on real disposable
PostgreSQL and passed fail-closed verification. It proved policy revision audit,
RLS, missing-context denial, restart-safe outbox acknowledgement, proposal
replay, and a two-worker active-target conflict: `workers=2`, `attempts=2`,
`successes=1`, `conflicts=1`, `unexpectedDuplicates=0`. See
`EPIC03_POSTGRESQL_EVIDENCE.md` for bounded real evidence.

## API and approval behavior

The guarded API routes are limited to proposal, simulation, approval request,
approval decision through the existing durable approval service, execution,
rollback proposal, action read, and evidence read. There is no direct
`/google-ads/change-budget` route. Controllers receive the application service,
not a Google provider or credential resolver. RBAC checks distinguish marketing,
workflow, integration, approval, artifact-read, and audit-read operations.

Existing durable approval states (`pending`, approved/approved-with-conditions,
rejected, expired) are mapped to action state. Rejected or expired approval turns
the action into `REJECTED`; provider failures become `FAILED`; verified execution
is separately recorded. Restart recovery uses persistent action and durable
approval repositories in API composition.

`workflowRunId` is persisted as correlation. The durable outbox now records the
workflow-continuation event, but connecting a deployed worker/runtime consumer
and operational telemetry remains a separate production integration gate.

## Tests and evidence scope

Repository tests cover proposal validation, simulation, budget/policy allow and
deny, kill switch, mandatory durable approval, rejected approval, missing tenant,
tenant isolation, evidence redaction, duplicate approval request, idempotent
replay, target conflict, timeout/retry, dry-run-only policy blocking a live
gateway, mock read/mutate/verify, provider disabled, timeout-after-mutation, and
fabricated-dispatch rejection. The normal test runner may be unavailable in the
sandbox because `tsx` fails during OS user lookup with `uv_os_get_passwd ENOMEM`;
when that occurs, compiled Node test output is used and reported explicitly.

## Remaining real-provider gates

Before enabling a sandbox mutation, inject credentials from a managed secret
store, approve least-privilege test accounts, complete the isolated read-only
and mutation rehearsal, and connect outbox delivery to the deployed workflow
runtime with observability, rate handling, and an exercised disable/rollback
runbook. Completing EPIC-03/04 code readiness does not claim cloud deployment,
payment-provider, Google Ads live, or full commercial production readiness.
