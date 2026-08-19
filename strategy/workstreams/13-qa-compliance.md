# Workstream 13: QA / Compliance

> **Status:** Execution brief for evidence-bounded marketing QA, launch readiness, and cross-channel compliance controls. It is not legal advice and does not approve a campaign or establish the requirements of any jurisdiction.
>
> **Evidence boundary:** The master GTM, ABM workflow, measurement system, and Workstreams 04-10 contain hypotheses, operating decisions, and dependencies. They do not, by themselves, prove claims, customer outcomes, channel permission, legal basis, data rights, AI safety, or local compliance. No Saudi law-specific conclusion is asserted here. Qualified legal, privacy, security, Arabic-language, and other subject-matter review is required where applicable.

## Objective

Create one pre-launch quality and compliance control for the Saudi B2B acquisition motion. Verify that claims are evidence-bounded, Arabic/English assets preserve meaning, outbound and email contact is permitted and suppressed consistently, data and AI use is controlled, assets function as intended, and every launch has a recorded decision, owner, expiry/review date, and escalation path.

This workstream owns the review system, registers, gates, launch checklist, issue log, and audit trail. It does not select accounts, define positioning, write channel content, interpret Saudi law, set measurement definitions, or replace qualified legal, privacy, security, or language review.

The operating principle is simple: **no asset, audience, sequence, upload, or launch proceeds when a material uncertainty is unresolved.** Mark the item `Blocked` or `[NEEDS INPUT]`, name the owner, and record what would unblock it.

## Upstream Inputs

Use these sources as context and handoff contracts; preserve their evidence status and ownership:

- [Saudi AI Customer Acquisition GTM](../saudi-ai-customer-acquisition-gtm.md): offer hypothesis, buyer committee, funnel, channel posture, Arabic/English test, handoffs, and quality gates.
- [First 90 Days: Saudi B2B SME and Mid-Market ABM Motion](../../examples/workflow-saudi-sme-abm-90-days.md): account evidence, tiering, owner assignment, signal freshness, consent gate, cooling-off, suppression, and seller handoff precedent.
- [Saudi B2B AI-Native Acquisition Measurement System](../../guides/saudi-b2b-ai-acquisition-measurement-system.md): account unit, FIND-through-CONVERT definitions, attribution, instrumentation dependencies, data-quality thresholds, cohort maturity, and decision gates.
- [Workstream 04: Messaging](04-messaging.md): message inventory, capability/proof boundary, approved claims, customer-language discipline, Arabic/English tests, and public-use status.
- [Workstream 05: Content](05-content.md): asset dispositions, evidence labels, language review, content QA, distribution, and Publish/Hold/Cut gate.
- [Workstream 06: SEO / AEO](06-seo-aeo.md): evidence register, answer-first content, authorship, source/date controls, structured data, access, and language considerations.
- [Workstream 07: LinkedIn / Founder-Led Social](07-linkedin-social.md): public engagement approvals, disclosure, response routing, suppression, language testing, and social escalation.
- [Workstream 08: Trigger-Led Outbound](08-outbound.md): trigger/account/contact fields, five-touch ceiling, channel eligibility, seller handoff, and immediate suppression rules.
- [Workstream 09: Email](09-email.md): permission and subscription state, preference center, deliverability dependencies, sequence exits, and unsubscribe propagation.
- `[NEEDS INPUT: Workstream 10 path, owner, scope, and launch dependencies; no Workstream 10 file is currently present in strategy/workstreams/]`.
- `[NEEDS INPUT: qualified legal/privacy reviewer, security reviewer, qualified Saudi Arabic reviewer, commercial approver, and QA storage location]`.

## Owner

**Accountable:** QA / Compliance owner `[NEEDS INPUT: named person]`.

**Required partners:** Legal/Privacy; qualified Saudi Arabic reviewer; English editor; Security/Data owner; AI workflow owner; Messaging/Positioning; Content; ABM; Outbound; Email; Social; SEO/AEO; Paid/Partner/Event owner `[NEEDS INPUT: Workstream 10 owner]`; Marketing Ops/Analytics; Sales; Finance/Commercial; and the executive launch approver `[NEEDS INPUT: name/role]`.

