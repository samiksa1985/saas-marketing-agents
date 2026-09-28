# EPIC05 — External Action Reliability and Observability

## Scope and boundary

EPIC05 hardens the provider-neutral external-action platform. It does not enable Google Ads production execution, remove EPIC04 sandbox controls, introduce a raw mutation route, or persist OAuth credentials. `GOOGLE_ADS_EXECUTION_ENABLED` remains false unless an environment explicitly enables it; the governed gateway still enforces the configured approved sandbox customer and durable approval.

The append-only migration is `0023_external_action_reliability`. It owns one PostgreSQL `BEGIN`/`COMMIT` block and is sent intact over the canonical reserved-connection journal runner, so a partial schema change cannot be recorded as applied. Apply it using the normal repository migration process before deploying code that activates the new operations surface. This document is not evidence that the migration has been executed in a production database.

## Architecture

`external_action_workflow_outbox` remains the durable handoff from a terminal, governed action to workflow processing. The EPIC05 store adds a tenant-scoped claim lease, attempt timestamps, retry scheduling, sanitized failure fields, and a dead-letter state. `ExternalActionOutboxWorker` takes only an outbox delivery adapter and the event's existing idempotency key; it has no provider or credential-resolver dependency and cannot create a new provider mutation.

Operational state is tenant/RLS scoped in three tables:

- `external_provider_health`: provider reachability/circuit state;
- `external_provider_credential_health`: safe credential lifecycle outcome;
- `external_action_operational_events`: sanitized action/outbox event timings.

All rows retain tenant, provider, action/workflow correlation when applicable. No table accepts an access token, refresh token, client secret, developer token, or raw provider response.

## Outbox state machine

```text
PENDING --claim--> PROCESSING --ack owned lease--> DELIVERED
   ^                    |
   |                    +-- transient failure --> PENDING (next_attempt_at)
   |                    |
   |                    +-- final/non-retryable failure --> DEAD_LETTER
   +-- authorized replay from FAILED/DEAD_LETTER --------------------+

PROCESSING --lease expiry--> PENDING (safe recovery by a later worker)
```

The conditional claim transitions an eligible pending row or expired processing lease to `PROCESSING` and assigns a unique lease ID. A worker can acknowledge or record failure only with its owned lease. A second worker that loses the update does not deliver. The durable action's unique outbox idempotency key is passed to the consumer unchanged, so crash recovery is at-least-once transport with idempotent consumer semantics, rather than duplicate provider execution.

Default retry is exponential: 1s, 2s, 4s … capped at 15 minutes. A provider or consumer `Retry-After` value wins when longer. The default maximum is five claims; a non-retryable failure or exhausted attempts becomes `DEAD_LETTER` with a safe code/reason and timestamp. Recovery/replay preserves the original event, action, correlation, and idempotency identity.

## Provider health and mutation circuit breaker

Provider health states are `HEALTHY`, `DEGRADED`, `RATE_LIMITED`, `AUTH_FAILURE`, `UNAVAILABLE`, and `UNKNOWN`. The record tracks successes, failures, rolling failure count, cooldown, retry-after, and a recovery-probe lease. Provider calls that complete verification mark health healthy; classified failures update health without retaining response payloads.

The core governed executor checks the health gate immediately before its normal transition to `EXECUTING`. It never calls a raw transport on health rejection.

- `AUTH_FAILURE` blocks mutation until a safe credential outcome records a healthy provider state.
- `RATE_LIMITED`, `UNAVAILABLE`, and `DEGRADED` block during cooldown/retry.
- After cooldown, exactly one short recovery probe lease may proceed. Concurrent callers remain blocked.
- Simulation, verification, and unknown-outcome read-back remain independent read operations; this does not turn an unsafe mutation into a raw fallback.

Health/telemetry persistence failures do not hide an already-completed provider result. Conversely, inability to read the gate before mutation is fail-closed as `PROVIDER_HEALTH_STATE_UNAVAILABLE`.

