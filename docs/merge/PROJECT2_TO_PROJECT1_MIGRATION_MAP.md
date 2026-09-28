# Project 2 → Project 1 Migration Map

## Canonical repository

`saas-marketing-agents` remains the canonical engineering repository.

The project 2 codebase is treated as the **application/product reference and source of reusable domain capabilities**. We must not operate two parallel backends after the merge.

## Mapping

| Project 2 | Canonical destination | Decision |
|---|---|---|
| `app/*` | `apps/web` | Port UX/pages; do not retain a second Next.js application runtime |
| `app/api/*` | `apps/api` | Re-express domain endpoints as Nest controllers/services; preserve API contracts where useful |
| `lib/auth/*` | existing auth package | Merge missing concepts; keep one auth source |
| `lib/agents/*` | agent registry/runtime packages | Merge 14 domain leaders with existing specialist registry |
| `lib/control-plane/*` | workflow/agent-runtime packages | Extract compatible state/evaluator/handoff concepts; keep one control plane |
| `lib/workflows/*` | workflow runtime | Port workflow definitions; do not create second workflow engine |
| `lib/automation/*` | workflow/automation package | Port deterministic automation model |
| `lib/context-builder.ts` | context/knowledge package | Merge into one tenant-scoped context builder |
| `lib/memory.ts` | memory package | Adopt memory model and persistence concepts |
| `lib/rag.ts` | knowledge/RAG package | Adopt RAG/citation concepts |
| `lib/tools/*` | tool gateway | Merge specs, registry and permission model |
| `lib/marketing/*` | marketing domain services | Port business logic, not framework-specific plumbing |
| `lib/crm/*` | CRM domain services | Port domain concepts into canonical API/domain layer |
| `lib/entitlements/*` | entitlement/billing package | Merge plan + feature gating concepts |
| `lib/db/*` | canonical DB package | Map Prisma entities to canonical schema; no second DB layer |
| `prisma/*` | canonical DB migrations | Review model-by-model; adopt only missing entities/relations |
| `config/agent-registry.json` | generated/versioned domain-agent manifest | Keep as source input; specialist markdown remains authoritative where applicable |
| `config/capability-registry.json` | canonical capability registry | Merge 28 capabilities and remove duplicates |
| `docs/agents/*` | agent source/reference | Use as domain-leader prompt sources; do not supersede specialist source definitions blindly |
| `docs/architecture-full/*` | canonical architecture docs | Merge decisions into repository docs |
| `RESTORED-BACKUP/*` | archive only | **Do not merge**; it duplicates project 2 and is explicitly a backup |

## Important implementation rule

Project 1 already has a NestJS API, monorepo workspaces, a workflow runtime, security and approval tests. Project 2 is a Next.js monolith with Prisma. The final system must not ship two application backends. The safe merge is:

**Project 1 backend/runtime + Project 2 product/domain capabilities + Project 1 specialist workforce.**

## First code tranche

1. Canonical domain contracts.
2. Domain-leader registry.
3. Capability registry merge.
4. Memory/RAG/context contracts.
5. CRM/marketing/analytics domain ports.
6. UI port into existing web app.
7. Durable persistence behind existing workflow contracts.
8. Marketing Commander.