**Decision authority:** QA records readiness and may block or return an item for correction. Qualified legal/privacy counsel owns legal interpretation. Security/Data owns technical data controls. The commercial approver owns the final business launch decision. No silence, schedule pressure, or channel owner approval overrides a material block.

## Operating Contract

Every review item has a stable ID, asset/campaign/audience version, surface, funnel stage, owner, source, evidence status, reviewer, decision, conditions, review date, and audit location. Statuses are:

- `Draft`: not reviewed for external use.
- `Needs review`: submitted with required evidence and owners.
- `Approved`: cleared for the named surface, audience, language, and time window only.
- `Approved with conditions`: usable only with recorded boundaries or controls.
- `Blocked`: cannot launch until the issue is resolved or an authorized reviewer changes the decision.
- `Expired`: prior approval no longer applies because the offer, evidence, policy, audience, or review date changed.

Approval is scoped. A cleared email does not clear a landing page, ad audience, social reply, sales sequence, partner upload, or translated version unless each is covered by the record.

## Claim / Proof Register

Create one register for every material statement in copy, creative, sales enablement, email, social, search, partner/event material, landing pages, forms, and AI-assisted output.

| Field | Required record |
|---|---|
| Claim ID and version | Stable ID, exact wording, asset/surface, audience, funnel stage, language, and last changed date. |
| Claim type | Capability, outcome, customer result, comparative, pricing, timing, local relevance, AI, security/privacy, regulatory, testimonial, or other. |
| Evidence | Source ID, source/date, owner, context, permission, scope, limitation, confidence, and expiry/review date. |
| Status | Observed, Reported, Inferred, Hypothesis, Approved proof, Unknown, Approved, Blocked, or Expired. |
| Capability boundary | `WORKS`, `PARTIAL`, `LIMITS`, or `ABSENT`, with plan, workflow, scale, role, region, or human-review condition where relevant. |
| Proof use | Exact surface and audience allowed; prohibited extrapolations and required qualifier/disclosure. |
| Review | Messaging/Positioning, capability owner, proof/permission owner, qualified legal/privacy reviewer where relevant, QA reviewer, date, and decision. |

Rules:

- A customer result proves only the named context and scope; it does not prove a universal result, benchmark, forecast, or guarantee.
- A provider statement, search result, AI answer, competitor page, or internal draft is not proof by itself.
- No invented metric, customer name, logo, quote, testimonial, market fact, competitor conclusion, local-access claim, performance claim, or certification enters the approved register.
- Pricing, delivery timing, AI performance, security, privacy, and regulatory language require the owner who can substantiate that specific statement.
- `PARTIAL` and `LIMITS` claims must show their condition. `ABSENT`, `Unknown`, and unsupported claims are blocked.
- A claim is re-reviewed after a material offer, capability, evidence, policy, customer permission, language, or surface change.

## Arabic / English Review

Treat language as a controlled variant, not a translation afterthought. The English and Arabic versions must express the same commercial scope, proof boundary, qualifiers, CTA, consent language, and next step.

Before external use, record:

- Audience role, account context, language evidence, script/locale, asset version, and source copy.
- Qualified reviewer name, qualifications/role, review date, terminology decisions, and unresolved ambiguity.
- Meaning, register, terminology, cultural assumptions, numerical/date/currency formats, CTA clarity, consent/opt-out wording, and right-to-left rendering checks.
- Any change that makes a hypothesis, capability, outcome, or legal qualifier stronger or narrower than the source version.

Machine translation or AI drafting may assist production but is never final approval. A qualified Saudi Arabic reviewer is required for customer-facing Arabic; qualified legal/privacy review is required for consent, privacy, data, regulatory, or contractual wording. Do not infer language preference from name, nationality, location, or profile image. Test Arabic-first, English-first, and bilingual variants using the measurement system's account-level progression criteria, not opens, impressions, or raw clicks.

## Outbound / Email Consent and Suppression Gate

