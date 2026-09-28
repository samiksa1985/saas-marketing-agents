# AI Marketing OS — System Architecture V1

```text
Client / Internal User / Admin
          |
      Next.js UI
          |
     API / Auth Layer
          |
   Authorization + Tenant Guard
          |
  Application Service Layer
          |
+---------+-------------------------------+
|                                         |
|       AI Orchestration Platform        |
|                                         |
| Intent Router -> Context Builder        |
|              -> Agent Runtime           |
|              -> Tool Gateway            |
|              -> Approval Engine         |
|              -> Workflow Engine         |
|                                         |
+---------+-------------------------------+
          |                 |
      AI Provider       Knowledge/RAG
          |                 |
   OpenAI / adapters    Object Storage
                         Extractors
                         Chunker
                         Embeddings
                         Vector Search
                         Reranker
          |
     PostgreSQL
          |
 Billing / CRM / Marketing / Analytics / Audit / Usage
          |
 Background Jobs / Queue / Scheduler
          |
 External Integration Adapters
```

## Layers

### Presentation
- Client portal
- Business command center
- Admin console
- Shared design system
- i18n / RTL

### Identity & security
- Session authentication
- RBAC
- Organization membership
- Tenant guard
- Rate limits
- Audit logging

### Domain layer
- CRM
- Marketing
- Content
- Campaigns
- SEO
- Sales
- Customer Success
- Finance
- Billing
- Operations

### AI platform
- Agent registry
- Prompt registry
- Prompt evaluation
- Model routing
- Context builder
- RAG
- Tool gateway
- Structured output validation
- Agent handoffs
- Cost controls

### Workflow platform
- Workflow definitions
- Workflow runs
- Step dependencies
- Approval gates
- Retries
- Idempotency
- Resumability
- Scheduled jobs

### Data platform
- PostgreSQL
- pgvector
- Object storage
- Analytics events
- Usage events
- Audit logs

## Full-scope rule

Every major feature must be represented as a domain/module and contract now, even if the first implementation is a stub or adapter. This prevents future core rewrites.
