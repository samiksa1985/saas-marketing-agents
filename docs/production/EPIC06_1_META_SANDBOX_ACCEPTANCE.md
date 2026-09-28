# EPIC06.1 — Meta Ads external onboarding and read-only acceptance

## Scope and non-negotiable boundary

This runbook proves only a configured Meta Marketing API account and selected
campaign can be read through the same Graph request shapes used by EPIC06.1.
It does **not** enable execution, start the API, write to PostgreSQL, create a
policy or approval, create a fixture, or issue a Meta mutation. The acceptance
script constructs `GET` requests only. It never sends `POST`, `PATCH`, or
`DELETE`.

Keep both providers fail-closed throughout this exercise:

```text
META_ADS_EXECUTION_MODE=DISABLED
META_ADS_EXECUTION_ENABLED=false
GOOGLE_ADS_EXECUTION_MODE=DISABLED
GOOGLE_ADS_EXECUTION_ENABLED=false
```

The repository currently defaults the Graph API version to `v21.0`, accepts a
pinned `v<major>.<minor>` override, and sends the token solely as an
`Authorization: Bearer` header. Before an external call, the operator must
confirm in the Meta dashboard that the selected version remains available;
the repository does not claim that `v21.0` is still provider-supported on the
date of execution.

## Exact repository transport contract

The real adapter requires exactly these credential values:

| Name | Required by current transport | Semantics |
| --- | --- | --- |
| `META_ADS_ACCESS_TOKEN` | Yes | Bearer token used only at the Meta transport boundary. The acceptance script reads the equivalent value from a local secret file rather than an environment variable. |
| `META_ADS_AD_ACCOUNT_ID` | Yes in `REAL` mode and for this acceptance | One configured account. Either digits or `act_<digits>` is accepted and normalized to `act_<digits>`. |
| `META_ADS_API_VERSION` | No | Defaults to `v21.0`; must match `v<major>.<minor>`. Pin an active version approved for the exercise. |
| `META_ADS_SANDBOX_AD_ACCOUNT_IDS` | Yes in `REAL` mode and required by this runbook | Comma-separated test/sandbox account allowlist. It must contain the normalized target account. |
| `META_ADS_EXECUTION_MODE` | No | Must remain `DISABLED` for this read-only exercise. |
| `META_ADS_EXECUTION_ENABLED` | No | Must be absent or `false`; `true` stops the script. |
| `META_ADS_BUSINESS_ID` | No | Optional identifier, not used by the current Graph transport. |
| `META_ADS_APP_ID` | No | Optional identifier, not used by the current Graph transport. |
| `META_ADS_APP_SECRET` | No | Not used by the current Graph transport or read-only script. Do not create or supply it for this exercise. |

The adapter reads `/{ad-account-id}` with `id,account_id,name,currency`, and a
campaign with `id,account_id,status,effective_status,daily_budget`. Campaign
scope fails closed when the returned `account_id` differs from the configured
account. The script also lists `/{ad-account-id}/campaigns` with those campaign
fields before it reads the explicitly selected campaign.

## Meta-controlled prerequisites

The operator must complete these outside the repository:

1. Create or use a Meta Developer account and a Meta Developer App with the
   Marketing API product. Link the app to the Business Portfolio that owns or
   has been granted the target ad-account asset.
2. Create a least-privilege System User for ongoing service operation, assign
   it only to the chosen ad account, and generate its token from the approved
   app. A human User Access Token is acceptable only for an interactive,
   time-bounded onboarding proof; it is not the recommended operational token.
3. Grant `ads_read` for this read-only sequence. Do not add write scope merely
   to list or inspect campaigns. For the later governed campaign-state or
   budget mutation, obtain `ads_management` and retain `ads_read` for the
   required independent pre/post reads. `business_management` is not called by
   this repository's Graph transport; request it only if a separate asset
   management workflow genuinely needs it.
4. Obtain the appropriate Marketing API access level for the assets being
   accessed. Meta's published collection states that Standard Access with
   `ads_read`/`ads_management` can be sufficient for an app managing its own
   account, while access to other parties' accounts requires the corresponding
   Advanced Access and review. Verify the current policy in the Meta dashboard
   before onboarding an external customer.
5. Confirm the System User/user has an explicit asset assignment and the
   token belongs to the selected app and business relationship. Possessing an
   app or a token alone is not an ad-account authorization grant.
