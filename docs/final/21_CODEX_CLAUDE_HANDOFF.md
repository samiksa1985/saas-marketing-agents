# Codex / Claude Handoff

## Purpose

This handoff preserves the release-frozen source of truth for a successor agent. Read `00_PROJECT_MASTER.md`, then the specification relevant to the requested change; do not create a parallel architecture document.

## Frozen baseline

- Repository branch: `merge/ai-marketing-os`.
- Baseline commit: `1707348f86f6d56d92c6cb2737b621a84609d2e0` when this documentation freeze was prepared.
- The worktree was already dirty. Preserve unrelated worktree changes and use `git diff` before editing.
- The canonical graph, 71 registered agents, 28 capabilities, 23 product surfaces, schemas, and controller contracts are implementation-derived facts, not aspirational requirements.

## Code map

| Area | Primary locations |
| --- | --- |
| API application | `apps/api/src` |
| Web application | `apps/web` |
| Shared contracts | `packages/contracts/src` |
| Registry and graph | `packages/registry/src` |
| Database schema and migrations | `packages/db/src`, `packages/db/drizzle` |
| Runtime and orchestration | `packages/workflow-runtime/src`, `packages/agent-runtime/src` |
| Governance and tool boundary | `packages/approvals/src`, `packages/governance/src`, `packages/tool-gateway/src` |
| Product/domain packages | `packages/*-intelligence`, `packages/marketing-*`, `packages/billing-entitlements` |

## Required working method

1. Inspect current code, tests, schema, and migrations before relying on any document.
2. Update the matching canonical document and `24_PROJECT_FILE_MANIFEST.md` when files or contracts materially change.
3. Add forward-only migrations; never alter a previously released migration. Do not execute them unless separately authorized.
4. Maintain tenant boundaries, approval rules, idempotency, and audit evidence for state changes and external effects.
5. Run the smallest affected package tests, then the root validation appropriate to the change. Record changed counts in `18_TEST_ACCEPTANCE_CRITERIA.md` only when source results change.
6. Do not call an integration production-ready without its explicit gate evidence in `PRODUCTION_READINESS_GATES.md`.

## Current handoff risks

- PostgreSQL migrations, RLS behaviour, and migration rollback have not been executed or verified in this freeze.
- Temporal has an adapter/runtime plan but no deployment verification.
- OIDC, provider credentials, external webhooks, payment, CRM, publishing, and observability operations need environment-specific verification.
- Existing merge-era documents can be historical input only; these `docs/final` documents describe the current implementation baseline.

## Definition of done for a future change

A future change is handoff-complete when code, contract, test, relevant frozen documentation, gate status, and changelog/decision record agree; any production-only claim remains explicitly unverified until evidence exists.
