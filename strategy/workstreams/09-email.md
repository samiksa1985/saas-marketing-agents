# Workstream 09: Email

> **Status:** Execution brief; channel, language, deliverability, and performance hypotheses remain unvalidated.
>
> **Service context:** First paid Saudi B2B acquisition engagement for a bounded pipeline reset and acquisition sprint.
>
> **Evidence boundary:** No company name, product details, customer proof, legal position, deliverability baseline, historical performance, pricing, or benchmark is supplied. Do not present any of these as fact. Mark unresolved items as `[NEEDS INPUT]`, `Unknown`, or `Hypothesis` until sourced, reviewed, and approved.

## Objective

See **1. Purpose and role** below for the existing email objective, ownership boundary, and first-engagement purpose.

## Upstream Inputs

See **2. Upstream inputs** below for the existing dependency list, including the master GTM context and Workstream 01.

## Owner

**Accountable specialist:** Email Lifecycle Architect / Email lifecycle owner.

See **3. Owner and operating contract** below for the existing operating contract and required partners.

## 1. Purpose and role

Email is the permission-aware continuity layer across `ENGAGE -> QUALIFY -> NURTURE -> CONVERT`. It turns an approved signal or conversation into a clear next step, preserves useful context between touches, supports timely follow-up, and records response and progression evidence for the acquisition loop.

Email is not a substitute for a sales owner, a valid offer, customer research, consent, deliverability work, or CRM discipline. The first engagement should prove whether email improves qualified commercial progression for one offer, one buyer segment, and one approved motion.

### Email owns

- Permission and subscription-state enforcement within the agreed sending system.
- Trigger-based follow-up after an approved interaction or handoff.
- Nurture for contacts who have a relevant problem but are not ready for a sales step.
- Sequence branching, cooling-off rules, suppression checks, and exit conditions.
- Arabic/English message testing and language metadata, subject to native review.
- Email event capture, source taxonomy, and reporting requirements with Marketing Ops.
- Feedback from replies, objections, content interest, and disengagement to the upstream owners.

### Email does not own

- Deciding that an unverified contact is eligible for outreach.
- Creating a legal basis for commercial communication or interpreting local law.
- Replacing sales judgment, discovery, qualification, proposal work, or response ownership.
- Promising outcomes, local access, AI capability, compliance, or customer results without approved evidence.
- Sending to a purchased or unverified list as a volume strategy.
- Treating opens as proof of intent, fit, permission, or pipeline.

## 2. Upstream inputs

- [Saudi B2B AI Customer Acquisition GTM](../saudi-ai-customer-acquisition-gtm.md): ICP, buyer committee, trigger-led channel posture, Arabic/English hypothesis, qualification, handoff, and 90-day gates.
- [Workstream 01: ICP / ABM](01-icp-abm.md): account tier, sourced trigger, reachable roles, owner, next milestone, and suppression check.
- `[NEEDS INPUT: Workstream 04 approved content themes, assets, claims register, and content owner]`.
- `[NEEDS INPUT: Workstream 05 paid-media audience, landing-page, retargeting, and consent dependencies]`.
- `[NEEDS INPUT: Workstream 08 competitive-intelligence findings, alternative used, objections, and approved comparison boundaries]`.
- `[NEEDS INPUT: actual company/product name, offer, package, supported sectors, languages, proof, and client responsibilities]`.
- `[NEEDS INPUT: CRM, ESP, sending domain, sender identity, subscription groups, suppression source, and integration owner]`.

## 3. Owner and operating contract

**Accountable:** Email lifecycle owner.

**Required partners:** paired sales owner for every active account or conversation; `analytics-marketing-ops-architect`; `ops-legal-compliance`; deliverability specialist; ABM owner; content/copy owner; paid-media owner where audiences or retargeting overlap; QA owner.

Every live sequence must have a named business owner, approved audience, trigger, sending identity, permission/suppression rule, content approver, reply owner, exit condition, and measurement owner. A sequence cannot launch because a contact exists in the CRM.

## 4. Permission and suppression model

### Source of truth

