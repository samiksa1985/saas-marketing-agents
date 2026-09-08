# EPIC-01 — PostgreSQL Production Proof Evidence

## Evidence state

| Gate | State | Evidence |
| --- | --- | --- |
| Harness safety rails | STATIC VERIFIED | The harness requires `PHASE1_CONFIRM_DISPOSABLE=YES`, a target database name containing `phase1`, and a distinct admin database. |
| Migration chain `0000`–`0021` | PASS | Final disposable PostgreSQL evidence applied and verified all 22 journal entries. |
| Migrations `0020` and `0021` | PASS | Forward-only schema, RLS, durable approval, and recovery checks passed. |
| RLS and tenant isolation | PASS | Non-owner application-role CRUD and cross-tenant negative checks passed. |
| pgvector | PASS | pgvector `0.8.6`, `vector(1536)`, round trip, invalid-dimension rejection, and isolation passed. |
| Billing authority and concurrency | PASS | Authority, 20-worker/100-attempt contention, 20 idempotency replays, rollback, and isolation passed. |

## Harness coverage

`packages/db/scripts/phase1-postgres.ts` recreates only a local disposable
database, applies the journal in order, then fails closed on any migration or
assertion error. It checks:

- `0019` immediately follows `0018`, and `0020` immediately follows `0019`.
- Migration-chain behavior before and after the `0019` RLS repair.
- `0020` plan-ID/acquisition and execution-binding schema.
- RLS on every public tenant-owned table using a non-owner,
  `NOSUPERUSER`, `NOBYPASSRLS` application role.
- Missing tenant context; cross-tenant Select/Insert/Update/Delete; and
  transaction-local setting reset.
- pgvector extension, vector dimension/index, retrieval ordering, and tenant
  isolation.
- Billing quota boundary, concurrent consumption, idempotency, rollback, and
  tenant isolation.

## Final disposition

The repository-owned disposable runner and its fail-closed evidence verifier
both produced PASS. The complete baseline and its scope boundary are recorded
in `PHASE1_POSTGRES_FINAL_EVIDENCE.md`. Docker remains unavailable to the
Codex sandbox, but that does not invalidate the supplied local evidence.

## Local disposable execution

Run this from the repository root in a local PowerShell terminal with Docker
Desktop available. It creates no `.env` file and removes the disposable volume
after a successful or failed run.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\MBUZZ\saas-marketing-agents'
$env:PHASE1_POSTGRES_USER = 'phase1_owner'
$env:PHASE1_POSTGRES_PASSWORD = ([guid]::NewGuid().ToString('N') + 'Aa1!')
$env:PHASE1_POSTGRES_DB = 'ai_marketing_phase1'
$env:PHASE1_POSTGRES_PORT = '55432'
$env:PHASE1_CONFIRM_DISPOSABLE = 'YES'
docker compose -f infra/docker/docker-compose.phase1.yml up -d
$containerId = docker compose -f infra/docker/docker-compose.phase1.yml ps -q postgres
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if ((docker inspect -f '{{.State.Health.Status}}' $containerId) -eq 'healthy') { break }
  Start-Sleep -Seconds 2
}
if ((docker inspect -f '{{.State.Health.Status}}' $containerId) -ne 'healthy') {
  docker compose -f infra/docker/docker-compose.phase1.yml logs postgres
  throw 'Disposable PostgreSQL did not become healthy.'
}
$encodedPassword = [uri]::EscapeDataString($env:PHASE1_POSTGRES_PASSWORD)
$env:PHASE1_DATABASE_URL = "postgres://$($env:PHASE1_POSTGRES_USER):$encodedPassword@localhost:$($env:PHASE1_POSTGRES_PORT)/$($env:PHASE1_POSTGRES_DB)"
$env:PHASE1_ADMIN_DATABASE_URL = "postgres://$($env:PHASE1_POSTGRES_USER):$encodedPassword@localhost:$($env:PHASE1_POSTGRES_PORT)/postgres"
try {
  npm --workspace @platform/db run phase1:postgres
} finally {
  docker compose -f infra/docker/docker-compose.phase1.yml down -v
}
```

Return the terminal output from the final `PHASE1_POSTGRES_RESULT=` line only;
do not return URLs or passwords.
