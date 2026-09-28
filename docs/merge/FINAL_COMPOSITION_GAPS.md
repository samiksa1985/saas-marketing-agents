# Final composition gaps

These are deliberate findings from the actual package and API graph. They are
not filled with placeholder endpoints or fabricated integrations.

## Code gaps

| Gap | Evidence | Required next code work |
| --- | --- | --- |
| Deterministic CFO forecasting | `packages/cfo-intelligence` implements profitability and labeled scenario modeling only. | Define canonical historical-input and forecast contracts, then implement/test a deterministic forecast before claiming `CAP-CFO-FORECASTING`. |
| Durable workflow read/command composition | The provider can select a `TemporalWorkflowRuntime`, but the API controller uses in-memory-only task/read APIs. | Implement one durable adapter/read model behind the canonical workflow abstraction; do not add a second engine. |
| Live product data states | The 23 web surfaces use typed honest states but have no authenticated backend data client. | Bind canonical API query results to loading/empty/error/unavailable and approval states. |

## Composition gaps

| Gap | Evidence | Required next composition work |
| --- | --- | --- |
| Tenant-scoped database requests | `withTenantScope` safely sets `app.tenant_id`, but `apps/api` does not construct or inject a database transaction layer. | Wrap every tenant request/worker operation in the helper using the same pooled transaction connection. |
| Billing entitlement access | Resolver accepts supplied subscription/plan/override/usage inputs; `AgentEntitlementAccess` is a port without an API-bound persistence adapter. | Compose authoritative active-subscription, plan entitlement, tenant override and usage-counter lookups. |
| Package capability reachability | Market, strategy, sales, customer success, CFO, automation, governance, billing and marketing-execution packages are mostly library/persistence capabilities, not canonical API endpoints. | Add only product-approved endpoints and wire authorization, tenant scope, persistence and approvals. |
| Workflow provider | Config requires Temporal mode in production and the provider selection is tested, but no Temporal SDK adapter is injected in API or worker. | Bind one adapter and durable state/query adapter at application bootstrap. |

## Infrastructure gaps

- PostgreSQL integration tests with two isolated tenant sessions, including RLS
  and concurrent duplicate billing idempotency requests.
- Temporal service, namespace, worker deployment, durable workflow state/query
  storage, and observability.
- Object storage, embedding/vector service, knowledge ingestion and retriever.
- OIDC issuer/audience and production database pool configuration.

## External integration gaps

- Payment/subscription provider, webhook verification and real payment actions.
- CRM, market research, analytics event ingestion, and publishing tool adapters.
- AI provider/model credentials and a real Arabic localization path. The mentor
  is advisory-only and does not claim deterministic Arabic generation.

## Production configuration gaps

- `WEB_URL`, `DATABASE_URL`, `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`,
  `ARTIFACT_BUCKET`, `AI_PROVIDER`, `AI_MODEL`, `OIDC_ISSUER_URL`, and
  `OIDC_AUDIENCE` must be supplied as appropriate.
- `WORKFLOW_RUNTIME_MODE=temporal` is required in production and must be paired
  with the real adapter/read-model composition.
- Historical migration corrections require forward migration plans, backups,
  data validation and rollback rehearsal.

## Reconciliation update — repository code gaps closed

The preceding code-gap table is historical. CFO forecast, authoritative billing
access, API/worker tenant transactions, workflow query/provider composition and
the typed 23-surface product route are implemented and unit-tested.
`0018_reconciliation_forward_repairs.sql` plus the migration report provide the
forward-only plan. Remaining items are infrastructure-only: PostgreSQL RLS and
concurrent billing verification, Temporal service/read-model deployment, OIDC
and storage/AI credentials, plus genuine external integrations. Billing usage is
explicitly unavailable until an authoritative deployed repository is bound; no
usage value is fabricated.

## Final validation counts

Root 321/321; API 44/44; frontend 8/8; CFO 7/7; billing 11/11;
persistence 38/38; governance 12/12; workflow runtime 20/20; agent runtime
96/96; tool gateway 3/3; DB structural 10/10. Root typecheck, frontend build
and `git diff --check` pass. No migration was executed.