Maintain one cross-channel consent and suppression record, or document the temporary reconciliation process if systems cannot yet share one. Email may maintain an operational copy for execution, but the copy must have an owner, refresh rule, timestamp, and conflict-resolution path.

Required contact-level fields:

- Contact and account ID; source system; source date; data owner.
- Channel and subscription type: outbound permission status, nurture subscription status, and operational/transactional status where applicable.
- Consent or other approved communication basis: value, source, date, scope, evidence, and review status. Legal owns interpretation.
- Opt-out timestamp, channel, request type, and processing status.
- Pause/snooze status and automatic reactivation date, if offered.
- Topic preferences and frequency preference, if implemented.
- Global suppression, channel suppression, legal restriction, complaint, hard bounce, and do-not-contact flags.
- Last touch, next eligible touch, active sales conversation, customer status, and owner.

### Enforcement rules

1. Check suppression and active-conversation status immediately before every send or enrollment.
2. A real unsubscribe is honored immediately in the sending system and propagated to every relevant system; it is never delayed behind a preference-center offer.
3. An opt-down ladder may offer monthly frequency, topic scoping, or a dated pause, but the real unsubscribe remains visible and available.
4. A pause has an explicit end date and reactivation path. The first message after reactivation must re-establish context rather than resume blindly.
5. Topic preferences must map to actual subscription groups or audience rules that campaigns read. A stored preference with no enforcement is a defect.
6. Active sales conversations, accepted opportunities, customers, legal restrictions, recent touches, and channel conflicts are excluded or handed off according to the orchestration contract.
7. Hard bounces, spam complaints, invalid addresses, and role changes are suppressed according to the ESP and deliverability owner's approved policy.
8. Never use email engagement alone to infer consent or permission.
9. Keep an audit trail for enrollment, send, suppression, unsubscribe, bounce, complaint, pause, reactivation, and manual override events.
10. `[NEEDS INPUT: legal review of Saudi and cross-border commercial communication, privacy, consent, data handling, and sector-specific requirements]`.

### Preference center

Offer, where technically and legally approved:

- Frequency step-down: active cadence to a lower approved cadence.
- Stream scoping: retain useful product, security, onboarding, or research streams while removing unwanted marketing topics.
- Pause/snooze: a dated suppression with automatic reactivation.
- Full unsubscribe: clear, immediate, and easy to find.

The preference center must write to fields or subscription groups that every sending system enforces. Document the cross-tool propagation test before relying on it.

## 5. Outbound follow-up versus nurture

| Dimension | Outbound follow-up | Nurture |
|---|---|---|
| Purpose | Advance a known interaction, trigger, reply, referral, meeting, or accepted handoff. | Build useful context for a relevant contact who is not ready for the next sales step. |
| Entry | Approved account/contact signal and permission or legal review; normally paired with a sales owner. | Explicit subscription or otherwise approved enrollment path, with stage and topic fit. |
| Owner | Sales owner owns judgment, reply handling, discovery, and next step; email supports execution. | Lifecycle/email owner owns cadence and branching; sales owns escalation when a threshold is met. |
| Content | Short, specific, contextual, and tied to the observed trigger or prior conversation. | Educational progression, proof only when approved, useful frameworks, and relevant product context. |
| Cadence | Touch density and cooling-off rules are governed by the account orchestration contract. | Frequency cap, topic preference, engagement state, and lifecycle stage govern eligibility. |
| Exit | Reply, meeting, accepted handoff, explicit not-now, opt-out, suppression, or sequence completion. | Sales-ready signal, unsubscribe, pause, inactivity/sunset rule, customer transition, or sequence completion. |
| Measurement | Reply quality, meeting held, accepted handoff, qualified progression, and opportunity outcome. | Engaged progression, content/topic interest, qualified handoff, activation of the next step, and retention of permission. |

A non-response to outbound does not automatically create permission for nurture. Move a contact only when the enrollment condition and suppression check are satisfied. A positive reply leaves automated sequences and moves to the sales owner.

## 6. Sequence architecture

### Shared sequence contract

Each sequence brief must specify:

