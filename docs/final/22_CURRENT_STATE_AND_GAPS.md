# Current State and Gaps

## Current implemented baseline

The repository contains a TypeScript workspace with API and web applications plus domain packages for agent runtime, orchestration, approvals, artifacts, audit, tenancy, billing, sales intelligence, market intelligence, marketing planning/execution, measurement, and configuration. The API currently exposes health/readiness, registry, workflow, approval, Marketing OS, typed product-surface endpoints, and governed external-action routes. The repository contains forward migrations through `0022_governed_external_marketing_actions.sql`; no migration is executed merely by adding its source.

The root typecheck, root test suite, API tests, frontend tests, frontend build, and focused regression suites passed for this documentation freeze. Those results establish repository regression health; they do not establish a deployed production environment.

## Material gaps

| Gap | Current state | Disposition |
| --- | --- | --- |
| PostgreSQL migration execution | The disposable real PostgreSQL chain `0000`–`0022` passed, including `0022_governed_external_marketing_actions`. | Target-environment change approval and rehearsal remain required. |
| RLS and tenant isolation on live PostgreSQL | Disposable non-owner RLS, tenant isolation, and pooled-reset proof passed through the new EPIC-03 tables. | Deployed-environment verification remains required. |
| Temporal service and worker | Runtime configuration and abstraction exist; no namespace, worker, or failover proof. | Execute the Temporal plan. |
| OIDC | Configuration validates production issuer/audience; live issuer, audience, JWKS, and role claims are unverified. | Complete identity gate. |
| Google Ads execution | EPIC-03 has provider-neutral simulation, budget/policy/approval gates, real disposable PostgreSQL policy/action/evidence/outbox proof, mock and dry-run adapters, verification, rollback proposals, timeout read-back recovery, and an opaque executor-only dispatch capability. | Real transport, managed secrets, sandbox evidence, and deployed worker delivery remain required; live Google Ads is not claimed. |
| Other external integrations | Tool boundary and approval/idempotency controls exist; production credentials and endpoint contracts are unverified. | Track in the external backlog. |
| Observability operations | Audit/event code exists; alert routing, dashboards, retention, incident drills, and SLO evidence are unverified. | Complete observability gate. |
| Security operations | Code-level controls exist; threat model, dependency review, secrets scan, penetration test, and incident exercises lack release evidence. | Complete security checklist. |
| Data backup/recovery | No production backup/restore evidence is represented by this repository. | Perform a restore drill. |

## Compatibility note

`/product-surfaces/:surface` is a current typed API endpoint. Earlier merge documentation that characterized product surfaces as composition-only is superseded for this freeze because it conflicts with the checked implementation.

## Release interpretation

The documentation set can be frozen for a later release commit and tag while the production gates remain NOT VERIFIED. It must not be represented as a production deployment approval.
