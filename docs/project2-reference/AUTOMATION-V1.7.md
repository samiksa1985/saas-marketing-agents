# Automation & Workflow Intelligence V1.7

The automation engine is tenant-scoped and entitlement-gated.

## Definition

An automation contains a trigger and an ordered/branched graph of nodes.

Node types:
- TRIGGER
- CONDITION
- ACTION
- AI_DECISION
- WAIT
- APPROVAL
- END

## Triggers

- MANUAL
- EVENT
- SCHEDULE (cron stored in definition; scheduler integration can invoke the run endpoint)

## Conditions

EQ, NEQ, GT, GTE, LT, LTE, CONTAINS, NOT_CONTAINS, EXISTS, NOT_EXISTS, IN.

## Actions

- CREATE_TASK
- NOTIFY
- SCORE_LEAD
- DRAFT_PROPOSAL
- RUN_AGENT
- SET_CONTEXT

## Reliability

- Per-node retry policy
- Backoff
- Node execution guard
- AutomationRun persistence
- WAITING state
- BLOCKED approval state
- FAILED state with error
- Full tenant scoping

## Example

Lead created
→ SCORE_LEAD
→ CONDITION lead score >= 80
→ RUN_AGENT Sales
→ CREATE_TASK
→ NOTIFY
→ END

The engine is deliberately provider-agnostic and reuses the existing AI Orchestrator and CRM services.