- Sequence ID, version, purpose, stage, and accountable owner.
- Audience definition: account tier, role, source, trigger, language, lifecycle state, and exclusions.
- Enrollment event, eligibility check, and frequency cap.
- Message job, value offered, CTA, evidence status, and approval owner for every email.
- Branches for reply, meeting request, click/topic interest, no engagement, bounce, unsubscribe, complaint, and active opportunity.
- Human review point and reply SLA.
- Exit conditions, cooling-off period, re-entry rule, and suppression behavior.
- UTM/source fields, CRM event mapping, and dashboard dimensions.

### First-engagement architecture

The exact count and timing remain hypotheses until capacity, permission, historical data, and buyer feedback are available. Start with a small, reviewable architecture:

1. **Trigger confirmation:** ABM or sales records the sourced trigger, role, account fit, source date, and suppression status.
2. **Contextual first touch:** sales-led outbound or approved follow-up states the relevant observation and offers a useful diagnostic or conversation; it does not lead with unsupported proof or a guaranteed result.
3. **Follow-up branch:** a reply, meeting request, or clear buying signal routes to the paired sales owner and suppresses automated follow-up.
4. **Not-now branch:** an explicit not-now response routes to a permissioned nurture choice with topic and frequency options; no silent enrollment.
5. **Education branch:** nurture answers the next practical question, then progressively addresses the common use case, operating risk, governance concern, and next commercial step.
6. **Interest branch:** a meaningful click or form action is recorded as an interest signal, not as qualification; sales reviews it against account fit, timing, authority, and problem evidence.
7. **Inactivity branch:** apply a documented lower-frequency, pause, or sunset rule. Do not keep escalating volume to non-engagers.
8. **Conversion branch:** qualified progression leaves nurture and enters the sales/deal process with source, context, owner, next milestone, and handoff timestamp.

### Working message progression

| Stage | Message job | Primary CTA | Exit signal |
|---|---|---|---|
| Context | Confirm relevance and offer a useful observation or resource. | Reply, choose a time, or request the diagnostic. | Positive reply, meeting request, or explicit not-now. |
| Problem understanding | Help the recipient examine acquisition leakage, qualification, handoff, or measurement. | Read, reply with context, or share the current constraint. | Account-level problem evidence. |
| Evaluation | Explain the bounded engagement and what the client must provide; use only approved proof. | Discovery or pilot-design conversation. | Agreed evaluation milestone. |
| Decision support | Clarify scope, owners, data boundaries, approvals, and scale/revise/stop criteria. | Confirm next step with owner and date. | Accepted opportunity or closed decision. |
| Post-handoff | Preserve context while sales owns the live conversation. | Complete agreed buyer action. | Opportunity stage change, pause, loss, or conversion. |

### Frequency and cooling-off

Do not set a permanent volume target without evidence. Record `[NEEDS INPUT: approved maximum touches per contact/account, minimum cooling-off window, and active-campaign conflict rules]`. The initial operating rule should prioritize one clear next step, a human response path, and immediate suppression over maximizing sends.

## 7. Arabic/English test

Treat language as a testable message and trust variable, not a translation task. Test Arabic-first, English-first, and bilingual variants only where the recipient's language context and review capacity support them.

### Test design

- Segment by role, sector, account tier, source, public language signals, and buyer context where those fields are sourced.
- Use equivalent message jobs, offers, CTAs, and evidence boundaries across variants; do not compare a different offer and call it a language result.
- Use native Saudi Arabic review for customer-facing Arabic. `[NEEDS INPUT: named reviewer, dialect/style guidance, and approval SLA]`.
- Preserve English meaning and commercial nuance without machine-translated claims or unnatural code-switching.
- Record language assignment, reviewer, version, send date, and any manual edits.
- Define a minimum decision cohort before launch; until then, label results directional.
- Judge on qualified replies, meetings held, accepted handoffs, opportunity progression, and negative signals. Opens and clicks are diagnostic only.
- Check for confounding from role, source, sender, offer, send time, domain, and sample size before deciding a winner.

### Language decision log

