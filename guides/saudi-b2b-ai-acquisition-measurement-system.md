# 90-Day Measurement System for a Saudi B2B AI-Native Acquisition Service

## Purpose and scope

This system measures the launch of an outsourced, AI-native customer acquisition service for B2B companies in Saudi Arabia over the first 90 days. It is designed to answer three decisions:

1. Are we reaching the right Saudi accounts and buying committee members?
2. Does interest become qualified pipeline at an acceptable delivery cost?
3. Is there enough evidence to scale, change the offer, or stop an activity?

No historical benchmarks, pricing, customer proof, or conversion data were supplied. Targets below are therefore **operating thresholds for learning**, not forecasts or market claims. Replace them after the first mature cohorts. Do not publish a customer, revenue, performance, certification, or integration claim without a recorded source.

## Measurement contract

### Unit of analysis

- **Account:** one deduplicated Saudi company, identified by normalized legal name, domain, CRM account ID, and commercial registration where legally and operationally available.
- **Person:** one contact linked to an account. A person does not create a second account.
- **Opportunity:** one mutually acknowledged commercial evaluation with an amount, expected close date, problem, and next step.
- **Pipeline value:** expected contract value recorded in the CRM, in SAR, using one declared convention: annualized recurring value for recurring work or total contracted value for project work. Never mix the two.
- **Reporting timezone:** Asia/Riyadh. Store timestamps in UTC and render in Riyadh time.
- **Cohort date:** date the account first reaches the stage being analyzed. Outcome metrics are compared at equal cohort age; immature cohorts are labeled provisional, never zero.

### Funnel: FIND through CONVERT

The funnel is account-based. Person activity supports an account stage but cannot advance an account by itself unless the exit criterion says so.

| Stage | Definition | Leading KPIs | Lagging / quality KPIs | Exit criterion |
|---|---|---|---|---|
| **FIND** | A target account is identified, deduplicated, and assigned an ICP fit reason and source. | New target accounts, reachable-account rate, contact coverage, ICP fit completeness | Account-to-ENGAGE rate, sourced pipeline per 100 accounts | Account has an owner, source, fit fields, and at least one reachable role or a documented reason it is unreachable. |
| **ENGAGE** | A target account or buying-committee member shows a measurable response to an owned, paid, partner, event, or outbound touch. | Qualified visits, video/content engagement, reply rate, meeting intent, cost per engaged account | ENGAGE-to-QUALIFY rate, engaged-account pipeline | Account records a reply, meeting request, attended event interaction, meaningful content conversion, or other approved high-intent event. |
| **QUALIFY** | A discovery interaction confirms a relevant acquisition problem and a plausible buyer path. | Discovery meetings held, response-to-meeting time, problem-confirmation rate | Qualified-account rate, qualified pipeline, qualification-to-PROPOSE rate | ICP fit, problem, current process, decision roles, timing, and next step are documented; disqualify or nurture otherwise. |
| **PROPOSE** | The account has accepted a scoped commercial proposal or pilot plan. | Proposal rate, proposal cycle time, proposal follow-up completion | Proposal-to-CONVERT rate, weighted pipeline, expected CAC/payback | Proposal sent to a named buyer group with scope, price in SAR, commercial owner, decision date, and mutual next step. |
| **CONVERT** | A commercial agreement is signed and the first payment or approved purchase order is recorded. | Win rate, sales-cycle days, time-to-sign | New customers, booked revenue, CAC, gross margin, payback, delivery acceptance | Signed agreement plus payment or valid purchase order; CRM and finance records reconcile. |

Stage rates use the eligible population entering the prior stage as denominator. Report both account counts and person counts. A person can be active while the account remains in an earlier stage; do not inflate account conversion with contact activity.

### Core KPI definitions

| KPI | Calculation and interpretation | Type / cadence |
|---|---|---|
| ICP account coverage | FIND accounts with fit, owner, and reachable role / planned target accounts | Leading, daily/weekly |
| Cost per engaged account | Attributable launch cost / new accounts reaching ENGAGE | Leading efficiency, weekly |
| ENGAGE-to-QUALIFY rate | Accounts reaching QUALIFY / accounts reaching ENGAGE | Leading quality, weekly; mature after the agreed response window |
| Qualified pipeline | Sum of open opportunity value after QUALIFY, without probability weighting | Lagging commercial, weekly |
| Pipeline per target account | Qualified pipeline / FIND accounts in the same cohort | Leading economic signal, weekly |
| QUALIFY-to-PROPOSE rate | PROPOSE accounts / QUALIFY accounts | Lagging stage conversion, weekly/monthly |
| PROPOSE-to-CONVERT rate | CONVERT accounts / PROPOSE accounts | Lagging, mature by the sales-cycle window |
| CAC | Fully loaded launch cost / new CONVERT customers; show media-only CAC separately | Lagging, cohort-based |
| Gross-margin payback | Fully loaded CAC / monthly gross profit from the customer | Lagging; do not read before revenue and margin are posted |
| Pipeline velocity | Qualified accounts x average opportunity value x qualified win rate / median sales-cycle days | Leading model, monthly; show inputs |
| Data completeness | Required fields/events present and valid / required fields/events expected | Guardrail, daily |

