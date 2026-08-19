# Workstream 06: SEO / AEO

> **Status:** Execution brief for discovery and validation. Search demand, rankings, competitors, citation frequency, traffic, and performance are unknown until measured.
>
> **Evidence boundary:** Do not invent search volume, keyword difficulty, rankings, competitors, click-through rates, AI citations, traffic, conversion rates, market demand, or performance claims. Label each item `Observed`, `Reported`, `Inferred`, `Hypothesis`, `Unknown`, or `Approved proof`. Use `[NEEDS INPUT]` for missing decisions, access, owners, and evidence.

## Objective

Build a Saudi B2B search and answer-engine acquisition system for the new service, beginning with a defensible research baseline rather than a keyword list or traffic forecast. Identify the questions, entities, jobs, language variants, and commercial moments that deserve testing; publish a small set of useful, crawlable, answer-first assets; and connect search discovery to account progression and the master GTM funnel:

`FIND -> UNDERSTAND -> TARGET -> ENGAGE -> QUALIFY -> NURTURE -> CONVERT`

The workstream must determine which search and answer surfaces are worth continued investment, which pages can support buyer evaluation, what evidence is required before public use, and whether organic or answer-engine discovery produces qualified commercial progression. It does not promise rankings, citations, leads, or revenue.

SEO covers crawlability, indexability, relevance, page experience, internal linking, and discoverability. AEO/GEO covers clear answer extraction, entity understanding, source attribution, authorship, and citation readiness. These are related but not interchangeable outcomes.

## Upstream Inputs

Use these artifacts as context and source of hypotheses. Do not copy their unvalidated claims into public search content:

- [Saudi AI Customer Acquisition GTM](../saudi-ai-customer-acquisition-gtm.md): ICP, segments, offer shape, buyer committee, channel roles, funnel stages, language test, qualification, handoff, gates, and measurement principles.
- [Workstream 01: ICP / ABM](01-icp-abm.md): capacity-sized account set, tiers, sourced triggers, reachable roles, committee map, suppression rules, account IDs, and account progression fields.
- [Workstream 02: Product Marketing / Positioning](02-product-marketing-positioning.md): positioning hypotheses, alternative map, proof boundary, message variants, buyer language, anti-ICP, and approval status.
- [Workstream 03: Competitive Intelligence](03-competitive-intelligence.md): alternative tracks, source labels, evidence ledger, comparison dimensions, buyer decision evidence, and unknowns. Named competitors are not assumed.
- [Workstream 04: Messaging](04-messaging.md): approved or directional message architecture, proof mapping, message variants, testing inputs, and claims boundaries.
- [Workstream 05: Content](05-content.md): content production, editorial workflow, evidence requirements, language review, publication, and refresh inputs.
- [AEO / GEO Playbook](../../guides/aeo-geo-playbook.md): answer-first structure, citation-friendly passages, entity organization, authorship, freshness, access-before-citability, and per-engine measurement guidance. Treat effect sizes and platform behavior as directional and re-verify before operational decisions.
- `[NEEDS INPUT: approved website/domain, CMS, documentation host, analytics properties, Search Console, Bing Webmaster Tools, log access, and consent-approved research tools]`.

### Required inputs before a public content gate

- `[NEEDS INPUT: company/product name, canonical domain, brand aliases, former names, category noun, and approved Organization facts]`.
- `[NEEDS INPUT: actual service packages, target sectors, Saudi regions, supported languages, exclusions, price/process boundaries, and delivery capacity]`.
- `[NEEDS INPUT: approved positioning, claims register, references, testimonials, customer proof, named authors, bios, and review dates]`.
- `[NEEDS INPUT: legal review covering Saudi and cross-border communications, privacy, consent, data use, AI disclosure, accessibility, and sector restrictions]`.
- `[NEEDS INPUT: Arabic language owner, Saudi Arabic reviewer, English editor, and escalation route for terminology]`.
- `[NEEDS INPUT: CRM stages, account IDs, source taxonomy, UTM policy, conversion definitions, and sales response SLA]`.

## Owner

**Accountable owner:** SEO / AI Search Optimizer.

**Required partners:** Product Marketing / Positioning Strategist; Customer Insights Researcher; ABM Strategist; Competitive Intelligence owner; Content Strategist and Copywriter; Technical SEO owner; Arabic reviewer; English editor; Analytics / Marketing Ops Architect; Performance Analyst; Sales Enablement; Legal / Compliance; Design / Web owner; `[NEEDS INPUT: executive approver]`.

