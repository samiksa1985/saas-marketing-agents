# Workstream 01: ICP / ABM

**Status:** Execution brief; working hypotheses remain unvalidated.

## Objective

Select and operate a capacity-sized named-account program for the first Saudi B2B acquisition motion. Establish which account segment, trigger, buyer role, and offer combination merits continued investment, while preserving evidence quality, sales ownership, consent, and account-level measurement.

The master strategy owns the broader ICP and ABM hypothesis. This workstream turns it into a maintained account list, tier model, orchestration contract, and review decision.

## Upstream Inputs

- [Saudi AI Customer Acquisition GTM](../saudi-ai-customer-acquisition-gtm.md): ICP, segmentation, pilot shape, progression rules, channel posture, and measurement principles.
- [CATALYST Saudi B2B Acquisition ICP Hypothesis](../catalyst-saudi-b2b-acquisition-icp-hypothesis.md): working fit, triggers, anti-ICP, buyer committee, discovery questions, and validation gates.
- [First 90 Days: Saudi B2B SME and Mid-Market ABM Motion](../../examples/workflow-saudi-sme-abm-90-days.md): capacity model, account ledger fields, research protocol, tiers, signals, handoffs, review gates, and output pack.
- Evidence supplied by the client: `[NEEDS INPUT: existing customer, prospect, closed-won/lost, proposal, CRM, and sales-call evidence]`.
- Operating constraints: `[NEEDS INPUT: named sellers, weekly availability, delivery capacity, supported regions, languages, sectors, and excluded sectors]`.

## Owner

**Accountable:** ABM strategist.

**Required partners:** one named founder or seller paired to every Tier 1 and Tier 2 account; marketing/research coordinator; `ops-legal-compliance`; `analytics-marketing-ops-architect`; downstream channel owners as needed.

No Tier 1 or Tier 2 account enters execution without a named paired owner, documented selection reason and source date, next milestone, and suppression/consent check.

## Operating Decisions

1. **List size:** derive active-account capacity from a time audit and touch density. Use the source workflow's pilot shape only as a working assumption; reduce the list when actual capacity is lower. Record cut and parked accounts.
2. **Selection:** prioritize trigger, operating readiness, buying authority, and evidence, not logo preference or company size alone. Use the temporary scoring model in the source workflow until closed-won/lost patterns exist.
3. **Tiers:** use 1:1, 1:few, and 1:many service levels from the source workflow. Tier is a resource decision, not a prestige label.
4. **Signals:** require two independent signal families before high-effort Tier 1 plays. Apply the source freshness windows and treat undated signals as inactive.
5. **Suppression:** query the single cross-channel suppression record before every touch. Suppress opt-outs, legal restrictions, recent touches, known customers where applicable, and active sales conversations.
6. **Handover:** active opportunities and live sales conversations leave ABM automation and move to the deal owner.
7. **Measurement:** report coverage, committee depth, progression, penetration, accepted handoff speed, and pipeline by primary source. ABM reports assists and progression; it does not duplicate pipeline credit.
8. **Re-tiering:** review at the source workflow's declared gates and after material commercial changes. Log the evidence, approver, and expiry date for exceptions.
9. **Paid executability:** do not assume paid coverage for a small account tier. Send audience construction and platform feasibility to the paid-media owners before including paid media in a touch plan.

## Required Tasks

- Confirm the serviceable market, offer, buyer, disqualifiers, delivery constraints, language capability, and compliance boundary; mark unknowns.
- Run the source workflow's capacity/time audit and publish the maximum active list by tier.
- Build and de-duplicate a candidate pool from supplied evidence and permitted research sources; record source and access date for every row.
- For each candidate, capture only sourced offer/B2B evidence, dated trigger, reachable roles, selection reason, confidence, and suppression status.
- Score, tier, and park or reject accounts that lack evidence, capacity, owner, or a credible next milestone.
- Map the buying committee by role for Tier 1 and Tier 2 accounts; label each role known, hypothesized, or missing.
- Verify consent and suppression status before outreach; route legal or channel questions to `ops-legal-compliance`.
- Create one ordered touch plan per tier with owner, dependency, response SLA, cooling-off rule, and no-touch conditions.
- Define the first account-level baseline and route field, routing, and scoring implementation to `analytics-marketing-ops-architect`.
- Review list quality and progression at the documented gates; retire or reallocate accounts without progression, evidence, or owner capacity.

## Artifact Outputs

- Capacity and coverage model with time-audit assumptions, active-list ceiling, tier counts, service levels, and cut/park register.
- Named-account ledger containing account ID, URL, sourced fit evidence, reason, source/date, signal family/date, tier, owner, committee roles, stage, next milestone/date, suppression status, confidence, and retirement date.
- Rejected and parked account register with reason and reconsideration evidence required.
- Tier model and exception register.
- Tier 1 account briefs and Tier 2 cluster/account cards, only where evidence and capacity justify them.
- Signals-to-actions matrix with freshness, corroboration, action owner, SLA, and suppression conditions.
- Account orchestration contract for the current review cycle.
- Account scoreboard and review decision log, with primary-source credit recorded per opportunity.