For every test, record hypothesis, eligible cohort, allocation rule, variant, approval status, primary metric, guardrails, observation window, result, limitation, and next decision. Do not claim a Saudi-wide language preference from a small or convenience sample.

## 8. Deliverability dependencies

Email lifecycle performance is conditional on deliverability and data quality. The workstream cannot promise inbox placement or performance before the deliverability owner clears the sending setup.

### Required dependencies

- Sending domain and subdomain ownership, DNS access, and sender identity approval.
- SPF, DKIM, and DMARC configuration reviewed by the deliverability specialist and domain owner.
- ESP account configuration, bounce and complaint processing, suppression synchronization, and unsubscribe handling.
- Domain/IP history, warming or ramp plan where required, and a documented volume ceiling. `[NEEDS INPUT: current sending history and approved ramp plan]`.
- List provenance, address validation policy, role-account policy, and source/date fields.
- Content and link QA, rendering checks, mobile checks, plain-text or accessible alternative, and test sends.
- Reply-to mailbox monitoring, authentication, routing, and same-business-day ownership for positive replies.
- Monitoring for bounces, complaints, blocks, authentication failures, sudden engagement changes, and unsubscribe spikes.
- Coordination with paid-media, CRM, sales, and any other sending system to prevent duplicate or conflicting communication.
- Legal/privacy approval for data flows, retention, tracking, cross-border processing, and commercial messaging.

No sequence launches while a required dependency is `Unknown` or blocked without a named approver accepting the risk and a documented stop condition.

## 9. Handoffs

Every handoff includes the input artifact, decision required, owner, acceptance criteria, unresolved assumptions, and feedback date.

| Handoff | Email provides | Receiving owner returns |
|---|---|---|
| ICP / ABM -> Email | Account ID, tier, sourced trigger/date, role, language hypothesis, owner, next milestone, suppression status. | Enrollment decision, missing fields, sequence ID, and scheduled review. |
| Sales outbound -> Email | Interaction history, reply state, explicit permission or approved enrollment path, not-now context, and topic interest. | Follow-up copy/job, nurture eligibility, or no-send decision. |
| Email -> Sales / Deal Strategy | Positive reply, meeting request, qualified signal context, source, timestamp, owner, and proposed next step. | Acceptance/rejection, response time, discovery outcome, stage, and loss/objection reason. |
| Content -> Email | Approved asset, audience, language version, claim status, CTA, owner, and expiry/review date. | Placement, performance, objections, and content interest by segment. |
| Paid Media -> Email | Audience eligibility, consent/suppression status, landing-page event, retargeting dependency, and frequency conflict. | Audience feasibility, platform status, overlap decision, and cost/quality observation. |
| Email -> Marketing Ops / Analytics | Sequence events, field schema, source rules, suppression events, language assignment, and cohort definitions. | Instrumentation status, data-quality exceptions, dashboard, and reconciliation results. |
| Email -> Deliverability | Audience source, volume, sending identity, content, links, ramp request, and test evidence. | Launch clearance, monitoring thresholds, incident path, and stop decision. |
| Email -> Legal / Privacy / QA | Data flow, subscription model, claims, tracking, Arabic/English variants, and customer-facing copy. | Approved, blocked, or revise decision with conditions and expiry. |
| Email -> Customer Marketing | Converted customer status, consent, product stage, and transition context. | Installed-base suppression and approved onboarding/retention path. |

## 10. Measurement

### Measurement principles

Measure the account and commercial progression, not email activity in isolation. Attribute one primary source per opportunity and report email assists separately. Do not sum influenced pipeline across email, ABM, paid, content, and sales.

### Required event fields

Capture contact ID, account ID, sequence ID/version, email ID/version, stage, trigger/source, language, sender identity, send timestamp, delivery status, bounce/complaint/unsubscribe, reply classification, click/topic, handoff timestamp, owner, meeting status, qualification outcome, opportunity ID, next milestone, and suppression state.

### Funnel views

