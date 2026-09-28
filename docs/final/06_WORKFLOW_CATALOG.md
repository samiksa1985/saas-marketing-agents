# Workflow catalog

`WorkflowRuntime` is the single workflow abstraction. It creates immutable graph snapshots, deterministic tasks, readiness checks, leases, retries, handoffs, artifacts, audit events, and tenant isolation. Automation definitions match event/schedule/webhook logical keys and dispatch canonical workflow starts idempotently.

Repository path: trigger → conditions → workflow start → ready task → Agent Runtime → proposed artifact → human approval/validation → handoff → downstream readiness. External Tool Gateway calls retain the approval boundary.

In-memory runtime and local executor are dev/test. Provider selection accepts `TemporalWorkflowAdapter` and `TemporalWorkflowReadModel`; temporal mode fails closed if either is absent. This documents composition, not a deployed Temporal namespace, task queue, worker, or read model.
