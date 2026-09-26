# AI Marketing OS — Final Universal Architecture

**Decision:** Build one complete universal product. Do not create separate core architectures for SMB, enterprise, government, or institutions. Commercial segmentation is a packaging/customization concern after the universal core is working.

## Product

> **AI Marketing OS** — an AI-native marketing and customer-acquisition operating system that understands the business, plans marketing work, coordinates specialist agents, executes approved actions, measures business outcomes, learns from results, and continuously improves.

## Canonical layers

1. **Client Experience**
   - onboarding
   - executive dashboard
   - AI marketing workspace/chat
   - strategy
   - campaigns
   - content
   - SEO/AEO/GEO
   - CRM / leads / opportunities
   - approvals
   - analytics / reports
   - knowledge / documents
   - billing / settings

2. **Marketing Commander**
   - receives business goals
   - decomposes goals into objectives, workstreams and capabilities
   - chooses the required domain leaders and specialist agents
   - owns replanning and outcome management
   - never bypasses policy or authorization

3. **Domain Intelligence**
   - Business Intelligence
   - Market Intelligence
   - Customer Intelligence
   - Account Intelligence
   - Competitive Intelligence
   - Signal / Intent Intelligence
   - Revenue Intelligence
   - Growth Intelligence

4. **Strategy**
   - ICP / segmentation
   - personas / buying committee
   - positioning
   - messaging
   - offers
   - channel strategy
   - GTM / growth plans
   - campaign strategy

5. **Agent Workforce**
   - domain-leader agents from AI Marketing OS
   - the existing 71 specialist agents from SaaS Marketing Agents
   - consolidated, versioned, evidence-aware specialist capabilities

6. **CATALYST + Workflow / Automation Control Plane**
   - dependency graph
   - deterministic workflow state machine
   - tasks / attempts / leases
   - handoffs
   - acceptance gates
   - human approvals
   - retries / repair
   - schedules
   - idempotency
   - resumability

7. **Execution Fabric**
   - CRM
   - email
   - social
   - paid media
   - websites / forms
   - analytics
   - calendar
   - notifications
   - external tools
   - all behind permissioned adapters

8. **Knowledge / Memory**
   - company memory
   - account memory
   - customer memory
   - campaign memory
   - interaction memory
   - organizational learning
   - RAG with citations / provenance

9. **Measurement / Learning**
   - funnel
   - attribution
   - CAC / pipeline / revenue / profitability
   - campaign performance
   - experiments
   - anomaly detection
   - recommendations
   - learning loop

10. **Platform Governance**
    - auth / RBAC / tenancy
    - entitlements
    - policy engine
    - tool permissions
    - AI provider routing
    - prompt/version management
    - audit
    - AI cost accounting
    - evaluation
    - security / data governance

## Agent hierarchy

### Executive
- Marketing Commander

### Platform / control
- AI Orchestrator
- Automation / Workflow Controller

### Domain leaders
- Business Intelligence
- Market Research
- Marketing Strategist
- Campaign
- Content
- Creative
- SEO
- Analytics & Growth
- Sales
- Customer Success
- CFO Intelligence
- AI Business Mentor
- additional domain leaders created only when a capability boundary is proven

### Specialists
- Existing 71 specialist agents from `saas-marketing-agents` remain the specialist workforce and are consolidated by responsibility, not by count.

## Core business graph

```text
Company
  -> Market
  -> ICP / Segment
  -> Account
  -> Buying Committee
  -> Signal / Intent
  -> Opportunity
  -> Strategy
  -> Campaign
  -> Message / Creative / Content
  -> Interaction
  -> Lead
  -> Qualified Lead
  -> Opportunity
  -> Customer
  -> Revenue
  -> Outcome
  -> Learning
  -> Next Action
```

## Autonomy

L0 Explain
L1 Recommend
L2 Draft
L3 Execute with approval
L4 Execute within policy
L5 Autonomous

Risk and approval policies are configured by capability and action, not by customer segment.

## Universal-core rule

The core must be complete and internally coherent first. A commercial package may later enable/disable modules, configure limits, add integrations, or add deployment/governance features. Those are packaging/customization layers and must not fork the business logic.

## Non-goals

- Do not build separate SMB/enterprise/government code paths.
- Do not duplicate CRM, ad networks, email infrastructure or data providers unnecessarily.
- Do not add agents for vanity.
- Do not replace deterministic workflows with LLM routing where deterministic logic is safer.
- Do not expose internal agent complexity as the customer product.
