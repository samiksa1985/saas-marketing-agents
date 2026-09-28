# Security Release Checklist

- [ ] AUTH_SECRET / session secret is production-grade
- [ ] DATABASE_URL is server-side only
- [ ] AI provider keys are server-side only
- [ ] OAuth client secrets are server-side only
- [ ] Production cookies use Secure + HttpOnly + SameSite
- [ ] CSRF strategy reviewed for cookie-authenticated mutations
- [ ] Rate limiting enabled at the edge/API
- [ ] Webhook signatures verified
- [ ] File upload MIME/size validation enabled
- [ ] SSRF protections enabled for URL ingestion
- [ ] Tenant authorization tested
- [ ] Admin authorization tested
- [ ] Audit logging enabled
- [ ] Error responses do not expose secrets or stack traces
- [ ] Backups and restore procedure tested
