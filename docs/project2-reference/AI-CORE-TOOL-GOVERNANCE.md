# AI Core — Tool Governance

## Tool classes

- READ: tenant-scoped retrieval only.
- WRITE: creates or changes internal records; approval is required at workflow level where the action is consequential.
- EXTERNAL: reaches outside the tenant/system; requires an approval-capable agent and later connector-specific policy.
- FINANCIAL: financial data or actions; never allowed to bypass financial approval policy.

## Current execution policy

V1.3 implements a safe read-tool set for the AI runtime. External/write tool adapters remain explicitly unimplemented rather than being silently simulated.

## Tool loop

The OpenAI provider may execute a bounded number of function-call rounds. Every tool call is checked against the agent registry and persisted in `ToolCall` with status, input, output/error and latency.

## Tenant isolation

Every tool execution requires an organization scope and authenticated user. Retrieval queries are filtered by `organizationId`.
