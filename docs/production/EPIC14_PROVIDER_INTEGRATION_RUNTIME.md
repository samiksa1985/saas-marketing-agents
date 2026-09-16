# EPIC14 provider integration runtime

EPIC14 supplies one tenant-scoped, provider-neutral routing layer for pilot connectivity. It does not replace the existing EPIC03 governed-action executor, EPIC05 outbox/retry/health authority, or EPIC04/06 Google and Meta adapters.

## V1 capabilities and safety

The runtime binds an explicit tenant capability to one provider and environment. It supports paid-media Google/Meta, CRM contact/lead/opportunity/task capabilities, and EMAIL/SMS/WHATSAPP declarations. Routing has no automatic fallback. Unknown, unconfigured, disabled, unhealthy, or credential-unknown bindings fail closed. Operations are `READ_ONLY`, `INTERNAL_NON_CONSEQUENTIAL`, or `EXTERNAL_CONSEQUENTIAL`; only the existing governed-action boundary may authorize consequential work.

Google Ads retains its existing REST/OAuth/sandbox-allowlist/governed-mutation/independent-verification path. The production manager `385-470-4045` is never a mutation target. Meta retains its configuration-driven Graph API adapter and disabled-by-default governed path; external acceptance remains deferred unless separate credentials and isolated acceptance evidence are supplied.

CRM and communications use provider-neutral DTO/adapter contracts with deterministic mock acceptance adapters. They never contact a real CRM or customer. CRM writes and communications require an approved governed dispatch and stable idempotency key. Communication provider acceptance is not delivery verification and remains `EXECUTED_UNVERIFIED` until independent evidence exists.

## Data and evidence

Migration `0031_provider_integration_runtime` stores tenant provider bindings, capability bindings, and sanitized verification metadata. It stores optional credential references, never credential values. EPIC05 remains authoritative for provider health, credential health, operational evidence, retries, leases, and dead letters. Verification states distinguish `PROVIDER_ACCEPTED`, `EXECUTED_UNVERIFIED`, `VERIFIED`, `FAILED`, and `UNCERTAIN`; no causal or delivery-success claim is fabricated.

## External status

Google and Meta code paths are governed and disabled unless explicitly configured under their existing controls. CRM mock is acceptance-ready; real CRM selection is deferred. Email, SMS, and WhatsApp mock contracts are ready; no live provider is connected. No provider mutation, customer communication, deployment, or credential exposure occurred in EPIC14.
