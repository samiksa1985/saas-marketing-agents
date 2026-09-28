# EPIC06 — Meta Ads Governed Execution

## Status and boundary

EPIC06 adds `META_ADS` as a second adapter behind the existing provider-neutral
external-action lifecycle. It does not enable Meta Ads, perform a live Graph API
read or mutation, add a Meta-specific approval route, or claim deployment or
commercial production readiness. Defaults remain:

```text
META_ADS_EXECUTION_MODE=DISABLED
META_ADS_EXECUTION_ENABLED=false
GOOGLE_ADS_EXECUTION_MODE=DISABLED
GOOGLE_ADS_EXECUTION_ENABLED=false
```

The API composes an `ExternalActionProviderRegistry` containing only explicit
`GOOGLE_ADS` and `META_ADS` gateways. The application resolves a gateway by the
durable proposal's provider before it creates the existing governed executor.
No controller, agent, workflow, worker, operator route, or registry entry
receives a raw Meta client or credentials.

## Canonical action mapping

The domain remains vendor-neutral. The initial Meta slice uses existing action
names, not Graph-native verbs:

| Canonical action | Meta resource operation | Verification / rollback |
| --- | --- | --- |
| `PAUSE_CAMPAIGN` | `POST /{campaign-id}` with `status=PAUSED` | Fresh campaign read must be non-active; rollback proposal is `ENABLE_CAMPAIGN` only when durable before-state was active. |
| `ENABLE_CAMPAIGN` | `POST /{campaign-id}` with `status=ACTIVE` | Fresh campaign read must be active; rollback proposal is `PAUSE_CAMPAIGN` only when durable before-state was paused. |
| `UPDATE_CAMPAIGN_BUDGET` | `POST /{campaign-id}` with `daily_budget` | Fresh campaign read compares the resulting budget; rollback restores the durable prior budget. |

Meta Graph campaign `daily_budget` is an integer in that ad account's currency
minor units. Thus the Meta proposal's `dailyBudget`, simulation delta, and Meta
policy budget ceiling must use that same unit. Ad-set budgets and creative,
audience, pixel, catalogue, lead, and page actions are out of scope. A campaign
that uses an ad-set budget must be rejected rather than silently redirected.

## Account, credential, and transport boundaries

`META_ADS_ACCESS_TOKEN` and `META_ADS_AD_ACCOUNT_ID` are the minimum runtime
credential boundary for Graph transport. Optional business/app identifiers stay
in the approved secret/configuration boundary and are never included in a
proposal, simulation, durable evidence, operator response, event detail, or log.
The access token is sent only in an authorization header, never a URL.

`REAL` mode requires one configured `META_ADS_AD_ACCOUNT_ID` and an explicit
`META_ADS_SANDBOX_AD_ACCOUNT_IDS` list containing it. IDs normalize to
`act_<numeric>`. A read or mutation to any other account fails closed before a
provider call. Possession of a token does not grant a route or policy bypass.

## Governed lifecycle

Every Meta mutation takes the existing path:

```text
recommendation → proposal → simulation → entitlement/budget → policy
→ durable approval → governed gateway → Graph mutation → fresh read-back
→ evidence → optional governed rollback → generic reliable outbox
```

Simulation reads the campaign's account binding, active/paused state, and
applicable budget before policy/approval. Status changes still have a simulation
and budget/entitlement decision; a missing numeric delta is an explicit warning,
not a bypass. Existing tenant policy rows apply to `META_ADS` through their
provider/action/account/campaign allowlists, confidence/evidence requirements,
approval role, risk level, and spend ceilings. Durable approvals are reused
unchanged.

Execution accepts only the opaque dispatch capability minted by the governed
executor while it is in `EXECUTING`. Disabled mode rejects mutation. REAL mode
also requires the explicit enabled switch and sandbox allowlist. HTTP success is
not terminal success: the gateway reads the campaign again and records
`VERIFIED` or a verification mismatch through the existing evidence lifecycle.

## Timeout, idempotency, rollback, and reliability

Meta has no durable client-idempotency lookup for these campaign mutations.
After a timeout/unknown result, the adapter performs a fresh read-back. A match
reconciles the original action without another mutation; a non-match remains
not-applied; unavailable read-back remains inconclusive and blocks automatic
replay. Existing durable external-action idempotency, target conflict control,
EPIC05 outbox leases, retry/backoff, dead-letter, replay, and recovery apply
without a Meta-specific lock or worker.

Rollback is a new durable governed proposal. It must simulate, pass policy,
receive the required approval, execute through the gateway, and independently
verify. It is never a direct Graph undo.

## Health, observability, and operations

The shared tenant/RLS-scoped provider and credential health stores use provider
`META_ADS`. Sanitized Meta error mapping distinguishes authentication/token
expired/revoked, authorization, resource-not-found/not-allowed, invalid request,
rate limit, unavailable/timeout, and unknown provider failures. Revoked and
expired outcomes become safe credential lifecycle states; no token text is
stored. Rate-limit errors are retryable and preserve a numeric `Retry-After`
hint where Graph/proxy provides one.

The existing operator endpoints expose `META_ADS` provider health, credential
health, generic outbox/dead letters, replay, and expired-lease recovery. They
remain tenant-scoped and authorization-protected. They cannot invoke a provider
or reconstruct a mutation.

## Live onboarding prerequisites

Before a separately authorized Meta sandbox rehearsal:

1. Obtain an approved test/sandbox ad account and campaign; never list a
   production account.
2. Inject a least-privilege token through the managed secret provider only.
3. Pin a supported Graph API version and set the one approved test account in
   both the account setting and sandbox allowlist.
4. Create a narrow durable `META_ADS` policy with a campaign allowlist, human
   approval, evidence requirement, kill switch, and budget ceiling in matching
   minor units.
5. Prove read-only account/campaign validation first. Then run one explicitly
   approved governed sandbox mutation with independent verification and a
   governed rollback rehearsal.
6. Keep execution disabled after acceptance. Production activation requires a
   separate security, change-management, monitoring, and provider review.

The executable read-only onboarding procedure, exact secret-file boundary,
operator prerequisites, failure interpretation, and future mutation design are
in [EPIC06.1 Meta sandbox acceptance](./EPIC06_1_META_SANDBOX_ACCEPTANCE.md).
That document does not authorize a Meta mutation.

## Evidence and current limitations

This code-level gate is covered by deterministic fake-transport tests for the
full governed lifecycle, action mapping, allowlist blocking, redaction, error
mapping, rate limiting, timeout reconciliation, concurrency, and rollback. No
Meta credential, Graph connectivity, live read, or live mutation was used.

```text
META_REAL_API=NOT_CONFIGURED
META_LIVE_READ=NOT_RUN
META_LIVE_MUTATION=NOT_RUN
EPIC06_CODE_LEVEL_GATE=STRUCTURAL_ONLY
```