Do not use impressions, raw traffic, followers, or AI-generated content volume as primary KPIs. They may diagnose reach, but they do not establish commercial progress.

## Dashboard design

### Executive view

Show one 90-day view and a weekly trend with actual, operating threshold, variance, cohort age, and status:

- FIND accounts and ICP coverage
- ENGAGE accounts and cost per engaged account
- QUALIFY accounts and qualified pipeline in SAR
- PROPOSE accounts and proposal-to-convert rate
- CONVERT customers, booked revenue, CAC, and payback status
- Data completeness, unattributed share, and unresolved reconciliation residual

The executive page must state the decision: **scale**, **iterate**, **hold**, or **stop**, with the evidence and next action beside it.

### Operating views and dimensions

Every funnel view supports counts, denominators, rates, value, cost, and maturity age. Use these dimensions where sample size permits; suppress or label cells with small counts:

- Source class: outbound, paid search, paid social, organic search, AI-answer visibility, partner, event, referral, direct
- Campaign, offer, creative, landing page, and experiment variant
- Account tier: strategic, growth, or other declared ICP tier
- Industry / use case, company size, and buying role
- Geography: Riyadh, Jeddah, Eastern Province, other Saudi region, and unknown
- Language and experience: English, Arabic, bilingual, and unknown
- Device, landing page, and consent state
- Sales owner, partner, pipeline stage, contract type, and cohort week

Segment findings are exploratory until confirmed in a later independent cohort. Always show the numerator, denominator, and unknown bucket.

## Attribution rules

### Operational attribution

Use three views, never one blended number:

1. **Sourced:** the first eligible touch that created the account or person record. This answers where demand was first found.
2. **Influenced:** every eligible touch associated with an account before QUALIFY or CONVERT. This answers what participated, and must not be summed across channels as unique pipeline.
3. **W-shaped allocation for management reporting:** allocate 30% to first eligible touch, 30% to QUALIFY creation touch, 30% to PROPOSE creation touch, and 10% across recorded intervening touches. Treat these weights as a declared starting convention, not causal truth.

Use last-touch only for operational routing and response-time analysis. Report paid-platform reported conversions separately from CRM conversions. When totals disagree, show the residual and investigate the instrument; do not average or force reconciliation.

### Eligibility and precedence

- Require a valid campaign ID, UTM source/medium/campaign, landing-page ID, consent state where applicable, and timestamp.
- Exclude internal traffic, test records, duplicates, bots, and contacts without an account link from conversion denominators.
- Preserve direct and unknown as values. Do not overwrite them with the latest known source.
- An account's first-touch source is immutable after first capture; later corrections require an audit record.
- Offline touches must link to account ID, person ID where available, activity type, timestamp, owner, and campaign ID.
- Compare attribution only after confirming that identity, lookback windows, consent behavior, channel grouping, and CRM stage rules are unchanged.

## 90-day operating plan

| Period | Measurement objective | Required output | Decision gate |
|---|---|---|---|
| Days 1-14: instrument and prove | Establish the account model, event taxonomy, source taxonomy, CRM stages, consent posture, and reconciliation checks. Run test records through the full path. | Instrumentation contract, data dictionary, baseline completeness report, target-account cohort | Do not scale acquisition if required event or CRM completeness is below 90%, duplicates are unresolved, or stage timestamps cannot be reconstructed. |
| Days 15-30: FIND and ENGAGE learning | Validate target-account coverage, message response, reachability, and channel delivery. | Weekly dashboard, source/campaign diagnostics, first experiment readout | Shift effort toward sources with repeatable engaged-account creation; hold claims about pipeline until cohorts mature. |
| Days 31-60: QUALIFY and PROPOSE | Measure discovery quality, qualification consistency, proposal economics, and sales handoff speed. | Qualified-pipeline review, cohort table, loss reasons, data-quality log | Scale only if quality and data gates pass and at least one mature source cohort meets its provisional economics threshold. |
| Days 61-90: CONVERT and decide | Read signed business, margin, delivery acceptance, and cohort economics. | 90-day decision memo, attribution comparison, movement and reconciliation note | Choose scale, iterate, hold, or stop by the thresholds below; record uncertainty and the next test. |

## Target-setting without historical benchmarks

Do not import generic B2B conversion benchmarks. Set targets in five steps:

