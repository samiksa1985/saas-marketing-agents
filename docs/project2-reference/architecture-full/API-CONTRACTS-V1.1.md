# API Contracts V1.1

All APIs are versioned under `/api/v1` for public application contracts. Internal server actions may use service modules directly.

## Identity
- POST `/api/v1/auth/register`
- POST `/api/v1/auth/login`
- POST `/api/v1/auth/logout`
- GET `/api/v1/auth/me`

## Organizations
- GET/PATCH `/api/v1/organization`
- GET `/api/v1/organization/members`
- POST `/api/v1/organization/members`

## Onboarding & intelligence
- GET/PUT `/api/v1/company-profile`
- POST `/api/v1/onboarding/complete`
- POST `/api/v1/ai/run`

## Knowledge
- POST `/api/v1/documents`
- GET `/api/v1/documents`
- POST `/api/v1/documents/:id/ingest`
- POST `/api/v1/knowledge/search`

## CRM
- CRUD `/api/v1/leads`
- CRUD `/api/v1/contacts`
- CRUD `/api/v1/opportunities`
- CRUD `/api/v1/activities`
- CRUD `/api/v1/proposals`

## Marketing
- CRUD `/api/v1/strategies`
- CRUD `/api/v1/campaigns`
- CRUD `/api/v1/content`
- CRUD `/api/v1/creative-briefs`
- CRUD `/api/v1/seo/projects`
- CRUD `/api/v1/seo/tasks`
- GET `/api/v1/reports`

## Approvals
- GET `/api/v1/approvals`
- POST `/api/v1/approvals/:id/approve`
- POST `/api/v1/approvals/:id/reject`
- POST `/api/v1/approvals/:id/request-changes`

## Workflows & automation
- POST `/api/v1/workflows`
- GET `/api/v1/workflows/:id`
- POST `/api/v1/automations`
- POST `/api/v1/automations/:id/run`

## Finance & customer economics
- GET `/api/v1/finance/overview`
- GET `/api/v1/finance/profitability`
- GET `/api/v1/customers/health`
- GET `/api/v1/customers/renewals`
- GET `/api/v1/customers/upsell`

## Billing & usage
- GET `/api/v1/billing/subscription`
- GET `/api/v1/billing/invoices`
- GET `/api/v1/ai/usage`

## Admin
- CRUD `/api/v1/admin/plans`
- CRUD `/api/v1/admin/agents`
- CRUD `/api/v1/admin/prompts`
- GET `/api/v1/admin/usage`
- GET `/api/v1/admin/audit`

## Security contract

Every route must resolve the authenticated principal and organization from the server-side session/API key. Client-provided `organizationId` is never trusted for authorization.
