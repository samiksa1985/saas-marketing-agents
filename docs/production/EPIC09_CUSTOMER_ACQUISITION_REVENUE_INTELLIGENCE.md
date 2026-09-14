# EPIC09: Customer Acquisition & Revenue Intelligence

## Status and boundary

**EPIC09 code readiness: implemented.** The forward migration and disposable PostgreSQL proof are intentionally not claimed as complete until the local, fail-closed Phase-1 runner is executed through migration `0026`.

This is a first-party, provider-neutral intelligence layer. It is not a CRM, a data broker profile, or a Vendasta/HubSpot/Salesforce/Dynamics implementation. It contains no CRM credential, provider DTO, message body, or provider mutation path. Google Ads and Meta Ads execution configuration is unchanged and remains disabled unless explicitly enabled by the existing control plane.

## Architecture

`Campaign → lead capture → canonical lead → deterministic identity resolution → conversation metadata and engagement evidence → qualification/intent → CRM capability port → opportunity → verified revenue event → attribution → funnel, diagnostics, routing recommendation, and learning evidence.`

The Core package owns canonical contracts and deterministic rules. PostgreSQL is an adapter behind a tenant-scoped port. API composition gives the adapter a transaction-local tenant context; RLS is a second enforcement boundary. CRM adapters, if introduced later, implement `CRMProvider` capabilities rather than leaking provider DTOs into Core.

## Lead, identity, consent, and conversation contracts

`LeadRecord` includes source/provenance, external IDs, campaign/channel links, Arabic/English name and language fields, consent state/evidence, confidence, and timestamps. Unknown remains `UNKNOWN`; missing data never becomes false. Email is normalized case-insensitively. Phone normalization supports E.164, Saudi local `05…` input when country is Saudi Arabia, and GCC-compatible E.164. It does not impose Latin-only names or a Western first/last-name requirement.

Identity resolution is deterministic and explainable: exact normalized identifier matches link safely; email-and-phone alignment is strong; weak name/company similarity is a `POSSIBLE_MATCH` and never auto-merges; multiple safe candidates are a `CONFLICT`. Links and edges retain reason, confidence, evidence, and resolver version. Consent values are `UNKNOWN`, `OPTED_IN`, `OPTED_OUT`, and `RESTRICTED`; routing sends restricted/opted-out leads to human review rather than outreach. EPIC09 has no bulk-message capability.

Conversation contracts cover metadata only: thread, participant, message metadata, and safe engagement signals for email, SMS, WhatsApp, web chat, voice, social DM, and other channels. No transport or message-content store is introduced.

## Qualification, CRM, opportunity, and revenue

Qualification V1 and Buying Intent V1 are deterministic and evidence-backed. Demo/pricing requests and booked meetings weigh more than generic engagement; unsubscribe/no-response signals and missing evidence are explicit. An LLM is not an authority for score or grade. ICP/fit can be supplied as evidence to the existing company-intelligence layer; no black-box fit score is introduced.

`CRMProvider` exposes only capability-discovered operations for read/upsert contacts, companies, opportunities, revenue, and evidence attachment. The registry explicitly records `CRM`, `LEAD_MANAGEMENT`, `CONVERSATIONS`, `AI_RECEPTIONIST`, `REPUTATION_REVIEWS`, `LOCAL_PRESENCE`, and `MULTI_LOCATION_GROWTH`, together with provider, tenant, enabled state, credential-health reference, read/write operations, and health. It models `NAWA_NATIVE`, `VENDasta`, `HUBSPOT`, `SALESFORCE`, `DYNAMICS_365`, and `CUSTOM` without adding a live adapter or credentials. Canonical opportunities preserve both normalized and raw provider stage. Revenue events distinguish verified from unverified/unknown/mismatched values; unverified revenue cannot power verified revenue, ROAS, or CAC.

Funnel transitions use the canonical stages from impression through revenue. Attribution V1 supports lead-source, first-touch, last-touch, opportunity source, campaign-assisted, and unattributed records, with evidence and stated limitations. It never claims causal incrementality.

## Metrics, diagnostics, routing, and privacy

Campaign metrics include lead and qualified-lead volume, pipeline, verified closed-won revenue, CPL, CPQL, cost per opportunity, CAC, and ROAS only when currency, spend, verification, and attribution conditions are valid. Invalid conditions produce `UNKNOWN` and reason codes rather than invented values.

Deterministic diagnostics cover low quality/pipeline/revenue conversion, missing attribution, CRM/data quality, duplicate and identity-conflict conditions. Routing outputs are recommendation-only and cannot assign, message, or mutate a CRM record. Data-quality assessment contracts cover stale/missing source, invalid contact values, impossible timestamps, currency/stage conflict, orphan attribution, and linkage gaps.

The design supports purpose limitation, consent evidence, minimization, deletion/export compatibility, and sensitive-data handling. It is not a legal compliance claim. API and operational logs must not emit emails, phone numbers, credentials, tokens, or message content.

## Persistence and RLS

Forward-only `0026_customer_acquisition_revenue_intelligence.sql` adds 20 tenant-owned tables: identity graph, leads/minimized quarantine/sources/links/signals/qualification, conversation metadata, opportunity/revenue/attribution, funnel, diagnostics, routing, data quality, and CRM capability records. Quarantine retains only tenant/idempotency/failure metadata, never malformed lead payloads. The migration adds tenant/idempotency keys for leads and revenue events, an exact normalized identity identifier unique key, indexes, foreign keys, timestamps, and RLS policies with `USING` and `WITH CHECK` bound to `app.tenant_id`.

The disposable PostgreSQL harness is extended to prove the 0000→0026 journal, 0026 ledger, schema, all 20 RLS tables, tenant A/B reads, cross-tenant write denial, missing-context write denial, lead idempotency, identity identifier deduplication, revenue-event idempotency, persistence adapter scope, and fixture cleanup. The evidence verifier fails closed until each EPIC09 property is present and `PASS`.

## API and acceptance

Guarded tenant-scoped routes are available for lead capture/read, qualification, identity, engagement, customer identity, opportunities, revenue events, revenue intelligence, funnel, attribution, diagnostics, and routing recommendations. There is no direct CRM mutation endpoint.

Code-level acceptance includes core normalization/deduplication/qualification/intent/revenue tests, persistence adapter type checks, API RBAC route tests, migration/journal tests, verifier tests, and execution-safety/secret scans. Run the documented disposable runner locally before claiming PostgreSQL PASS.

## Limitations

- No live CRM, Vendasta Conversations, WhatsApp/SMS/voice transport, bulk messaging, or automated lead assignment exists.
- No causal incrementality, full forecasting AI, legal/PDPL compliance, or commercial-production readiness is claimed.
- `0026` is code-ready only until real local PostgreSQL evidence is captured.