6. Confirm app mode, business verification, and App Review status. Development
   access is restricted to app-role users and permitted assets; production/live
   access and third-party accounts require the Meta approvals that apply at the
   time of use. App Review needs the narrow declared use case and reviewer
   material requested by Meta.
7. Confirm the exact Graph version and token expiry/rotation policy in Meta.
   The app must have an operator-owned rotation/revocation process; this code
   intentionally does not exchange, refresh, or persist a Meta token.

Meta's [official Marketing API Postman collection](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi?entity=request-31691153-cd811e13-b38e-42d9-9710-a947684b6b0a)
describes Developer App, ad account, user/system-user token, and permission
prerequisites, including the access distinction above. Treat its current
Dashboard and permission views as authoritative when they differ from this
point-in-time runbook.

## Test/sandbox reality

The `META_ADS_SANDBOX_AD_ACCOUNT_IDS` setting is a repository safety allowlist;
it does **not** create a Meta test account or prove a general Meta sandbox
entitlement. This repository has no Meta credential and has not verified that
Meta Test Users, Test Businesses, or any purported Test Ad Account can perform
the three in-scope Marketing API campaign operations for this app/business.

Therefore, a Meta sandbox mutation is **UNVERIFIED** for this product. Do not
infer support from the word “sandbox” in the configuration. The operator must
obtain a Meta-approved non-production/test asset, confirm in the current Meta
UI and documentation that it permits the intended Marketing API operation, and
provide a campaign with a campaign-level `daily_budget` before a separately
authorized mutation gate can be attempted.

## Local secret handling

Keep local secrets outside the repository at:

```text
C:\Users\MBUZZ\.nawa-secrets\meta-ads-access-token.txt
```

This is the only secret file needed by the present implementation. It contains
only the access token; no trailing diagnostics or shell commands. Use ACLs that
restrict it to the local operator. Do not add this path, token, app secret, or
any copied `.env` file to Git, logs, PowerShell history, evidence, or a ticket.
The script uses `[IO.File]::ReadAllText(...).Trim()` and emits only fixed
markers and safe failure codes.

`META_ADS_APP_ID` and `META_ADS_APP_SECRET` are not consumed by the current
transport. Do not create `meta-ads-app-id.txt` or `meta-ads-app-secret.txt`
unless a future approved implementation actually reads them.

## Read-only acceptance procedure

1. In a new PowerShell session, set only non-secret process configuration.
   Use a selected campaign ID from the approved test account; do not create one
   during this procedure.

   ```powershell
   $env:META_ADS_EXECUTION_MODE = 'DISABLED'
   $env:META_ADS_EXECUTION_ENABLED = 'false'
   $env:META_ADS_API_VERSION = '<META_CONFIRMED_ACTIVE_GRAPH_VERSION>'
   $env:META_ADS_AD_ACCOUNT_ID = 'act_<TEST_AD_ACCOUNT_ID>'
   $env:META_ADS_SANDBOX_AD_ACCOUNT_IDS = 'act_<TEST_AD_ACCOUNT_ID>'
   & .\scripts\meta-ads-readonly-acceptance.ps1 -CampaignId '<EXISTING_TEST_CAMPAIGN_ID>'
   ```

2. The script checks the local token file, normalizes the account identifier,
   validates the explicit allowlist and disabled execution state, then performs
   only these Graph reads:

   ```text
   GET /{ad-account-id}?fields=id,account_id,name,currency
   GET /{ad-account-id}/campaigns?fields=id,account_id,status,effective_status,daily_budget
   GET /{campaign-id}?fields=id,account_id,status,effective_status,daily_budget
   ```

3. A complete pass emits all of the following:

   ```text
   META_CONFIG_VALIDATION=PASS
   META_EXECUTION_SAFETY=PASS
   META_ACCOUNT_ACCESS=PASS
   META_AD_ACCOUNT_SCOPE=PASS
   META_CAMPAIGN_LIST_READ=PASS
   META_CAMPAIGN_READ=PASS
   META_STATUS_READ=PASS
   META_BUDGET_READ=PASS
   META_PROVIDER_HEALTH=PASS
   META_CREDENTIAL_HEALTH=PASS
   META_READONLY_ACCEPTANCE=PASS
   META_HTTP_METHODS=GET_ONLY
   ```

`META_PROVIDER_HEALTH` and `META_CREDENTIAL_HEALTH` are ephemeral read proofs:
the shared provider-neutral stores are intentionally not written by this
read-only script. Existing operator endpoints can read persisted tenant-scoped
health rows after a governed flow has recorded them; they cannot invoke Meta or
create a bypass.

