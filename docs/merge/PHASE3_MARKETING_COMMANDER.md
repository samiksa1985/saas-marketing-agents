# Phase 3 — Marketing Commander

## Purpose

Introduce the business-level planning layer above the canonical agent registry.

### Separation of responsibilities

- **Marketing Commander** — interprets a business goal, diagnoses context, selects domain leaders/specialists/workstreams, produces a governed plan.
- **AI Orchestrator** — coordinates technical agent/tool execution and state.
- **CATALYST / Workflow Runtime** — remains the authoritative orchestration and execution-state layer.
- **Automation** — remains deterministic trigger/condition/action workflow logic.

## Guardrails

- No direct external side effects.
- No permission bypass.
- No invented business context.
- Unknowns become `[NEEDS INPUT]`.
- External execution remains approval/policy gated.
- Specialist selection is deterministic and auditable in this phase; LLM-based planning can be layered later without changing the contract.

## Current planner

The first planner:
1. infers a marketing objective from the goal when not explicitly supplied;
2. selects domain leaders;
3. selects a bounded specialist shortlist;
4. selects existing workstream IDs;
5. builds an ordered plan;
6. surfaces missing inputs;
7. sets approval/governance requirements.

## Next

Phase 4 will connect the commander plan to the persistent context/memory layer and the actual workflow runtime.