| Layer | Measures | Interpretation boundary |
|---|---|---|
| Eligibility | Eligible contacts/accounts, permission state, suppression rate, data completeness. | Shows whether the audience can be contacted, not whether it wants the offer. |
| Delivery | Delivered, hard/soft bounce, complaint, unsubscribe, authentication and block events. | Deliverability and list health; investigate before interpreting engagement. |
| Engagement | Reply rate, positive/neutral/negative reply, click/topic signal, meeting request. | Directional interest; opens are not proof of intent or permission. |
| Handoff | Accepted handoffs, acceptance rate, response time, meeting booked, meeting held. | Tests coordination and sales follow-through. |
| Qualification | Accounts meeting agreed exit criteria, disqualified/nurture outcomes, objection and loss reason. | Tests commercial relevance, not raw lead volume. |
| Pipeline | Opportunity progression, primary source, email assist, stage velocity, proposal and signed outcome where mature. | Requires agreed CRM stages and a sufficiently mature cohort. |
| Retention of permission | Preference changes, pauses, reactivations, unsubscribes, complaints, and sunset outcomes. | Tests whether the program preserves trust and list health. |

### Dashboard cuts

Report by account tier, role, source, trigger family, language, sequence, cohort, sender, lifecycle stage, and owner. Include denominator, observation window, data completeness, and maturity status for every rate.

`[NEEDS INPUT: baseline window, CRM stage definitions, primary-source attribution rules, cohort maturity rule, dashboard owner, and reporting cadence]`.

### Decision rules

Use pre-declared decision thresholds only after the baseline and capacity are known. `[NEEDS INPUT: minimum eligible cohort, observation window, acceptable complaint/bounce/unsubscribe guardrails, handoff SLA, and continuation threshold]`.

A language or sequence variant is not a winner solely because it has a higher open or click rate. Continue, revise, park, or stop based on qualified progression, negative signals, data quality, sales acceptance, and deliverability impact.

## 11. Explicit `[NEEDS INPUT]` register

- `[NEEDS INPUT: company/product name, actual offer, package, price, delivery model, proof, and minimum engagement]`
- `[NEEDS INPUT: first paid client's ICP segment, account list, buyer roles, triggers, and named sales owner]`
- `[NEEDS INPUT: consent basis, approved commercial communication channels, privacy requirements, and legal reviewer]`
- `[NEEDS INPUT: ESP/CRM, sending domain, sender identity, subscription groups, suppression source, and integration owner]`
- `[NEEDS INPUT: current list provenance, address quality, historical send volume, bounce/complaint history, and domain reputation]`
- `[NEEDS INPUT: approved maximum frequency, cooling-off rules, campaign conflict rules, pause policy, and sunset window]`
- `[NEEDS INPUT: Workstream 04 content assets, claims register, Arabic/English copy owners, and review process]`
- `[NEEDS INPUT: Workstream 05 landing pages, paid audience feasibility, retargeting events, and overlap controls]`
- `[NEEDS INPUT: Workstream 08 comparison set, buyer objections, proof requests, and approved competitive language]`
- `[NEEDS INPUT: qualification definition, CRM stages, sales response SLA, meeting definition, and handoff acceptance rules]`
- `[NEEDS INPUT: Arabic reviewer, language assignment fields, test cohort, allocation method, and decision owner]`
- `[NEEDS INPUT: dashboard fields, source taxonomy, attribution policy, baseline period, maturity rule, and reporting cadence]`
- `[NEEDS INPUT: deliverability clearance, SPF/DKIM/DMARC status, ramp plan, monitoring thresholds, and incident owner]`

## 12. Acceptance criteria