Consent, permission, and suppression are cross-channel business records. The authoritative record belongs in the CRM/CDP or other approved operational system, not in this repository or a local campaign spreadsheet. Every channel reads it before contact or audience upload.

The gate applies immediately before:

- Outbound email, phone, LinkedIn message, WhatsApp, or other direct contact.
- Email enrollment, send, reactivation, or preference change.
- Paid custom/matched audience creation or refresh.
- ABM activation, partner/event list transfer, or sales-sequence enrollment.

Required checks:

1. Account and contact identity are deduplicated and linked to the system of record.
2. The source, collection/access date, channel, purpose, permission/consent state, owner, and review status are recorded.
3. Global suppression, channel suppression, unsubscribe, complaint, do-not-contact, legal restriction, customer state, active opportunity, recent-touch conflict, and cooling-off rules are checked.
4. The specific channel and geography are cleared by the qualified reviewer; public availability, a referral, a platform connection, or account importance is not automatic permission.
5. Suppression is applied before every send, enrollment, upload, and audience refresh, including contacts suppressed in another channel.
6. An opt-out or suppression is propagated to email, sales sequences, paid audiences, ABM, partner/event workflows, and other contact-capable systems before the next action. No local list may override it.
7. The event, decision, timestamp, reviewer, and exception are auditable. Exceptions require written qualified approval, scope, expiry, and stop condition.

Uncertainty about Saudi or cross-border requirements, privacy, commercial communications, phone/WhatsApp, recording, cookies, data sharing, or platform rules stops execution and escalates to qualified review. This workstream does not decide whether a channel is lawful.

## Data / AI Controls

Before using personal, customer, prospect, confidential, or account research data, record the data flow and approved purpose. At minimum, document:

- Data categories, source, access permissions, account/contact linkage, retention, deletion, and access roles.
- Whether data is used for drafting, enrichment, scoring, personalization, routing, analytics, audience creation, training, or evaluation.
- Approved tools, vendors/subprocessors, environment, transfer/storage location `[NEEDS INPUT]`, contract/security review `[NEEDS INPUT]`, and prohibition on unapproved model training or reuse.
- Human review points for account facts, claims, Arabic language, customer communication, suppression, routing, and launch decisions.
- Prompt/output handling, redaction, secrets policy, hallucination checks, source preservation, and incident reporting.
- AI-generated or AI-assisted material is labeled in the working record, checked against the claim/proof register, and never treated as evidence merely because a model produced it.
- Automated decisions that affect contact eligibility, account tier, personalization, or suppression have an owner, explainable rule, override path, audit log, and QA sample.

Do not place contact lists, suppression records, private account research, customer-confidential data, credentials, or unapproved personal data in shared Markdown, prompts, public assets, or model context. Escalate suspected exposure, incorrect deletion, unauthorized use, prompt leakage, or harmful output immediately to Security/Data, Legal/Privacy, QA, and the incident owner.

## Asset QA

Every asset passes the applicable checks before launch:

1. **Brief and scope:** named audience, account/role, funnel stage, objective, CTA, owner, version, channel, and expiry/review date.
2. **Evidence and claims:** claim/proof IDs, source/date, qualifiers, capability boundary, permissions, comparison limits, and approved status.
3. **Message and offer:** matches Workstreams 02/04 and the actual offer; no hidden guarantee, unsupported local assertion, or capability expansion.
4. **Language:** qualified English and Saudi Arabic review where applicable; meaning and qualifier parity confirmed.
5. **Consent and suppression:** current system-of-record result captured for every contactable audience; no conflict with active opportunity, customer, cooling-off, or opt-out state.
6. **Data and AI:** approved data flow, tool, human review, redaction, retention, and output verification recorded.
7. **Technical function:** links, forms, routing, sender identity, unsubscribe/opt-out, tracking, UTM/source fields, CRM IDs, redirects, rendering, mobile, accessibility, and right-to-left display tested.
8. **Disclosure and rights:** sponsorship/affiliate/material-connection, customer proof permission, image/font/content license, confidentiality, and required notices reviewed by the appropriate owner.
9. **Measurement:** event taxonomy, account linkage, stage timestamps, primary-source rule, cohort window, and dashboard destination are defined; unknowns are not silently zeroed.
10. **Audit trail:** reviewers, findings, fixes, final decision, launch time, rollback owner, and post-launch check are recorded.