The accountable owner owns the search research protocol, query/topic map, information architecture recommendation, AEO requirements, content briefs, search measurement specification, and gate decisions. Content owners own drafting; technical owners own implementation; Legal owns clearance; Sales owns commercial follow-up; Analytics owns instrumentation and reporting definitions.

No page enters production without a brief owner, target audience/job, evidence status, language/reviewer, approval path, canonical URL decision, and measurable next action.

## Operating Principles

1. **Access before citability.** Audit `robots.txt`, edge/WAF behavior, status codes, renderability, and representative logs before judging an engine's citation potential. A retrieval agent that cannot fetch a page cannot cite it.
2. **Unknown is not zero.** No search-data access, no observed demand, no ranking, or no citation is recorded as `Unknown` or `Not measured`, never as no demand or poor performance.
3. **Research questions, not invented targets.** Query themes come from the GTM, interviews, account language, alternatives, support questions, and observed search data. Volumes and difficulty are captured only when a named source and date exist.
4. **Evidence before claims.** Statistics, quotations, customer outcomes, local-access claims, regulatory statements, and comparison statements require a source, date, owner, scope, approval status, and expiry/review date.
5. **One entity, many expressions.** Preserve canonical product, category, people, organization, and alternative names while allowing Arabic, English, transliterated, and buyer-language variants.
6. **People-first usefulness.** Do not create thin pages for keyword coverage, duplicate city pages without a real service distinction, or machine-translated pages without qualified review.
7. **Answer first, qualify honestly.** A page should answer its core question early, then explain nuance, evidence, limitations, and next steps. It must not imply certainty beyond the evidence.
8. **Separate discovery from credit.** Search impressions, clicks, AI citations, assisted progression, and primary-source pipeline are different measurements. Do not merge them into one visibility score.
9. **Per-engine reporting.** Google Search / AI features, Bing / Copilot, ChatGPT, Perplexity, Gemini, and other engines have different access and reporting behavior. Report engine, query, sample, date, and method.
10. **No competitor invention.** A search result, directory listing, or mention is an observed source record, not proof of competitor quality, market leadership, effectiveness, or commercial relevance.

## Query and Topic Research Protocol

### Research inputs

Build the initial research set from these sources, recording source, date, language, segment, role, funnel stage, and confidence for every item:

- Approved ICP segments, triggers, jobs, roles, anti-ICP, and account language from Workstream 01.
- Validated, directional, or held positioning language and alternative questions from Workstream 02.
- Alternative tracks, buyer wording, objections, proof requests, and comparison dimensions from Workstream 03.
- `[NEEDS INPUT: Workstreams 04 and 05 research, channel, product, or lifecycle questions]`.
- Buyer and non-buyer interviews, discovery notes, sales calls, proposals, loss notes, support questions, and approved customer language.
- First-party observed Search Console, Bing Webmaster Tools, site search, analytics, server logs, and CRM source data, where access and retention are approved.
- Public search and answer-engine observations, captured as dated research observations. Do not treat a result page as proof of demand or performance.
- Authoritative third-party sources for definitions, regulations, statistics, technical explanations, and quotations. Record the original source and verify the claim at publication and review.

### Query/topic record

Use one controlled research record per query or topic cluster:

| Field | Required capture |
|---|---|
| Record ID | Stable ID, researcher, creation date, review date, status. |
| Query or topic | Exact observed wording where available; otherwise a clearly labeled topic hypothesis. |
| Language form | Arabic, English, bilingual, transliterated, or mixed; record script and locale if known. |
| Search job | Informational, problem diagnosis, comparison, commercial evaluation, navigational, procurement, local, or other observed intent. |
| Funnel relation | FIND, UNDERSTAND, TARGET, ENGAGE, QUALIFY, NURTURE, or CONVERT; do not force a stage if unknown. |
| Audience context | Segment, role, sector, trigger, geography, and account relation only when sourced. |
| Source and date | Tool/export, interview ID, CRM record, page, log, engine, or observation method. |
| Demand data | Value and unit only if supplied by an approved source; otherwise `Unknown`. Never estimate. |
| SERP/answer observation | Features, cited pages, entities, questions, and result patterns actually observed; include date and engine. |
| Competition observation | Named result/provider only when observed and source-linked; no quality or market-share inference. |
| Evidence label | Observed, Reported, Inferred, Hypothesis, Unknown, or Approved proof. |
| Confidence and contradiction | Confidence reason, conflicting sources, and unresolved ambiguity. |
| Action | Research, brief, consolidate, monitor, reject, or `[NEEDS INPUT]`. |
| Owner and gate | Decision owner, dependencies, approval status, and next review date. |

