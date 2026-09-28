# EPIC13 customer growth decisioning

EPIC13 is a tenant-scoped, deterministic, provider-neutral decision layer. It turns explicitly supplied lifecycle, consent, contactability, capability, evidence, frequency, complaint, handoff, and activation-state facts into a recommendation record. It does not communicate with a customer, mutate a CRM, call a provider, create an approval, or execute an action.

## Decision and safety model

Candidate identifiers and ranking inputs are deterministic. The score is the explicit sum of objective (20), lifecycle relevance (10 or 30 for at-risk retention), available evidence (20), evidence freshness (10), and a five-point penalty per recent contact. Stable candidate IDs provide deterministic tie behavior; the score is an explanation, not a prediction, causal estimate, or promise of lift.

Eligibility fails closed for unknown or denied consent, unavailable contactability or capability, stale evidence, a frequency cap of three recent contacts, unresolved human handoff, and pending activation. Complaint/promotional, churn-risk/upsell, and handoff/automation conflicts require human review. Arabic and mixed-language identity/evidence values are preserved as supplied.

## Governance boundary and learning

An eligible lifecycle recommendation may be represented only through the existing EPIC12 lifecycle-activation application service. That path creates its existing candidate, simulation, policy, and approval-gated plan; it is not an execution path. The existing governed external-action boundary remains the only consequential execution authority.

Outcomes and `GrowthDecisionLearningRecord` are durable only when independently verified evidence is supplied to persistence. Unverified input raises `VERIFIED_OUTCOME_REQUIRED`. Learning is recorded with `causalClaim: NONE`; correlation is never represented as causation.

## Persistence and PostgreSQL evidence

Forward migration `0030_customer_growth_decisioning` adds eight RLS-protected tables: contexts, candidates, eligibility assessments, conflict assessments, scores, recommendations, outcomes, and learning records. Context, candidate, recommendation, and outcome records have tenant-scoped exact idempotency authorities; learning is unique per tenant/outcome. The Phase1 harness requires a 31-migration ledger, all eight tables with RLS, tenant/no-context denials, single-authority concurrency proofs, learning isolation, and exact child-before-parent fixture cleanup.

No Google Ads, Meta Ads, CRM, provider, communication, calendar, payment, or telephony execution is enabled by EPIC13.
