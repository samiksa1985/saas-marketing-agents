# AI Marketing OS — Architecture V1

## Status
- Foundation: **Partially Implemented** (application scaffold + data model + MVP UI)
- AI Core: **Partially Implemented** (provider abstraction + mock strategy endpoint)
- Database: **Implemented as schema** (requires PostgreSQL provisioning and Prisma migration)
- Authentication/RBAC: **Planned**
- Billing: **Planned**
- Production AI provider: **Planned**
- Document ingestion/vector retrieval: **Planned**

## Runtime architecture
```text
Browser
  -> Next.js App Router
  -> Application/API layer
  -> Auth + tenant context
  -> Domain services
  -> AI Orchestrator
      -> Context Builder
      -> Retriever
      -> Agent
      -> Provider abstraction
      -> Output validator
      -> Workflow/approval
  -> PostgreSQL + object storage
```

## Tenant isolation
Every tenant-owned model carries `organizationId`. Production authorization must enforce the organization scope server-side and, when using Supabase/Postgres RLS, at the database boundary as well.

## AI abstraction
`AIProvider` separates business logic from model vendors. The current MVP uses `MockAIProvider`; replace it with a real provider adapter after credentials and model policy are configured.