### Research sequence

1. **Set the evidence boundary.** Confirm what data is available, what cannot be accessed, the date range, permitted tools, and the distinction between observation and inference.
2. **Cluster jobs before phrases.** Group questions around the buyer problem, category, workflow, alternative, risk, proof request, and procurement concern. Add language variants after the job is understood.
3. **Map the funnel.** Assign each cluster to a GTM stage and intended action. Flag mixed-intent clusters for separate pages or further research.
4. **Collect first-party evidence.** Export available queries, landing pages, internal search, referrals, and conversion paths. Preserve raw export metadata and avoid backfilling missing periods.
5. **Collect qualitative language.** Mine approved interviews, sales notes, proposals, objections, and account briefs for exact buyer wording. Separate quote, paraphrase, and analyst interpretation.
6. **Observe public surfaces.** Record dated result and answer-engine observations, entities, source types, and unanswered questions. Do not claim a stable ranking from one observation.
7. **Prioritize transparently.** Use a qualitative prioritization such as `evidence strength x commercial relevance x answerability x implementation readiness`, with each factor labeled and defined. Do not convert it into forecasted traffic or revenue.
8. **Run a challenge review.** A second reviewer checks duplicates, unsupported regional assumptions, language errors, competitor overreach, and whether the proposed page answers a real job.
9. **Approve briefs in batches.** Each approved cluster receives one primary page hypothesis, supporting pages if justified, internal links, evidence needs, language plan, CTA, owner, and review date.
10. **Re-test after publication.** Compare observed data against the baseline window and record changes without claiming causation unless the measurement design supports it.

### Research guardrails

- Do not publish a keyword volume, difficulty, ranking position, competitor count, click-through rate, AI citation rate, traffic number, or conversion result without a dated source.
- Do not use search autosuggest, AI-generated queries, or a tool's difficulty label as validated buyer demand; they are discovery inputs.
- Do not create pages solely for every city, sector, language, or spelling variant. A variant needs distinct useful content or should consolidate to a canonical page.
- Do not treat an AI answer's description of the company, market, or competitor as authoritative evidence. Trace important facts to primary or independently credible sources.
- Store queries and public observations with access date. Search results and AI answers are personalized, volatile, and non-deterministic.

## Information Architecture

### Proposed architecture

The final structure remains a hypothesis until the offer, audience, language, and evidence inputs are supplied:

- **Entity home:** organization, service category, approved identity facts, authorship, contact, trust, and governance information.
- **Service / offer pages:** one page per actual service or package only after scope and client responsibilities are approved.
- **Problem and workflow pages:** acquisition leakage, qualification, handoff, nurture, measurement, and AI workflow questions where buyer evidence supports them.
- **Audience or sector pages:** only where the service, buyer job, proof boundary, and workflow materially differ; no unsupported Saudi-sector generalizations.
- **Comparison and alternative pages:** internal hire, fragmented providers, generalist agency, referrals/partners, software/tooling, and local provider routes, using the Workstream 03 evidence protocol and unknown-state handling.
- **Resource and research library:** guides, interviews, decision checklists, governance FAQs, experiment logs, and sourced research.
- **Author and trust surfaces:** real bylines, bios, editorial policy, contact, corrections, source policy, privacy, and terms.
- **Language alternates:** Arabic and English equivalents only where translation, review, canonical, hreflang, and maintenance ownership are defined.

### IA rules

- One canonical URL and primary intent per page; consolidate overlapping pages rather than producing near-duplicates.
- Every page belongs to an explicit topic cluster and links to its parent, sibling decision pages, authoritative sources, and next commercial step where appropriate.
- Navigation labels use approved buyer language and canonical entities, not unvalidated keyword stuffing.
- Breadcrumbs, canonical tags, redirects, XML sitemap inclusion, and hreflang are implementation decisions for the technical SEO owner, not assumptions in this brief.
- Comparison pages must state scope, evidence date, unknowns, and whether a statement is a provider claim, buyer report, observed workflow, or approved proof.
- Do not expose private account research, confidential interview notes, suppression records, or unapproved customer data in public IA.

