# Observability operations runbook

## Scope and status

The API emits one-line JSON logs to stdout with service, event, level,
timestamp, and request correlation ID where available. Sensitive-key values,
bearer credentials, connection URLs, email, phone, and address fields are
redacted before serialization. Do not add request/response bodies, tenant or
user identifiers, raw provider responses, prompts, or exception stacks to
logs. The worker uses the same logger for lifecycle events and does not log
Temporal endpoints or namespaces.

The API keeps bounded, process-local request histograms and security/workflow/
provider outcome counters. They reset on process restart and are not a
replacement for durable audit evidence. The authenticated Prometheus text
endpoint is `GET /metrics`; it is disabled unless
`OBSERVABILITY_METRICS_ENABLED=true` and an `OBSERVABILITY_METRICS_TOKEN` of
at least 32 characters is provided. Prefer the `_FILE` form from an
operator-managed secret mount. When enabling it with the production Compose
example, mount that file read-only into the API container and set
`OBSERVABILITY_METRICS_TOKEN_FILE` to its in-container path; do not mount the
scrape token into the migration or worker containers. The endpoint returns 404 when disabled or when
the bearer token is invalid. Keep it on a private scrape path; explicitly deny
public reverse-proxy access and do not place the token in URLs, logs, or
dashboard configuration.

Health and readiness have separate meanings: `/health` is process liveness;
`/ready` performs the API's database readiness check. Neither endpoint reports
provider readiness or authorizes provider execution. Provider execution stays
under existing approval, policy, idempotency, and safety-gate controls.

## Scrape and dashboard setup

Configure the chosen metrics collector outside the application to scrape
`/metrics` over a private network, set an Authorization bearer header from its
secret manager, use the scrape job label `codecore-api` (as expected by the
availability alert), and exclude the endpoint from public ingress. Set a scrape
interval of 30 seconds or longer. Import `infra/observability/dashboard.json`
after binding its Prometheus datasource and load
`infra/observability/alerts.yml` into the alert evaluator. Alert rules are
initial operational defaults, not measured SLOs; tune thresholds and routing
after collecting representative traffic and reviewing the service's error
budget with its owner.

The metrics currently cover API HTTP request count/latency, authentication
rejections, workflow API outcomes, and governed provider action outcomes.
They are in-memory per-process values: scrape every API replica independently,
and aggregate in the collector. The worker has structured lifecycle logs but
no HTTP metrics listener. Temporal, deployment, and provider health
integrations are not claimed live by this instrumentation.

## Retention, privacy, and access

Set log and metrics retention in the selected external observability service;
there is no repository-managed collector, trace backend, retention job, or
tenant export. Use 30 days as an initial operational default only when it is
consistent with customer agreements, legal hold, and applicable privacy
requirements. Restrict access to logs, dashboards, scrape credentials, and
alert history by operational role. Review access and retention at least
quarterly and after an incident. Keep audit records under their existing
governance and retention authority; observability retention must not shorten
or replace that authority.

## Incident triage

1. Use the alert time, service, release, route template, status class, and
   request ID to correlate sanitized logs. Never ask an operator to paste a
   bearer token, full URL, request body, or provider payload into an incident
   channel.
2. For readiness failures, verify PostgreSQL reachability and runtime-role
   posture using the established database operations runbook. Do not change
   RLS or switch to a migration credential to restore service.
3. For authentication or authorization alerts, check OIDC and membership
   service availability and audit decisions. Do not bypass identity or tenant
   membership checks.
4. For workflow errors, identify whether failure is API-side or in the
   configured external runtime. Temporal deployment and runtime work remains
   outside this change.
5. For `provider` outcome `uncertain`, reconcile external provider state by
   its existing idempotency and evidence controls before retrying. Do not
   replay mutations or enable a provider to clear an alert.
6. If a credential is suspected in logs, restrict access, preserve the
   sanitized incident evidence, rotate it through its owning secret manager,
   and follow `SECURITY_OPERATIONS_RUNBOOK.md`.

No collector, dashboard service, alert destination, on-call route, or target
environment has been provisioned or verified by this runbook.
