# EPIC-02.5 — Durable Governance, Knowledge, and Restart Recovery

## Scope and source of truth

This document describes the current repository implementation. The complete
repository-owned disposable PostgreSQL Phase 1 baseline has passed; it does not
claim a production migration or deployment.

`0020_persistent_marketing_os_runtime.sql` remains logically correct and is
not edited. Forward migration
`0021_durable_marketing_os_approvals.sql` adds the separate durable concerns:

- tenant-scoped `marketing_os_approval_records`, including stable API IDs,
  plan/workflow links, idempotency, decision audit fields, and RLS;
- immutable-forward embedding provenance fields on knowledge chunks
  (`embedding_provider`, `embedding_model`, `embedding_version`, and
  `embedded_at`), plus a tenant/provenance index.

## Canonical approval service and recovery

`ApprovalApiService` remains the canonical API service. It now depends on a
tenant-scoped `DurableApprovalRepository`; it no longer owns approval maps or
idempotency maps. Nest composes `ApiTenantDurableApprovalRepository` for a
durable workflow or production. That adapter executes the PostgreSQL repository
inside `ApiTenantDatabase`, which establishes `app.tenant_id` in the same
transaction as the read/write.

The only in-memory approval repository is named and retained as an explicit
development/test composition fallback. It is not selected for production.
Marketing OS execution now awaits the canonical asynchronous approval gateway
and persists plan/workflow references when requesting approval. A fresh API
service instance reads an existing injected repository record rather than
process-local state.

## Durable knowledge and embeddings

`PostgresKnowledgeDocumentRepository` performs tenant-bound document upsert,
chunk upsert/re-embedding, and delete against the existing RLS-protected
knowledge tables. Each chunk write calls a provider-neutral `EmbeddingProvider`
whose mode is either `external` or `local`; every response must match the
configured provider/model/version and have a finite 1536-dimensional vector.
There is no production in-memory embedding fallback.

`PersistentKnowledgeRetriever` uses the same provider contract, SQL tenant
predicates, ready-document filtering, optional JSONB metadata containment, and
an application-side tenant check before evidence leaves the repository. An
unconfigured durable application composition fails closed before returning
fabricated knowledge.

## External action lifecycle contract

`@platform/marketing-os-core` exposes the provider-neutral
`ExternalMarketingAction` lifecycle:

`DRAFT → APPROVAL_REQUIRED → APPROVED → DISPATCHING → DISPATCHED → ACKNOWLEDGED`

`CANCELLED` may be reached before dispatch. `FAILED` may be reached from
dispatching or dispatched. Both are terminal, as are `ACKNOWLEDGED` and
`CANCELLED`. The contract requires tenant, plan, workflow, and idempotency
identity; approval is required for transition to `APPROVED`. It intentionally
does not implement a vendor integration or dispatch any external action.

## Real PostgreSQL evidence procedure

Run only from a local PowerShell terminal with Docker access:

```powershell
Set-Location C:\Users\MBUZZ\saas-marketing-agents
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-phase1-postgres-local.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-phase1-postgres-evidence.ps1
```

The runner generates an in-memory password, starts only the named disposable
Compose database, waits for health, records full harness evidence under
`artifacts/phase1-postgres/`, fails if the final JSON is absent or non-PASS,
and removes the Compose container/volume unless `-KeepRunning` is specified.
The verifier fails closed unless the most recent evidence proves migration
chain through `0021`, RLS/tenant isolation, non-owner role behavior, pooled
tenant-reset behavior, pgvector, and billing concurrency/idempotency/rollback
checks. Do not return URLs or passwords as evidence.

## Current verification state

- TypeScript typecheck: executed and passing after EPIC-02.5 source changes.
- Repository unit tests: rerun as part of final Phase 1 closeout.
- Real PostgreSQL migration/RLS/billing proof: **PASS**. The local runner and
  fail-closed verifier emitted the required PASS records; see
  `PHASE1_POSTGRES_FINAL_EVIDENCE.md`.
