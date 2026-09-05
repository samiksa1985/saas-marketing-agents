# Project File Manifest

## Repository structure

| Path | Role |
| --- | --- |
| `apps/api` | NestJS-style HTTP application, controllers, guards, and API tests. |
| `apps/web` | Next.js product UI and frontend tests/build. |
| `packages/contracts` | Canonical types, capability records, agent/workstream identifiers, and contracts. |
| `packages/registry` | Agent, workstream, graph, and readiness registry. |
| `packages/db` | Drizzle schema definitions, PostgreSQL configuration, and SQL migrations. |
| `packages/config` | Runtime environment schema and configuration loading. |
| `packages/workflow-runtime` | Workflow lifecycle, tasks, handoffs, persistence seams, and execution modes. |
| `packages/agent-runtime` | Agent execution/runtime controls and tests. |
| `packages/approvals`, `packages/governance`, `packages/tool-gateway` | Approval policy, governance decisions, and guarded tool execution. |
| `packages/artifacts`, `packages/audit`, `packages/handoffs` | Evidence/artifact, audit, and work handoff primitives. |
| `packages/*-intelligence`, `packages/marketing-*`, `packages/measurement-engine` | Product-domain intelligence, planning, execution, and measurement modules. |
| `docs/final` | This release-frozen canonical documentation package. |

## Package inventory

The workspace includes acquisition graph, agent runtime, AI gateway, approvals, artifacts, audit, auth, automation engine, billing entitlements, business mentor, CFO intelligence, company intelligence, configuration, context engine, contracts, customer-success intelligence, database, domain, governance, handoffs, i18n, market intelligence, marketing commander, marketing execution, Marketing OS core/execution/persistence, measurement engine, registry, sales intelligence, strategy intelligence, tool gateway, validation, and workflow runtime packages.

## Data and migration inventory

- Drizzle configuration: `packages/db/drizzle.config.ts`.
- Schema source: `packages/db/src`.
- Migration source: `packages/db/drizzle` through `0018_reconciliation_forward_repairs.sql`.
- Migration files are versioned repository artifacts; this freeze did not apply any of them.

## Documentation inventory

The required release-freeze documents are the numbered files `00` through `25`, this manifest, `README.md`, and the seven operational documents in `docs/final`. Their inventory is recorded in `RELEASE_FREEZE_MANIFEST.md`.

## Manifest maintenance

Update this manifest when a top-level application, package family, persisted-store location, external execution boundary, or documentation deliverable is added, removed, or materially renamed.
