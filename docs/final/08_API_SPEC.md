# API specification

All protected API routes use bearer authentication through `ApiAuthGuard`; tenant identity is derived from `TenantContext`, never an `x-tenant-id` header.

| Method/path | Purpose and state | Permission / tenant behavior |
| --- | --- | --- |
| GET `/health`, `/ready`, `/i18n/context` | Control-plane health/readiness/locale | Health is public; readiness reports configured state, not infrastructure verification. |
| GET `/agents`, `/agents/:agentId`, `/workstreams`, `/graphs/:version` | Registry reads | `workflow:read`; no caller tenant spoofing. |
| POST `/workflows`; GET workflow/tasks/artifacts/handoffs/readiness; POST lifecycle/task commands | Canonical workflow control | Read/execute/artifact permissions; query boundary serves reads. |
| POST/GET `/approvals`, GET `/approvals/:id`, POST decision | Approval records | Create/decide/read permissions and tenant isolation. |
| POST `/marketing-os/plan`, `/execute`, `/start/:planId`; GET `/runs/:planId` | Marketing OS control slice | Authenticated tenant; execution stays approval-aware. |
| GET `/product-surfaces/:surface` | Typed 23-surface composition state | Per-surface permission; returns ready, empty, or unavailable rather than fabricated data. |

Domain packages without a listed public record endpoint are not imaginary APIs. Billing usage is explicitly unavailable until authoritative deployed persistence binding exists.