## Credential lifecycle

Credential outcomes are `VALID`, `EXPIRING`, `EXPIRED`, `REVOKED`, `INVALID`, `MISSING`, and `UNKNOWN`. The lifecycle record contains only timestamps, rotation/disconnect markers, and safe error codes. Credentials remain in the configured environment/secret provider. Google OAuth `invalid_grant` maps to a sanitized `GOOGLE_ADS_CREDENTIAL_REVOKED` code, which becomes tenant-local `REVOKED` health; raw OAuth text is not stored or logged.

## Observability

The API records sanitized operational events for proposal, simulation, policy, approval request/decision latency, execution attempt, verification, mismatch, uncertainty, failure, rollback request, and outbox lifecycle. Event IDs are deterministic for action lifecycle events and random for repeated operational facts, allowing safe metric ingestion without action duplication. The Google adapter's existing write-only telemetry boundary remains valid and does not receive credentials or raw HTTP payloads.

## Operator APIs and recovery

All routes are protected by the normal API guard and tenant transaction scope:

- `GET /marketing-os/external-action-operations/summary`
- `GET /marketing-os/external-action-operations/outbox`
- `GET /marketing-os/external-action-operations/provider-health/:provider`
- `GET /marketing-os/external-action-operations/credential-health/:provider`

The read routes require `system_health:read`. The following recovery routes require both `security_policy:manage` and `integration:admin`:

- `POST /marketing-os/external-action-operations/outbox/:eventId/replay`
- `POST /marketing-os/external-action-operations/outbox/recover-expired-leases`

Replay only returns an existing workflow outbox message to `PENDING`; it does not call a provider or reconstruct a governed action. It is idempotent for an already pending/delivered item. Dead-letter inspection is through the outbox read route. Operators should first inspect the safe failure code, provider and credential health, restore the external dependency or rotate credentials in the secret provider, then replay the specific eligible event. Do not replay an action whose provider outcome is uncertain; use its independent read-back path.

The canonical local acceptance runner exercises the four read routes and the
tenant-scoped expired-lease recovery route using the explicit non-production
acceptance identity. That identity includes `system_health:read` only in the
local-auth provider; OIDC and production authentication are unchanged.

## Threat and safety model

- Tenant scoping is enforced both by application tenant transactions and RLS `USING`/`WITH CHECK` policies on every EPIC05 table.
- The worker receives a stable delivery event, never provider credentials or an arbitrary mutation payload.
- A lease owner cannot acknowledge another worker's processing event.
- Recovery is auditable and cannot bypass approval, entitlement, policy, or Google Ads sandbox execution gates.
- Sanitization removes common authorization/token/secret/password/API-key assignments from delivery diagnostics before persistence.

## Production readiness gates

Before declaring the EPIC05 reliability gate complete in an environment:

1. Apply and verify migration `0023`; prove the three RLS policies with a non-owner tenant database role.
2. Run the durable worker against a disposable database and assert concurrent claim, crash lease recovery, retry-after, dead-letter, replay, and tenant isolation behavior.
3. Exercise an authorized operator with no provider access and prove replay cannot create a provider mutation.
4. Exercise provider error classifications using a sandbox/test account only. Do not use production credentials or enable live Google Ads execution.
5. Monitor the operational events/health records with redaction checks before integrating a future metrics sink.

EPIC05 improves platform reliability; it is not a claim of full commercial or provider production readiness.

## Evidence status

The repository includes a fail-closed disposable PostgreSQL harness that applies
the 24-entry journal, records `0023` exactly once, reruns the journal safely,
and removes its EPIC05 fixtures before it reports `PASS`. It covers non-owner
RLS, concurrent claim collision, lease expiry, retry-after, dead-letter/replay
lineage, provider/credential state, circuit recovery probes, and redaction.
The independent verifier rejects a result that omits any EPIC05 check. A real
local PostgreSQL run and its persisted verifier evidence are still required
before this gate can be declared closed for a specific environment.
