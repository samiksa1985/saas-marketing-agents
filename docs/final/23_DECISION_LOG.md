# Decision Log

| ID | Decision | Basis and consequence | Status |
| --- | --- | --- | --- |
| D-001 | Treat current code as the canonical source. | Merge reports and plans may be stale; code, tests, schema, and migrations control this freeze. | Accepted |
| D-002 | Keep one canonical agent/capability/graph registry. | Contracts and registry tests protect referenced IDs and graph relationships. | Accepted |
| D-003 | Preserve the current enabled state of `CAP-CFO-FORECASTING`. | The checked registry record has `enabled: true`; a documentation freeze does not change capability state. | Accepted |
| D-004 | Use forward-only migration repair. | `0018_reconciliation_forward_repairs.sql` is additive; earlier migrations are not rewritten. | Accepted |
| D-005 | Separate release freeze from production verification. | Passing repository tests does not prove live infrastructure, identities, integrations, or data recovery. | Accepted |
| D-006 | Guard external effects in the tool gateway. | Tenant context, permission checks, approval ID, idempotency, and audit need to precede side effects. | Accepted |
| D-007 | Expose current product surfaces as typed API data. | `ProductSurfaceController` currently serves `/product-surfaces/:surface`; final docs describe this rather than conflicting historic route guidance. | Accepted |
| D-008 | Use in-memory workflow mode for development/test and Temporal for production. | Configuration defaults/constraints distinguish local validation from production operation. | Accepted |
| D-009 | Do not include secrets in frozen documentation. | Environment documentation names variables and ownership only. | Accepted |
| D-010 | Do not execute migrations, deploy, commit, push, or tag during this freeze. | Explicit release-freeze scope constraint. | Accepted |

## Change-control rule

Any decision that changes a public API, persisted schema, capability enablement, tenant boundary, approval policy, or external side-effect path must update the affected canonical document, acceptance criteria, and production gate before a release is declared ready.
