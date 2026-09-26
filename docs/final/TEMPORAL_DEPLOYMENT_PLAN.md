# Temporal Deployment Plan

## Current state

Development and test configuration may use `in-memory` workflow mode. Production configuration requires `WORKFLOW_RUNTIME_MODE=temporal` plus `TEMPORAL_ADDRESS` and `TEMPORAL_NAMESPACE`. This repository does not provide evidence that a Temporal cluster, namespace, worker fleet, or production workflow has been deployed.

## Pre-deployment plan

1. Provision an approved Temporal environment, namespace, certificates/authentication, network policy, retention settings, and least-privilege service identity.
2. Define task queues, worker deployment topology, concurrency, resource limits, autoscaling, logs/metrics/traces, retry policy, timeouts, and dead-letter/incident handling.
3. Inject configuration through the managed environment process; validate that production startup rejects in-memory mode.
4. Package and deploy compatible worker/application versions using an immutable artifact and explicit compatibility policy.

## Verification scenarios

| Scenario | Required evidence |
| --- | --- |
| Start workflow | Tenant-scoped workflow starts once with durable correlation and audit event. |
| Retry | Retry reaches the configured policy without duplicating an external side effect. |
| Cancel | Cancellation stops eligible work, records actor/reason, and preserves evidence. |
| Approval wait | Workflow pauses for approval and resumes/rejects correctly after decision. |
| Worker loss | A worker restart or loss recovers deterministically from persisted workflow state. |
| Versioning | Compatible worker rollout does not strand existing executions. |
| Outage | Endpoint outage produces bounded failure, alerting, and documented operator recovery. |
| Tenant boundary | Workflow identifiers, tasks, artifacts, and queries cannot cross tenants. |

## Go/no-go

Do not change G6 from NOT VERIFIED until the scenarios succeed in the target environment, alerting reaches the on-call owner, and a rollback/disable procedure has been exercised. This plan authorizes neither infrastructure provisioning nor deployment by itself.
