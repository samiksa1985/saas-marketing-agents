# AI Marketing OS — AI Core V1.3

## Runtime

User request → tenant authorization → entitlement/usage gate → agent registry → production prompt → context builder → RAG/memory → permitted tools → model → structured output → AgentRun/ToolCall/UsageEvent → operational memory.

## Provider

The provider abstraction supports OpenAI Responses API and a Mock provider. The OpenAI provider supports structured outputs and a bounded function-tool loop. API keys are server-side only.

## Tool governance

Agents can only call tools declared in their registry and permission records. External/irreversible tools require an approval-capable agent. Tool calls are persisted with latency, input, output, and error state.

## Memory

Company, operational, and learning memories are tenant scoped. Expiring memories are ignored during recall.

## Cost/usage

Each agent run consumes the `ai.requests.monthly` entitlement before execution. Actual model usage is persisted to UsageEvent and AgentRun. Cost rates are configurable through environment variables; zero means cost is recorded as zero until configured.

## RAG

Knowledge retrieval is tenant scoped and uses pgvector. Embeddings are generated server-side. No cross-tenant retrieval is permitted.
