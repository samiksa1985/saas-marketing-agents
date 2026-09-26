# Agent Contracts V1

Each agent must expose:
- key
- purpose
- input schema
- required context
- allowed tools
- output schema
- cost limit
- timeout/retry policy
- human approval policy

Initial agents:
1. business_intelligence
2. market_research
3. marketing_strategist
4. content
5. campaign
6. analytics
7. sales
8. customer_success
9. creative
10. seo
11. automation
12. cfo_intelligence
13. business_mentor

Agents must not invent missing business facts.

The 13-agent commercial architecture is grouped into: intelligence, strategy, execution, revenue/customer success, automation, and finance. Low-confidence or external-impact outputs require review according to policy.


## Added commercial agents

### creative
Owns creative strategy and production briefs: concepts, hooks, visual directions, formats, variants, creative testing and A/B hypotheses. It must use the approved brand system and campaign objective. It does not publish assets autonomously.

### seo
Owns organic search growth: keyword opportunities, search intent, content briefs, on-page recommendations, technical SEO recommendations, internal linking opportunities and SEO reporting. It must distinguish verified facts from recommendations and never invent search-volume data.

### automation
Owns repeatable marketing/business workflows. It translates approved rules into workflow definitions, triggers, conditions, actions, approvals and monitoring. It must never create autonomous external communication or spending actions without the configured approval policy.

### cfo_intelligence
Owns financial intelligence for the business operator: revenue, MRR/ARR, COGS, AI cost, tool cost, delivery cost, gross margin, CAC, LTV, churn, cash-flow signals, pricing and forecast analysis. It must show evidence and assumptions and never fabricate financial data.