### IA acceptance gate

An IA recommendation is ready when every proposed section has a target job, evidence source or explicit hypothesis, owner, language plan, canonical decision, internal-link role, CTA, review date, and a reason it cannot be answered adequately by an existing page.

## Structured Answer and AEO Requirements

### Page-level requirements

Each citable page brief must specify:

1. The core question and a self-contained answer capsule near the beginning. Target 40-60 words only as a format guideline, not a performance claim.
2. A clear definition before explanation, followed by nuance, limitations, examples, and a next action.
3. Descriptive H1/H2/H3 headings, short paragraphs, tables, lists, and FAQ-style question/answer blocks where they improve comprehension.
4. One claim or decision per extractable passage; avoid pronouns and context-dependent wording in the answer capsule.
5. Named author, visible bio, expertise relevant to the topic, substantive update date, sources, reviewer, and correction path.
6. Direct quotations, statistics, and factual claims only when attributable to a named, accessible source and approved for use. Never manufacture data to satisfy an answer format.
7. A visible evidence boundary: what is known, what is a hypothesis, what is not measured, and what the reader should verify.
8. Internal links that explain the entity and topic relationship, plus outbound links to authoritative sources where a claim depends on them.
9. A useful conversion path matched to intent: research, diagnostic, conversation, qualification, or contact. Do not force a sales CTA on an informational question.
10. Media, tables, downloadable assets, and video transcripts only when they add accessible information and use the same canonical entities.

### Structured data requirements

The technical SEO owner should implement only markup that reflects visible, approved content and validate it after release:

- `Organization` on the entity-defining page, with approved name, URL, logo, contact, and `sameAs` links only after each profile is verified live and consistent.
- `Person` / author data mirroring the visible byline, role, expertise, and profile URL.
- `Article` or the appropriate content type for editorial pages, including author, headline, dates, and main entity.
- `BreadcrumbList` where breadcrumbs are visible and stable.
- `Product` or service-related markup only if the actual offer and required fields are approved; do not use it to imply pricing or availability that does not exist.
- `FAQPage` only where the complete questions and answers are visible. Treat FAQ as an extraction and understanding format, not a promise of a Google rich result.
- `VideoObject` only when a visible video, transcript, dates, and publisher information exist.

JSON-LD is a comprehension aid, not proof of recognition or a ranking guarantee. Entity recognition must be reconciled across the entity home, third-party profiles, review surfaces, and authoritative references before expanding `sameAs`.

### Access and retrieval gate

Before a page is called citation-ready, verify where possible:

- `robots.txt` rules for Googlebot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, and other relevant agents.
- HTTP status, redirects, WAF/CDN behavior, rate limits, challenges, and bytes served for representative URLs.
- Raw HTML contains the answer capsule, byline, key text, links, and JSON-LD required for the page; do not assume every retrieval agent executes JavaScript.
- Server and edge logs show agent requests and status mix, with bot identity treated as unverified until operator IP/reverse-DNS checks are completed.
- Google Search Console and Bing Webmaster Tools access is available before interpreting their reports.

Report each agent as `reachable`, `blocked`, `never-seen`, or `unknown`, with date and method. Robots.txt is not an access-control boundary for user-triggered fetches; sensitive information must remain authenticated.

## Arabic / English Considerations

- Decide language by observed role, sector, query, content job, and buyer context. Do not assume Arabic-first or English-first for all Saudi B2B audiences.
- Maintain a terminology register: Arabic term, English term, transliteration, approved definition, prohibited ambiguity, reviewer, source, and review date.
- Use qualified Saudi Arabic review for customer-facing Arabic. Machine translation may assist drafting but is not final approval.
- Preserve meaning, commercial scope, legal qualifiers, and evidence boundaries across languages; do not translate a hypothesis into a stronger claim.
- Test Modern Standard Arabic, Saudi-relevant wording, English, bilingual phrasing, and transliteration only when observed or explicitly approved. Record script and locale; do not infer demand from spelling variants.
- Map Arabic and English pages with an approved canonical and alternate relationship. Technical SEO owns `hreflang`, language metadata, duplicate handling, and indexing checks.
- Review numerals, dates, currency, units, form labels, phone formats, address conventions, quotation marks, punctuation, reading direction, and mobile layout with native reviewers.
- Keep entity names consistent while recording approved aliases and former names. Do not create a separate entity for a translation or transliteration.
- Measure language paths separately where data supports it: impressions, clicks, engaged sessions, assisted progression, qualified handoffs, and errors. Aggregate only after preserving language and sampling context.
- `[NEEDS INPUT: approved Arabic terminology, reviewer, dialect/locale policy, translation workflow, and language-specific legal/compliance requirements]`.