## Launch Checklist

A campaign, sequence, asset set, audience, upload, or website release is launch-ready only when the owner checks every applicable item:

- [ ] Objective, audience, account tier, funnel stage, CTA, owner, budget/capacity, and stop condition are documented.
- [ ] Claim/proof register is complete; all material claims are approved or visibly blocked/directional with required qualifiers.
- [ ] Arabic/English versions have qualified review and parity of meaning, scope, CTA, and consent wording.
- [ ] Qualified legal/privacy review has addressed the relevant Saudi and cross-border questions; no legal conclusion is inferred by QA.
- [ ] Consent/permission and global cross-channel suppression were checked immediately before activation.
- [ ] Email, outbound, social, paid, ABM, partner, and event audiences have no conflicting local lists or stale uploads.
- [ ] Data/AI workflow, vendors, permissions, retention, human review, and incident route are approved.
- [ ] Asset, link, form, sender, opt-out, tracking, CRM routing, rendering, accessibility, and mobile tests pass.
- [ ] Proof, trademark, copyright, sponsorship, affiliate, customer permission, and confidentiality checks pass where applicable.
- [ ] Measurement fields, source taxonomy, account IDs, stage definitions, attribution boundary, and reconciliation owner are ready.
- [ ] Reviewers accepted the handoff, remaining `[NEEDS INPUT]` items are non-material or explicitly block launch, and the launch approver signed off.
- [ ] Launch timestamp, rollback/pause method, monitoring window, first post-launch check, and incident contacts are recorded.

## Escalation and Issue Log

Record every material issue in one risk register with issue ID, date, asset/campaign, description, requirement, severity, affected people/accounts/channels, evidence, owner, remediation, due date, status, approver, and closure evidence.

| Severity | Examples | Action |
|---|---|---|
| Critical | Suppressed contact reached; unauthorized audience upload; suspected personal-data exposure; fabricated material claim live; security incident; unlawful or harmful content concern | Pause affected activity immediately, preserve evidence, notify qualified Legal/Privacy and Security/Data, and escalate to the executive incident owner. No restart without written clearance. |
| High | Missing permission decision; unapproved customer proof; material claim without substantiation; Arabic meaning changes scope; broken unsubscribe or suppression sync; material tracking/account-linking failure | Block launch or pause the affected path. Assign owner and due date; qualified reviewer decides release conditions. |
| Medium | Missing source metadata; stale proof; non-critical rendering/accessibility defect; incomplete handoff or dashboard field | Hold the affected item until corrected or document an authorized, time-limited exception. |
| Low | Typo, cosmetic spacing, non-material metadata gap | Correct before or during the next controlled release; no silent recurrence. |

Any employee or agent may raise an issue. Never resolve a suppression, data exposure, legal, security, customer-proof, or language-risk issue by editing the register alone. The accountable owner records the escalation, and the qualified decision owner records the disposition.

## `[NEEDS INPUT]` Register

- `[NEEDS INPUT: named QA/compliance owner, executive launch approver, storage location, template, audit retention, and review cadence]`
- `[NEEDS INPUT: qualified legal/privacy counsel and scope of Saudi/cross-border review; no Saudi law conclusion is approved by this workstream]`
- `[NEEDS INPUT: qualified Saudi Arabic reviewer, English editor, terminology register, and language escalation SLA]`
- `[NEEDS INPUT: CRM/CDP system of record for consent and suppression, sync frequency, conflict owner, and cross-channel propagation test]`
- `[NEEDS INPUT: actual company/product name, offer, pricing, delivery scope, client responsibilities, proof, permissions, and forbidden claims]`
- `[NEEDS INPUT: approved data inventory, retention/deletion schedule, access roles, vendors/subprocessors, transfer/storage locations, and security review]`
- `[NEEDS INPUT: AI tools, model-use policy, human review points, redaction rules, training/reuse restrictions, and incident route]`
- `[NEEDS INPUT: Workstream 10 path, owner, channel scope, audience/upload process, and QA dependencies]`
- `[NEEDS INPUT: asset repository, versioning convention, launch calendar, rollback process, and monitoring dashboard]`
- `[NEEDS INPUT: CRM stages, event taxonomy, UTM/source registry, account IDs, attribution rules, data-quality thresholds, and reconciliation owner]`
- `[NEEDS INPUT: customer proof permissions, trademark/copyright/partner rights process, disclosure standards, and reviewer]`
- `[NEEDS INPUT: severity SLA, incident contacts, legal/security escalation route, and post-incident review owner]`

