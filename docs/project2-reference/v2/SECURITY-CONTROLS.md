# V2 Security Controls

- Never expose provider secrets to the browser.
- Never write raw OAuth/API secrets to application logs.
- All integration records are tenant scoped.
- Webhook handlers must verify provider signatures before processing.
- API keys are shown once and stored hashed/encrypted according to provider capability.
- Data export/delete requests require authenticated organization authority.
- Admin operations require explicit admin permissions.
- Billing operations are tenant scoped and audit logged.
- Feature flags must not bypass authorization.
