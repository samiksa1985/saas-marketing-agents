# AI Marketing OS — Phases 4–7 Integration Batch

This batch is the next continuous build block and is intentionally additive.

## Included

### Phase 4 — Context + Memory
- Tenant-isolated memory repository
- Knowledge retrieval abstraction
- Context builder
- Provenance/evidence sources

### Phase 5 — Acquisition Graph
- Company → account → contact → signal → intent → campaign → interaction → lead → opportunity → customer → revenue graph
- Tenant boundary checks
- Path traversal

### Phase 6 — Marketing OS Core
- Context-first planning
- Marketing Commander consumes memory/knowledge evidence
- Readiness and `[NEEDS INPUT]` gates
- Acquisition graph attached to plan output

### Phase 7 — Measurement / Growth
- Outcome events
- Funnel snapshot
- Revenue-oriented measurement
- Initial Growth Insight generation

## Architectural rules

1. Existing 71 specialists remain intact.
2. Existing 13 workstreams remain intact.
3. CATALYST remains workflow/orchestration authority.
4. Marketing Commander remains the business planning layer.
5. Context/Memory never crosses tenant boundaries.
6. External side effects remain approval-gated.
7. Unknown information becomes `[NEEDS INPUT]` instead of invented facts.
8. Commercial segmentation is not embedded in the core.
9. The new packages are capability layers, not a replacement backend.

## Next integration gates

After local/CI verification:
1. connect persistent memory/RAG adapters;
2. expose Marketing OS plan endpoint;
3. connect plan to workflow creation/start;
4. connect outcome events to real analytics sources;
5. add autonomous learning loop and evaluation.
