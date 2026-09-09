# Google Ads Sandbox / Test-Account Runbook

## Safety boundary

Use a dedicated Google Ads test-account hierarchy only. Do not set
`GOOGLE_ADS_EXECUTION_ENABLED=true` against a production customer. The
repository defaults to `GOOGLE_ADS_EXECUTION_MODE=DISABLED`.

`REAL` mode now uses the Google Ads REST transport, but it remains fail-closed:
the configured numeric customer ID must be present in the explicit numeric
`GOOGLE_ADS_SANDBOX_CUSTOMER_IDS` allowlist. Labels such as "test" are never a
safety control. A target not on that list is rejected before provider access.

## Supply secrets locally

Set these only in a local secret manager or terminal environment, never in a
repository file, action payload, evidence, or log:

- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` when a manager account is used

These non-secret controls are also required for REAL mode:

- `GOOGLE_ADS_API_VERSION` (currently `v25`)
- `GOOGLE_ADS_CUSTOMER_ID` — the one approved test customer ID
- `GOOGLE_ADS_SANDBOX_CUSTOMER_IDS` — comma-separated numeric test customer IDs

`GOOGLE_ADS_EXECUTION_ENABLED=false` still permits the bounded read-only
authentication/account/campaign acceptance path. It never permits mutation.

Use the provider validation/read-only path to confirm OAuth, the developer token,
accessible customer metadata, and a known test campaign. The transport uses an
OAuth refresh-token exchange and Google Ads REST API requests only inside
`@platform/tool-gateway`; no secret is placed in a proposal, workflow, evidence,
audit record, log, or API response.

## Future approved sandbox rehearsal

1. Leave production accounts out of allowlists and set the durable tenant policy
   to `DRY_RUN` while checking proposal, simulation, spend limit, policy,
   approval, evidence, and rollback content.
2. For a separately approved test, allow exactly one test account/campaign,
   retain `requiredEvidence=true`, human approval, kill switch available, and a
   narrow absolute/monthly ceiling.
3. Run a read-only campaign lookup and record identifiers without credentials.
4. Simulate one governed mutation and compare the before-state with the proposed
   state and rollback state.
5. After explicit human approval, perform one sandbox mutation only, then
   independently read back the campaign.
6. If observed state differs or a timeout is ambiguous, do not re-mutate. Use
   reconciliation; escalate `PROVIDER_OUTCOME_UNCERTAIN` when read-back cannot
   decide. If needed, submit a governed rollback proposal through the same chain.

No live customer mutation has been performed by this repository work.

## Acceptance status

Code readiness is complete for the provider boundary, but no Google OAuth or
Google Ads API connectivity has been attempted from this repository. Until a
dedicated test-account hierarchy and local managed credentials are supplied:

```text
REAL_SANDBOX_EXECUTION=BLOCKED_EXTERNAL_CREDENTIALS
REAL_SANDBOX_READ=NOT_RUN
REAL_SANDBOX_MUTATION=NOT_RUN
LIVE_PRODUCTION_MUTATION=NO
```
