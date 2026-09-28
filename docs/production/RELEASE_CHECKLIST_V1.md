# Release checklist v1.0 pilot

- [ ] Immutable build, root typecheck, focused tests, and production build pass.
- [ ] `NODE_ENV=production` configuration validates without displaying secrets.
- [ ] OIDC issuer/audience, HTTPS/CORS, trusted proxy, release version, and Temporal are configured.
- [ ] PostgreSQL 16, pgvector, migration ledger, and tenant RLS pass `production:verify`.
- [ ] Backup and isolated restore verification evidence is retained.
- [ ] API `/health`, `/ready`, `/version`; worker logs; provider-health/outbox/dead-letter dashboard are checked.
- [ ] Reverse proxy TLS, CSP, WAF, distributed rate limiting, logging/metrics/alerts, and secret-manager access are approved externally.
- [ ] Pilot tenant bootstrap and tenant-isolation acceptance pass.
- [ ] Google, Meta, CRM, email, SMS, and WhatsApp live mutation/send remain disabled.
- [ ] Human release authority approves deployment. Do not tag, push, or deploy from this checklist.
