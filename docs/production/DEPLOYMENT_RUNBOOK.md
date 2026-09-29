# Deployment runbook

## Preconditions

Provision PostgreSQL 16 with pgvector, private networking, TLS, backups, a reverse proxy/WAF, OIDC issuer/audience, and an external secret/configuration injection boundary. These are external prerequisites, not repository-provided infrastructure.

Set production configuration through the deployment secret/configuration system. Never bake `.env` files or credentials into an image. V1's approved durable workflow architecture is PostgreSQL-backed; do not provision Temporal. The current production configuration/runtime composition still has a Temporal adapter requirement, so production application rollout remains blocked until WS-PROD-06 supplies the approved PostgreSQL runtime. Do not work around that mismatch by enabling in-memory mode.

Provider mutation defaults remain disabled. Do not set any provider execution mode or enable flag to allow live effects until a separate approved change request, sandbox allowlist, policy, approval, and verification evidence exist.

## Procedure

1. Build once from a locked commit and publish API, web, and worker images. Record the release manifest, source/image SBOMs, provenance, and immutable image digests.
2. Promote those same digests between acceptance and production; do not rebuild for each environment.
3. Deploy PostgreSQL/pgvector privately; do not publish port 5432.
4. After approved change control, run the migration profile as an explicit one-shot job with `NAWA_PRODUCTION_MIGRATION_CONFIRM=APPLY`, then run production verification. Application startup never runs migrations.
5. Roll out the exact promoted API, worker, and web digests only after WS-PROD-06 closes the runtime mismatch. Put HTTPS, WAF/rate limiting, TLS termination, and external distributed rate limiting in front of web/API.
6. Check `/health`, `/ready`, and `/version`; `/ready` verifies database reachability without revealing connection data.
7. Run the first-customer pilot runbook before admitting a tenant.

The production Compose file is a topology example, not deployment authorization. Supply `.env.production` at runtime through the approved operator/secret boundary; never commit it. The `migrate` service is disabled unless its migration profile is explicitly selected.

## Build and rollback contract

`infra/docker/Dockerfile` builds the three targets `api`, `web`, and `worker` from the same locked source revision. The release workflow publishes commit-identified tags, OCI provenance/SBOM attestations, and a machine-readable manifest; tag-triggered builds preserve the manifest and source SBOM on a draft GitHub Release. Use image references of the form `registry/name@sha256:...` for promotion and deployment. Tags are lookup labels, not deployment identity.

For rollback, retrieve the previous known-good release manifest and deploy its exact component digests. Before application rollback, verify the current database migration journal against the previous release's migration reference and confirm forward-compatible schema behavior. Migrations are forward-only; this procedure does not perform an automatic database downgrade. Record any required forward repair separately and obtain change approval.

Swagger is intentionally unavailable in production. The API emits sanitized JSON logs with request correlation. Per-process rate limiting is a protective fallback; an edge/WAF distributed limiter is mandatory for multi-instance production.
