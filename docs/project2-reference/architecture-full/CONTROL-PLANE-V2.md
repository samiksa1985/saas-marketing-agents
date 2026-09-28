# AI Marketing OS — Control Plane V2

## Purpose
This layer makes capability ownership, execution state, handoffs, model routing and evaluation explicit without replacing the existing 14 Core Agents.

## Components
- `config/capability-registry.json`: canonical capability ownership catalogue for the current Core Workforce.
- `lib/control-plane/capability-registry.ts`: validates capability definitions and detects owner conflicts.
- `lib/control-plane/state-machine.ts`: guarded execution lifecycle.
- `lib/control-plane/handoff.ts`: versioned handoff envelope with trace, evidence, confidence and provenance.
- `lib/control-plane/model-router.ts`: task/risk based model selection with environment overrides.
- `lib/control-plane/evaluator.ts`: deterministic required-field evaluation primitive.
- `lib/agents/registry.ts`: exposes capability IDs from the canonical capability registry.

## Architecture rule
Capability is the primary unit of ownership. Agents implement capabilities; tools are permissioned resources and do not imply ownership.

## Execution states
`PLANNED → QUEUED → RUNNING → WAITING_TOOL / WAITING_APPROVAL / RETRYING → SUCCEEDED / FAILED / BLOCKED / CANCELED`.

## Safety
External, financial, publishing and access-changing actions remain subject to the existing approval and tool-governance model. This change does not add new external tool adapters.

## Next
Add persistent execution tracing/idempotency and capability-level evaluation suites before introducing additional specialist runtime agents.
