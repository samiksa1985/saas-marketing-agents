# AI / LLM strategy

The repository exposes an AI gateway/provider abstraction, Agent Runtime prompt assembly, typed agent definitions, structured artifact validation, and tenant-bound execution context. Context is assembled before planning/execution and retains evidence/confidence references. Tool calls are isolated behind Tool Gateway; cost/usage is governed through entitlement-aware execution and billing usage reservation.

Hallucination controls are architectural: no fabricated business state, evidence-bearing artifacts, explicit unresolved inputs, deterministic domain calculations where applicable, human approvals, and external-action gates. Model/provider fallback, production credential selection, vendor data residency, live evaluation telemetry, and Arabic generation quality are configuration/backlog items. Arabic/English UI direction is implemented; deterministic Arabic model output is not claimed.
