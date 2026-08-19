# Workstream 11: Analytics / Measurement

> **Status:** Implementation brief; system definitions are inherited from the measurement system, while platform configuration, owners, access, and launch thresholds remain subject to confirmation.
>
> **Evidence boundary:** The measurement system is the primary source. The master GTM and Workstreams 01, 08, 09, and 10 are referenced for account, channel, handoff, and dependency context. No historical benchmarks, revenue claims, customer proof, or performance forecasts are introduced here.

## Objective

Implement one auditable account-based measurement system for the Saudi B2B acquisition motion. Make it possible to answer, with explicit definitions and maturity status:

- Which target accounts are being found and reached?
- Which activity becomes qualified commercial progression?
- Which sources, campaigns, offers, segments, and language variants contributed?
- Where is the instrument incomplete, incomparable, or unreconciled?
- Should the team scale, iterate, hold, or stop an activity based on evidence?

Analytics / Measurement owns the measurement contract, data model, instrumentation quality, reporting views, reconciliation, and decision log. It does not manufacture targets, infer legal permission, replace sales qualification, or claim causality from attribution.

## Upstream Inputs

- [90-Day Measurement System for a Saudi B2B AI-Native Acquisition Service](../../guides/saudi-b2b-ai-acquisition-measurement-system.md): primary source for the account model, FIND through CONVERT funnel, KPI definitions, maturity rules, dashboard design, attribution, operating plan, thresholds, dependencies, and cadence.
- [Saudi AI Customer Acquisition GTM](../saudi-ai-customer-acquisition-gtm.md): ICP, buyer committee, channel roles, qualification exit criteria, handoff contract, and 90-day decision gates.
- [Workstream 01: ICP / ABM](01-icp-abm.md): canonical account ledger, tiers, signal evidence, committee map, suppression status, owners, and account progression.
- [Workstream 08: Trigger-Led Outbound](08-outbound.md): trigger, contact, sequence, seller handoff, response SLA, language test, and outbound event requirements.
- [Workstream 09: Email](09-email.md): permission and suppression model, sequence events, lifecycle branches, deliverability dependencies, and email-to-CRM handoff fields.
- `[NEEDS INPUT: Workstream 10 document, owner, scope, event dependencies, and reporting handoffs; no 10-* file is currently present in strategy/workstreams]`.
- `[NEEDS INPUT: confirmed CRM, analytics/event store, ESP, ad platforms, finance, consent, and integration access]`.

## Owner

**Accountable:** `analytics-marketing-ops-architect`.

**Required partners:** Marketing Ops / Performance Analyst; ABM owner; outbound owner; email lifecycle owner; Sales Ops and deal owner; paid-media and partner channel owners; Finance; Delivery; Legal/Privacy; QA; and the Workstream 10 owner once identified.

The accountable owner may define schemas, validation rules, dashboards, and reconciliation procedures. Source-system owners remain responsible for correct capture in their systems. Legal/Privacy owns consent and lawful-basis decisions; Finance owns cost and booked-revenue reconciliation; Sales owns qualification and CRM stage hygiene.

## Implementation Scope

### 1. Event and account model

Use the measurement system's account-based unit of analysis:

- **Account:** one deduplicated Saudi company with a stable account ID, normalized legal name, domain, and parent/child rule where applicable.
- **Person:** one contact linked to an account; person activity supports account progression but does not create a second account.
- **Opportunity:** one mutually acknowledged commercial evaluation with amount, currency convention, expected close date, problem, owner, and next step.
- **Pipeline value:** one declared CRM convention, never a blend of recurring and project value.
- **Time:** store timestamps in UTC and render reporting in Asia/Riyadh. Preserve event time, ingestion time, and stage-change time separately.
- **Cohort:** the date an account first reaches the stage being analyzed. Label immature outcome cohorts provisional; never convert not-yet-arrived data into zero.

Every event must be attributable to an account where the event is account-relevant, and to a person where a person is known. Required common fields:

| Field group | Minimum fields |
|---|---|
| Identity | `account_id`, `person_id` where known, `opportunity_id` where applicable, canonical domain, source system |
| Event | event name, event version, event timestamp, ingestion timestamp, actor/system, event status |
| Context | stage, source class, campaign ID, UTM source/medium/campaign/content/term, offer, landing-page or asset ID, experiment/variant, language, geography where sourced |
| Governance | consent state, suppression state, eligibility decision, owner, audit/source reference |
| Commercial | CRM stage, stage-change reason, next milestone/date, amount/currency convention, contract type, cost allocation where applicable |
| Quality | dedupe key, validation status, unknown reason, correction timestamp, instrument/version marker |

Minimum event taxonomy:

- `account_created` / `account_updated` / `account_merged`
- `person_linked` / `person_suppressed`
- `funnel_stage_entered` / `funnel_stage_exited` / `stage_disqualified`
- `engagement_recorded` / `form_submitted` / `meeting_requested` / `meeting_booked` / `meeting_held`
- `seller_handoff_created` / `seller_handoff_accepted` / `seller_handoff_dispositioned`
- `opportunity_created` / `proposal_sent` / `agreement_signed` / `payment_or_po_recorded`
- `email_sent` / `email_delivered` / `email_replied` / `email_clicked` / `email_unsubscribed` / `email_bounced` / `email_complained`
- `paid_cost_loaded` / `partner_touch_recorded` / `offline_touch_recorded`
- `consent_updated` / `suppression_updated` / `data_quality_exception`

Do not add a new event merely to satisfy a dashboard. Each event needs an owner, source, definition, valid values, required fields, dedupe rule, retention rule, and downstream use.

### 2. CRM stages and exit criteria

Implement the measurement system's account-level stages. Person activity alone cannot advance the account unless the stage exit criterion is met.

| Stage | Required meaning | Exit evidence |
|---|---|---|
| `FIND` | Target account identified, deduplicated, assigned an ICP fit reason and source. | Owner, source, fit fields, and reachable role or documented unreachable reason. |
| `ENGAGE` | Account or buying-committee member records an approved measurable response. | Reply, meeting request, attended interaction, meaningful conversion, or approved high-intent event. |
| `QUALIFY` | Discovery confirms relevant problem and plausible buyer path. | ICP fit, problem, process, decision roles, timing, next step; otherwise nurture/disqualify. |
| `PROPOSE` | Account accepts a scoped commercial proposal or pilot plan. | Proposal to named buyer group with scope, price in SAR, owner, decision date, mutual next step. |
| `CONVERT` | Commercial agreement is signed and first payment or valid purchase order is recorded. | CRM and finance records reconcile to the signed agreement and payment/PO. |

CRM must retain stage history rather than only the current stage. Required stage fields include entry timestamp, exit timestamp, owner, reason code, source/primary credit, next step, and maturity status. Preserve `nurture`, `disqualified`, `suppressed`, `parked`, and `retired` dispositions without treating them as conversion stages.

Stage rates use the eligible population entering the prior stage as denominator. Reports show account counts and person counts separately, with numerator, denominator, unknown bucket, exclusions, and cohort age.

`[NEEDS INPUT: final CRM object names, field API names, stage picklist values, required-field enforcement, owner mapping, and Sales Ops approver]`.

### 3. Attribution and source governance

Publish three separate views; never blend them into one total:

1. **Sourced:** first eligible touch that created the account or person record.
2. **Influenced:** every eligible touch associated with the account before QUALIFY or CONVERT; assists are not unique pipeline and must not be summed across channels.
3. **W-shaped management view:** use the measurement system's declared starting convention of 30% first eligible touch, 30% QUALIFY creation touch, 30% PROPOSE creation touch, and 10% across recorded intervening touches. Treat this as a management convention, not causal truth.

Use last-touch only for operational routing and response-time analysis. Report paid-platform conversions separately from CRM conversions. When totals disagree, show the residual and investigate the instrument; do not average or force reconciliation.

Attribution eligibility requires valid campaign ID, UTM source/medium/campaign, landing-page ID, consent state where applicable, timestamp, and account link. Exclude internal traffic, test records, duplicates, bots, and unlinked contacts from conversion denominators. Preserve `direct` and `unknown`; do not overwrite first-touch source with a later known source. Offline touches link to account, person where available, activity type, timestamp, owner, and campaign.

Maintain a dated series-break register for changes to identity, deduplication, consent, channel grouping, lookback, scoring, stage definitions, tags, or attribution model. A trend crossing a material series break is not interpreted until comparability is confirmed.