## Measurement

### Measurement objective

Establish a baseline for search discoverability, answer visibility, content usefulness, and commercial progression without turning missing data into a performance claim. Report the smallest useful slice first, then expand when instrumentation and sample quality justify it.

### Required measurement model

| Layer | What to measure | Source / method | Status |
|---|---|---|---|
| Access | Agent requests, status codes, bytes, robots rules, renderability | Server/edge logs, fetch tests, robots review | `[NEEDS INPUT]` |
| Search visibility | Impressions, indexed pages, queries, positions where available | Search Console, Bing Webmaster Tools, dated exports | `[NEEDS INPUT]` |
| Answer visibility | Engine, query, answer presence, cited URL, citation context, sample size, date | Repeated manual or approved platform observation; native reports where available | Not measured |
| Content behavior | Landing page, engaged session definition, scroll/read proxy if approved, return, language | Analytics with consent and defined events | `[NEEDS INPUT]` |
| Commercial progression | Account ID, source, CTA, accepted handoff, qualification, opportunity stage, next milestone | CRM and GTM handoff contract | `[NEEDS INPUT]` |
| Revenue outcome | Proposal, signed agreement, expansion, loss reason, primary source | CRM/finance reconciliation after maturity | `[NEEDS INPUT]` |
| Quality | Evidence coverage, broken sources, schema validation, freshness, language QA, corrections | Content QA and technical checks | Not measured |

### Rules and definitions

- Establish a baseline window only after `[NEEDS INPUT: analytics and search-property access, timezone, retention, filters, bot treatment, consent model, and date range]` are confirmed.
- Record engine and platform separately. Google Search impressions are not equivalent to AI citations; Bing AI Performance citations are not equivalent to organic clicks; observed ChatGPT or Perplexity answers are samples, not census data.
- For answer-engine sampling, fix the query set, engine, geography, language, session conditions, sample size, date, and citation rule. A citation counts only when the URL is actually shown and observed.
- Report citation frequency and context quality, not a single deterministic answer. Mark intermittent, contested, hedged, and unknown results explicitly.
- Attribute commercial progression using the master GTM source taxonomy and Workstream 01 account IDs. Search may assist a deal; it does not automatically receive primary-source credit.
- Keep AI-referred analytics as an observed floor when referrers are visible. Direct traffic may contain unobserved assistant referrals; do not report visible referrals as total AI traffic.
- Do not set traffic, ranking, citation, lead, pipeline, conversion, or revenue targets until historical data or an approved test design exists. Initial decisions should be based on data quality, evidence coverage, page usefulness, qualified progression, and pre-agreed learning criteria.
- Review key pages on a substantive cadence set by evidence decay and operating capacity. `[NEEDS INPUT: freshness SLA and review owner]`.

### Initial dashboard specification

The dashboard should show, by page/topic, language, funnel stage, account segment where available, and engine where relevant:

- Pages published, indexed, technically blocked, and awaiting review.
- Query/topic records by evidence status and decision.
- Search impressions/clicks/position only where observed and source-dated.
- Answer observations: sampled queries, citations, citation frequency, cited passage, engine, language, date, and sample size.
- Organic and observed AI referral sessions as separate series, with the floor caveat.
- CTA events, accepted handoffs, qualification exits, opportunity progression, and primary-source attribution.
- Evidence QA: source links, schema, byline, freshness, Arabic/English review, corrections, and unresolved `[NEEDS INPUT]` items.
- Access health by host, agent, status mix, and last seen.

`[NEEDS INPUT: dashboard owner, BI destination, refresh cadence, metric definitions, access permissions, and escalation SLA]`.

