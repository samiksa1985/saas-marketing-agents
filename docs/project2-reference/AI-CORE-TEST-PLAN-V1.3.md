# AI Core V1.3 Test Plan

1. Authentication required for every agent run.
2. User organization must equal request organization.
3. Missing AI entitlement blocks execution.
4. Monthly AI request limit blocks execution after the configured limit.
5. Agent can only call registry-declared tools.
6. Tool execution is tenant-scoped.
7. External tools cannot execute through the current safe tool set.
8. RAG retrieval is tenant-scoped.
9. AgentRun records status, model, token counts and estimated cost.
10. ToolCall records success/failure and latency.
11. UsageEvent records model usage.
12. Operational memory is tenant-scoped.
13. Structured output must validate against the agent envelope schema.
14. Tool loop must stop at the configured maximum rounds.
