# AI Marketing OS — API Contract Map V1

## Auth
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

## Organization
- GET /api/organization
- PATCH /api/organization
- GET /api/organization/members
- POST /api/organization/members

## Onboarding / intelligence
- POST /api/onboarding/start
- POST /api/onboarding/message
- POST /api/onboarding/complete
- GET /api/company-intelligence
- PATCH /api/company-intelligence

## Knowledge
- POST /api/knowledge/documents
- POST /api/knowledge/documents/:id/process
- GET /api/knowledge/documents
- DELETE /api/knowledge/documents/:id
- POST /api/knowledge/search

## AI
- POST /api/ai/run
- GET /api/ai/runs/:id
- GET /api/ai/usage
- GET /api/ai/recommendations

## Agents / prompts — internal
- GET /api/admin/agents
- GET /api/admin/agents/:id
- GET /api/admin/prompts
- POST /api/admin/prompts
- POST /api/admin/prompts/:id/test
- POST /api/admin/prompts/:id/promote

## CRM
- GET/POST /api/leads
- GET/PATCH/DELETE /api/leads/:id
- GET/POST /api/contacts
- GET/POST /api/opportunities
- GET/PATCH /api/opportunities/:id
- GET/POST /api/activities
- GET/POST /api/tasks

## Marketing
- GET/POST /api/strategies
- GET/POST /api/campaigns
- GET/PATCH /api/campaigns/:id
- GET/POST /api/content
- GET/PATCH /api/content/:id
- POST /api/content/:id/approve
- POST /api/content/:id/request-changes
- GET/POST /api/creative
- GET/POST /api/seo
- GET/POST /api/landing-pages

## Analytics / reports
- GET /api/analytics/dashboard
- GET /api/analytics/campaigns
- GET /api/analytics/attribution
- GET /api/reports
- POST /api/reports/generate

## Finance / business
- GET /api/business/dashboard
- GET /api/finance/revenue
- GET /api/finance/costs
- GET /api/finance/profitability
- GET /api/finance/forecast
- POST /api/business/mentor

## Billing
- GET /api/billing/plans
- GET /api/billing/subscription
- POST /api/billing/checkout
- POST /api/billing/change-plan
- GET /api/billing/invoices

## Workflows / automation
- GET/POST /api/workflows
- POST /api/workflows/:id/run
- GET /api/workflows/runs/:id
- POST /api/automations
- POST /api/automations/:id/enable

## Integrations
- GET /api/integrations
- POST /api/integrations/:provider/connect
- POST /api/integrations/:provider/disconnect
- POST /api/integrations/:provider/sync

## Admin
- GET /api/admin/organizations
- GET /api/admin/usage
- GET /api/admin/system-health
- GET /api/admin/audit-logs

All endpoints must enforce session authentication and organization scope except explicitly public authentication endpoints.
