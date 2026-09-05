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
| `REPOSITORY_ROOT` | Optional API registry setting. | Set only when repository discovery is intentionally enabled. | Sensitive path metadata. |

## Startup validation

1. Resolve variables from the managed secret/configuration provider.
2. Validate required values with the shared configuration package before accepting traffic.
3. Reject production startup when OIDC issuer/audience are absent or workflow mode is not Temporal.
4. Confirm `WEB_URL`, OIDC issuer, artifact endpoint, and provider endpoints use approved HTTPS origins.
5. Emit only variable names and validation outcomes to logs; never values.

## Rotation and ownership

Platform owns runtime injection. Security owns secret-store policy and rotation cadence. Application owners validate provider-specific credentials in non-production before an approved production rotation. Completion of a rotation requires a health check, least-privilege review, and audit record.
