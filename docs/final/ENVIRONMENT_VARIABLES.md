# Environment Variables

Never copy real values, secrets, connection strings, or tokens into source control or release documentation. Use a managed secret store and environment-specific deployment configuration.

| Variable | Source behaviour | Production requirement | Handling |
| --- | --- | --- | --- |
| `NODE_ENV` | Defaults to `development`; supports development, test, and production. | Set to `production`. | Non-secret. |
| `API_PORT` | Defaults to `4000`. | Set by platform ingress/runtime policy. | Non-secret. |
| `WEB_URL` | Required by configuration. | Must be the canonical HTTPS web origin. | Non-secret, validate allow-list. |
| `DATABASE_URL` | Required by configuration and Drizzle. | Managed PostgreSQL connection with TLS/least privilege. | Secret. |
| `TEMPORAL_ADDRESS` | Required by configuration. | Reachable managed/self-hosted Temporal endpoint. | Sensitive endpoint. |
| `TEMPORAL_NAMESPACE` | Required by configuration. | Dedicated approved namespace. | Sensitive identifier. |
| `WORKFLOW_RUNTIME_MODE` | Defaults to `in-memory` in development/test; production requires `temporal`. | Set to `temporal`. | Non-secret. |
| `ARTIFACT_BUCKET` | Required by configuration. | Approved tenant-aware artifact store/bucket. | Sensitive identifier. |
| `ARTIFACT_ENDPOINT` | Optional endpoint override. | Provide only for approved compatible storage. | Sensitive endpoint. |
| `AI_PROVIDER` | Required by configuration. | Approved provider with contractual/privacy review. | Non-secret identifier. |
| `AI_MODEL` | Required by configuration. | Approved model/version and evaluation record. | Non-secret identifier. |
| `OIDC_ISSUER_URL` | Required in production. | HTTPS issuer with discovered JWKS and approved tenant/role claims. | Sensitive endpoint. |
| `OIDC_AUDIENCE` | Required in production. | Exact API audience. | Sensitive identifier. |
| `LOCAL_ACCEPTANCE_AUTH_ENABLED`, `LOCAL_ACCEPTANCE_AUTH_TOKEN_FILE`, `LOCAL_ACCEPTANCE_AUTH_TENANT_ID`, `LOCAL_ACCEPTANCE_AUTH_USER_ID` | Disabled by default. When explicitly enabled outside production, configuration requires an external, readable, non-empty high-entropy token file and a fixed tenant/user identity. | Forbidden in production; OIDC remains mandatory. | Local acceptance only. Never put the bearer token in `.env`, source control, logs, or an API response. |
| `GOOGLE_ADS_EXECUTION_MODE` | Defaults to `DISABLED`; accepts `DISABLED`, `DRY_RUN`, `MOCK`, or `REAL`. | Keep `DISABLED` until the G9 provider gate is approved. Production rejects `MOCK`. | Non-secret control. |
| `GOOGLE_ADS_EXECUTION_ENABLED` | Defaults to `false`; only has effect with `REAL`. | Requires a documented and approved enablement change. | Non-secret control. |
| `GOOGLE_ADS_API_VERSION` | Defaults to `v25`; must be a Google Ads version identifier. | Pin an approved supported version. | Non-secret control. |
| `GOOGLE_ADS_SANDBOX_CUSTOMER_IDS` | Comma-separated numeric test-account allowlist. | Required for REAL mode and must contain the approved customer. | Sensitive account identifiers; never use names as a safety control. |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Resolved only inside the Google Ads provider boundary. | Required for REAL transport; `GOOGLE_ADS_CUSTOMER_ID` must be an allowlisted test account. | Secrets/sensitive identifiers; never log or persist values. |
| `REPOSITORY_ROOT` | Optional API registry setting. | Set only when repository discovery is intentionally enabled. | Sensitive path metadata. |

## Startup validation

1. Resolve variables from the managed secret/configuration provider.
2. Validate required values with the shared configuration package before accepting traffic.
3. Reject production startup when OIDC issuer/audience are absent, workflow mode is not Temporal, or local acceptance auth is enabled.
4. Confirm `WEB_URL`, OIDC issuer, artifact endpoint, and provider endpoints use approved HTTPS origins.
5. Emit only variable names and validation outcomes to logs; never values.

## Rotation and ownership

Platform owns runtime injection. Security owns secret-store policy and rotation cadence. Application owners validate provider-specific credentials in non-production before an approved production rotation. Completion of a rotation requires a health check, least-privilege review, and audit record.