1. **Model backwards from capacity and economics.** Start with the number of customers the team can onboard in 90 days, minimum acceptable gross margin, maximum affordable payback, available sales capacity, and approved spend. Derive required PROPOSE, QUALIFY, ENGAGE, and FIND volumes using explicit scenario assumptions.
2. **Use a three-point launch range.** For each rate and cost KPI, pre-register a floor, working target, and stretch target before campaign results are reviewed. The first ranges are planning inputs and must be labeled `[NEEDS INPUT: owner approval]` until accepted.
3. **Use leading indicators before outcomes mature.** Set weekly process targets for account coverage, contactability, response time, meeting attendance, and data completeness. Do not turn an immature CONVERT rate into a failure.
4. **Replace assumptions with observed cohorts.** After the first two comparable cohorts, calculate median and interquartile ranges by source and segment. After three or more mature cohorts, set the next target from the observed distribution plus the economic requirement.
5. **Reforecast weekly, freeze monthly.** Change planning targets only with a dated decision log. Never silently move a target after seeing performance.

### Initial decision thresholds

These are launch controls, not benchmarks. Apply absolute count floors as well as percentages:

- **Data stop:** pause optimization decisions if completeness is below 90% for two consecutive reporting days, unattributed share exceeds 20%, duplicate account rate exceeds 5%, or CRM-to-finance booked revenue does not reconcile within 5%.
- **Channel stop:** pause a source or campaign after at least 20 eligible ENGAGE accounts if it produces zero QUALIFY accounts, or after at least 10 QUALIFY accounts if no PROPOSE is created and the documented sales follow-up SLA was met. Investigate tracking before declaring demand failure.
- **Quality stop:** hold spend expansion if QUALIFY-to-PROPOSE is below the pre-registered floor in two comparable cohorts, or if disqualification for poor ICP fit exceeds 50% of qualified reviews.
- **Scale candidate:** increase a source or campaign by no more than 20% per review cycle when it has at least 10 QUALIFY accounts, at least 3 PROPOSE accounts, data gates passing, no unresolved material series break, and both cost per qualified account and expected payback meet the approved working target.
- **Service stop:** stop the offer or redesign the motion if two mature cohorts miss the gross-margin or payback ceiling and the loss is not explained by an instrument issue, or if delivery acceptance is below the agreed contract criterion.

Thresholds are not causal findings. A stop triggers an audit of comparability, maturity, denominator, follow-up, and segment mix before budget is permanently removed.

## Instrumentation dependencies and owners

| Dependency | Minimum requirement | Owner / failure impact |
|---|---|---|
| CRM account and opportunity model | Immutable account ID, dedupe rules, stage history, timestamps, amount, currency, owner, reason codes | Marketing Ops + Sales Ops; without it, account funnel and pipeline cannot reconcile |
| Web and landing-page analytics | FIND/ENGAGE events, form start/submit, meeting request, page and variant IDs, consent state, Riyadh-time reporting | Marketing Ops; without it, source and conversion rates are biased |
| UTM and campaign registry | Controlled source, medium, campaign, content, term, offer, platform IDs; no free-text variants | Marketing Ops + channel owners; without it, attribution fragments |
| Identity resolution | Domain normalization, contact-to-account matching, duplicate merge history, partner and parent-account rules | RevOps; without it, reach and sourced pipeline are overstated |
| Consent and privacy | Documented Saudi privacy review, consent-mode behavior, lawful basis, retention and access controls | Legal/Privacy + Marketing Ops; without it, observed traffic is not comparable |
| Paid and partner cost feeds | Spend, fees, credits, currency conversion date, campaign ID | Finance + channel owners; without it, CAC and ROI are incomplete |
| Sales activity and SLA | Meeting outcome, qualification fields, next step, proposal timestamp, loss reason | Sales Ops; without it, channel quality cannot be separated from follow-up |
| Finance and delivery | Signed agreement, payment/PO, recognized revenue, gross margin, onboarding acceptance | Finance + Delivery; without it, CONVERT and payback are provisional |
| AI-native channel registry | AI search/agent referral capture where available, prompt/query observation log, referral URL, assisted-account rule | SEO/AI-search + Marketing Ops; AI visibility is not equivalent to attributable demand |

Before launch, run a daily reconciliation: analytics sessions and conversions to event store; event store to CRM records; CRM CONVERT to signed agreement/payment; spend feeds to finance. Keep a dated series-break register for changes to tags, consent, channel grouping, scoring, identity, lookback, or stage definitions.

## Cadence and governance

- **Daily:** instrumentation health, spend, delivery, event freshness, anomalies, and unresolved errors.
- **Weekly:** funnel counts and rates by source/campaign/segment, cohort age, follow-up SLA, pipeline movement, experiment decisions, and stop/scale review.
- **Day 30, 60, 90:** maturity-aware cohort review, target reset or confirmation, attribution comparison, and decision memo.
- **Owners:** Marketing Ops owns definitions and data quality; Performance Analyst owns interpretation and decision log; channel owners own delivery; Sales Ops owns stage hygiene; Finance owns cost/revenue reconciliation; Legal/Privacy owns consent controls.

Every report records metric definition, numerator, denominator, exclusions, source systems, maturity age, target version, actual, variance, verdict, and next action. Unknown is a valid result; it never rounds to zero, observed, or explained.
