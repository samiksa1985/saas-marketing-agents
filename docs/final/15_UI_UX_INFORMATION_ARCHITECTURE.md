# UI/UX information architecture

The Next shell contains 23 routes: `/`, `/ai-command`, company, market, ICP, strategy, campaigns, content, creative, SEO, sales, customer success, analytics, CFO, automation, knowledge, approvals, workflows, AI team, mentor, billing, settings, and governance. Navigation groups are overview, intelligence, marketing, revenue, insights, operations, AI platform, and management.

Every view declares a required permission and optional entitlement. The typed client maps to `/product-surfaces/:surface`; server composition returns `ready`, `empty`, or `unavailable`. UI models preserve loading, empty, unavailable, error, permission-denied, and entitlement-unavailable states. Approval-sensitive surfaces never imply an external action. Arabic uses RTL and English LTR in the same responsive shell. The older merge route manifest is provenance; current code includes the typed product-surface API path.
