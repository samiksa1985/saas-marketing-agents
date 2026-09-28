# Canonical architecture

```mermaid
flowchart LR
  Web[Next product shell] --> API[Nest API control plane]
  API --> Contracts[Contracts + RBAC]
  API --> Registry[Registry / Commander]
  Registry --> Agent[Agent Runtime]
  API --> WF[Workflow provider + query]
  Agent --> Approval[Approval service]
  Agent --> Tool[Tool Gateway]
  API --> Domains[Domain packages + persistence]
  Domains --> DB[(PostgreSQL / RLS verification gate)]
```

```mermaid
sequenceDiagram
  participant U as Tenant user
  participant A as API/Agent Runtime
  participant P as Approval
  participant T as Tool Gateway
  U->>A: tenant-scoped request
  A->>A: RBAC, entitlement, evidence checks
  A->>P: approval where required
  P-->>A: approved id
  A->>T: idempotent tool call
  T->>T: tenant + permission + approval enforcement
```

```mermaid
flowchart TD
  Request --> Scope[withTenantScope / SET LOCAL]
  Scope --> Tx[Same transaction query]
  Tx --> RLS[PostgreSQL RLS]
  RLS --> Result[Tenant rows]
```

Actual containers are `apps/web`, `apps/api`, and `apps/worker`. In-memory workflow is dev/test; Temporal mode requires injected command adapter and durable read model. Context uses memory/knowledge with citations. Billing resolves subscription, plan, override and usage before atomic consumption. The 23 UI surfaces use typed `/product-surfaces/:surface` composition responses. Temporal, PostgreSQL, and external providers are production gates, not deployed facts.
