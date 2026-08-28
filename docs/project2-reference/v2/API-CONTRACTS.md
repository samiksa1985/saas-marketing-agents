# V2 API Contracts

## Billing
GET /api/v1/billing/plans
POST /api/v1/billing/meter
POST /api/v1/billing/checkout
POST /api/v1/billing/subscription
GET /api/v1/billing/invoices

## Integrations
GET /api/v1/integrations
POST /api/v1/integrations/connect
POST /api/v1/integrations/disconnect
POST /api/v1/integrations/:id/sync
GET /api/v1/integrations/:id/health
POST /api/v1/webhooks/:provider

## Enterprise
POST /api/v1/api-keys
POST /api/v1/webhook-endpoints
POST /api/v1/data/export
POST /api/v1/data/delete

## Admin
GET /api/v1/admin/organizations
GET /api/v1/admin/usage
GET /api/v1/admin/agents
GET /api/v1/admin/prompts
GET /api/v1/admin/workflows
GET /api/v1/admin/audit
GET /api/v1/admin/system-health
GET /api/v1/admin/feature-flags