If the account has no campaigns, the script reports
`NOT_APPLICABLE_NO_CAMPAIGNS` and exits non-zero with
`META_READONLY_ACCEPTANCE_INCOMPLETE_NO_CAMPAIGNS`. It never creates a fixture.
If a campaign has no campaign-level `daily_budget`, it reports
`NOT_APPLICABLE_NO_CAMPAIGN_DAILY_BUDGET` and exits non-zero. That campaign
cannot yet prove the budget-read requirement for the current campaign-budget
scope.

## Failure interpretation

| Safe failure code / marker | Meaning and operator action |
| --- | --- |
| `META_ADS_ACCESS_TOKEN_FILE_MISSING` or `_EMPTY` | Create/fix only the local token file; never paste the token into source or output. |
| `META_ADS_EXECUTION_MODE_NOT_DISABLED` or `_ENABLED_MUST_BE_FALSE` | Restore the fail-closed settings and rerun; do not proceed. |
| `META_ADS_TARGET_NOT_IN_SANDBOX_ALLOWLIST` | Correct the local allowlist to the exact approved account; do not broaden it. |
| `META_GRAPH_READ_FAILED_HTTP_401` / `_403` | Token, scope, app, user/system-user asset assignment, or access level is insufficient. Recheck Meta, then rotate/reissue externally as appropriate. |
| `META_GRAPH_READ_FAILED_HTTP_429` | Respect Meta rate limiting and retry later; do not increase request volume. |
| `META_ADS_ACCOUNT_SCOPE_MISMATCH` / `META_ADS_RESOURCE_NOT_ALLOWED` | The configured account and returned resource differ; stop and investigate. |
| `META_READONLY_ACCEPTANCE_INCOMPLETE_NO_CAMPAIGNS` | The account may be accessible but the campaign-read gate is not proven. Do not create a raw fixture. |
| `META_READONLY_ACCEPTANCE_INCOMPLETE_NO_CAMPAIGN_DAILY_BUDGET` | Choose a Meta-approved test campaign with a campaign-level budget, or define a later scoped design change; do not use an ad-set budget as a substitute. |

Token expiry, revocation, or rotation failure must be handled in Meta's secret
and token administration flow. Replace only the local secret-file content and
rerun the read-only proof; do not place tokens in the database or retry logs.

## Future governed mutation acceptance — design only

No mutation is authorized by this document. Once Meta test-asset eligibility,
token access, and this read-only gate are independently proven, the first
separately approved action must be reversible and use the full lifecycle:

```text
proposal → simulation → entitlement/budget → policy → durable approval
→ governed execute → independent verification → durable evidence
→ rollback proposal → simulation → policy → approval
→ governed rollback → independent verification
```

Prefer `PAUSE_CAMPAIGN` only if the selected campaign is presently `ACTIVE`.
Otherwise prefer `ENABLE_CAMPAIGN` only if it is presently `PAUSED`. Do not use
a budget mutation first. Rollback is not a raw undo: an original pause derives
`ENABLE_CAMPAIGN` only when its durable before-state was active; an original
enable derives `PAUSE_CAMPAIGN` only when before-state was paused. Each rollback
is a new governed proposal with its own simulation, policy decision, durable
approval, execution, and fresh read-back. A budget rollback, if ever approved,
restores the durable prior campaign `daily_budget` through the same lifecycle.

## Persistence and PostgreSQL evidence

No migration or Meta-specific persistence change is required. Migration 0023
defines provider-neutral `varchar(64)` provider keys with tenant-scoped RLS and
unique `(tenant_id, provider)` constraints for both provider and credential
health. Existing Phase 1 / EPIC05 PostgreSQL evidence proves the shared health,
outbox, and operational stores together with RLS isolation; source tests cover
Meta error-to-health classification without storing token material. This
read-only script deliberately creates no health row, so it is not evidence of a
live Meta database mutation.

## What remains before any governed mutation acceptance

- A Meta-approved test/non-production ad account and existing eligible campaign.
- Confirmation that the selected Graph version and permissions remain active.
- A real read-only acceptance pass using the script above.
- Separate written authorization for one governed, reversible mutation.
- Narrow durable `META_ADS` policy, entitlement/budget ceiling in minor units,
  required human approval, kill switch, and evidence controls.
- Independent verification and a separately governed rollback rehearsal.

No Google Ads or Meta execution switch may be enabled as a consequence of this
runbook.
