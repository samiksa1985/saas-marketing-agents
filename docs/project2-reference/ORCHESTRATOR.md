# AI Orchestrator Runtime V1

## Purpose

The orchestrator is the control plane for AI Marketing OS. It routes intent, loads bounded tenant context, verifies tool permissions, executes the selected agent, validates the result, and returns next-agent handoffs.

## Runtime contract

`POST /api/ai/run`

```json
{
  "agentId": "auto",
  "organizationId": "org_123",
  "userId": "user_123",
  "intent": "Build a marketing strategy for our new service",
  "input": {}
}
```

## Security rules

- Tenant context is scoped by `organizationId`.
- Agents may only use tools declared in the registry.
- External, financial, publishing, and communication actions require an approval gate in the production tool adapter.
- The current runtime does not execute external side effects; it only validates and routes.

## Next implementation

1. Replace request-provided context with Prisma-backed loaders.
2. Add tool adapters and permission-aware execution.
3. Add structured output schemas per agent.
4. Persist `AgentRun` and `UsageEvent` records.
5. Add workflow state persistence and approval records.
6. Replace MockAIProvider with a production AI provider adapter.
