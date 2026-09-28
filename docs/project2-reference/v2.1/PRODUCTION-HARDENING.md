# V2.1 — Production Hardening

## Quality gates
1. Dependency installation
2. Prisma generation / schema validation
3. TypeScript typecheck
4. Structural validation
5. Unit tests
6. API contract tests
7. Authentication tests
8. Tenant isolation tests
9. Agent governance tests
10. RAG tests
11. CRM / Marketing / Automation / Analytics / CFO tests
12. Billing and entitlement tests
13. Security checks
14. Production build
15. CI execution

## Security gates
- no client-side provider secrets
- tenant scope on every tenant-owned operation
- role + permission checks
- entitlement checks
- usage limits
- webhook signature verification
- audit logging for privileged actions
- safe error messages
- rate limiting hooks
- export/delete authorization
- no raw secrets in logs

## Release rule
A release is Production Ready only after the CI pipeline reports all required gates as PASS.
