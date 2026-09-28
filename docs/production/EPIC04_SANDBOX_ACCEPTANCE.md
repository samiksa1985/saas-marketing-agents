# EPIC-04: Google Ads Sandbox Acceptance

## Gate separation

`EPIC-04 CODE READINESS` concerns deterministic repository tests and the
governed provider boundary. `EPIC-04 REAL SANDBOX ACCEPTANCE` requires a real,
dedicated Google Ads test-account hierarchy and must never be inferred from
mocked tests.

Current status:

```text
REAL_SANDBOX_EXECUTION=BLOCKED_EXTERNAL_CREDENTIALS
REAL_SANDBOX_READ=NOT_RUN
REAL_SANDBOX_MUTATION=NOT_RUN
LIVE_PRODUCTION_MUTATION=NO
```

## Rollback code-readiness evidence (2026-09-10)

Rollback derivation is explicit at the provider boundary. The provider uses
only the original durable action and its durable `rollback.before` state; it
does not read current remote state to infer restoration intent. The executor
then persists a new, idempotent governed proposal and requires the entire
simulation, budget/entitlement, policy, durable approval, opaque dispatch,
independent read-back, and evidence chain again.

The deterministic mock-provider suite proves these restoration mappings:

| Original action and durable before-state | Derived rollback action |
| --- | --- |
| `ENABLE_CAMPAIGN`, `{ enabled: false }` | `PAUSE_CAMPAIGN` |
| `PAUSE_CAMPAIGN`, `{ enabled: true }` | `ENABLE_CAMPAIGN` |
| `UPDATE_CAMPAIGN_BUDGET` | `UPDATE_CAMPAIGN_BUDGET` with previous durable budget |
| `UPDATE_TARGET_CPA` | `UPDATE_TARGET_CPA` with previous durable CPA |
| `UPDATE_TARGET_ROAS` | `UPDATE_TARGET_ROAS` with previous durable ROAS |

An absent or invalid durable before-state fails closed before a rollback
proposal is created. The regression suite also proves that rollback remains
tenant-bound, policy- and approval-gated, target-lock compatible, and
idempotent under concurrent proposal requests. This is code evidence only; it
does not constitute a real Google Ads sandbox mutation.

## Preconditions

1. Create a separate Google Ads test manager and test customer hierarchy. It
   must not be linked to production accounts.
2. Obtain a developer token with test-account access and an OAuth identity that
   has access only to this hierarchy.
3. Place credential values only in a local managed secret store or process
   environment. Never add them to files.
4. Set the exact numeric target ID in both `GOOGLE_ADS_CUSTOMER_ID` and
   `GOOGLE_ADS_SANDBOX_CUSTOMER_IDS`; keep production IDs absent.
5. Keep `GOOGLE_ADS_EXECUTION_ENABLED=false` for initial read-only acceptance.

## Local acceptance authentication (development/acceptance only)

This optional mechanism exists only to exercise the existing API guard and
controller authorization locally while OIDC is unavailable. It is disabled by
default, forbidden when `NODE_ENV=production`, and never replaces OIDC in
production. It accepts one bearer token from an external local file and returns
only the fixed tenant context below:

```text
role: tenant_admin
permissions: marketing:admin, workflow:execute, approval:decide,
             integration:admin, artifact:read, audit:read, system_health:read
locale: ar-SA
```

Generate the token directly into the external default path without printing it:

```powershell
$secretDirectory = 'C:\Users\MBUZZ\.nawa-secrets'
$tokenFile = Join-Path $secretDirectory 'local-acceptance-auth-token.txt'
New-Item -ItemType Directory -Force -Path $secretDirectory | Out-Null
$tokenBytes = [byte[]]::new(48)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($tokenBytes)
[System.IO.File]::WriteAllText($tokenFile, [Convert]::ToBase64String($tokenBytes), [System.Text.UTF8Encoding]::new($false))
```

Set only the file path and fixed identity through local process configuration:
`LOCAL_ACCEPTANCE_AUTH_ENABLED=true`, `LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE`,
`LOCAL_ACCEPTANCE_AUTH_TENANT_ID`, and `LOCAL_ACCEPTANCE_AUTH_USER_ID`. Keep
the token outside the repository and never put it in `.env`, a request log, or
release evidence. OIDC takes precedence whenever it is configured in a
non-production environment. This local authentication path does not change
Google Ads execution settings; `GOOGLE_ADS_EXECUTION_ENABLED` remains `false`
for read-only acceptance.

## Read-only acceptance

An approved operator first validates OAuth/access, reads the configured account
metadata, reads one dedicated campaign, and records only sanitized identifiers,
before-state, request ID, and verification outcome. No mutation authorization,
proposal execution, or rollback action is permitted in this phase.

## Mutation acceptance — requires separate human authorization

The first authorized test is exactly one `PAUSE_CAMPAIGN` proposal for a
dedicated test campaign. It must pass the complete existing chain:

```text
recommendation -> simulation -> budget -> policy -> durable approval
-> governed dispatch -> Google Ads -> independent read-back -> evidence
```

If and only if read-back is `VERIFIED`, the governed rollback endpoint derives
the explicit restoration action from durable before-state, then creates a
separately proposed and approved rollback. For this initial pause test, the
derived rollback action is `ENABLE_CAMPAIGN`. A timeout is reconciled by
read-back before retry; mismatch or uncertainty never triggers a blind retry.

## Production-enablement gates

Production accounts remain blocked. Enabling them requires a separate security
and commercial decision, test-account evidence, managed-secret deployment,
deployed outbox delivery/telemetry, rate-limit operations, a kill-switch drill,
and an exercised governed rollback. None of those gates is satisfied by this
document or EPIC-04 code readiness.