`[NEEDS INPUT: approved attribution owner, platform lookback settings, campaign registry owner, cost allocation convention, and correction/audit workflow]`.

### 4. Dashboard implementation

Build one source-controlled dashboard with an executive view and operating views. Every metric displays actual, declared target or threshold version, variance, trend comparison, numerator, denominator, maturity age, data completeness, and status. When no target has been approved, display `[NEEDS INPUT: target]` rather than a fabricated benchmark.

**Executive view:**

- FIND accounts and ICP coverage
- ENGAGE accounts and cost per engaged account
- QUALIFY accounts and qualified pipeline in the declared SAR convention
- PROPOSE accounts and proposal progression
- CONVERT customers, booked revenue, CAC, and payback status only when mature and reconciled
- Data completeness, unattributed share, and unresolved reconciliation residual
- Decision: scale, iterate, hold, or stop, with evidence, uncertainty, and next action

**Operating views:**

- Funnel and cohort progression by source class, campaign, offer, variant, account tier, industry/use case, company size, buying role, geography, language, device, landing page, consent state, owner, contract type, and cohort week where eligible.
- ABM coverage, committee depth, trigger freshness, account progression, handoff speed, and primary-source pipeline.
- Outbound and email delivery, replies, meetings, accepted handoffs, qualification, opt-outs, bounces, complaints, and suppression events.
- Paid/partner cost, CRM conversions, platform-reported conversions, attribution residual, and source/campaign diagnostics.
- Instrument health: event freshness, missing fields, duplicate rate, unknown bucket, failed joins, stage timestamp reconstruction, and finance reconciliation.

Suppress or label small cells and exploratory segment findings. Always show counts and denominators. Do not use impressions, raw traffic, followers, opens, clicks, or AI-generated content volume as primary commercial KPIs.

`[NEEDS INPUT: dashboard platform, workspace, refresh schedule, access groups, certified data owner, target register, and alert destination]`.

### 5. Daily and weekly cadence

- **Daily:** check event freshness, ingestion failures, required-field completeness, duplicates, consent/suppression propagation, spend delivery, stage updates, attribution unknowns, finance feed freshness, and material anomalies. Log exceptions and owners.
- **Weekly:** publish funnel counts/rates by source and relevant segments; review cohort age, follow-up SLA, pipeline movement, experiment decisions, attribution residuals, data-quality gates, and scale/iterate/hold/stop recommendations.
- **Day 30, 60, and 90:** review equal-age cohorts, replace planning assumptions with observed evidence where mature, confirm or reset targets through a dated decision log, review attribution comparability, and issue a decision memo.
- **On any suspected change:** freeze comparability, check the series-break register and maturity, reconcile parent/child totals, decompose mix versus within-segment effects, then classify the investigation as measurement change, behavioral change, mixed, expected variation, or unresolved.

Each report carries metric definition, numerator, denominator, exclusions, source systems, maturity age, target version, actual, variance, verdict, and next action. Unknown never rounds to zero, observed, or explained.

## Data Quality Gates

Run gates before dashboard publication and before any scale/stop decision:

| Gate | Check | Failure action |
|---|---|---|
| Identity | Account/person/opportunity keys are stable; duplicate and merge history is available. | Hold affected rates; route to RevOps; retain residual. |
| Completeness | Required event, CRM, source, consent, owner, and stage fields are present and valid. | Mark affected metrics provisional; open exception with owner and due date. |
| Freshness | Analytics, CRM, spend, email, partner, finance, and delivery feeds arrived within their declared windows. | Label stale data; do not interpret a partial period as a business move. |
| Eligibility | Internal/test/bot/duplicate/unlinked records and suppressed contacts are excluded according to the contract. | Rebuild denominator and document rule/version. |
| Reconciliation | Analytics-to-event, event-to-CRM, CRM-to-agreement/payment, and spend-to-finance totals reconcile; residual is visible. | Block conversion/economic claims until investigated or explicitly marked unresolved. |
| Stage history | Entry/exit timestamps, reason codes, owner, and next step can be reconstructed. | Hold stage-rate and velocity interpretation. |
| Attribution | First-touch immutability, campaign/UTM validity, lookback, consent, and channel grouping are unchanged or break-dated. | Report measurement-change risk; do not compare across the break. |
| Maturity | Outcome cohorts have reached the declared observation age or are labeled provisional. | Do not call an immature cohort a failure or zero. |
| Privacy and suppression | Consent state, lawful-basis decision, opt-out, and cross-channel suppression behavior are confirmed by the owner. | Stop affected activation and escalate to Legal/Privacy. |

