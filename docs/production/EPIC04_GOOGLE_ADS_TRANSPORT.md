# EPIC-04: Google Ads REST Transport

## Status and boundary

**EPIC-04 code readiness: implemented and test-covered.** This is a provider
adapter, not a control plane. It is reachable only through the existing
governed external-action executor and opaque dispatch capability.

No Google OAuth token, developer token, client secret, refresh token,
authorization header, or raw provider response is persisted in actions,
evidence, workflow payloads, logs, or API responses.

## Authentication and REST implementation

`GoogleAdsRestTransport` uses the OAuth refresh-token exchange and a pinned,
configurable Google Ads REST version (`v25` by default). It sends the developer
token and optional manager `login-customer-id` only as outbound provider
headers. The transport supports:

- validation by OAuth and accessible-customer lookup;
- account metadata and campaign-state reads through GAQL `searchStream`;
- pause/enable campaign updates through `CampaignService`;
- daily-budget updates through `CampaignBudgetService`;
- target CPA and target ROAS campaign updates;
- independent campaign read-back for verification and timeout reconciliation.

There is intentionally no `CREATE_CAMPAIGN` implementation. Rollback is never
a direct transport operation. A provider-neutral rollback-derivation contract
receives the original durable action and its durable before-state, and returns
the explicit restoration action/payload before a new governed proposal is
persisted. Google Ads maps enable-with-previously-paused to
`PAUSE_CAMPAIGN`, pause-with-previously-enabled to `ENABLE_CAMPAIGN`, and
budget/CPA/ROAS updates to the same update type with the corresponding durable
prior value. Missing or invalid before-state fails closed. The derived proposal
then requires a new durable approval, policy and budget check, dispatch,
read-back, and evidence chain; it cannot bypass governance.

## REAL-mode safety

REAL mode remains disabled by default. A process configured for REAL must have:

1. a numeric `GOOGLE_ADS_CUSTOMER_ID`;
2. a non-empty numeric `GOOGLE_ADS_SANDBOX_CUSTOMER_IDS` allowlist containing
   that approved customer;
3. valid credentials resolved only at the provider boundary.

Read-only operations require tenant scope, the configured customer, and the
sandbox allowlist, but not mutation enablement or an approval. A mutation also
requires `GOOGLE_ADS_EXECUTION_ENABLED=true` and the existing executor gates:
policy, entitlement/budget authority, current durable approval, kill switch,
idempotency, target lock, and opaque dispatch capability. Any account mismatch
or absent allowlist fails closed before a provider request.

## Error and telemetry policy

Provider failures map to stable, sanitized classes: authentication,
authorization, account access, campaign-not-found, policy rejection, invalid
mutation, quota/rate-limit, timeout, and network uncertainty. Only the stable
code/class is retained.

The optional telemetry port receives provider, tenant, operation, action type,
action ID, workflow correlation, latency, attempt, verification/rollback state,
and provider error class. It is deliberately unable to receive credentials or
raw HTTP payloads.

## External references

- [Google Ads REST authentication and headers](https://developers.google.com/google-ads/api/rest/auth)
- [Google Ads REST search/searchStream](https://developers.google.com/google-ads/api/rest/common/search)
- [Google Ads REST mutate](https://developers.google.com/google-ads/api/rest/common/mutate)
- [Google Ads test accounts](https://developers.google.com/google-ads/api/docs/best-practices/test-accounts)