## Outputs

1. Claim/proof register with evidence, scope, permission, capability boundary, status, reviewer, and expiry.
2. Arabic/English review register with source/variant parity, qualified reviewer, terminology decisions, and unresolved language risks.
3. Cross-channel consent and suppression gate record, including pre-send/pre-upload checks, propagation results, exceptions, and conflicts.
4. Data/AI control record covering data flows, approved tools, access, retention, human review, redaction, output verification, and incidents.
5. Asset QA record with checklist results, defects, approvals, versions, and review dates.
6. Launch readiness packet with sign-offs, launch/rollback details, monitoring window, and first post-launch check.
7. Compliance issue log and risk register with severity, owner, remediation, escalation, and closure evidence.
8. Post-launch QA report covering delivery, suppression, claims, language, technical function, data quality, and any series breaks.
9. Audit trail and decision log for approve, approve with conditions, block, pause, revise, expire, or stop decisions.

## Downstream Handoffs

Every handoff includes artifact version, evidence status, owner, acceptance criterion, unresolved inputs, escalation trigger, and feedback date.

| Recipient | Handoff | Acceptance criterion |
|---|---|---|
| ABM | Approved account/contact audience, account IDs, role, trigger, suppression result, cooling-off, and next milestone | ABM confirms the audience is sourced, capacity-sized, current, and safe to activate. |
| Messaging / Positioning | Claim decisions, proof gaps, language findings, objections, and blocked copy | Message owners update the controlled inventory without promoting hypotheses to facts. |
| Content / Design / Web / SEO-AEO | Cleared claims, asset brief, language decision, technical QA, source links, and expiry | Production preserves scope, qualifiers, accessibility, links, authorship, and evidence status. |
| Outbound / Email / Social | Launch-approved copy/version, audience eligibility, suppression timestamp, response owner, opt-out route, and stop rule | Channel owner passes a final pre-send check and confirms local list conflicts are absent. |
| Paid / Partner / Event owner | Approved audience/upload rules, suppression scrub, proof/disclosure status, creative, and refresh cadence | Owner confirms platform feasibility, audience refresh controls, and no suppressed records are uploaded. |
| Marketing Ops / Analytics | QA fields, event/source taxonomy, account IDs, stage timestamps, attribution rules, and reconciliation checks | Instrumentation passes the measurement system's completeness and reconciliation gates. |
| Sales / Commercial | Approved offer/proof, qualification boundary, handoff SLA, objection/escalation route, and next milestone | Seller accepts the route and can act without inventing scope, proof, or permission. |
| Legal / Privacy / Security | Open questions, data flows, claims, proof permissions, channel details, and incident evidence | Qualified reviewer records approved, blocked, or conditional decision with expiry and conditions. |
| Executive launch approver | Readiness summary, residual risk, conditions, monitoring, rollback, and decision request | Approver records launch, hold, revise, pause, or stop with date and owner. |

## Acceptance Criteria