- The first engagement has one approved email objective, audience, trigger, owner, and next commercial milestone.
- Outbound follow-up and nurture have separate enrollment, ownership, cadence, content, handoff, and exit rules.
- Every contact is checked against the current suppression record before enrollment and send; unsubscribe, complaint, bounce, pause, and active-opportunity behavior is tested.
- The preference model distinguishes full unsubscribe, topic subscription, frequency step-down, and dated pause, and each preference maps to an enforced sending rule.
- No non-response is treated as permission for nurture, and every positive reply or accepted opportunity leaves automation for a named owner.
- Every message has an evidence status, approval owner, CTA, language/version field, and expiry or review condition where relevant.
- Arabic/English variants use equivalent message jobs and are reviewed by a named native-capable owner; results are labeled directional until the agreed cohort and observation conditions are met.
- Deliverability owner has cleared sending identity, authentication, list provenance, suppression sync, ramp, QA, monitoring, and stop conditions.
- CRM and ESP events reconcile for eligibility, delivery, reply, handoff, qualification, opportunity, and suppression states.
- Reporting distinguishes primary-source pipeline from email assists and does not use opens, clicks, or raw lead volume as commercial success.
- Every live handoff has a named owner, response SLA, acceptance criteria, unresolved assumptions, and feedback date.
- The workstream decision log records continue, revise, park, or stop decisions with source, date, limitations, and next action.

## 13. First 14 days

| Day | Action | Output / gate |
|---|---|---|
| 1 | Confirm the paid engagement objective, offer, ICP/account scope, sales owner, email owner, and evidence boundary. | Owner map, working brief, and unresolved inputs marked. |
| 2 | Map the current CRM, ESP, sending domain, sender identity, subscription groups, suppression source, and other active senders. | System and data-flow inventory; blockers escalated. |
| 3 | Review permission, source, opt-out, bounce, complaint, and active-opportunity fields with Legal/Privacy, Ops, and Deliverability. | Permission/suppression field map and approved review path. |
| 4 | Define outbound follow-up versus nurture entry and exit conditions with ABM and Sales. | Enrollment matrix, response SLA, cooling-off rule, and no-send conditions. |
| 5 | Create the sequence contract and first-message briefs for the selected trigger and audience. | Versioned sequence map with owners, branches, CTAs, and approval fields. |
| 6 | Gather approved content, claims, proof boundaries, objections, and comparison language from Content, PMM, and Competitive Intelligence. | Evidence-linked copy brief; unsupported claims removed or marked. |
| 7 | Draft Arabic-first, English-first, and bilingual variants for the same message job. | Three reviewable variants with language metadata and native-review assignment. |
| 8 | Validate list provenance, address quality, audience size, account/contact deduplication, and suppression status. | Sendable, blocked, and needs-review cohorts. |
| 9 | Complete deliverability checks: authentication, sender, links, rendering, mobile, reply routing, monitoring, and ramp. | Deliverability test report and launch clearance or stop decision. |
| 10 | Confirm tracking fields, event mapping, UTM/source rules, CRM stages, handoff fields, and dashboard denominator. | Instrumentation brief and data-quality test cases. |
| 11 | Run QA on copy, personalization, links, language, accessibility, unsubscribe, preference center, and branch behavior. | Approved test sends and defect log. |
| 12 | Launch only the smallest approved cohort or holdout/test allocation with documented observation window and guardrails. | Controlled first send; live monitoring owner and incident path. |
| 13 | Review delivery, negative signals, replies, topic interest, handoff acceptance, and sales feedback. | Early evidence log; pause or continue decision. |
| 14 | Hold the first gate with Sales, ABM, Content, Ops, Legal/Privacy, Deliverability, and Analytics. | Continue, revise, park, or stop decision; next 30-day backlog and accepted handoffs. |

### Day-14 exit condition

Proceed only when permission/suppression enforcement, deliverability clearance, reply ownership, event reconciliation, and copy approvals are documented. Otherwise pause sending, resolve the narrowest blocker, and record the decision rather than interpreting incomplete email activity as market evidence.

## Source context

- [Saudi B2B AI Customer Acquisition GTM](../saudi-ai-customer-acquisition-gtm.md)
- [Workstream 01: ICP / ABM](01-icp-abm.md)
- `[NEEDS INPUT: Workstream 04 source file and approved content brief]`
- `[NEEDS INPUT: Workstream 05 source file and approved paid-media dependency brief]`
- `[NEEDS INPUT: Workstream 08 source file and approved competitive-intelligence handoff]`
- [Saudi B2B AI Acquisition Measurement System](../../guides/saudi-b2b-ai-acquisition-measurement-system.md)
