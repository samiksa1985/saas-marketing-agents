# NAWA Core Migration Candidates

This is an architectural inventory, not a migration plan. NAWA Growth
Intelligence OS remains independently deployable and retains all growth-domain
IP. No Core runtime dependency is introduced here.

| Capability | Current implementation / affected modules | Domain dependencies | Difficulty / breaking risk | Suggested Core interface | Recommended phase |
| --- | --- | --- | --- | --- | --- |
| Tenant isolation | PostgreSQL transaction-local RLS in `packages/db`, `apps/api/src/tenant-database.ts` | Every tenant-owned Growth record | High / high | tenant transaction context | Core foundation after parity proof |
| Identity and RBAC | `@platform/auth`, `@platform/contracts`, API guards | Marketing policy and approval roles | Medium / high | identity/authorization provider | Core foundation |
| External-action policy | Local durable policy store in `marketing-os-persistence`; `ExternalActionPolicyProvider` port | Google target, spend, approval semantics remain Growth IP | Medium / medium | policy resolution provider | After generic-policy requirements are proven |
| Approvals | Existing Phase-1 durable approval repository and `ExternalActionApprovalGateway` | Marketing risk/payload content | Medium / medium | approval provider | Reuse-compatible migration |
| Audit and evidence | Policy audit, action evidence, and outbox in persistence | Campaign, KPI, simulation, and verification evidence remain Growth IP | Medium / high | evidence/audit transport | Incremental, schema-compatible |
| Workflow runtime | `@platform/workflow-runtime` and action workflow correlation/outbox | Marketing workflow definitions | High / high | workflow continuation provider | Core runtime maturity phase |
| Secrets | `GoogleAdsCredentialResolver` in Tool Gateway | Google Ads credential names and OAuth semantics | Medium / medium | provider secret resolver | Core secret-service integration |
| Tool gateway | `@platform/tool-gateway`, governed dispatch capability | Google Ads adapter, mutations, verification | Medium / medium | governed tool-execution provider | After transport registry exists |
| Entitlements | Phase-1 authoritative billing access | Marketing external-action entitlement key | Medium / medium | entitlement provider | Core commercial-platform phase |
| Generic external-action primitives | `GovernedExternalActionExecutor` lifecycle/opaque dispatch | Action types, simulation, rollback and evidence are Growth IP | High / high | idempotent external-action execution primitive | Extract only after a second product proves shared semantics |

## Boundaries preserved

Growth recommendations, campaign/action models, spend-impact simulation, Google
Ads adapter and verification, marketing rollback, marketing evidence, workflows,
and API/UX remain in this product. The new policy and credential ports are narrow
adaptation seams, not a generic policy or secret platform.

Premature Core migration performed: **NO**.
