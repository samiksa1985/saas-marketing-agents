# Entitlements & RBAC V1.1

## Roles

- OWNER: full organization control and billing
- ADMIN: operational administration
- MARKETING_MANAGER: marketing, campaigns, content, SEO
- SALES_MANAGER: CRM, opportunities, proposals
- FINANCE_MANAGER: finance, billing and profitability
- SUCCESS_MANAGER: customer health, renewals and upsell
- OPERATIONS_MANAGER: workflows, tasks and automation
- STAFF: assigned operational access
- CLIENT_ADMIN: client organization administration
- CLIENT_USER: normal client operations
- VIEWER: read-only access

## Permission format

`domain.resource.action`

Examples:
- `marketing.content.create`
- `marketing.content.approve`
- `crm.opportunity.update`
- `finance.profitability.read`
- `ai.run.execute`
- `admin.prompt.manage`

## Entitlement layers

1. Role permission
2. Organization plan entitlement
3. Usage limit / credits
4. Entity ownership / tenant scope
5. Approval policy

All five are evaluated server-side before privileged actions.
