# Product UX Merge Matrix

## Decision

The canonical Next.js frontend in `apps/web` and the canonical API in
`apps/api` are preserved. Project2 material is used as a product reference
only. No Project2 runtime, RESTORED-BACKUP artifact, parallel REST API,
database, Prisma schema, auth model, or tenant model is imported.

| Project2 reference / concept                                  | Canonical product destination | Decision  | Data and safety boundary                                                                                                                                 |
| ------------------------------------------------------------- | ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executive dashboard                                           | `/` Executive Dashboard       | MERGE     | Composition only; ACTUAL, ESTIMATED, or MODELED provenance is required before values render.                                                             |
| AI command surface                                            | `/ai-command`                 | MERGE     | Reads canonical agent and Marketing OS run state; this frontend has no external execution action.                                                        |
| Company intelligence                                          | `/company-intelligence`       | MERGE     | Canonical company-intelligence composition with evidence and confidence.                                                                                 |
| Market intelligence                                           | `/market-intelligence`        | MERGE     | Canonical market composition; no competitor facts are fabricated.                                                                                        |
| ICP / persona engine                                          | `/icp-personas`               | MERGE     | Consumes canonical ICP composition; does not recreate an ICP engine.                                                                                     |
| Strategy workspace                                            | `/strategy`                   | MERGE     | Canonical strategy artifact composition and approval state.                                                                                              |
| Campaign workspace                                            | `/campaigns`                  | MERGE     | Canonical marketing execution artifacts; publish remains unavailable pending Gateway and approvals.                                                      |
| Content Studio                                                | `/content-studio`             | MERGE     | Canonical content artifacts; drafts do not imply publication.                                                                                            |
| Creative Studio                                               | `/creative-studio`            | MERGE     | Canonical creative artifacts; no external publishing control.                                                                                            |
| SEO workspace                                                 | `/seo`                        | MERGE     | Canonical SEO composition; recommendations never apply directly to properties.                                                                           |
| Sales / CRM                                                   | `/sales-crm`                  | MERGE     | Canonical sales intelligence composition; approval does not send a proposal.                                                                             |
| Customer Success                                              | `/customer-success`           | MERGE     | Canonical customer-success composition; risk is advisory and evidence-bounded.                                                                           |
| Analytics / experiments                                       | `/analytics-experiments`      | MERGE     | Canonical analytics composition and deterministic evaluator provenance.                                                                                  |
| CFO dashboard                                                 | `/finance-cfo`                | MERGE     | Canonical CFO composition; financial values are never invented.                                                                                          |
| Automation                                                    | `/automation`                 | MERGE     | Canonical Workflow Runtime composition; frontend is not an execution engine.                                                                             |
| Knowledge / documents                                         | `/knowledge`                  | MERGE     | Canonical knowledge composition, citations, and source references; no separate RAG system.                                                               |
| Approval center                                               | `/approvals`                  | MERGE     | Existing canonical `GET /approvals`; human `approval:decide` is required for decisions.                                                                  |
| Workflow operations                                           | `/workflows-operations`       | MERGE     | Existing canonical workflow/readiness API and artifact/handoff composition.                                                                              |
| AI team registry                                              | `/ai-team`                    | MERGE     | Existing canonical `GET /agents`; no duplicate agent registry.                                                                                           |
| Business Mentor                                               | `/business-mentor`            | MERGE     | Advisory-only composition; sensitive execution controls are intentionally absent.                                                                        |
| Billing and usage                                             | `/billing-usage`              | MERGE     | Canonical billing/entitlement composition; no provider success without integration.                                                                      |
| Tenant settings                                               | `/settings`                   | MERGE     | Canonical organization/integration composition; no second tenant model.                                                                                  |
| Admin and Governance                                          | `/admin-governance`           | MERGE     | Canonical GovernanceService composition; server policy remains authoritative, feature flags never authorize, deletion is request → approval → execution. |
| Project2 architecture / RBAC / audit material                 | All guarded surfaces          | REFERENCE | Reconciled against the canonical Auth, RBAC, Audit, Approval, Tool Gateway, and Governance contracts.                                                    |
| Project2 runtime, API, Prisma, database, auth, tenant context | None                          | REJECT    | Canonical implementation already owns those capabilities.                                                                                                |
| RESTORED-BACKUP material                                      | None                          | REJECT    | Explicitly excluded from implementation and route decisions.                                                                                             |

## Reconciliation notes

- The interface is one application shell with the requested eight navigation
  groups: Overview, Intelligence, Marketing, Revenue, Insights, Operations,
  AI Platform, and Management.
- Each product surface has a typed data-state model. A composition not
  implemented by the existing canonical API renders an explicit unavailable
  state rather than placeholder business data.
- The read-only client in `apps/web/app/canonical-api.ts` calls only existing
  canonical API endpoints. It does not supply a tenant identity header, create
  a parallel API, or report external success.
- UI visibility and eventual actions must remain guarded independently by
  tenant context, permission, entitlement, approval status, and the canonical
  Tool Gateway. A feature flag is never an authorization grant.
