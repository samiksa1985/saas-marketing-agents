# AI Marketing OS — Full Product Scope V1

This document freezes the product scope that must be supported by the architecture from day one.

## Product surfaces

### Client Portal
- Executive Dashboard
- AI Marketing Chat
- Conversational Onboarding
- Company Intelligence
- Products & Services
- Brand Center
- ICP & Personas
- Competitors
- Marketing Strategy
- 30/60/90 Roadmap
- Content Studio
- Content Calendar
- Creative Studio
- Campaigns
- SEO
- Leads
- CRM
- Opportunities
- Proposals
- Approvals
- Tasks
- Analytics
- Reports
- Knowledge Base
- Documents
- Notifications
- Billing & Subscription
- Settings

### Internal Business Command Center
- Executive Dashboard
- Sales Pipeline
- Forecast
- Customers
- Customer Health
- Renewals
- Upsells
- Revenue
- MRR / ARR
- Costs
- AI Costs
- Delivery Costs
- Gross Profit / Margin
- Net Profit
- CAC / LTV
- Cash Flow
- Package Profitability
- Client Profitability
- Operations
- SLA
- Workflows
- AI Usage
- Agent Performance
- Prompt Management
- Model Management
- Recommendations
- Learning Mode
- Business Challenges
- Audit Logs
- System Health

### Admin Console
- Organizations
- Users
- Roles / Permissions
- Plans
- Pricing
- Features / Entitlements
- Add-ons
- Coupons / Discounts
- Subscriptions
- Invoices / Payments
- AI Providers / Models
- Agents
- Prompts / Versions
- Tools / Permissions
- Workflows
- Integrations
- Usage / Cost Controls
- Audit Logs
- Security / Data Policies
- System Health

## AI team

1. AI Orchestrator
2. Business Intelligence
3. Market Research
4. Marketing Strategist
5. Content
6. Campaign
7. Creative
8. SEO
9. Analytics & Growth
10. Sales
11. Customer Success
12. Automation
13. CFO Intelligence
14. AI Business Mentor

## Integration framework

The core must support adapters for:
- Web research
- Google services
- Microsoft services
- Meta / Instagram
- LinkedIn
- X
- TikTok
- WhatsApp
- Google Ads
- Meta Ads
- Google Analytics
- Search Console
- Email
- Calendar
- Payment providers
- External CRMs

Integrations are adapters, not hard-coded business logic.

## Full lifecycle

Lead → Qualification → Opportunity → Proposal → Negotiation → Won → Onboarding → Strategy → Production → Approval → Campaign → Measurement → Optimization → Renewal → Upsell

## Non-negotiable architecture principles

- Multi-tenant isolation from database to tool layer.
- Arabic RTL and English LTR are first-class.
- AI provider abstraction.
- Agent registry and versioned prompts.
- Tool permission matrix.
- Workflow orchestration with resumability.
- RAG with source attribution.
- Human approval gates for sensitive actions.
- Usage and AI cost accounting.
- Full audit trail.
- Configurable plans, pricing and entitlements.
- No client-facing AI action may bypass authorization.
- External integrations must be replaceable adapters.