- A named QA/compliance owner, qualified review partners, approval path, storage location, review cadence, and issue-log owner exist.
- The workstream references and preserves the master GTM, ABM workflow, measurement system, and Workstreams 04-10 boundaries; it does not create competing account, message, channel, measurement, or legal authority.
- Every material claim has a stable ID, source/date, evidence label, scope, permission where relevant, capability boundary, reviewer, and expiry/review date.
- Unsupported, expired, extrapolated, or unowned claims are blocked; customer proof is not generalized beyond its documented context.
- Arabic/English assets receive qualified review, preserve meaning and qualifiers, and record language evidence rather than inferred preference.
- Outbound and email activation, sales-sequence enrollment, ABM activation, paid audience upload, and partner/event transfer all query one authoritative cross-channel suppression record immediately before action.
- Opt-outs and suppression captured in any channel propagate to every contact-capable channel before the next send or upload; no shared configuration file or local list is treated as authoritative.
- Data and AI workflows have documented purpose, source, access, retention, approved tools/vendors, human review, redaction, output verification, and incident route; sensitive operational data is not stored in this repository.
- Asset QA covers evidence, offer, language, consent/suppression, data/AI, technical function, disclosure/rights, measurement, and audit trail.
- The launch checklist is complete, non-material unknowns are explicitly accepted by the appropriate owner, and material `[NEEDS INPUT]` items block launch.
- Critical and high issues have an owner, SLA, escalation path, pause/rollback rule, and qualified disposition; closure includes evidence.
- Downstream owners accept their handoffs, and post-launch monitoring verifies suppression, delivery, tracking, claims, language, and data-quality behavior.

## First 14 Days

| Day | Action | Deliverable / gate |
|---|---|---|
| 1 | Confirm QA owner, executive approver, qualified reviewers, source systems, storage, audit trail, and the missing Workstream 10 dependency. | Owner map, review route, and `[NEEDS INPUT]` register. |
| 2 | Import master GTM, ABM, measurement, and Workstreams 04-09 decisions; record Workstream 10 as unresolved rather than inventing its scope. | Versioned upstream/source register and ownership boundary. |
| 3 | Define statuses, severity levels, review SLAs, evidence labels, claim IDs, asset IDs, and exception rules. | QA template pack and issue-log schema. |
| 4 | Inventory the first launch assets, sequences, audiences, forms, pages, social posts, partner/event materials, and AI-assisted outputs. | Asset/surface register with owners and versions. |
| 5 | Build the claim/proof register; map capability, outcome, customer, comparative, AI, local, pricing, and regulatory statements. | Blocked/approved/directional claim decisions and proof gaps. |
| 6 | Establish the Arabic/English review workflow and terminology register; assign qualified reviewers and run a parity check on the first variants. | Language QA record and unresolved terminology list. |
| 7 | Trace outbound/email enrollment and send paths, ABM activation, and paid/partner/event audience paths to the authoritative suppression record. | Consent/suppression data-flow map and pre-action gate. |
| 8 | Run a cross-channel opt-out propagation test from email, outbound, social, and CRM sources through sequences, ABM, and audience refresh paths. | Dated test evidence, defects, owners, and pause conditions. |
| 9 | Map data and AI flows, approved tools, access, retention, human review, redaction, output verification, and incident route. | Data/AI control record; unresolved sensitive-data risks blocked. |
| 10 | Execute asset QA on links, forms, tracking, CRM routing, unsubscribe/opt-out, rendering, accessibility, rights, disclosures, and rollback. | Defect log and corrected/retest items. |
| 11 | Route claims, consent, privacy, data, AI, language, proof, and disclosure questions to qualified reviewers. | Recorded approved, conditional, blocked, or `[NEEDS INPUT]` decisions. |
| 12 | Assemble the launch packet and run the checklist with channel owners, Marketing Ops, Sales, and the commercial approver. | Launch readiness verdict; material gaps block activation. |
| 13 | Perform a controlled pre-launch or internal test, verify monitoring and reconciliation, and confirm suppression immediately before the test. | Test report, rollback confirmation, and post-launch monitoring plan. |
| 14 | Hold the QA/compliance gate: launch, revise, hold, pause, or stop. Record residual risk, expiry, next review, and accepted handoffs. | Signed decision log, issue register, audit pack, and next-cycle actions. |

Day 14 approval is limited to the named assets, audience, language, channels, and window. A changed claim, offer, audience, data flow, model/tool, proof permission, policy, or legal/privacy position reopens the relevant review.