## Outputs

1. **Search evidence register:** query/topic records, source/date metadata, language, funnel relation, observed data, unknowns, and decisions.
2. **Saudi B2B topic map:** jobs, questions, entities, alternatives, language variants, evidence status, and priority rationale without invented volume.
3. **Information architecture recommendation:** page inventory, cluster relationships, canonical/alternate decisions, internal links, CTA, owners, and implementation dependencies.
4. **Page brief pack:** answer capsule prompt, audience/job, headings, evidence requirements, source plan, author/reviewer, language, schema, links, CTA, and acceptance gate.
5. **AEO/GEO content standard:** answer-first, extractable passage, authorship, citation, entity, freshness, access, and FAQ-format requirements.
6. **Entity and structured-data brief:** approved Organization, Person, Article, BreadcrumbList, service/product, FAQ, and `sameAs` requirements with visible-content constraints.
7. **Arabic/English terminology and localization register:** approved terms, variants, reviewer decisions, unresolved questions, and maintenance owner.
8. **Technical access and indexability audit:** robots, status, render, WAF/edge, logs, sitemap/canonical/hreflang dependencies, and remediation queue.
9. **Measurement and dashboard specification:** baseline requirements, source taxonomy, event/CRM fields, answer-engine sampling method, attribution boundaries, and QA checks.
10. **Decision log and experiment backlog:** hypothesis, disconfirming check, owner, evidence threshold, date, result, and promote/revise/hold/stop decision.
11. **Content refresh and citation-regression register:** substantive update date, source validity, schema, access, author, language, and observed citation changes.

`[NEEDS INPUT: final storage locations, naming convention, dashboard destination, publishing workflow, and approval/sign-off path]`.

## Downstream Handoffs

Every handoff includes the artifact, decision required, owner, acceptance criteria, unresolved assumptions, escalation trigger, and feedback date.

| Handoff | Input from SEO/AEO | Recipient |
|---|---|---|
| Query/topic map -> Positioning and Customer Insights | Observed buyer language, search jobs, question clusters, contradictions, and unknowns | Product Marketing / Positioning + Customer Insights |
| Topic map and account relation -> ICP/ABM | Sourced account questions, triggers, roles, language, content gaps, and suppression constraints | Workstream 01 ABM Strategist |
| Alternatives and comparison queries -> Competitive Intelligence | Observed comparison language, result observations, source list, and evidence gaps | Workstream 03 Competitive Intelligence |
| Position and claims -> Content | Approved message, page job, evidence register, forbidden claims, answer capsule, author, language, and CTA | Content Strategist / Copywriter |
| Page briefs -> Design/Web | Page hierarchy, components, tables, accessible content, language direction, and media requirements | Design and Web owner |
| Technical findings -> Technical SEO / Engineering | Crawl/index issues, structured data, render, redirects, sitemap, canonical, hreflang, WAF, and log requirements | `[NEEDS INPUT: technical SEO owner]` |
| Claims, sources, Arabic/English copy -> Legal/Compliance | Claim register, source links, data assumptions, local-language materials, proof permissions, and unresolved risks | `ops-legal-compliance` |
| Source taxonomy and events -> Analytics/Ops | Page IDs, account IDs, CTA events, language, engine, campaign/source rules, CRM stages, and attribution boundaries | `analytics-marketing-ops-architect` + Performance Analyst |
| Search intent and CTA -> Sales | Qualification questions, content-to-conversation path, accepted handoff definition, SLA, and feedback fields | Sales Enablement + commercial owner |
| Entity and proof needs -> Customer Marketing | Author/entity facts, approved references, review surfaces, proof gaps, and consent status | `[NEEDS INPUT: customer proof owner]` |
| Access/citation findings -> AI Search and Growth loop | Reachability status, sampled citations, regressions, corrections, and next test | SEO/AEO owner + `[NEEDS INPUT: loop coordinator]` |

### Handoff acceptance rule

A recipient accepts only when the input is complete enough for the next decision, all unknowns are visible, the owner and due date are named, and the recipient has returned either acceptance, a specific defect, or a documented `[NEEDS INPUT]` blocker. Search visibility is never accepted as proof of commercial quality without downstream progression data.

## Acceptance Criteria

This workstream is accepted for its next GTM gate when:

