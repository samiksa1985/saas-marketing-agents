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

If and only if read-back is `VERIFIED`, a separately proposed and approved
`ENABLE_CAMPAIGN` rollback follows the same chain. A timeout is reconciled by
read-back before retry; mismatch or uncertainty never triggers a blind retry.

## Production-enablement gates

Production accounts remain blocked. Enabling them requires a separate security
and commercial decision, test-account evidence, managed-secret deployment,
deployed outbox delivery/telemetry, rate-limit operations, a kill-switch drill,
and an exercised governed rollback. None of those gates is satisfied by this
document or EPIC-04 code readiness.
