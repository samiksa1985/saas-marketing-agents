# API Specification V1

## GET /api/health
Returns service health.

## POST /api/ai/strategy
Input:
```json
{"company":"string","industry":"string","goal":"string"}
```
Output:
```json
{"status":"generated","strategy":{...},"provider":"mock"}
```

## Planned API groups
- `/api/auth/*` authentication/session
- `/api/organizations/*` tenant lifecycle
- `/api/onboarding/*` conversational onboarding
- `/api/knowledge/*` upload/ingestion/retrieval
- `/api/agents/*` agent catalog and runs
- `/api/crm/*` leads/contacts/opportunities
- `/api/marketing/*` strategies/content/campaigns
- `/api/approvals/*` internal/client approval
- `/api/analytics/*` metrics/reports
- `/api/business/*` MRR/profitability/mentor
- `/api/billing/*` plans/subscriptions/invoices
