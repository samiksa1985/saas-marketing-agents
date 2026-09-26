# Final merge audit

## 1. Executive conclusion

The repository has one checked-in canonical architecture and useful Project 2
capabilities have been merged, replaced, retained as reference, or rejected.
Safe reconciliation fixes were applied. The result is a **Conditional Go**,
not a production-complete merge: durable workflow, tenant database request
composition, billing authority, live product data and controlled migrations
remain outside the currently composed runtime.

## 2. Canonical architecture confirmation

- Frontend: `apps/web` is the sole active frontend.
- Control plane: `apps/api` is the sole active backend/API.
- Tenant/RBAC/governance: `@platform/contracts`, `@platform/auth`, and
  `@platform/governance` are canonical; the former domain `TenantContext` now
  re-exports the contract.
- Agent, registry, tool gateway, context/RAG and database all have one
  canonical package family. The marketing execution compatibility package now
  re-exports `@platform/marketing-os-core` instead of carrying a second service.
- `docs/project2-reference` remains uncompiled provenance; no active Project 2
  Prisma, Next API or RESTORED-BACKUP runtime dependency was found.

## 3. Capability inventory

The repository contains canonical package implementations for Company/ICP,
Market, Strategy, Sales, Customer Success, CFO profitability/scenarios,
measurement/experiments, billing entitlements, automation, marketing execution,
business mentor and governance. Their current reachability and external
dependencies are recorded in `FINAL_COMPOSITION_GAPS.md`.

## 4. Project 2 disposition summary

See `FINAL_PROJECT2_DISPOSITION_MATRIX.md`. Project 2 application code and
Prisma are rejected/replaced; domain capability specifications informed the
canonical packages. No project reference tree is an executable dependency.

## 5. Duplicate-system audit

- Removed duplicate `TenantContext` definition by re-exporting the contracts
  type from `@platform/domain`.
- Moved Company Evidence/Profile/ICP Assessment contracts to
  `@platform/contracts`, retaining advanced `ICPProfile`/`Account` as a
  separate runtime boundary.
- Replaced the unused duplicate Marketing OS execution class with a
  compatibility re-export of the canonical core service.
- Kept the Temporal and in-memory implementations behind one
  `WorkflowRuntime` abstraction. Selection is explicit and Temporal is required
  by production config, although application bootstrap is not yet wired.

## 6. Security and tenant-isolation audit

Canonical authorization checks permissions rather than feature flags; OIDC
normalization accepts canonical roles/permissions only. Governance keeps export
and deletion requests tenant-scoped, approval-gated and append-oriented rather
than physically deleting data. Source migrations now include tenant RLS policies
for the knowledge and analytics tables that previously lacked them.

`withTenantScope` uses transaction-local `set_config('app.tenant_id', ..., true)`
before tenant work. It is unit-tested, but is not yet composed by API/worker DB
request handling; this prevents a PASS for live RLS session wiring.

## 7. Billing hardening result

Billing persistence and migration source use integer minor units. Usage
consumption now reserves the unique idempotency event before upserting the
counter, and deletes a rejected reservation in the same statement. This avoids
the prior read-then-increment race in the SQL source. The executor consumes quota
before provider execution, so a provider failure remains billable by policy.

The repository does not have a real PostgreSQL concurrency environment and has
no composed authoritative subscription/plan/override lookup adapter. Concurrency
and entitlement authority therefore remain unverified/incomplete for production.

## 8. RLS session result

The canonical helper exists and proves order/empty-tenant behavior. Production
must call it with the authenticated tenant and run all tenant queries through the
same transaction connection. No migration was executed and no live RLS test was
possible.

## 9. Workflow production composition result

`createWorkflowRuntime` selects one in-memory or Temporal implementation and
refuses Temporal mode without an adapter. `RuntimeConfig` defaults production to
and requires Temporal mode. The API still exposes in-memory-specific read/task
operations and the worker only reports configuration, so a concrete Temporal
adapter/read model has not been composed. This is a fail-closed configuration
improvement, not evidence of durable production execution.

## 10. Migration readiness

See `MIGRATION_READINESS_REPORT.md`. Source reconciliation fixed missing RLS,
UUID defaults, tenant FK drift and billing money columns. Multiple historical
files are BLOCKED for live environments because the corrections require forward,
controlled migrations and data checks. No database migration was run.

## 11. Product UX completeness

All 23 declared product surfaces have canonical routes/navigation, typed
permission and entitlement gates, loading/empty/error/unavailable states, and
RTL/LTR content. Product model tests cover representative access and state
selection. They are honest unavailable compositions rather than fake metrics,
payments, publishing or integration success. They are not meaningful live,
backend-integrated surfaces yet, so Product UX does not pass the full prompt
criterion.

## 12. Test and build results

- Root package regression suite: 307/307 passing.
- API suite: 39/39 passing; frontend suite: 6/6 passing.
- Targeted CFO capability checks: contracts 3/3 and registry 13/13 passing.
- Root typecheck (including frontend typecheck): passing.
- Frontend production build: passing with the existing local WASM compiler
  fallback because native SWC is blocked by the Windows environment; no package
  manifest was altered for the fallback.
- `git diff --check`: passing (line-ending notices only).

## 13. Remaining code gaps

- Deterministic CFO forecast implementation and tests.
- Durable workflow state/query adapter compatible with API task/read endpoints.
- Live web data integration for the 23 surfaces.

## 14. Remaining production and infrastructure gaps

- API/worker database transaction composition through `withTenantScope`.
- Billing entitlement authority adapter and PostgreSQL duplicate-key concurrency
  test.
- Temporal, PostgreSQL, OIDC, object storage, embeddings/retriever, AI provider,
  payment/CRM/publishing integrations and their credentials.
- Controlled forward migration plans for the changed historical migrations.

## 15. Go / Conditional Go / No-Go conclusion

**Conditional Go.** The source merge is coherent and validated at unit/build
level, but it cannot be called complete or production-ready until the documented
code/composition gaps and controlled environment work are closed.

## Reconciliation closeout update

The preceding code-gap findings are superseded. CFO forecasting now has
canonical period contracts, shared stage weighting, provenance/evidence, tenant
checks, tests and aligned persistence; `CAP-CFO-FORECASTING` is enabled. Billing
now resolves active subscription, plan, organization override and canonical
usage limit before atomic reservation. API and worker database façades use
transaction-local `withTenantScope`.

Workflow reads flow through an injected query boundary; Temporal mode requires
both a command adapter and durable read model. All 23 web views use a typed,
authenticated `/product-surfaces/:surface` data route and preserve empty or
unavailable state without fabricated metrics. `0018` is the forward-only repair
artifact and was not run. Remaining items are infrastructure-only validation:
PostgreSQL RLS/concurrency, Temporal deployment, credentials and external
integrations.

## Final reconciliation validation

- Root regression suite: **321/321** passing.
- API suite: **44/44** passing; frontend suite: **8/8** passing.
- Targeted checks: contracts **3/3**, registry **13/13**, CFO **7/7**,
  billing **11/11**, persistence **38/38**, governance **12/12**, workflow
  runtime **20/20**, agent runtime **96/96**, tool gateway **3/3**, and DB
  structural tests **10/10**.
- Root typecheck and frontend production build: passing; the latter used the
  local WASM fallback because native SWC is blocked by the Windows environment.
- `git diff --check`: passing. No migration, commit, or push was performed.
