# Security operations runbook

Production requires OIDC, server-side RBAC, transaction-local RLS, HTTPS origins, explicit CORS origins, proxy posture, semantic release metadata, and disabled provider mutations by default. Local-acceptance authentication is rejected in production.

The API applies request IDs, no-sniff/frame/referrer/permissions headers, HSTS in production, origin allowlisting, sanitized JSON logging, safe error bodies, and a per-process request limiter. Reverse-proxy TLS, WAF/DDOS protection, distributed rate limiting, CSP for the web edge, webhook signature validation, secret manager policy, vulnerability scanning, and alert routing remain deployment-operator responsibilities.

Never log request bodies, authorization headers, cookie values, credentials, provider tokens, or database URLs. Rotate an exposed secret in its secret manager, disable the related provider binding, and preserve an audit-safe incident record. Treat unknown provider/credential health as not mutation-ready.