`[NEEDS INPUT: declared freshness windows, completeness calculation, duplicate tolerance, reconciliation tolerances, maturity ages, and gate approvers]`.

## Outputs

- Versioned instrumentation contract and event taxonomy.
- Account, person, opportunity, stage-history, identity, source, consent, suppression, cost, and revenue data dictionary.
- CRM field/stage implementation map and validation report.
- Campaign/source registry and attribution rules with audit history.
- Daily data-quality report and exception log with owner, severity, evidence, and due date.
- Certified executive dashboard and operating views with metric definitions, denominators, maturity, targets/threshold versions, and residuals.
- Weekly funnel, cohort, segment, handoff, attribution, and experiment review pack.
- Series-break register and anomaly investigation records using the five declared verdicts.
- 30/60/90-day measurement decision memos.
- `[NEEDS INPUT: named repository or catalog location for published schemas, dashboard, and decision log]`.

## Downstream Handoffs

Every handoff includes the artifact, owner, acceptance criterion, unresolved assumptions, and feedback date.

- **Analytics / Measurement -> ICP / ABM:** canonical account IDs, tier/segment fields, coverage and committee-depth views, trigger/source status, suppression result, and account progression data.
- **Analytics / Measurement -> Outbound:** eligible account/contact IDs, source and trigger fields, sequence/variant IDs, handoff timestamps, seller SLA, suppression state, and disposition reporting.
- **Analytics / Measurement -> Email:** sequence and email event schema, permission/suppression events, language metadata, cohort definitions, source rules, and delivery-to-CRM reconciliation.
- **Analytics / Measurement -> Workstream 10:** `[NEEDS INPUT: Workstream 10 owner, required metrics, event contract, and receiving acceptance criteria]`.
- **Analytics / Measurement -> Sales / Deal Strategy:** stage history, accepted handoffs, qualification completeness, opportunity source, next-step hygiene, maturity status, and loss/disposition data.
- **Analytics / Measurement -> Paid Media / Partners:** eligible audience/source IDs, cost feed requirements, platform-versus-CRM conversion comparison, and attribution residuals.
- **Analytics / Measurement -> Finance / Delivery:** cost allocation, signed agreement/payment/PO joins, booked value convention, margin/payback dependencies, and reconciliation exceptions.
- **Analytics / Measurement -> Legal / Privacy:** consent and suppression fields, data lineage, retention/access controls, unresolved channel or cross-border questions, and series-break impact.
- **Analytics / Measurement -> Messaging / Content / SEO-AEO:** qualified progression by message, content, landing page, query/source, language, and experiment variant, with proof gaps and maturity caveats.

## Explicit `[NEEDS INPUT]` Register

- `[NEEDS INPUT: company/product name, actual offer, package, price, delivery model, proof, and approved claims]`
- `[NEEDS INPUT: Workstream 10 file, accountable owner, scope, dependencies, and handoff contract]`
- `[NEEDS INPUT: CRM, analytics platform, event store, ESP, paid platforms, finance system, consent system, and system owners]`
- `[NEEDS INPUT: final account deduplication, parent/child, identity-resolution, and account-to-person matching rules]`
- `[NEEDS INPUT: CRM stage API values, required fields, stage owners, disqualification/nurture reasons, and Sales Ops approval]`
- `[NEEDS INPUT: campaign registry, UTM governance, source taxonomy, lookback windows, cost allocation, and attribution approver]`
- `[NEEDS INPUT: dashboard platform, certified dataset, refresh schedule, access groups, alert route, and target register]`
- `[NEEDS INPUT: data retention, privacy, consent, suppression, lawful-basis, and cross-border processing decisions]`
- `[NEEDS INPUT: declared data freshness windows, completeness formula, duplicate/reconciliation tolerances, and gate approvers]`
- `[NEEDS INPUT: cohort maturity ages for ENGAGE, QUALIFY, PROPOSE, CONVERT, revenue, margin, and payback]`
- `[NEEDS INPUT: reporting timezone confirmation, calendar definitions, baseline/comparison windows, and target-reset authority]`
- `[NEEDS INPUT: named owners and service levels for daily exceptions, seller follow-up, finance reconciliation, and dashboard publication]`

