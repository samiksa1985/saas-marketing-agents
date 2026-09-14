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
| Campaign orchestration ports | EPIC07 `CampaignProviderCapabilityRegistry`, workflow binding, and existing action/policy/evidence ports | Unified campaign model, objectives, allocation rationale, provider budget semantics, campaign performance, and optimization remain Growth IP | High / high | campaign-orchestration provider / capability registry | Candidate only after another product proves the same provider-neutral contract |
| Performance intelligence ports | EPIC08 canonical telemetry normalization, attribution V1, diagnostics/anomalies, recommendations, simulations, outcomes, and learning records | Metric semantics, campaign evidence, optimization rules, and recommendation rationale remain Growth IP | High / high | evidence provider, model provider, audit provider, memory provider | Candidate only after a second product proves identical metric and governance semantics |
| Future customer-growth capability registry | EPIC08 design-only `FutureGrowthCapabilityRegistry` for CRM, lead management, conversations, AI receptionist, reputation/reviews, local presence, and multi-location growth | Customer lifecycle policy, provider mappings, and growth recommendations remain Growth IP | Medium / medium | capability provider registry | Contract-only; do not migrate or adopt a vendor yet |
| Customer identity and CRM capability ports | EPIC09 canonical lead/identity graph, `CRMProvider`, tenant capability records, consent/evidence contracts | Identity resolution policy, qualification, acquisition, revenue, campaign linkage, CRM mapping, and routing remain Growth IP | High / high | identity provider, CRM capability provider, evidence provider | Candidate only after another product proves the same first-party lifecycle semantics |
| Revenue intelligence evidence ports | EPIC09 opportunity, verified revenue event, attribution, funnel, diagnostic, and routing-recommendation contracts | Revenue semantics, currency policy, attribution limits, sales funnel diagnostics, and growth rules remain Growth IP | High / high | evidence/memory/audit provider | Preserve local implementation; no Core migration now |

## Boundaries preserved

Growth recommendations, unified campaign/action models, spend-impact
simulation, Google/Meta adapters and verification, marketing rollback,
marketing evidence, workflows, and API/UX remain in this product. The new
capability registry and existing policy/credential ports are narrow adaptation
seams, not a generic campaign, policy, or secret platform.

EPIC08 preserves future `PolicyProvider`, `EvidenceProvider`, `ModelProvider`,
`AgentRuntimeProvider`, `ApprovalProvider`, `AuditProvider`, `MemoryProvider`,
and `WorkflowProvider` compatibility through narrow local ports. The design-only
future capability registry has no Vendasta, Dynamics, Salesforce, HubSpot, CRM,
conversation, receptionist, review, or location implementation and no Core
runtime dependency.

EPIC09 preserves future `IdentityProvider`, `PolicyProvider`, `EvidenceProvider`,
`ApprovalProvider`, `AuditProvider`, `WorkflowProvider`, `SecretProvider`, and
`MemoryProvider` seams while retaining Growth-specific customer acquisition,
qualification, CRM mapping, funnel, attribution, and revenue intelligence IP.
No NAWA Core migration or vendor dependency is performed.

Premature Core migration performed: **NO**.
