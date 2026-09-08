# Google Ads Sandbox / Test-Account Runbook

## Safety boundary

Use a dedicated Google Ads test account or sandbox-compatible account only. Do
not set `GOOGLE_ADS_EXECUTION_ENABLED=true` against a production customer. The
repository defaults to `GOOGLE_ADS_EXECUTION_MODE=DISABLED`; current `REAL` mode
also fails closed because a transport is not yet wired.

## Supply secrets locally

Set these only in a local secret manager or terminal environment, never in a
repository file, action payload, evidence, or log:

- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` when a manager account is used

Use the provider validation/read-only path to confirm the developer token and
OAuth identity, confirm that login-customer/customer IDs resolve to the intended
test hierarchy, then fetch a known test campaign. Do not interpret a missing
transport as a connectivity success.

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
5. After explicit human approval and a real transport implementation, perform
   one sandbox mutation only, then independently read back the campaign.
6. If observed state differs or a timeout is ambiguous, do not re-mutate. Use
   reconciliation; escalate `PROVIDER_OUTCOME_UNCERTAIN` when read-back cannot
   decide. If needed, submit a governed rollback proposal through the same chain.

No live customer mutation has been performed by this repository work.
