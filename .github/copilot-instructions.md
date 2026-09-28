# Repository engineering guidance

## Project identity

CODECORE Growth Intelligence OS is a tenant-aware platform for planning, governing, executing, and measuring marketing-to-revenue work. Historical repository and documentation names may differ.

## Sources of truth

Use current code, tests, schema, and migrations as primary evidence, followed by the canonical documentation in `docs/final/`. Historical and reference material is provenance, not a current contract. Start with [the canonical documentation index](docs/final/README.md), [the project master](docs/final/00_PROJECT_MASTER.md), and [the engineering handoff](docs/final/21_CODEX_CLAUDE_HANDOFF.md); read only what the task needs.

## Working method

**SEARCH → IDENTIFY → READ TARGETED FILES → IMPLEMENT.** Inspect current Git state for substantial work; search before reading, then inspect the relevant interfaces and tests. Use the diff as the review packet. Preserve existing work, avoid broad rereads and unrelated refactoring, and keep changes within the requested scope.

## Architecture and security invariants

- Derive tenant identity from trusted server-side authentication and `TenantContext`; enforce membership and explicit permissions server-side.
- Preserve tenant isolation at application and PostgreSQL RLS boundaries.
- Route consequential external effects through established governance/provider boundaries, including required approval, idempotency, and audit controls. Fail closed on production security decisions.
- Never commit secrets or credentials. See [canonical security and governance](docs/final/12_APPROVAL_GOVERNANCE_SECURITY.md) for details.

## Database and migrations

Inspect the relevant schema and migrations before changing persistence behavior. Preserve tenant isolation and RLS; make migrations forward-only unless repository evidence explicitly establishes otherwise. Keep runtime and migration authority separated where established. Do not weaken production verification to make tests pass.

## Test economy

Verify in stages: affected test → affected package/module → integration/service → full suite only at meaningful gates. Use the smallest relevant checks first. Verified root commands include `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run db:check`; use only those relevant to the change.

## Git safety and scope

For substantial work, inspect branch, HEAD, and status first. Preserve user and local changes; inspect the diff before committing. Do not destructively reset, clean, or stash unknown work; do not force-push unless explicitly authorized. Do not claim readiness without evidence. Do not start another phase/workstream, redesign approved architecture, perform broad cleanup, or silently change production/deployment architecture without explicit instruction.

## Review, handoff, and done

When handing work to another model or agent, provide a compact summary: project, phase/task, branch, HEAD, objective, completed work, changed files, tests/results, known failures, relevant invariants, and the next exact action. Avoid requiring repository rediscovery.

Engineering work is done when implementation is complete, targeted tests and relevant package/integration verification pass, the diff is reviewed, unrelated changes are absent, and security/tenant invariants are preserved. Run broader verification at meaningful gates.