## Explicit [NEEDS INPUT]

- `[NEEDS INPUT: company/product name, actual offer, package, price, delivery model, proof, and minimum engagement]`
- `[NEEDS INPUT: named sellers/founders, weekly hours, paired owners, and delivery capacity]`
- `[NEEDS INPUT: existing customer/prospect records and closed-won/closed-lost patterns from the last 12-24 months]`
- `[NEEDS INPUT: priority Saudi regions, sectors, supported languages, and exclusions]`
- `[NEEDS INPUT: approved claims, references, case studies, and customer-facing proof]`
- `[NEEDS INPUT: qualification definition, CRM stages, source fields, and sales response SLA]`
- `[NEEDS INPUT: applicable privacy, outreach, WhatsApp, cross-border data, and consent requirements]`
- `[NEEDS INPUT: current cross-channel suppression record and system of record]`
- `[NEEDS INPUT: paid-media audience availability, match feasibility, and platform owner confirmation]`
- `[NEEDS INPUT: comparison set and baseline window for later win-rate and cycle-length analysis]`

## Downstream Handoffs

- `sales-outbound-strategist`: approved account set, tier, role map, trigger, message brief, owner, and next milestone; sequences and cold-outreach mechanics remain with sales.
- `sales-deal-strategist`: active opportunities or live sales conversations; ABM automation is suppressed on acceptance.
- `pmm-messaging-architect`: evidence-backed account/cluster hypotheses and persona gaps; messaging and value narrative remain with PMM.
- `paid-media-social-ads-specialist` and `paid-media-programmatic-buyer`: eligible audience, consent/suppression status, tier, and objective; they confirm match, frequency, bid, and platform feasibility.
- `analytics-marketing-ops-architect`: canonical account IDs, field schema, scoring, routing, suppression integration, and reporting requirements.
- `ops-legal-compliance`: unresolved consent, privacy, data-handling, and channel restrictions before any touch.
- `events-field-marketing-strategist`: approved account set and event-specific segment; events do not source a separate target list.
- `growth-customer-marketing-lead`: installed-base or expansion accounts removed from this acquisition motion.
- `paid-media-attribution-analyst`: primary-source credit model, comparison set, and pre/post or holdout measurement design.

## Acceptance Criteria

- Active account count is at or below documented capacity, with the calculation and cut/park register published.
- Every active account has a sourced reason and date, tier, confidence, next milestone, suppression status, and accountable owner; no unsupported firmographic or initiative claim remains.
- Every Tier 1 and Tier 2 account has a paired seller, role-level committee map, coordination cadence, and agreed next milestone.
- Each proposed high-effort play has corroboration from two independent signal families and a declared freshness window.
- The orchestration contract names ordered touches, owners, dependencies, response SLAs, suppression rules, and per-channel executability checks.
- Active sales conversations, opt-outs, legal restrictions, and recent-touch conflicts have a documented no-touch or handoff outcome.
- The scoreboard distinguishes account progression and assists from primary pipeline credit and excludes lead-volume success measures.
- Review decisions record evidence for promotion, demotion, continuation, retirement, and any approved exception.

## First-14-Day Actions

| Day | Action | Output / gate |
|---|---|---|
| 1 | Confirm owner, paired sellers, available hours, delivery constraints, and unresolved inputs. | Capacity-input log; blockers marked `[NEEDS INPUT]`. |
| 2 | Review supplied customer/prospect and sales evidence; define the evidence boundary and source-of-truth fields. | Evidence register and ledger schema. |
| 3 | Run the time audit and calculate the active-account ceiling by tier. | Capacity and coverage model. |
| 4-5 | Build and de-duplicate the candidate pool; exclude customers, active opportunities, competitors, and suppressed records where known. | Candidate ledger with source and access date. |
| 6-7 | Desk-research fit, B2B evidence, dated triggers, reachable roles, and selection rationale. | Scored candidates with confidence and explicit gaps. |
| 8 | Review the highest-confidence candidates with a second founder/seller; assign only available paired owners. | Proposed active, parked, and rejected lists. |
| 9 | Map buying-committee roles for Tier 1 and Tier 2; identify coverage gaps and next milestones. | Account briefs or cluster cards. |
| 10 | Run consent/suppression checks and resolve legal/channel questions before any touch. | Cleared, blocked, or parked status per account. |
| 11 | Apply corroboration and freshness rules; select the first motion and no-touch conditions. | Signals-to-actions matrix. |
| 12 | Draft ordered touch plans by tier and validate owner, dependency, SLA, and paid executability. | Account orchestration contract. |
| 13 | Validate CRM/account IDs, routing, primary-source attribution, and scoreboard fields with operations and analytics. | Measurement implementation brief. |
| 14 | Hold the list gate: approve, cut, park, or retire accounts; publish owners and the next review date. | Versioned account list, decision log, and accepted handoffs. |
