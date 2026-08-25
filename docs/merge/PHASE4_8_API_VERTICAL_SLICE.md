# Phase 4–8 API Vertical Slice

This batch now includes the first API-facing Marketing OS plan endpoint.

## Endpoint

`POST /marketing-os/plan`

Authentication:
- `ApiAuthGuard`
- tenant taken from authenticated identity
- optional body tenantId must match authenticated tenant

The endpoint returns:
- Marketing Commander plan
- current context snapshot
- acquisition graph snapshot
- readiness / `[NEEDS INPUT]` reasons

## Important implementation boundary

The endpoint uses in-memory context/memory/graph stores for the first vertical slice. This is intentional: it validates end-to-end contract flow without pretending persistence is production-ready.

The next production gate is:
- persistent memory repository
- persistent acquisition graph/domain storage
- real RAG adapter
- workflow creation/start integration
- execution and approval persistence
