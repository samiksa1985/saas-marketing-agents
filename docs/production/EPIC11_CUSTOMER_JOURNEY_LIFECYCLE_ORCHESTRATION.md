# EPIC11 — Customer Journey & Lifecycle Orchestration

## Scope and boundary

EPIC11 is NAWA-owned customer journey intelligence. It observes evidence, produces deterministic assessments and recommendation-only plans, and records independently observed outcomes. It does not send email/SMS/WhatsApp, place calls, book calendars, mutate CRM records, solicit reviews, or execute payments.

## Architecture

`Observe → timeline → lifecycle/stage → trigger → candidate action → eligibility → deterministic rank → recommendation/plan → governance → await external outcome → verified evidence → tenant-scoped learning`.

`CustomerJourneyEvent` is the durable canonical timeline record. Events preserve tenant, optional identity/lead, source/provider, timestamp, provenance, evidence, campaign/conversation/opportunity/revenue references where known, and verification state. Missing events and revenue are never fabricated. EPIC10 `CustomerJourneyContext`, intent, buying signal, engagement, contactability, handoff, follow-up, and diagnostics remain upstream evidence contracts.

## Lifecycle and stage intelligence

The lifecycle vocabulary is `UNKNOWN`, `ANONYMOUS`, `PROSPECT`, `LEAD`, `ENGAGED_LEAD`, `QUALIFIED_LEAD`, `OPPORTUNITY`, `CUSTOMER`, `ACTIVE_CUSTOMER`, `AT_RISK`, `DORMANT`, `CHURNED`, `RENEWAL_DUE`, `EXPANSION_CANDIDATE`, and `ADVOCATE`. `UNKNOWN` is distinct from zero or false. Assessment is deterministic and evidence-backed; invalid transitions fail closed. Stage assessment records entry time, duration, progression/regression evidence, blockers, unknowns, freshness, and confidence without requiring a linear funnel.

## NBA, eligibility, and plans

The V1 engine selects deterministic candidate actions from lifecycle and observed event types, then ranks by explicit urgency/action rules. Every recommendation contains evidence, reasons, governance/consent/approval requirements, capability requirements, expiry, limitations, and `RECOMMENDATION_ONLY` state. Eligibility fails closed for missing identity/contactability/evidence, opt-out/restriction, cooldown, duplicate recommendations, unresolved handoff, unavailable capability, and approval-gated policy. A `CustomerJourneyPlan` has ordered, non-executable steps; it cannot invoke a provider.

Supported capability labels are provider-neutral (`CONVERSATIONS`, `EMAIL`, `SMS`, `WHATSAPP`, `WEB_CHAT`, `VOICE`, `CRM`, `CALENDAR`, `AI_RECEPTIONIST`, `REPUTATION_REVIEWS`, `LOCAL_PRESENCE`, `LEAD_MANAGEMENT`). Vendasta, HubSpot, Salesforce, Dynamics, Twilio, WhatsApp, Microsoft Graph, and Google Workspace remain optional future adapters, never the intelligence system of record.

## Retention, renewal, expansion, health, and governance

Retention V1 is deterministic signal assessment, not predictive ML. Complaint, support escalation, churn, dormancy, and renewal signals are explainable evidence. Expansion requires explicit expansion evidence and remains recommendation-only. Health returns categorical, explainable dimensions rather than an arbitrary score. Frequency governance blocks cooldown/restricted cases so repeated recommendations cannot create uncontrolled contact.

Outcomes are authoritative only when observed or independently verified, are linked as “observed after/associated with” under a rule, and do not assert causality. Learning records are tenant-scoped and cannot alter policy. Revenue links reuse EPIC09 verified revenue authority; no second revenue truth or causal incrementality claim exists.

## Persistence, RLS, and idempotency

Forward migration `0028_customer_journey_lifecycle_orchestration.sql` adds tenant-RLS tables for lifecycle, timeline, stage, triggers, eligibility, recommendations, plans, assessment/diagnostic state, outcomes, and learning. EPIC11 health assessments use the distinct `customer_journey_health_assessments` table; the historical Customer Success `customer_health_assessments` table remains separate. Each policy compares `tenant_id` with transaction-local `app.tenant_id`, so missing context fails closed. Natural idempotency keys are explicit for journey events, deterministic NBA recommendations, and outcomes. PostgreSQL replay/harness proof is still required before any PASS claim.

The `PersistentCustomerJourneyStore` uses the existing tenant-scoped Drizzle transaction façade and persists timeline events, lifecycle/stage assessments, NBA recommendations, plans, outcomes, and learning without transport authority. Guarded API reads are available under `/customer-journey/:identityId`; NBA evaluation is restricted to the existing `marketing:admin` permission. There are no execution, send, call, booking, payment, or refund routes.

The existing disposable Phase1 runner now contains an EPIC11 block after every historical gate. It validates the 0028 ledger entry, all nineteen EPIC11 tables, tenant/missing-context RLS rejection, and independent concurrent idempotency for event/NBA/outcome keys before recording learning isolation and cleanup. The evidence verifier requires every EPIC11 result field, but real evidence remains pending until a local disposable PostgreSQL run completes.

## Arabic/Saudi and privacy readiness

Identity IDs and journey metadata are opaque Unicode values; Arabic, English, and mixed language data remain canonical without translation. Organization/brand/business-unit/location identifiers are optional on events for multi-location readiness. Contactability is reused from EPIC10. Outbound recommendations require contactability evidence and an opted-out customer receives `DO_NOT_CONTACT`; no PDPL or legal-compliance claim is made.

## Limitations and future adapters

This is intelligence/governance V1. It does not infer dormant status from low message volume alone, invent renewal dates/contracts, create opportunity/revenue, or provide autonomous nurture. Future adapters must remain behind consent, policy, approval, capability, verification, audit, and evidence boundaries.