## Acceptance Criteria

- The account, person, opportunity, event, stage-history, source, consent, suppression, cost, and revenue models are documented, versioned, and approved by their owning system teams.
- A test account can be deduplicated, linked to a person and opportunity, progressed through FIND, ENGAGE, QUALIFY, PROPOSE, and CONVERT, and reconciled to signed agreement plus payment/PO without losing history.
- CRM stages enforce or report the stated exit criteria; nurture, disqualified, suppressed, parked, and retired outcomes remain distinguishable from conversion.
- Required events carry stable IDs, timestamps, source/context, governance fields, version, and validation status; duplicate events are handled by a declared rule.
- Sourced, influenced, and W-shaped attribution are available as separate views; paid-platform and CRM conversions are shown separately; residuals are visible and investigated.
- Dashboard metrics show definitions, numerator, denominator, exclusions, maturity, target/threshold version, actual, variance, unknown bucket, and data-quality status.
- Daily and weekly reports run on the declared cadence, with owners for exceptions and dated decision records for scale, iterate, hold, or stop.
- Data-quality gates cover identity, completeness, freshness, eligibility, reconciliation, stage history, attribution, maturity, privacy, and suppression; failed gates block or qualify affected decisions.
- A dated series-break register exists, and anomaly investigations use one of measurement change, behavioral change, mixed, expected variation, or unresolved.
- Downstream owners accept the required handoff artifacts, including Workstream 10 once its scope and owner are supplied.
- No benchmark, forecast, revenue claim, customer proof, or causal attribution is published without an approved source and maturity status.

## First 14 Days

| Day | Action | Output / gate |
|---|---|---|
| 1 | Confirm accountable owner, partners, systems, access, reporting timezone, and missing Workstream 10 dependency. | Ownership and dependency log; unresolved items marked `[NEEDS INPUT]`. |
| 2 | Freeze the measurement contract from the primary measurement system and map GTM / Workstreams 01, 08, and 09 terms to it. | Versioned definitions register and terminology crosswalk. |
| 3 | Inventory CRM, analytics, event, ESP, ad, finance, delivery, consent, and suppression objects and owners. | Source-system inventory and access gap log. |
| 4 | Finalize account/person/opportunity identity keys, deduplication, parent/child, and contact-linking rules. | Identity model and test cases. |
| 5 | Map FIND through CONVERT stages, exits, dispositions, timestamps, owners, and required CRM fields. | CRM stage implementation map; Sales Ops review requested. |
| 6 | Define event names, versions, required fields, valid values, dedupe rules, and source ownership. | Instrumentation contract and event dictionary. |
| 7 | Define source taxonomy, campaign registry, UTM rules, consent fields, lookbacks, and three attribution views. | Attribution specification and audit requirements. |
| 8 | Map outbound and email events, handoffs, suppression transitions, language variants, and seller response fields. | Channel event map and handoff validation checklist. |
| 9 | Build data-quality gates, freshness checks, reconciliation identities, unknown buckets, and exception severity. | QA test plan and exception workflow. |
| 10 | Define dashboard measures, dimensions, cohort age labels, target placeholders, refresh behavior, and access groups. | Dashboard wireframe/specification with `[NEEDS INPUT: target]` where required. |
| 11 | Run test records through account creation, engagement, handoff, qualification, proposal, conversion, suppression, and correction paths. | End-to-end test evidence and defect log. |
| 12 | Reconcile analytics/events to CRM, CRM to agreement/payment/PO, and spend to Finance using test or approved historical records. | Reconciliation report with residuals and owners. |
| 13 | Review the implementation with ABM, outbound, email, Sales Ops, Finance, Legal/Privacy, and Workstream 10 owner if available. | Review decisions, blockers, approvals, and dated series-break register. |
| 14 | Publish the first certified dashboard/report pack and hold the measurement launch gate. | Approved implementation backlog, operating cadence, acceptance record, and next review date. |
