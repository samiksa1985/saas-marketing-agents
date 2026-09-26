# EPIC-10: Customer Conversations, AI Receptionist & Lead Engagement

## Scope and gate status

EPIC-10 establishes NAWA-owned, provider-neutral customer-engagement intelligence. It is a code and schema readiness increment. **EPIC-10 PostgreSQL gate: PENDING_LOCAL_RUN.** This document does not claim production readiness, legal compliance, PDPL certification, WhatsApp certification, telephony readiness, CRM synchronisation, external-provider connectivity, or live customer communication.

The owned journey is campaign/source evidence → lead and identity context → consent/contactability → minimized conversation evidence → qualification, intent and engagement → recommendation → governed human handoff → opportunity and verified-revenue linkage. Missing evidence remains `UNKNOWN`; it is never converted to zero, false, or a causal revenue assertion.

## Architecture and data minimisation

`@platform/marketing-os-core` owns deterministic, provider-neutral domain contracts. `@platform/marketing-os-persistence` is the tenant-scoped Drizzle adapter, and the API composes it through the existing transaction-local tenant database boundary. The core has no transport SDK, vendor dependency, send authority, or raw provider credential handling.

Inbound/outbound `ConversationIngressEvent` records are replay-safe and retain only provider/channel references, opaque participant references, timestamps, direction, content reference/hash, optionally safe redacted excerpt, consent state, language hints, provenance/evidence and idempotency key. Raw message bodies, OAuth tokens, credentials and authorization headers are intentionally absent. Persisting raw conversational content is neither required nor implemented by this EPIC.

The canonical lifecycle is `NEW`, `ACTIVE`, `WAITING_CUSTOMER`, `WAITING_AGENT`, `WAITING_HUMAN`, `ESCALATED`, `RESOLVED`, `CLOSED`, or `UNKNOWN`. Structured facts and evidence are authoritative; generated prose is not required.

## Intelligence and safety

Deterministic V1 intent classification supports inquiry, pricing, demo, meeting, purchase, support, complaint, cancellation, renewal, upsell, partnership, career, spam, abuse, and `UNKNOWN`. It uses explicitly supplied classification hints and retains reason codes, confidence, limitations, language and evidence. It does not infer facts from unavailable raw text.

Buying signals, lead-engagement assessments, contactability assessments, response recommendations, follow-up recommendations, meeting intent, handoff, commitments, diagnostics and analytics are evidence-bound. A recommendation is explicitly `RECOMMENDATION_ONLY`; there is no endpoint or adapter for send, call, message, book, refund, payment, or execute.

The AI receptionist models profiles, sessions, turns, recommendations, handoffs and outcomes. It fails closed to human escalation for an explicit human request, non-allowed contactability, complaint/abuse/cancellation, low confidence, or unavailable governance. It cannot accept a contract, issue a pricing exception, take payment/refund action, make a binding commitment, mutate a CRM, or perform an advertising action.

Arabic, English, and mixed-language metadata are first-class inputs. Arabic names and organization identifiers remain opaque Unicode references; neither Latin name structure nor translation is required. Saudi/GCC phone normalisation remains owned by the EPIC-09 identity boundary and is not reimplemented in conversation ingestion. Dialect accuracy is not claimed.

## Persistence, RLS and idempotency

Forward migration `0027_customer_conversations_ai_receptionist.sql` creates 22 tenant-owned tables for minimized conversation events/turns/state/intents/summaries, signals, engagement/contactability/recommendations, receptionist records, handoffs, meeting/follow-up recommendations, commitments, and diagnostics. Every table enables PostgreSQL RLS and compares `tenant_id` with the transaction-local `app.tenant_id` setting.

The event natural key is `(tenant_id, idempotency_key)` and provider replay deduplication is `(tenant_id, provider, external_message_id)`. Receptionist sessions and turns each retain tenant-local idempotency constraints. The Phase-1 harness proves two attempts yield exactly one stored conversation event and exactly one stored receptionist session, while unexpected database errors continue to fail.

The fail-closed evidence verifier now requires migration count 28, latest migration `0027_customer_conversations_ai_receptionist`, EPIC-10 RLS, ingestion, receptionist, cross-tenant/missing-context, and cleanup proof fields. This proof is valid only after a fresh disposable local PostgreSQL run.

## API, RBAC and provider boundary

All endpoints are protected by the existing API authentication guard and existing permission checks. Read intelligence uses `artifact:read`; diagnostics and analytics also require `audit:read`; ingestion and receptionist session creation require `marketing:admin`. They execute through the tenant-scoped database adapter. A receptionist event must resolve to its existing session's conversation before ingestion, preventing an accidental cross-conversation write.

The API exposes guarded conversation intake/read intelligence, recommendation, handoff, follow-up and analytics views, plus receptionist session lifecycle views. It contains no unrestricted communications or consequential-action endpoint. Future transport adapters must independently pass consent, policy, capability, approval, delivery verification and evidence gates.

Provider capabilities remain optional and provider-neutral. Potential future adapters include communications, contact centre, CRM and calendar providers; Vendasta, Twilio, WhatsApp Business Platform, Microsoft Graph, Google Workspace, HubSpot, Salesforce, Dynamics and custom systems are examples only. None is installed, configured, called, or made authoritative by EPIC-10.

## Local validation

Run the established disposable gate only from a local terminal with the explicit disposable configuration:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-phase1-postgres-local.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-phase1-postgres-evidence.ps1
```

No Google Ads or Meta Ads execution is enabled by this EPIC. No live provider mutation, production migration, deployment, or external customer contact is part of this validation.
