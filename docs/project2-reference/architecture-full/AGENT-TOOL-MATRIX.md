# AI Marketing OS — Agent / Tool Matrix V1

| Agent | Read | Write | External | Approval |
|---|---|---|---|---|
| Orchestrator | registry, context, workflows | workflow state | no | controls gates |
| Business Intelligence | company, docs, RAG | company intelligence | optional web | strategy-sensitive changes |
| Market Research | company, RAG | research records | web/search | no publication |
| Strategist | company, research, analytics | strategies | no | strategy approval |
| Content | company, brand, strategy, RAG | content drafts | optional generation | publish approval |
| Campaign | strategy, CRM, analytics | campaign plans | ad adapters later | launch approval |
| Creative | brand, campaign, content | creative briefs/variants | image/video adapters | publication/launch |
| SEO | company, strategy, analytics | SEO plans/recommendations | search tools | publication |
| Analytics & Growth | campaigns, CRM, revenue | recommendations/experiments | analytics adapters | budget changes |
| Sales | CRM, company, proposals | leads/opportunities/proposals/tasks | email adapters later | external communication |
| Customer Success | CRM, analytics, billing | health/tasks/renewals/upsells | communication adapters | external communication |
| Automation | workflows, tools, entitlements | automation definitions/runs | integrations | sensitive actions |
| CFO Intelligence | billing, revenue, costs, usage | forecasts/recommendations | no | financial changes |
| Business Mentor | all permitted business metrics | learning records/challenges | no | advisory only |

## Sensitive actions

Require explicit authorization and approval before:
- spending ad budget
- changing financial settings
- sending external messages
- publishing public content
- changing subscriptions/pricing
- deleting business data
- modifying access permissions
