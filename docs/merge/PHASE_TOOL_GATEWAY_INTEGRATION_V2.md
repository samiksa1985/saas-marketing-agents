# Tool Gateway Integration V2

## What this changes

- Adds real tests to `packages/tool-gateway`; the previous run reported 0 tests because no test file existed in the canonical package.
- Adds `ToolAwareAgentExecutor` to the existing `packages/agent-runtime` rather than creating another runtime.
- Tool calls are tenant checked and routed through the existing Tool Gateway before model execution.
- Existing `AIGatewayAgentExecutor` remains the canonical model executor.

## Architecture

Workflow Runtime
→ Agent Runtime
→ Tool Gateway
→ AI Gateway

External side effects remain approval-gated by Tool Gateway policy.

This is an execution-boundary integration, not a new orchestration engine.
