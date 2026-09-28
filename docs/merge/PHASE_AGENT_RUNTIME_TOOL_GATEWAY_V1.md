# Agent Runtime + Tool Gateway V1

One controlled execution boundary for the final architecture.

Tool Gateway enforces tenant identity, permissions, tool allow/deny policy, idempotency, and approval for external side effects.

Agent Runtime enforces capability ownership and tool allow-lists, then invokes tools only through Tool Gateway and sends their results to a pluggable model provider.

Workflow Runtime remains the owner of workflow/task state. Agents never receive direct credentials or direct network access.
