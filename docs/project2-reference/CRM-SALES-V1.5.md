# CRM & Sales Intelligence V1.5

## Scope
Lead management, contacts, opportunities, activities, lead scoring, next-best-action, proposals, pipeline intelligence and weighted forecasting.

## Lead Scoring
Score combines fit, intent, engagement and timing. Each scoring run creates an immutable LeadScoreSnapshot and updates the current Lead.score.

## Sales Copilot
The Sales Agent can use `crm_read`, `sales_intelligence` and `proposal_draft` subject to tool permissions and tenant isolation.

## Forecast
Weighted forecast = sum(opportunity.amount * probability). Forecasts are time-bounded by expected close date.

## Proposal Engine
Creates a structured draft proposal; client-facing sending remains approval-gated.

## APIs
- GET/POST /api/v1/crm/leads
- POST /api/v1/crm/leads/:id/score
- GET/POST /api/v1/crm/opportunities
- GET /api/v1/crm/forecast?period=MONTH
- POST /api/v1/crm/proposals
