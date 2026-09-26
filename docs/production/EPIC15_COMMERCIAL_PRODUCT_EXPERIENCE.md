# EPIC15 commercial product experience

## Purpose

EPIC15 turns the existing Growth Intelligence OS foundations into one bilingual, tenant-aware pilot experience. It adds no domain authority, provider transport, credential handling, or database schema. The application remains an evidence-first presentation and composition layer over existing API authorities.

## Information architecture and routes

Primary navigation: Overview (`/`), Growth Workspace (`/growth-workspace`), Campaigns, Customers, Conversations, Journeys, Approvals, Analytics, Integrations, and Reports. Administration: Workspace Settings, Users & Roles, AI & Governance, Billing / Plan, and Audit & Evidence. Onboarding is available at `/onboarding`.

The route model is in `apps/web/app/product-model.ts`; all labels are English/Arabic pairs and the shell switches `dir` between LTR and RTL. Arabic content is written explicitly, while provider names, IDs, and backend identifiers remain unchanged where appropriate.

## Pilot journey

Sign in and tenant context precede onboarding. The onboarding sequence is Workspace, Business profile, Goals, Market/audience, Channels, Provider integrations, Governance preferences, Readiness review, and Growth Workspace. Partial integrations are valid. A provider is only described as connected after the provider-integration API returns evidence; otherwise the UI communicates needs configuration, unavailable, disabled, or approval-required status.

Overview intentionally renders source-attributed unknown data rather than zeros. Growth Workspace separates AI recommendation, simulation, human approval, executed action, and verified result. Campaigns use unified campaign, performance, and readiness routes. Customers use lead/opportunity/funnel routes; Conversations use engagement, handoff, and follow-up routes and contain no send control; Journeys use lifecycle/journey routes. The Approval Center is presentation over the existing approval authority only. Analytics does not represent correlation as causal attribution. Reports are in-app pilot report concepts, not a new export authority.

## API and RBAC mapping

`CanonicalApiClient` is the single authenticated frontend read boundary for shared list/read endpoints. The screen model maps each page to existing backend routes, including `GET /approvals`, `/revenue-intelligence`, `/leads`, `/customer-engagement/conversations`, `/customer-journey/:identityId`, `/lifecycle-activation/plans/:key`, `/campaigns/unified/:campaignId`, and `/provider-integrations/*`.

The UI checks display state but never substitutes for server authorization. Existing server-side permissions remain authoritative: `artifact:read`, `approval:decide`, `audit:read`, `organization:*`, `billing:admin`, and `integration:admin` where relevant. No new approval, policy, execution, outbox, health, or reliability authority is introduced.

## Security and live-state rules

The frontend does not include provider credentials, authorization headers in rendered content, tokens, refresh tokens, or developer tokens. Integration display is capability-centric and uses sanitized binding, capability, health, readiness, and verification metadata. No EPIC15 surface makes a direct consequential provider request, sends customer communication, or claims execution/verification without backend evidence.

The pilot can operate with a real tenant and partial real integrations. Google governed readiness and Meta readiness remain what the backend returns; CRM and communications may be mock/unconnected. Billing stays explicitly unavailable until an authoritative billing read model exists. Entity-key pages remain unavailable until a selected authoritative record is supplied rather than guessing or manufacturing a result.

## Deferred items

Real authentication/session injection, selected-record URL state, paginated interactive lists, report export, and live provider setup flows require their respective existing backend authorities to be wired into a deployed tenant session. They are deliberately not simulated by EPIC15.
