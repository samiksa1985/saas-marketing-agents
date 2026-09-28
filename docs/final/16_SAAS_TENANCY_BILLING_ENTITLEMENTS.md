# SaaS tenancy, billing, and entitlements

Tenant records, subscriptions, plan entitlements, organization overrides, usage counters/events, invoices, and payments are canonical contracts/schema. Invoices and payments use integer minor units. `AuthoritativeEntitlementAccess` obtains the active subscription, plan entitlement, organization override, and usage counter; numeric limits are derived from plan/override, never caller-supplied. It invokes `AtomicBillingUsageStore`, whose SQL reserves idempotency before counter upsert and removes a quota-rejected reservation.

`AgentEntitlementAccess` is the agent-runtime port satisfied by the equivalent canonical adapter. Cross-tenant records fail closed. Tenant billing tables have RLS migration source. A real PostgreSQL concurrency test for duplicate keys/quota boundaries remains unverified, and no payment provider is live.
