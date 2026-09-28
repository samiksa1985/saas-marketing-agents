# Release Freeze Manifest

## Identity

| Field | Value |
| --- | --- |
| Freeze date | 2026-09-05 |
| Branch | `merge/ai-marketing-os` |
| Baseline HEAD | `1707348f86f6d56d92c6cb2737b621a84609d2e0` |
| Scope | Canonical documentation and operational runbooks only. |
| Repository authority | Current source code, tests, schema, and migrations. |
| Worktree condition | Dirty before this freeze; unrelated changes were preserved. |

## Deliverables

`README.md`; numbered documents `00_PROJECT_MASTER.md` through `25_BUILD_BACKLOG.md`; `RELEASE_FREEZE_MANIFEST.md`; `PRODUCTION_READINESS_GATES.md`; `ENVIRONMENT_VARIABLES.md`; `POSTGRESQL_VERIFICATION_PLAN.md`; `TEMPORAL_DEPLOYMENT_PLAN.md`; `EXTERNAL_INTEGRATION_BACKLOG.md`; and `SECURITY_RELEASE_CHECKLIST.md` comprise the release-freeze package.

## Source snapshot facts

- 71 registered agents, 28 capability records, 23 typed product surfaces, and approximately 85 Drizzle table definitions are represented by current source.
- API surface includes health/readiness, i18n context, registry, workflows/tasks/artifacts/handoffs, approvals, Marketing OS planning/execution/runs, and product surfaces.
- Migration source runs through `0018_reconciliation_forward_repairs.sql`; no migration was executed for this freeze.
- Production configuration requires OIDC issuer/audience and uses Temporal workflow mode; credentials and live environments were not inspected or changed.

## Validation evidence

| Check | Result |
| --- | --- |
| Root typecheck | PASS |
| API tests | PASS, 44 passed / 44 total |
| Frontend tests | PASS, 8 passed / 8 total |
| Root package regression tests | PASS, 321 passed / 321 total |
| Frontend production build | PASS |
| Internal documentation links | PASS |
| Documentation trailing whitespace | PASS |
| `git diff --check` | PASS; host emitted LF/CRLF conversion warnings only. |

The direct first API test invocation encountered a host `uv_os_get_passwd` ENOMEM error before test loading. The successful recorded test runs used a temporary local Node startup shim and temporary directories outside the repository; no repository code or configuration was changed.

## Prohibited actions record

| Action | Result |
| --- | --- |
| Database migration execution | Not performed |
| Deployment | Not performed |
| Commit | Not performed |
| Push | Not performed |
| Tag creation | Not performed |

## Freeze integrity rules

1. The document set must describe current implementation, not earlier intent.
2. Each production claim requires target-environment evidence in the relevant gate.
3. No secrets, access tokens, connection strings, or customer data belong in this package.
4. A later release commit/tag must include the documentation files and preserve all unresolved production gates as NOT VERIFIED until proof is attached.