- The evidence boundary, owner map, tool access, baseline requirements, and `[NEEDS INPUT]` register are published.
- Query/topic research covers the master GTM jobs, Workstream 01 segments/triggers, Workstream 02 positioning hypotheses, Workstream 03 alternatives, and the explicitly missing 04–05 inputs without inventing demand.
- Every query/topic record has source/date, language, intent or job, funnel relation, evidence label, confidence, owner, and next action; unknown fields are not filled with guesses.
- The initial topic map and IA distinguish informational, evaluation, comparison, procurement, local, and navigational jobs where evidence supports the distinction.
- Proposed pages have a unique job, evidence plan, canonical decision, internal-link role, author/reviewer, language plan, CTA, review date, and approval status.
- AEO requirements cover answer-first passages, headings, extractable structure, sources, quotations/statistics rules, authorship, entity consistency, visible structured data, FAQ-format limits, and access checks.
- Arabic/English decisions are based on observed or approved evidence, with qualified review and technical alternate/canonical ownership defined.
- No search volume, ranking, competitor, citation, traffic, conversion, pipeline, or revenue claim appears without a dated source and clear scope.
- Technical access, indexability, renderability, structured-data, and entity reconciliation dependencies have owners and remediation criteria.
- Measurement separates visibility, answer citations, content behavior, account progression, primary-source attribution, and revenue outcomes; the dashboard does not collapse them into a vanity score.
- At least one narrow content or technical test has a disconfirming check, owner, date, and decision threshold that does not depend on invented performance benchmarks.
- Downstream recipients have accepted their handoffs or have documented specific blockers and dates.

## First 14 Days

| Day | Action | Deliverable / gate |
|---|---|---|
| 1 | Confirm accountable owner, decision sponsor, domain/CMS, approved offer boundary, and evidence rules. | Owner map, access request, evidence register, and `[NEEDS INPUT]` log. |
| 2 | Reconcile master GTM funnel, Workstream 01 segments/triggers, Workstream 02 positions, and Workstream 03 alternatives. | Search research brief and source-to-decision map. |
| 3 | Request or verify Search Console, Bing Webmaster Tools, analytics, CRM/source taxonomy, server/edge logs, robots, and publishing access. | Access matrix; unavailable sources marked `Unknown`, not zero. |
| 4 | Inventory existing site, pages, authors, entities, languages, redirects, templates, and structured data. | Crawl/page inventory and technical baseline request. |
| 5 | Create the controlled query/topic ledger and six alternative tracks; add Workstreams 04–05 as unresolved dependencies. | Empty but governed research register with stable IDs. |
| 6 | Extract approved buyer wording, triggers, objections, proof requests, and content jobs from upstream and supplied evidence. | Provisional topic clusters with source/date and evidence labels. |
| 7 | Run first-party exports and permitted qualitative review; document date range, filters, sample, and missing data. | Initial observed-data pack and contradiction log. |
| 8 | Review public search and answer surfaces for the provisional clusters in Arabic and English. | Dated observation log; no ranking, competitor, volume, or performance inference. |
| 9 | Challenge clusters with a second reviewer; remove duplicates, unsupported local assumptions, and topics without a real buyer job. | Revised topic map and promote/reject/monitor decisions. |
| 10 | Draft the IA, page inventory, canonical/alternate questions, internal-link graph, and CTA by funnel stage. | IA recommendation with owners, dependencies, and `[NEEDS INPUT]` items. |
| 11 | Produce one narrow page brief and AEO checklist, including answer capsule, sources, byline, Arabic/English plan, schema, and access requirements. | Reviewable pilot brief; no public publish until approval gates pass. |
| 12 | Define the measurement schema, answer-engine sampling protocol, baseline window, attribution boundaries, and dashboard fields. | Measurement specification accepted by Analytics/Ops or blocked with named gaps. |
| 13 | Run technical access/entity checks and legal/language review of the pilot brief and terminology. | Reachability report, structured-data requirements, language notes, and claim clearance. |
| 14 | Hold the first gate: approve research, revise clusters, publish a tightly scoped pilot, or hold pending inputs. | Decision log, accepted handoffs, next review date, and experiment backlog. |

No content launch or SEO target is justified merely because the 14-day schedule elapsed. Proceed only when the page job, evidence boundary, owner, language review, technical access, measurement path, and approval status are clear.
