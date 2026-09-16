# Deployment runbook

## Preconditions

Provision a managed PostgreSQL 16 instance with pgvector, private networking, TLS, backups, a reverse proxy/WAF, OIDC issuer/audience, and a secret manager. These are external prerequisites, not repository-provided infrastructure.

Set production configuration through the deployment secret/configuration system: `NODE_ENV=production`, HTTPS `WEB_URL`, `CORS_ALLOWED_ORIGINS`, explicit `TRUST_PROXY`, semantic `RELEASE_VERSION`, `DATABASE_URL`, Temporal settings, OIDC issuer/audience, artifact configuration, and AI configuration. Provider credential variables are provider-specific secret references only. Do not use `.env.example` as a production secret file.

Provider mutation defaults remain disabled. Do not set any provider execution mode or enable flag to allow live effects until a separate approved change request, sandbox allowlist, policy, approval, and verification evidence exist.

## Procedure

1. Build the pinned source with `npm run build` and publish an immutable image through the approved registry.
2. Deploy PostgreSQL/pgvector privately; do not publish port 5432.
3. Run `scripts/production-migrate.ps1` once from an approved operator environment after setting `NAWA_PRODUCTION_MIGRATION_CONFIRM=APPLY`.
4. Start API, worker, and web using `infra/docker/docker-compose.production.example.yml` only as a provider-neutral topology reference. Put HTTPS, WAF/rate limiting, TLS termination, and external distributed rate limiting in front of web/API.
5. Check `/health`, `/ready`, and `/version`; `/ready` verifies database reachability without revealing connection data.
6. Run the first-customer pilot runbook before admitting a tenant.

Swagger is intentionally unavailable in production. The API emits sanitized JSON logs with request correlation. Per-process rate limiting is a protective fallback; an edge/WAF distributed limiter is mandatory for multi-instance production.
