# Run Log

Append-only log of every maintenance run. Newest first. Each entry: date, what shipped, what was checked, what was deferred. See [ROUTINE.md](ROUTINE.md) for the process.

---

### 2026-07-30 (fifth run) — Creative Strategist learns to check power before declaring a verdict (automated)

**Job:** skill scout (`SKILL_SCOUT.md`), one iteration. **Focus discipline:** paid media / social, chosen by rotation — it was last the focus on 2026-07-26, while email/analytics/ops and content/SEO-AEO-GEO both ran earlier today and PMM/sales/GTM ran 07-28. Paid entered with an empty enhancement queue.

**Scouted (6 sources, logged in [scout-ledger.md](scout-ledger.md)):** `AgriciDaniel/claude-ads` (**enhanced-ours** — third mine, first time opening its `ads-test` experiment module), `borghei/Claude-Skills` (**enhanced-ours**, co-credit), `charlie947/social-media-skills` (**watch** — filed to backlog), `realkimbarrett/advertising-skills` (**dismissed**, unlicensed + DTC audience mismatch), `kostja94` / `hyperfx-ai` (**dismissed**, already mined), `Hainrixz` / `thatrebeccarae` / `OpenClaudia` (**dismissed**, duplicate or already mined).

**Gap verified before writing (required step):** grepped the repo for `statistical power|sample size|minimum detectable|MDE|underpowered|statistical significance|95% confidence`. The repo prescribes 95%-significance testing in **nine** places (`marketing-analytics/SKILL.md` even fixes "100 conversions per variant" as the bar), but **`underpowered` and `minimum detectable` appeared zero times repo-wide** — nothing anywhere handled the case a B2B SaaS account actually lives in, where the test *cannot be powered at all*. `paid-media-creative-strategist` was additionally self-contradictory: its success metrics promised "40%+ lift with 95% statistical confidence within 60 days" **and** "3-5 independent creative tests monthly," which at B2B conversion volumes are mutually exclusive and actively invite reading noise as a winner.

**Shipped:** a **"Power Before Verdict: Testing at B2B Volumes"** section plus a new **Critical Rule 9** in *both* dual-located copies of [`paid-media/paid-media-creative-strategist.md`](../paid-media/paid-media-creative-strategist.md). Seven parts: the inverse-square sample/effect relationship and LinkedIn's own conceded floor; **pre-registration** (MDE, stopping rule, and the sample-size assumptions declared before spend); **choosing a metric at an altitude you can power** (CTR powers in days, cost-per-SQL often never — and a CTR winner is evidence about attention, not pipeline, because in B2B the creative that maximizes clicks pulls the wrong job titles); a **variable-impact ordering** (offer > audience > concept > format > hook > visual > CTA wording) reframed around MDE, so the bottom of the list is understood as *arithmetically untestable* rather than merely low-leverage; **four outcomes not two** (winner / loser / **inconclusive-underpowered** / **invalid**), with underpowered noise never rounding to a winner — the same *unknown-is-its-own-state* discipline the PPC strategist applies to account health; a **six-option ladder for when you can't power it** ending in "don't test — a test you cannot power returns a coin flip wearing the costume of evidence"; **concurrency and peeking** discipline; and **logging the MDE next to every result** so "no difference" stays readable a year later. Also rewrote the two contradictory success metrics and added a `Test validity rate`.

**Sourcing:** ideas-only, written from scratch. Pre-registration discipline learned from `AgriciDaniel/claude-ads` (MIT); the variable-impact hierarchy from `borghei/Claude-Skills` — which is **MIT + Commons Clause**, a restrictive non-free condition, so ideas-only with the license flagged in-file and no text reused. Every number cited to LinkedIn's own [A/B Testing best practices](https://www.linkedin.com/help/lms/answer/a525922) (read 2026-07-30, verified twice): $3,000 lifetime budget per ad set for lead-gen tests, $700 for other objectives, 14-day minimum / 21 recommended / 90-day maximum, and **p ≤ 0.1 as an acceptable significance level** — the B2B-closest platform conceding the textbook 95% bar doesn't fit its volumes. Meta's equivalent figures were deliberately **not** included: its official help page wouldn't return English body content this run, and the numbers circulating in secondary blogs weren't verifiable against a primary source.

**Verified:** `bash scripts/lint-agents.sh` passes on both changed copies (2153 words each, frontmatter/sections intact); the two copies `diff` clean; all three new external links return HTTP 200.

**Deferred:** `charlie947/social-media-skills`' scoring-reference-class idea (score a draft against *your own* historical performance with an explicit data gate, rather than generic best practice) — filed to the P2 curation backlog against `ops-quality-assurance`, whose Four U's rubric shipped 07-26 without asking that question. One change per run.

---

### 2026-07-30 (fourth run) — Marketing Ops Architect governs the field layer (automated)

**Job:** general maintenance routine (`ROUTINE.md`), one iteration.

**Health check (all clean, no P0):** 0 broken internal `.md` links repo-wide; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; every `SKILL.md` has `name` + `description`; both `Last reviewed` dates (`guides/aeo-geo-playbook.md` 2026-07-28, `integrations/README.md` 2026-07-23) well inside the 90-day window. No P0.

**Shipped:** Top unblocked skill-curation item (the P1 curation queue is exhausted; the remaining P1s are blocked on issue decisions #1/#2 or human-gated distribution submissions). Compared the `revops-data-governance` skill from `NEON-Rutger/B2B-revops-skills` (MIT — already an established, cited source in this agent) against Critical Rule #3 of the **Marketing Ops Architect**. Rule #3 and the Data Dictionary deliverable already cover field ownership, naming conventions, quality standards, and quarterly audits, but two governance disciplines were genuinely absent (verified by grep first — `prefix` in zero agents; no field-deprecation lifecycle anywhere). Added a **"Governing the Field Layer: Ownership in the Name, and a Retirement Path"** section to **both** dual-located copies: (1) **field-prefix-by-owning-team** naming (`mkt_`/`sales_`/`cs_`/`fin_`/`ops_`/`sys_`) that makes ownership legible at the point of use and structurally prevents cross-team field collisions, with set-at-creation and signpost-not-source-of-truth constraints; and (2) a **four-step field deprecation lifecycle** (mark deprecated → stop writes → map dependents + grace period → archive then remove) folded into the quarterly audit and versioned per Rule #7, because most CRMs delete a field without warning what depends on it. CRM behavior kept vendor-neutral (verify-before-delete note) to avoid asserting platform specifics not verified this run. Ideas-only, written from scratch, source credited in-file.

**Verified:** `bash scripts/lint-agents.sh` passes on both changed copies (4109 words each, frontmatter/sections intact); the two copies `diff` clean (in sync); re-ran the link check (0 broken); both manifests still parse.

**Deferred:** native subagents under `plugins/saas-marketing/agents/` (blocked on #1 decisions); `seo-programmatic-strategist` proposal (blocked on #2); `ops-legal-compliance` proposal (needs legal validation); the higher-bar awesome-list submissions (`hesreallyhim`, `VoltAgent`) and the Anthropic community marketplace (owner's in-app form) — human-gated, not auto-submitted; the two remaining P2 scoping items (consent/suppression as a durable shared record; the AEO↔Reddit seam).

---

### 2026-07-30 (third run) — Lifecycle Architect gains an opt-down ladder (automated)

**Job:** general maintenance routine (`ROUTINE.md`), one iteration.

**Health check (all clean, no P0):** 0 broken internal `.md` links repo-wide; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all skills have a `SKILL.md` with `name` + `description`; both `Last reviewed` dates well inside the 90-day window (`guides/aeo-geo-playbook.md` 2026-07-28, `integrations/README.md` 2026-07-23). No P0.

**Item selection:** P1 high-leverage is exhausted — the only open one (native subagents, [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1)) is blocked on in-thread decisions, as is the programmatic-SEO proposal ([#2](https://github.com/shalintripathi/saas-marketing-agents/issues/2)) and the legal-compliance proposal (needs legal validation). The P1 distribution items all require posting to external third-party repos with human-written framing (`awesome-claude-code` explicitly "human-written"; VoltAgent PR; the Anthropic in-app form) — out of scope for an autonomous run under the "social/third-party posts are human-posted" guardrail. So pulled the top unblocked *in-repo* item: the P2 skill-curation **email frequency opt-down ladder** (backlog line 55).

**Gap verified before writing (required step):** grepped `opt.?down|step.?down|frequency ladder|reduce frequency|fewer emails` repo-wide — the only hit was a single passing bullet in `email-deliverability-specialist.md:146` ("allow subscribers to opt-down…"), with no structured ladder, no sunset rung on a *lifecycle* agent, and — the real value-add — no mapping of each preference choice to the suppression/frequency rule the ESP must actually enforce. Gap was real and structural.

**Shipped:** a new **"The Opt-Down Ladder: A Structured Alternative to the Hard Unsubscribe"** section in both dual-located copies of `email/email-lifecycle-architect.md`. Placed on the Lifecycle Architect (not the Deliverability Specialist) because the ladder is a retention-relationship mechanism adjacent to its existing win-back / churn-prevention / preference-center material; the *sunset* rung is explicitly co-owned with the deliverability specialist rather than duplicating its list-hygiene policy. Four rungs each mapped to concrete ESP enforcement, plus a compliance guardrail (the ladder never gates the real one-click unsubscribe; a pause is a preference, not a legal opt-out) and a pointer to the separate consent-registry scope item.

**Not adopted from the source:** `aaron-he-zhu/aaron-marketing-skills` (Apache-2.0) is bilingual EN/ZH with heavy repo-specific scaffolding (SEND N-dimension vetoes, EQS) that doesn't transfer — ideas only, no text reused, and the opt-down ladder is standard preference-center practice rather than that repo's invention, so it's credited for *surfacing* the pattern.

**Verified:** both copies re-linted (`scripts/lint-agents.sh`, 2/2 pass) and confirmed byte-identical; no new broken internal links; every compliance/deliverability claim cited to a primary source (Google's sender guidelines for the two-day one-click-unsubscribe window, FTC CAN-SPAM, GDPR Art. 7(3)) read 2026-07-30, with the two-day window scoped to bulk marketing mail and transactional excluded.

**Deferred:** the consent-as-durable-shared-record item (backlog line 56 — a scope decision, likely folds into `brand-context.md` + state-ledger) and the AEO↔Reddit seam (line 57); one change per run.

---

### 2026-07-30 (second run) — Skill Scout: AI Search Optimizer audits crawler access before citability (automated)

**Job:** SKILL_SCOUT (market intelligence), not the general maintenance routine.

**Focus discipline (by rotation):** content / SEO-AEO-GEO. It was tied with paid/social at 2026-07-26; content/SEO won the tiebreak on queue depth — paid shipped *two* enhancements that day and has an empty curation queue, while the SEO corner still holds the open `seo-programmatic-strategist` proposal — and because the AEO/GEO half of this market moves fastest.

**Surveyed:** 10 sources (see [scout-ledger.md](scout-ledger.md) for every verdict) — `zubair-trabzada/geo-seo-claude`, `Auriti-Labs/geo-optimizer-skill` (re-check), `Bhanunamikaze/Agentic-SEO-Skill`, `onvoyage-ai/gtm-engineer-skills`, `Jeffallan/writing-with-agents`, `coleschaffer/copywritingskills-rmbc` + `dtc-copywriting-skills`, `mverab/eGEOagents`, `cxcscmu/AutoGEO`, `gooseworks-ai/goose-skills`, `rampstackco/claude-skills`, `coreyhaines31/marketingskills` (third re-check).

**Shipped:** a new **"Access Before Citation: Auditing AI Crawler Reachability"** section plus **Critical Rule 9** in both dual-located copies of [`seo/seo-ai-search-optimizer.md`](../seo/seo-ai-search-optimizer.md).

The gap was verified before writing: `GPTBot` appeared **nowhere** in the repo, "off-site" nowhere, and robots.txt only in generic technical-SEO crawl-budget lines with no AI-agent awareness — meaning the Field Guide and the citability rubric shipped 07-26 both rested on an unaudited assumption that the engine can fetch the page at all. The section separates training / retrieval-indexing / user-triggered agents per operator, names the three costly misreads (Google-Extended ≠ AI Overviews; GPTBot ≠ ChatGPT search; robots.txt ≠ access control for user fetchers), audits the three layers where access dies (robots.txt → edge/WAF → render), and requires empirical per-agent log verification with *never-seen* never rounding up to *reachable*.

**Not adopted from the source:** `geo-seo-claude`'s own bot tiering places `GPTBot` on the search/retrieval side, which contradicts OpenAI's documentation (GPTBot = training; `OAI-SearchBot` = ChatGPT search). Our table was rebuilt from each operator's primary docs instead. Two layers the source does not cover — **edge/WAF enforcement** and **empirical log verification** — are ours.

**Verified:** both copies re-linted (`scripts/lint-agents.sh`, 2/2 pass) and confirmed byte-identical; all 8 external links in the new section return HTTP 200 (Google's crawler doc had moved — link updated to its current canonical URL); every factual claim about agent behavior traced to the operator's own documentation with a 2026-07-30 read-date.

**Deferred:** the AEO↔Reddit seam surfaced by `onvoyage-ai/gtm-engineer-skills` (filed to backlog, one change per run); `cxcscmu/AutoGEO` re-check pending publication of its extracted rule sets; `Jeffallan/writing-with-agents` (a drafting-process persona is a larger architectural call than a scout run should make).

---

### 2026-07-30 — Skill Scout: Marketing Ops Architect scores fit and engagement as two axes (automated)

**Job:** SKILL_SCOUT (market intelligence), not the general maintenance routine.

**Focus discipline (by rotation):** email / analytics / marketing-ops — last the *focus* discipline on 2026-07-25 (shipped 07-27), against paid/social and content/SEO-AEO on 07-26 and PMM/sales/GTM on 07-28.

**Scouted:** 7 sources evaluated (see [scout-ledger.md](scout-ledger.md) for every row and verdict) → 1 enhance, 2 watch, 4 dismissed. Two of the dismissals are unlicensed vendor-bound ESP manuals (`Sequenzy/*`) and three are already-mined sources re-checked for movement in this window.

**The find:** `marketing-operations` in [NEON-Rutger/B2B-revops-skills](https://github.com/NEON-Rutger/B2B-revops-skills) (MIT, 37★, 34 skills, pushed 2026-07-23) models lead scoring as **two independent axes joined by an AND-gate**, not one additive number.

**Overlap verified before writing (the required step):** grepped and read the actual scoring prescriptions across the repo. Our shape was genuinely single-axis: `email/email-automation-engineer.md:90` prescribed *"typically 0-100 scale, with sales handoff threshold at 50+"*, and `strategy/playbooks/phase-2-foundation.md:176` *"Contact becomes MQL at 20+ points."* The dimensions were all there (`Engagement scoring`, `Demographic scoring`, `Firmographic scoring`, `Behavioral scoring`, plus decay at line 74) — but listed as inputs **summed into one score**. Grep for a two-axis gate (`fit score`, `matrix scor`, `both.*threshold`) returned nothing; `recycl` returned only content-recycling. So the gap was real and structural rather than a missing tactic.

**Why it matters:** a summed score lets engagement compensate for fit. A perfect-ICP VP who read two pages and a free-tier student who opened forty emails can land on the same number, so sales works both, rejects one, and stops trusting the model. That is the mechanism behind "your leads are garbage" — a bad shape, not bad point values.

**Grounded in primary sources, not the surfacing repo:** verified that both major MAPs already ship two fields — Adobe Marketo Engage's separate `Demographic Score` and `Behavior Score` operational programs ([op-scoring-demographic](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/programs/program-library/op-scoring-demographic), [op-scoring-behavior](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/programs/program-library/op-scoring-behavior)) and HubSpot's three-property fit/engagement/total model ([Understand the lead scoring tool](https://knowledge.hubspot.com/scoring/understand-the-lead-scoring-tool)), all read 2026-07-30. Both platforms give you the fields and still let you sum them — so the section makes the point that the fields are the platform's job and the gate is yours.

**Shipped** — new section *"Scoring Fit and Engagement as Two Axes, Not One Number"* in both dual-located copies of `analytics-marketing-ops-architect` (chosen over `email-automation-engineer`: the Architect owns scoring-model *design* and the MQL definition per its Core Mission and Critical Rule #1; the Engineer owns implementation). Placed before the GA4 section so that section's opening line ("Everything above governs the CRM/MAP layer") stays true. Contents: the **AND-gate** (`Fit ≥ F AND Engagement ≥ E`, thresholds back-derived from your own closed-won history); a **four-quadrant disposition table** where low-fit/high-engagement is *investigated, not routed* — with a monthly cluster review, since forty accounts in the same unexpected industry is an ICP finding rather than forty bad leads; **decay engagement, never decay fit** (fit changes on enrichment refresh, not on the calendar — a score that drops while nothing changed is what permanently discredits a model with reps); **recycled vs. disqualified** reason codes so rejections feed back instead of vanishing; and **treat the model like production** (version, never edit live, tag records with the scoring version, judge a challenger on acceptance/conversion rather than score distribution). Plus a new **`Fit/Engagement Routing Precision`** success metric.

**Licensing / accuracy discipline:** ideas only, written from scratch in our voice; source credited in-file (MIT). The surfacing skill's own MQL-acceptance improvement figures ("5-15 percentage points"; "62% to 81%", labelled *practice-based* there) were **deliberately not reproduced** — no fabricated or laundered metrics. Every factual platform claim is quoted from and cited to Adobe/HubSpot documentation with a 2026-07-30 read-date, and all thresholds, cadences, and dispositions are explicitly flagged as calibration guidance rather than benchmarks.

**Verified:** both copies `diff`-identical; `scripts/lint-agents.sh` on both — **2/2 pass**; broken-internal-link scan clean repo-wide.

**Deferred to backlog:** the two ideas from `aaron-he-zhu/aaron-marketing-skills` (Apache-2.0, 2.5k★) — a **frequency opt-down ladder** (weekly → monthly → pause → sunset) as an alternative to a hard unsubscribe, and **consent/suppression as a durable shared record** rather than ESP-local state. Both are real gaps; one change per run, so they wait.

---

### 2026-07-28 — Freshness pass: FAQ rich-results now settled + GSC-vs-Bing AI report distinction (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links repo-wide; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; before this run the two `Last reviewed` dates were `guides/aeo-geo-playbook.md` 2026-07-21 and `integrations/README.md` 2026-07-23 — both inside the 90-day window. No P0.

**Item selected:** the backlog is genuinely quiet for autonomous, unblocked internal work — the P1 subagents item is blocked in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1); both PROPOSALs are blocked (issue-#2 scope decision; legal validation); distribution items are the human-gated promotion track; and the `LeadMagic/gtm-skills` scout mine that fed the previous four runs today is now fully worked (JOLT ✓, multi-thread ✓, transparency ✓, signal-play found already-covered). That routes to **ROUTINE step 3 — the freshness pass** on the AEO/GEO playbook + `seo-ai-search-optimizer`, updating only if something genuinely changed.

**What genuinely changed (verified against Google's own docs, read 2026-07-28):**
1. **FAQ rich results** — the playbook (§3) and both `seo-ai-search-optimizer` copies (line 79) described them as *"being removed in 2026"* (present-continuous). They are now gone and the deprecation is phased and dated: rich results stopped appearing **May 7 2026**; the search-appearance filter, rich-result report, and Rich Results Test support were dropped in **June 2026**; and **Search Console API support ends August 2026** — an imminent date the docs never stated. `FAQPage` remains a valid Schema.org type Google still reads to understand a page, so the *keep-the-structure* advice is unchanged; only the tense and the concrete end-date needed fixing. Sources: [Google FAQ structured-data doc](https://developers.google.com/search/docs/appearance/structured-data/faqpage), [Search Engine Journal](https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/).
2. **GSC Search Generative AI performance report** — checklist item 15 grouped it with Bing's report under *"track citations."* Google's report (launched June 2026) is **impressions-only** — it counts times your links were *shown* in AI Overviews/AI Mode, with **no clicks, CTR, or query data** — i.e. visibility, not citations. **Bing Webmaster Tools' AI Performance report** is the one that reports actual **citations** (Total Citations, page-level Citation Activity). Item 15 now draws that distinction, and the report is added to the playbook's Sources. Source: [Google Search Console Help — Generative AI performance report](https://support.google.com/webmasters/answer/16984139).

**Shipped:** `guides/aeo-geo-playbook.md` — FAQ line rewritten (was `_Contested:_`, now `_Now settled (2026):_` with the phased dates), checklist item 15 split into the impressions-vs-citations distinction, GSC report added to Sources, `Last reviewed` bumped to 2026-07-28. Both dual-located copies of `seo-ai-search-optimizer.md` — line 79 FAQ clause moved to past tense with the Aug-2026 API note. No effect sizes, study figures, or GEO tactics touched (those were current); no fabricated metrics.

**Verified:** both `seo-ai-search-optimizer` copies `diff`-identical; `scripts/lint-agents.sh` on both — **2/2 pass**; broken-internal-link scan clean repo-wide. All four added links are external and point to Google/authoritative docs.

**Deferred:** the still-blocked subagents (#1), `seo-programmatic-strategist` (#2), and `ops-legal-compliance` (legal) items; the human-gated distribution submissions.

---

### 2026-07-28 — Discovery Coach: transparency selling (proactive disclosure to disarm) (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links repo-wide; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; both `Last reviewed` dates well inside the 90-day window (`guides/aeo-geo-playbook.md` 2026-07-21, `integrations/README.md` 2026-07-23). No P0.

**Item selected:** the P1 *high-leverage* subagents item stays blocked in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1); the P1 *distribution* items are the human-gated promotion track; the two PROPOSAL entries are blocked (issue-#2 scope decision; legal validation). The remaining genuinely-unblocked candidate was the last un-actioned source idea the scout flagged for future runs on 2026-07-28: `sales-revops/transparency-selling` from `LeadMagic/gtm-skills` (MIT). Verified the gap first — "transparency" appears 69× repo-wide but exclusively as *pricing/attribution/reporting* transparency; the **selling methodology** (Todd Caponi, *The Transparency Sale* — proactive flaw disclosure, ordering of negatives, imperfection-believability, early pricing legibility) had **zero coverage** (grep for Caponi / "transparency sale" / lead-with-weakness returned nothing).

**Shipped:** a new **"Selling by Disclosure (Transparency Selling)"** section in both dual-located copies of `sales-discovery-coach` (`sales/` + `plugins/saas-marketing/skills/sales-enablement/agents/`). Five mechanics (volunteer the flaw first; imperfection > perfection; order negatives by primacy/recency; pre-empt the known objection; make pricing legible early), framed as the trust-building twin of the existing disqualification rigor (Critical Rule 7) and cross-referenced to the Proposal Architect for written pricing mechanics. Chose the Discovery Coach — not the twice-touched-today Deal Strategist — because transparency selling is orthogonal to the Coach's existing question-taxonomy (what you *volunteer* vs. what you *ask*). Ideas-only, our own words; framework attributed to Caponi; the 4.2–4.5-star ratings figure flagged **directional**, attributed to Northwestern's Spiegel Research Center. **No numeric business claims fabricated.**

**Verified:** two copies byte-identical (`diff -q`); `scripts/lint-agents.sh` on both — **2/2 pass**; no broken links introduced.

**Deferred:** distribution submissions (human-gated); subagents (#1) and both proposals (#2, legal) remain blocked.

---

### 2026-07-28 — Deal Strategist: thread coverage as a graded state, not a stakeholder count (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across 191 checked; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; both `Last reviewed` dates well inside the 90-day window (`guides/aeo-geo-playbook.md` 2026-07-21, `integrations/README.md` 2026-07-23). No P0.

**Item selected:** the P1 *high-leverage* subagents item stays blocked on the two in-thread decisions in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1); the P1 *distribution* items are the separate promotion track and human-gated (README-polish condition, star thresholds, human-written issue forms, an in-app marketplace form); the two remaining PROPOSAL entries are blocked (issue-#2 scope decision; legal validation). The top genuinely-unblocked item was the skill-curation entry: multi-thread orchestration mechanics + evaluate the signal-play family, from `LeadMagic/gtm-skills` — which required verifying overlap before writing.

**Overlap verified before writing (the required step):** grepped and read both target agents. The **signal-play family was found already covered** by `sales-outbound-strategist` — funding, hiring, job-change, and product-launch triggers all appear across Critical Rule #1, the "Buying Signal Indicators" list, and the T1/T2/T3 "Intent Signal Prioritization"; only earnings-call triggers are absent, and those fit a narrow public-company ICP. So that half was **deliberately not duplicated**. The multi-thread half had a genuine, narrow gap: `sales-deal-strategist` already has an extensive Multi-Threading Execution Plan (Threads 1–5 + engagement frequency), but it reads as a checklist, and the single success metric that measures it — **"Stakeholder Engagement Score: *Number* of active stakeholders (target 3-5)"** — rewards headcount, the exact "count, not coverage" anti-pattern the backlog item named. Five threads can still be single-threaded on the economic buyer.

**What shipped:** a compact **"Thread Coverage as a State, Not a Count"** block, co-located right after the Multi-Threading Execution Plan in both dual-located copies of [`sales/sales-deal-strategist.md`](../sales/sales-deal-strategist.md), plus a new **`Buying-Committee Coverage`** success metric. The block grades each decision-critical role (economic buyer, champion, technical/security evaluator, procurement, known blocker) on three states rather than present/absent — **Covered** (a live *first-hand* thread, not "my champion says finance is fine"), **Corroborated** (two independent sources, so one departure can't collapse the read — where champion risk actually lives), **Current** (engaged inside the recent-activity window; a quiet thread is lapsed, not covered) — and defines multi-threaded as *every critical role passes all three*, re-graded at each stage gate. The existing headcount metric is kept but explicitly reframed as a *proxy only*.

**Sourcing discipline:** ideas-only — no third-party prose reused. The graded-coverage framing is original to this repo; `LeadMagic/gtm-skills` (MIT) credited in-file for surfacing multi-thread-as-measurable-state, and the in-file note records that the signal-play half was evaluated and found already covered. No fabricated metrics; the only added link is external. No personal data.

**Verified:** `scripts/lint-agents.sh` passes on both edited copies (2/2); `diff` confirms the twins are byte-identical; re-ran the broken-internal-link check (0/191).

**Deferred:** earnings-call as a distinct outbound trigger (narrow public-co ICP; not worth a section); the still-blocked subagents (#1), `seo-programmatic-strategist` (#2), and `ops-legal-compliance` (legal) items; the human-gated distribution submissions.

---

### 2026-07-28 — Skill Scout: the third loss mode (buyer indecision) for the Deal Strategist (automated)

**Focus discipline (by rotation):** PMM / sales / GTM — last the *focus* on 2026-07-21, while content/SEO-AEO, email/analytics/ops, and paid/social have each had a dedicated run since.

**Scouted (6 sources, all logged in [scout-ledger.md](scout-ledger.md)):** [LeadMagic/gtm-skills](https://github.com/LeadMagic/gtm-skills) (MIT, 205 skills, pushed 2026-07-20) → **enhance**; [manojbajaj95/claude-gtm-plugin](https://github.com/manojbajaj95/claude-gtm-plugin) → dismissed (its persistent-workspace idea is what we already ship as `brand-context.md` + loop ledgers); [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) re-checked after its 2026-07-23 push → dismissed (new `launch`/`product-marketing`/`pricing` skills, same checklist format, shallower than our PMM agents); `gtmagents/gtm-agents` + `gtm-skills/gtm` → dismissed (already mined 07-21, stale since April/February); [alyssonfranklin/b2b-agents](https://github.com/alyssonfranklin/b2b-agents) → dismissed (unlicensed, and its "B2B" marketing folder is per-channel social personas).

**Gap verified before writing:** grepped the repo for `indecision|no.decision|JOLT|omission bias|status quo` — the concept was absent. `sales-deal-strategist` models a loss as *competitor won* or *status-quo preferred* (Rule 7), and "status quo" appears 3 times repo-wide, always framed as a value problem to be solved with more cost-of-inaction pressure.

**What shipped:** a new **"The Third Loss Mode: Deals Lost to Indecision, Not to a Competitor"** section in both dual-located copies of [`sales/sales-deal-strategist.md`](../sales/sales-deal-strategist.md), plus a **`No-Decision Loss Mix`** success metric. The section separates indecision (a *risk* problem — the buyer is already convinced and afraid of being wrong) from status-quo preference (a *value* problem), states the operational rule that follows — **never escalate urgency on a stalled deal before diagnosing which mode you're in** — and adapts the four JOLT moves to multi-threaded enterprise deals: judge *and locate* the indecision (whose?), offer a recommendation instead of options, limit the exploration (a data room is not an answer to anxiety), and take risk off the table by restructuring the downside within deal-desk/legal limits. Two parts are ours rather than adapted: **run the play through the champion** (the person carrying the most personal risk), and **classify every no-decision loss** by mode with evidence, so the largest loss bucket stops being undifferentiated.

**Sourcing discipline:** ideas only — no third-party prose reused. The JOLT framework is attributed to Matthew Dixon & Ted McKenna (*The JOLT Effect*, 2022); the source skill that surfaced it is credited to LeadMagic (MIT). Statistics (2.5M recorded conversations; 40–60% of losses ending in no decision; the 44/56 status-quo-vs-indecision split) cited to two Dixon-affiliated sources read 2026-07-28, and the **84% figure explicitly flagged as inconsistently framed between them** (an 84% increase in loss likelihood vs. backfiring 84% of the time) — direction well-evidenced, magnitude directional.

**Verified:** `lint-agents.sh` passes on both copies (2/2); `diff` confirms the twins are byte-identical; all three added links resolve (`challengerinc.com` 200, `jolteffect.com` 200, and the LeadMagic repo confirmed live + MIT via the GitHub API after a sandbox `curl` timeout). No fabricated metrics; no personal data.

**Deferred:** `abm/multi-thread-orchestration`, `sales-revops/transparency-selling`, and the `sales-plays/*-signal-play` family from the same source — noted in the ledger for a future run rather than crammed into this one (one change per run).

---

### 2026-07-27 — Scoping issue for `seo-programmatic-strategist` (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across 174 markdown files; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact (`name`/`metadata.version`/`metadata.description` on the marketplace; `name`/`version`/`description` on the plugin); all 13 skills have a `SKILL.md` with `name` + `description`; both `Last reviewed` dates well inside the 90-day window (`guides/aeo-geo-playbook.md` 2026-07-21, `integrations/README.md` 2026-07-23). The `Last Updated: 2026-04-03` stamps on the CATALYST strategy playbooks are v1.0 *version footers*, not `Last reviewed` freshness commitments — bumping them with no content change would be a forbidden padding edit, so left untouched. No agents edited, so no lint run needed. **No P0.**

**Item selected:** the P1 *high-leverage* item (native subagents) stays blocked on two in-thread decisions in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1); the P1 *distribution* items are human-gated (README-polish condition, star thresholds, human-written issue forms, an in-app marketplace form) and not appropriate to submit autonomously; and every queued `enhanced-ours` skill-curation entry is now shipped. The top genuinely-unblocked item was the next skill-curation PROPOSAL — `seo-programmatic-strategist` — whose queued action is "open an issue first" (the routine requires net-new/large changes to be proposed as an issue before any code).

**What shipped:** GitHub issue [#2](https://github.com/shalintripathi/saas-marketing-agents/issues/2) — a scoping proposal for a net-new `seo-programmatic-strategist` agent (scaled template-page SEO: integration / `vs` / alternatives / use-case / glossary pages, with thin-content + index-bloat guardrails). Includes the **verified overlap analysis** the backlog required before proposing: grepped the SEO/content/PMM agents for `programmatic`, `template page`, `comparison page`, `glossary`, `alternatives page`, `/vs/` → **zero matches** (gap confirmed), plus a table drawing the consume-from / hand-off-to boundary against `seo-keyword-researcher`, `seo-content-optimizer`, `content-blog-strategist`, and `pmm-competitive-intelligence`. Surfaces the real open decision — **net-new 60th agent vs. a capability section on an existing agent** — to settle in-thread before code. Sources credited ideas-only, MIT (per scout ledger 2026-07-21); no fabricated metrics or capabilities. Marked the backlog item scoped + blocked-on-decision.

**Verified:** re-ran the broken-link check (0/174), re-validated both manifests after editing `backlog.md` (`jq empty` clean), and confirmed issue #2 is live and labeled `enhancement`. No agent bodies touched, so `lint-agents.sh` was not applicable this run.

**Deferred:** implementing the agent (blocked on the #2 scope decision); the `ops-legal-compliance` proposal (needs human/legal validation); the human-gated distribution submissions; and the native-subagents work (#1).

---

### 2026-07-27 — Marketing Ops Architect: web-analytics instrumentation audit (GA4) (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across 187 checked; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all skills have a `SKILL.md` with `name` + `description`; both `Last reviewed` dates well inside the 90-day window (`guides/aeo-geo-playbook.md` 2026-07-21, `integrations/README.md` 2026-07-23); `scripts/lint-agents.sh` run on both edited copies — **2/2 pass**. No P0.

**Item selected:** the top P1 *high-leverage* item (native subagents) stays blocked on two in-thread decisions in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1); the P1 *distribution* items are human-gated (README-polish condition, star thresholds, human-written issue forms, an in-app marketplace form) and not appropriate to submit autonomously. The top genuinely-unblocked, right-sized item was the next skill-curation entry: enhance `analytics-marketing-ops-architect` with a web-analytics instrumentation quality audit.

**What shipped:** a new **"Auditing the Web-Analytics Measurement Layer (GA4)"** section in both dual-located copies (`analytics/` and `plugins/saas-marketing/skills/marketing-analytics/agents/`). Six read-only-by-default checks — key-event config, custom dimensions/metrics quota + scope, PII in event parameters (fail-loud P0), attribution model/lookback vs. sales cycle, `(not set)`/*Unassigned* diagnosis, UTM→channel-grouping alignment — each graded pass/needs-work/broken with *unknown never rounding to pass*, plus a *Web-Analytics Instrumentation Audit* deliverable folded into the weekly data-quality review.

**Facts verified against Google's GA4 docs (read 2026-07-27), not memory:** standard-property custom-definition limits (50 event-scoped / 25 user-scoped / 10 item-scoped custom dimensions; 50 custom + 5 calculated metrics); the PII prohibition wording ("no data be passed to Google that Google could use or recognize as personally identifiable information (PII)", naming email/mobile/SSN) and the Data-redaction remedy; the three reporting attribution models + configurable key-event lookback window; and rule-based, case-sensitive default channel grouping with *Unassigned* as the no-rule-match fallback. The attribution *default model/window durations* were **not** assertable from the fetched page, so the audit instructs reading the actual Admin setting rather than stating a default — flagged in-file.

**Guardrails:** ideas-only — the trigger source (`cognyai/claude-code-marketing-skills` `/ga4-audit`) is paywalled and was **not** adopted; dimensions credited in-file alongside `SpillwaveSolutions` (MIT). No prose reused. Read-only-by-default framing consistent with the repo's existing send/spend gates. No fabricated metrics.

**Deferred:** the remaining scout proposals (`seo-programmatic-strategist`, `ops-legal-compliance`) still need an issue / legal validation first; `analytics-marketing-ops-architect` GA4 audit item now closed.

---

### 2026-07-26 — Quality Assurance Manager: Four U's copy-scoring rubric + AI-tell screen (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across 186 checked; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; every `Last reviewed` date in-repo is well inside the 90-day window (`guides/aeo-geo-playbook.md` 2026-07-21, `integrations/README.md` 2026-07-23); `scripts/lint-agents.sh` run across all 11 category dirs — **59/59 agent personas pass**. No P0, so pulled the top unblocked backlog item.

**Item selected:** the top P1 *high-leverage* item (native subagents) stays blocked on two in-thread decisions in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1); the P1 *distribution* items are human-gated (README-polish condition, star thresholds, human-written issue forms, an in-app marketplace form) and not appropriate to submit autonomously. The top genuinely-unblocked, right-sized item was the next skill-curation entry: enhance `ops-quality-assurance` with a Four U's rubric + AI-tell screen.

**Shipped:** a new **"Scoring Copy: The Four U's and the AI-Tell Screen"** section in **both** dual-located copies (`client-ops/ops-quality-assurance.md` and `plugins/saas-marketing/skills/client-operations/agents/ops-quality-assurance.md`, verified byte-identical), placed after Critical Rules like the recent PMM and social-ads enhancements. Two parts:
- **The Four U's** — a scoring pass that grades headlines/leads/CTAs on **Useful, Ultra-specific, Unique, Urgent**, each *weak/adequate/strong* with a one-line diagnostic and a required fix. One editorial gate: weak on **Useful or Ultra-specific → back regardless of the other two** (the two failures that most reliably lose the reader). The bar is flagged as editorial convention, not a measured threshold; the Urgent dimension explicitly forbids manufactured scarcity and cross-references the FTC compliance rule already in the agent.
- **The AI-tell / banned-word screen** — two buckets: *hollow modifiers* that fail Ultra-specific by construction (cutting-edge, world-class, seamless, robust, synergy, unlock, elevate…) → replace with the fact they stand in for or cut; and *machine-cadence tells* (opener clichés, the "not just X, but Y" reflex, delve/tapestry/realm/harness, em-dash strings, a tacked-on "In conclusion"). Framed as a **flag, not a verdict**: triggers a second read and a rewrite for concreteness, never an auto-reject and never an authorship accusation. Explicit rule against reporting any "percent-AI" figure (no reliable measure exists → would violate the no-fabricated-metrics guardrail); positioned as a complement to, not a replacement for, the brand-voice audit.

**Sourcing & licensing:** ideas-only, written from scratch in the agent's voice. The Four U's (Useful/Urgent/Unique/Ultra-specific) attributed in-file to Michael Masterson / AWAI. Screen idea credited to [`cgallic/kai-cmo-harness`](https://github.com/cgallic/kai-cmo-harness) (MIT) and [`sergebulaev/linkedin-skills`](https://github.com/sergebulaev/linkedin-skills) (MIT) — both verified via GitHub API this run (MIT confirmed). Word lists are illustrative, not exhaustive; **no detection-accuracy or other numeric claims** are made.

**Verified:** both copies byte-identical (`diff` clean); `scripts/lint-agents.sh` passes on both (all checks green); section order correct (after Critical Rules, before Deliverables); both new external links return HTTP 200; both manifests still parse.

**Deferred:** the remaining skill-curation queue (`analytics-marketing-ops-architect` GA4 instrumentation audit); the two issue-first proposals; native subagents (#1, blocked); distribution submissions (human-gated). One change per run.

---

### 2026-07-26 — Positioning Strategist: named-framework toolkit + portfolio-first discipline (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across the repo; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; every `Last reviewed` date in-repo is well inside the 90-day window (`guides/aeo-geo-playbook.md` 2026-07-21, `integrations/README.md` 2026-07-23). No P0, so pulled the top unblocked backlog item.

**Item selected:** the top P1 *high-leverage* item (native subagents) stays blocked on two in-thread decisions in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1); the P1 *distribution* items are human-gated (README-polish condition, star thresholds, human-written issue forms, an in-app marketplace form) and not appropriate to submit autonomously. The top genuinely-unblocked, right-sized item was the next skill-curation entry — and PMM was the least-recently-touched track (last enhanced 2026-07-21, behind two same-day paid-media runs and a 2026-07-25 email pass): enhance `pmm-positioning-strategist`.

**Shipped:** a new **"The Positioning Toolkit: Named Frameworks and When to Reach for Each"** section in **both** dual-located copies (`product-marketing/` and `plugins/saas-marketing/skills/product-marketing-ops/agents/`, verified byte-identical), placed after Critical Rules like the social-ads enhancement. It converts "do positioning" into a diagnose-then-pick-a-lens method — five canonical frameworks, each with an explicit *when to reach for it*:
- **Dunford, *Obviously Awesome*** — the five components (competitive alternatives → unique attributes → value → target-market characteristics → market category) for a mis-framed product; deepens the "Obviously Awesome" framework the deliverables already reference.
- **Moore, *Crossing the Chasm*** — beachhead segment / whole product / peer-reference base when adoption stalls before the pragmatist majority, with a caveat that a feature in an established category has no chasm to force.
- **Jobs-to-be-Done** — progress across functional/emotional/social dimensions and the four forces (push, pull, anxiety, habit) as the demand-side truth that *precedes* messaging.
- **StoryBrand SB7** — customer-as-hero, brand-as-guide clarity discipline used to *express* a settled position, not discover one.
- **Blue Ocean ERRC** — Eliminate–Reduce–Raise–Create to draw a divergent value curve out of a feature-parity category.
Plus a **"Portfolio before message"** discipline: resolve company category → each product's relationship to that spine → per-product buyer/job differences *before* any single product's positioning statement, framed as the most expensive positioning debt a growing SaaS accumulates.

**Sourcing & licensing:** ideas-only, written from scratch in the agent's voice. Frameworks attributed in-file to their authors (Dunford; Moore; the JTBD tradition incl. Christensen and Bob Moesta's four forces; Miller; Kim & Mauborgne). Credited for the curation idea to [`wondelai/skills`](https://github.com/wondelai/skills) (MIT, "Frameworks from Bestselling Books") and [`realjaymes/marketingagentskills`](https://github.com/realjaymes/marketingagentskills) (MIT) — both verified via GitHub API this run. **No numeric claims** are made anywhere in the section, so there is nothing to fabricate.

**Verified:** both copies byte-identical (`diff` clean); `scripts/lint-agents.sh` passes on both (all checks green); repo-wide internal `.md` link check clean (0 broken) after edits; both new external links (the two source repos) return HTTP 200; both manifests still parse.

**Deferred:** the remaining skill-curation queue (`ops-quality-assurance` Four-U's + AI-tell screen; `analytics-marketing-ops-architect` GA4 instrumentation audit); the two issue-first proposals; native subagents (#1, blocked); distribution submissions (human-gated). One change per run.

---

### 2026-07-26 — Social Ads Specialist: creative-fatigue rule + Meta EMQ audit (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across 178 checked (up from 172 files as the repo has grown); `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; `guides/aeo-geo-playbook.md` last reviewed 2026-07-21 and `integrations/README.md` 2026-07-23 — both well inside the 90-day window. No P0, so pulled the top unblocked backlog item.

**Item selected:** the top P1 *high-leverage* item (native subagents) stays blocked on two in-thread decisions in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1); the P1 *distribution* items are human-gated (traction thresholds, "human-written" issue forms, an in-app marketplace form) and not appropriate to submit autonomously. So the top genuinely-unblocked item was the next skill-curation entry: enhance `paid-media-social-ads-specialist`.

**Shipped:** a new **"Reading the Two Silent Signals: Creative Fatigue and Match Quality"** section in **both** dual-located copies (`paid-media/` and `plugins/saas-marketing/skills/paid-media-ops/agents/`, verified byte-identical). Two parts:
- **Creative fatigue** read as a coordinated decline (frequency ↑, first-time-impression ratio ↓, CPM ↑ vs flat/falling CTR, CVR ↓ while CTR holds) rather than any single metric, with directional B2B refresh triggers (frequency ≥ 2.5 cold, 4–5 retargeting), a queue-not-rescue fix, and an explicit fatigue-vs-audience-exhaustion distinction. Ties back to the agent's existing Critical Rule 5.
- **Event Match Quality audit** as its own line item: CAPI *alongside* the Pixel; correct parameter hashing (`em`/`ph`/name/geo/`external_id` SHA-256, `client_ip_address`/`client_user_agent`/`fbc`/`fbp` un-hashed); `event_id`+`event_name` deduplication inside Meta's 48-hour window; EMQ ≥ 7 target before scaling — under a hashed, consent-gated, aggregates-only PII boundary that mirrors the email and PPC gates.

**Sourcing:** ideas-only, credited in-file to [`TheMattBerman/meta-ads-kit`](https://github.com/TheMattBerman/meta-ads-kit) (MIT, verified via GitHub API this run). EMQ scoring, customer-information parameters + hashing rules, and deduplication behaviour each cited to Meta's own developer docs (Dataset Quality API, Customer Information Parameters, Handle duplicate events), read 2026-07-26. Numeric fatigue/EMQ thresholds flagged directional, not platform guarantees. No fabricated metrics.

**Verified:** both copies byte-identical (`diff` clean); `scripts/lint-agents.sh` passes on both (all checks green, 1811 words each); re-ran the link check (0 broken across 178 internal links); both manifests still parse.

**Deferred:** the remaining skill-curation queue (pmm-positioning-strategist, ops-quality-assurance AI-tell screen, analytics GA4 instrumentation audit); the two issue-first proposals; native subagents (#1, blocked); distribution submissions (human-gated).

---

### 2026-07-26 — Skill Scout: audit evidence grading, a spend-change gate, and the search-term loop (automated)

**Focus discipline:** paid media / paid social. Rotation put content/SEO-AEO (shipped earlier today) and email/analytics/ops (2026-07-25) behind us, leaving paid and PMM/sales tied at 2026-07-21; paid won on queue depth — two open backlog enhancements to PMM/sales' one.

**Scouted (5 sources, all logged in [scout-ledger.md](scout-ledger.md)):** `AgriciDaniel/claude-ads` (enhance), `fourteenwm/ppc-ai-skills` (enhance), `hyperfx-ai/marketing-skills` (watch), `Hainrixz/claude-ads` (dismissed — same lineage as AgriciDaniel), `Linked-API/linkedin-skills` + `sergebulaev/linkedin-skills` (dismissed — LinkedIn organic/outreach, not paid social; automated DM outreach is off-limits for us).

**Why this item:** it was the top queued paid-media backlog entry, and the primary source had grown substantially since the 2026-07-21 first pass (now ~7.5k★, 12 platforms, capability-gated mutations), which raised rather than lowered its value.

**Shipped:** a new **"Operating a Live Account: Evidence, Gates, and the Search-Term Loop"** section in [`paid-media/paid-media-ppc-strategist.md`](../paid-media/paid-media-ppc-strategist.md) and its plugin twin. Three parts:
- **Evidence grading** — four control states (`pass`/`fail`/`unknown`/`not applicable`) with `unknown` never rounding to `pass`, and two reported numbers instead of one: health (scored only over resolved checks, N/A dropped from the denominator) and evidence coverage (≥80% graded · 60–79% provisional · <60% insufficient → publish the missing access, not a score). Partial runs must be labelled partial; waste figures must derive from spend actually classified in that account, never from an imported benchmark.
- **The spend-change gate** — read-only by default with write scope per task and *"recommend" never implying "apply"*; three blast-radius tiers (contained/reversible → live spend or delivery, needing a diff, a spend delta, and approval inside a **written** ceiling → structural or wide-blast, needing explicit per-change approval, including anything touching shared lists or account-level negatives since those reach Search, PMax, Shopping, App, Smart, and Local at once); plus verify-state-immediately-before-write, prefer pause to remove, one variable per verification window, and idempotency + a named rollback. Explicitly framed as the same posture as the email agent's pre-send gate — different currency, identical logic.
- **The search-term loop** — cadence follows volume, not the calendar; pull search terms (and report the share of spend on *no* visible term as its own line, since it's the hard ceiling on what the loop can clean); n-gram rollup so you negate recurring patterns not one-off strings; eight intent buckets, two of which (competitor brand, own brand) are decisions rather than reflexes; **independent double-classification with disagreements routed to human review**, because the expensive error is negating a converting term; a cross-level conflict check before adding; deliberate level choice; gated apply (Tier 1 at ad-group level, **Tier 3** at shared-list/account level); and measurement in both directions — a list that cuts spend and conversions in the same proportion shrank the account rather than optimizing it.

**Sourcing & licensing:** ideas-only, written from scratch in our voice. Credited in-file to `AgriciDaniel/claude-ads`, `fourteenwm/ppc-ai-skills`, and `hyperfx-ai/marketing-skills` (all MIT). No prose reused from any source.

**No fabricated numbers:** the only hard figures are Google's own documented negative-keyword rules and limits — negatives don't match close variants ("flowers" blocks *red flowers*, not *red flower*), 10,000 negatives per campaign, 5,000 per list, 20 lists per manager or child account, 1,000 account-level negatives, 1,000 max on Display/Video — each cited to Google Ads Help with read-date 2026-07-26. The coverage bands (80/60) are adopted structure and presented as thresholds to set, not measured constants.

**Also updated:** [scout-ledger.md](scout-ledger.md) (new dated block, 5 sources with verdicts), `CHANGELOG.md` `[Unreleased]`, [backlog.md](backlog.md) (item marked done; a second market signal noted against the MCP-recipes item).

**Verified:** both copies of the agent byte-identical (`diff`) and passing `scripts/lint-agents.sh`; all 6 new external links resolve (3 GitHub repos, 3 Google Ads Help pages); repo-wide internal `.md` link check clean after edits.

**Deferred:** the remaining queued paid item (`paid-media-social-ads-specialist`: creative-fatigue rule + Pixel/CAPI Event-Match-Quality audit, src `TheMattBerman/meta-ads-kit`) — one change per run.

---

### 2026-07-26 — Skill curation: measurement backbone for the AI Search Optimizer (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across the repo; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; `guides/aeo-geo-playbook.md` last reviewed 2026-07-21 and `integrations/README.md` 2026-07-23 — both well inside the 90-day window. No P0, so pulled the top unblocked backlog item.

**Why this item:** the top P1 "high-leverage" item (native subagents) stays blocked on two open decisions in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1); the distribution items are gated on README polish / star thresholds. The highest-priority genuinely unblocked, right-sized item was the queued skill-curation enhancement for `seo-ai-search-optimizer` (scout-vetted 2026-07-21).

**Shipped:** a **"Measuring Citability: Score, Regress, Map"** section in [`seo/seo-ai-search-optimizer.md`](../seo/seo-ai-search-optimizer.md) (and its plugin twin). Three instruments, each turning a Field-Guide lever into something you can run on a schedule:
- **Passage-Citability Score (0–100)** — an 8-row rubric (self-contained answer capsule, direct quotation, cited statistic, outbound citations, extractable structure, author + `Person`/`Author` schema, freshness, minus a keyword-stuffing penalty) with 80/60 interpretation bands. Weights track the GEO study's *measured* per-lever effect sizes; the composite is flagged **directional editorial judgement, not a validated model**.
- **Citation-Regression Tests** — a baseline-diff suite (capsule still answers ≤60 words · cited evidence still resolves against the live source · schema still validates · freshness in-window · citation still held per tracked query/engine · no new stuffing/thin-content drift), framed like software regression tests, with a non-determinism caveat and a hard boundary: never record a citation not actually observed.
- **AI Share-of-Voice Heatmap** — queries × engines (ChatGPT/Perplexity/Google AIO/Gemini/Copilot) colour-coded you / competitor / neither, motivated by the ~11% cross-engine domain overlap already cited in the file; plus an honest-measurement note (sample each query N times, report frequency + sample size + date, flag intermittent cells).

**Sourcing & licensing:** ideas-only, written from scratch in our voice, credited in-file to `Auriti-Labs/geo-optimizer-skill`, `AgricIDaniel/claude-seo`, and `seranking/seo-skills` (all MIT). No prose reused.

**No fabricated numbers:** the only quantitative claims are the per-lever effect sizes (quotations ~+40%, statistics ~+33%, outbound citations ~+28%, fluency ~+29%, keyword stuffing ~−9%, named authors ~2.3×) already present and cited in this file's Field Guide and the [AEO/GEO Playbook](../guides/aeo-geo-playbook.md) to Aggarwal et al., "GEO: Generative Engine Optimization" (KDD 2024). The rubric point weights are explicitly labelled our own directional judgement.

**Also updated:** [scout-ledger.md](scout-ledger.md) (queued row → shipped), `CHANGELOG.md` `[Unreleased]`, [backlog.md](backlog.md) (item marked done).

**Verified:** both copies of the agent byte-identical (`diff`) and passing `scripts/lint-agents.sh`; internal-link check on the changed files clean (0 broken) after edits.

---

### 2026-07-25 — Skill Scout: pre-send safety gate for the automation engineer (automated)

**Focus discipline:** email / analytics / marketing-ops — chosen because the [scout ledger](scout-ledger.md)'s first pass covered it thinnest (one email row, one client-ops row, zero analytics rows).

**Scouted (5 new sources, all logged with verdicts):** `CosmoBlk/email-marketing-bible` (MIT, 246★, refreshed mid-2026), `thatrebeccarae/claude-marketing` (MIT, 81★), `OpenClaudia/openclaudia-skills` (MIT, 590★, updated 2026-07-24), `cognyai/claude-code-marketing-skills` (MIT repo, paywalled GA4 audit), `SpillwaveSolutions/running-marketing-campaigns-agent-skill` (MIT), plus two aggregators dismissed as discovery layers.

**Shipped:** a **pre-send safety gate** in [`email/email-automation-engineer.md`](../email/email-automation-engineer.md) (and its plugin twin). The gap was real and specific: that agent is 226 lines of sophisticated lead-scoring and workflow architecture with exactly *one* line about testing before scale, and a repo-wide grep found no send-approval concept anywhere in the email discipline. It is also the highest-stakes gap in the collection — every other agent produces a draft a human reviews, while this one describes wiring live flows in an ESP, where a single wrong action reaches an entire list and cannot be undone.

The section adds: three **blast-radius tiers** (contained ≤50 known addresses / defined segment / broadcast-or-unenumerable) with an escalating approval bar, and an explicit rule that approval is per-send and never inherited; **read-only by default** for ESP/CRM/CDP credentials with write scopes opt-in per task and send/schedule never implied by a write scope, plus an aggregates-not-records rule; a **9-item pre-send checklist** (audience resolved to a number not a rule · suppressions incl. customers-on-prospect-sends and open opportunities · cross-flow collision check · merge-field and link/UTM rendering · one-click unsubscribe + postal address + lawful basis · SPF/DKIM/DMARC alignment and complaint-rate headroom · seed send across Gmail/Outlook/mobile incl. dark mode and image-blocked · a **named kill switch** · warm-up ramp for new domains/IPs or >30% volume jumps); and a **fail-loud** rule returning `[NEEDS INPUT: …]` instead of proceeding on assumption.

**Sourcing & licensing:** ideas-only, written from scratch in our voice, credited in-file to `CosmoBlk/email-marketing-bible` (MIT — the pre-send-gate framing) and `thatrebeccarae/claude-marketing` (MIT — the read-only-by-default connector posture). No prose reused from either.

**No fabricated numbers:** the one external threshold cited (bulk senders under 0.30% spam-complaint rate, recommended under 0.10%) and the `List-Unsubscribe` / `List-Unsubscribe-Post` header requirement were both verified against [Google's Email sender guidelines](https://support.google.com/a/answer/81126) (read 2026-07-25) and are consistent with the <0.1% target our `email-deliverability-specialist` already holds. Google's DMARC requirement permits a `none` policy, so the gate asks for passing authentication with From-domain alignment rather than overstating an enforcement requirement.

**Also updated:** [scout-ledger.md](scout-ledger.md) (7 sources, 1 enhance / 2 watch / 4 dismissed), `CHANGELOG.md` `[Unreleased]`, [backlog.md](backlog.md).

**Filed, not actioned (one change per run):** a new skill-curation item to give `analytics-marketing-ops-architect` a **web-analytics instrumentation quality audit** (GA4 key events, custom dimensions, PII in event params, attribution settings, `(not set)` traffic, UTM-to-channel alignment) — verified as a genuine gap: that agent is thorough on CRM/MAP data quality and silent on the measurement layer every other analytics agent depends on. Also annotated the P2 "MCP tool recipes" item as a promote-to-P1 candidate, since OpenClaudia (590★) is evidence the field is shifting from advisory personas to skills wired into live APIs.

**Verified:** both copies of the agent byte-identical (`diff`) and passing `scripts/lint-agents.sh`; full-repo internal-link check clean (0 broken) after edits.

---

### 2026-07-21 — Skill Scout: new job + first pass + 2 enhancements (manual)

**New capability:** stood up the second recurring job — the **Skill Scout** ([SKILL_SCOUT.md](SKILL_SCOUT.md) + [scout-ledger.md](scout-ledger.md), a daily task). It monitors GitHub/web for high-value marketing skills, compares them to our inventory, and either enhances an existing agent or adds a missing one — under a hard licensing guardrail (learn ideas, never copy prose; attribute permissive adaptations; ideas-only for restrictive/unlicensed sources).

**First pass (6-agent survey→synthesis workflow):** evaluated 53 open-source marketing skills/collections across 5 disciplines → 7 enhance, 3 add-proposals, 5 already-have. All logged in the [scout ledger](scout-ledger.md) with verdicts, sources, and licenses.

**Shipped 2 enhancements** (ideas-only, credited in-file, both dual-located copies synced, linted):
- `paid-media-attribution-analyst` — a Bayesian-MMM measurement backbone (adstock/saturation, uncertainty, geo-holdout incrementality; names PyMC-Marketing / Google Meridian / Meta Robyn). Src: pymc-marketing (Apache-2.0).
- `sales-discovery-coach` — a discovery methodology taxonomy (SPIN / Gap / MEDDPICC / Challenger / Sandler / Value + when to use each). Src: gtm-skills, gtmagents (MIT).

**Queued:** 5 more enhancements + 2 proposals in the [backlog](backlog.md) for the daily scout. Notably, one surveyed "add" idea (shared context + cascading state-passing) was already implemented by the maintenance routine's `brand-context.md` work — the two jobs are converging.

---

### 2026-07-24 — README hero demo asset (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` both parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; `guides/aeo-geo-playbook.md` (reviewed 2026-07-21) and `integrations/README.md` (2026-07-23) are both well inside the 90-day window.

**Shipped:** the README hero demo — [`assets/catalyst-demo.svg`](../assets/catalyst-demo.svg), the repo's first image asset. It shows the arc the README describes but never demonstrated: one product-launch brief → Step 0 brand-context load → CATALYST-Sprint mode selection → fan-out to named specialists across nine disciplines → Phase gate 1.

**Why an animated SVG and not a GIF.** The previous run deferred this item as "needs a human to record," which was the blocker for a screen capture, not for the item itself. An SVG removes the blocker and is strictly better here: ~8 KB versus megabytes, text stays crisp at any width, it is diffable in review, and it needs no recording session to update when the agent roster changes. Built with CSS opacity/transform reveals only — no `<script>`, no SMIL, no external fonts or network requests (verified: 0 script tags, XML parses). It **degrades correctly**: elements carry their visible state as attributes and CSS animation only hides-then-reveals them, so where animation doesn't run the reader gets the complete final frame rather than a blank box. A `prefers-reduced-motion: reduce` block disables the motion outright.

**Honesty constraints applied.** Every one of the 18 agents named in the demo was checked to exist as a real file in this repo (each resolved to 2 paths, the expected dual location) — no invented specialists. The mode line uses CATALYST-Sprint's own documented envelope from the orchestrator skill (2–4 weeks, 20–30 agents, 6 phase gates) rather than made-up numbers. No metrics, outcomes, or customers appear anywhere in it. The README caption labels it an *illustration of the routing flow*, so it can't be mistaken for a recorded session, and the `alt` text plus SVG `<title>`/`<desc>` carry the same content for screen readers.

**Deviation from the backlog spec, noted deliberately:** the item asked for 60–90s. The reveal completes in ~12s. A hero asset that takes a full minute to become legible fights the README instead of serving it; the full arc is visible either way. Backlog item annotated with the reasoning.

**Verified:** rendered the file in a browser and confirmed both a mid-animation frame (staged reveal and blinking caret actually running) and the completed frame — no text overflow past the card, all glyphs (`→`, `·`, drawn checkmark) present, nine routing rows aligned. Two whitespace bugs found and fixed by that render: SVG collapses the leading spaces used to indent the brief under the command (fixed with `xml:space="preserve"`) and the gap on the Mode line (fixed with `dx`). Re-ran the link check after editing `README.md`, `CHANGELOG.md`, `backlog.md`, and this log — 0 broken links; both manifests still parse. No agent files touched, so no dual-location sync was needed and `lint-agents.sh` was not in scope.

**Deferred:** the native-subagents implementation (still blocked on the two decisions in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1)); the awesome-list submissions, which remain unsuitable for an automated run — `awesome-claude-code` requires a human-written issue and `awesome-agent-skills` asks submitters to lead with genuine usage. Both need the maintainer.

---

### 2026-07-23 — Native-subagents item scoped as a design issue (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across 172 `.md` files; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; 59/59 agent personas pass `scripts/lint-agents.sh` (the 10 reported failures are `strategy/` docs, not agents); README badge counts (59 agents / 13 skills) accurate and all 59 agents present in `AGENTS_INDEX.md` by path; `guides/aeo-geo-playbook.md` last reviewed 2026-07-21, well inside the 90-day window.

**No code shipped — this run produced a design proposal instead.** The top unblocked P1 item ("expose the 59 personas as native Claude Code subagents") is a large, design-sensitive change: it touches 59 agent files (66 skill-copies today), changes frontmatter shape (current `name` is a Title-Case display string + `emoji`, not the lowercase-slug + trigger-style `description` native subagents want), and forces a decision the P2 "de-duplicate agent sources" item already flags — personas live in 2 places now, and a native `agents/` dir makes a 3rd hand-maintained copy unless one source generates the rest. Per the routine's "large changes get proposed in an issue first / keep runs small" rules, I filed [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1) rather than committing a half-done conversion.

**The issue is substantive, not a restatement:** it records the verified current state (per-category file counts, the exact frontmatter gap, that filenames are already clean slugs), proposes a concrete format mapping, and surfaces six decisions to settle before implementation — single source of truth, description-rewrite strategy, CATALYST-vs-auto-delegation UX, `tools` scoping, docs/badge sync, and `claude plugin validate` — plus a per-discipline incremental rollout plan. Backlog line annotated with the issue link and its two blocking decisions; item left **open** (proposed, not done).

**Verified:** issue created successfully (`gh issue view 1`); re-ran the link check after editing `backlog.md` and this log — 0 broken links; both manifests still parse. No agent or plugin files were touched, so no dual-location copy was needed.

**Deferred:** the native-subagents implementation itself (awaiting the two in-thread decisions on #1); the README demo GIF (needs a human to record); the higher-bar awesome-list submissions, which the list rules require to be human-written.

---

### 2026-07-23 — Install flow verified end-to-end; integrations guide corrected against vendor docs (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links; both manifests parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; 59/59 agents pass `scripts/lint-agents.sh` (CI scope); `guides/aeo-geo-playbook.md` last reviewed 2026-07-21, well inside the 90-day window. The top P1 item (native subagents) is a 59-file change — too large for one run under the "keep runs small" rule, so it stays queued for a dedicated pass.

**Shipped:** The next unblocked P1 item — verified the install flow end-to-end and corrected the drift it exposed in [`integrations/README.md`](../integrations/README.md) and [`scripts/install.sh`](../scripts/install.sh).

Four confirmed drift points, each checked against the vendor's own docs (now cited in a new **Sources** section with a `Last reviewed` date):

- **GitHub Copilot — wrong install target.** `install.sh` preferred `$HOME/.github/agents/`, which is not a real location: `.github/agents/` is *repository*-scoped, and the personal-scope directory is `~/.copilot/agents/`. Agents also need the `NAME.agent.md` extension, not plain `.md`. Both fixed; the guide now documents repo vs. personal scope in a table and notes that VS Code also detects `.claude/agents/`.
- **Aider — invalid model and misdescribed command.** `--model claude-opus` is not a documented alias (`opus` and `sonnet` are). `/edit` is an alias for `/editor` (opens an editor to compose a prompt), not a way to iterate on output. Personas should load with `/read-only`, not `/add`, so aider doesn't rewrite the persona while working.
- **Windsurf — dead URL and legacy-only format.** `codeium.com/windsurf` 301s to `windsurf.com`. Current rules live in `.devin/rules/*.md` (preferred) or `.windsurf/rules/*.md`; the legacy single-file `.windsurfrules` the script writes is still read, so it works, but the guide now shows the current convention and the global-rules path.
- **Claude Code — invented CLI flags, missing primary path.** `claude <file>` and `claude --context <file>` are not real invocations, and the guide never mentioned the plugin marketplace install that the README leads with. Replaced with the `/plugin marketplace add` flow plus correct `@`-mention usage.

Also added a **Using the install script** section with a verified `--tool` → destination table, flagged that `aider`/`windsurf` write into the *current* directory, corrected the Cursor section (`.mdc` is required — plain `.md` in `.cursor/rules` is ignored; these install as *Apply Intelligently* rules), and replaced the stale "Claude Code: up to 200k tokens" line with repo-measured agent sizes (~680–2,900 words, median ~1,270) and per-tool context controls.

**Verified:** ran all six `--tool` paths against a sandboxed `$HOME` and confirmed every destination in the new table matches what the script actually writes, including the corrected `~/.copilot/agents/*.agent.md`; `bash -n scripts/install.sh` clean; re-ran the link check (0 broken) and the full 59-agent lint (0 failures) after editing; sandbox removed and working tree confirmed clean of test artifacts.

**Deferred:** exposing the 59 personas as native subagents (large, needs its own run); the README demo GIF (needs a human to record).

---

### 2026-07-23 — Brand context wired into the weekly content engine loop (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across every `.md` in the repo; `.claude-plugin/marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; `guides/aeo-geo-playbook.md` last reviewed 2026-07-21 (2 days old, well inside the 90-day window). No agent files touched this run, so no lint needed.

**Shipped:** The top open P1 backlog item — a **Step 0: Load brand context** block in [`loops/weekly-content-engine-loop.md`](../loops/weekly-content-engine-loop.md). This loop predated `templates/brand-context.md`; the ABM and competitive-intel loops added since the template already had one, so this was the last inconsistency. All three loops now load brand context first, and the loop's handoff rule was updated to carry brand context through every step — an explicit exception to its otherwise context-lean rule, since voice and proof constraints apply to the step-6 distribution copy just as much as to the step-3 draft.

**The fabrication guard is loop-specific, not boilerplate.** Each loop's Step 0 names the risk particular to that loop (accounts research for ABM, competitor claims for competitive intel). For this loop it is **citations**: the loop actively rewards cited statistics and direct quotations because those are among the strongest levers for earning AI-engine citations — which makes it precisely where an agent will invent a plausible number, attribute a quote to a real analyst who never said it, or link a source that doesn't support the sentence. The block now requires every statistic and quotation to come from a page the agent actually read and to carry source name + URL + date of the underlying data, with `[NEEDS INPUT: …]` markers for anything unsourced, and extends the same rule to the user's own proof (customer names, metrics, integrations, certifications may only be asserted if recorded in `brand-context.md`). The stated reason: this loop is designed to make content *quotable*, so a published fake number gets repeated onward with the user's name attached.

**Also added:** two items to the weekly "done" checklist — every statistic and quotation names its source, links to it, dates the underlying data, and the linked page actually says what the sentence claims; and no `[NEEDS INPUT: …]` markers survive into the published version.

**Verified:** re-ran the full link check after the edits — 0 broken links, including the new `../templates/brand-context.md` relative link (confirmed the target file exists); re-validated both manifests; confirmed all 3 loop files now contain the Step 0 heading. `loops/` is browse-only (not shipped inside `plugins/`), so no dual-location copy was needed.

**Deferred:** the remaining P1 items — native subagents under `plugins/saas-marketing/agents/`, README demo GIF, cross-editor install verification, and the higher-bar awesome-list submissions (`hesreallyhim/awesome-claude-code`, `VoltAgent/awesome-agent-skills`, Anthropic community marketplace — the last needs the owner's in-app form).

---

### 2026-07-22 — Weekly competitive-intel loop added to the loops library (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across every `.md` in the repo; `marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; `guides/aeo-geo-playbook.md` last reviewed 2026-07-21 (inside the 90-day window). No agent files touched this run, so no lint needed.

**Shipped:** Top P1 backlog item — [`loops/weekly-competitive-intel-loop.md`](../loops/weekly-competitive-intel-loop.md). Deliberately scoped *against* the [`pmm-competitive-intelligence`](../product-marketing/pmm-competitive-intelligence.md) agent's own quarterly deep-dive work (dossiers, win/loss, positioning maps): this loop does one thing weekly — **detect change and route it**. Structure: three parallel sweeps in steps 1–3 (public sources via `pmm-competitive-intelligence`, search surface via `seo-keyword-researcher`, AI-answer citation share via `seo-ai-search-optimizer`), all diffed against last week's snapshot; then a **triage gate** at step 4 (`pmm-positioning-strategist`) that assigns `watch` / `notify` / `act` severity with a stated reason, defaulting to `watch`. Only `act` items reach `pmm-messaging-architect` (step 5) and `sales-enablement-content-creator` + `sales-discovery-coach` (step 6); step 7 corroborates against real deals (`sales-pipeline-analyst`) and writes the digest (`pm-campaign-coordinator`). Persistent state is a **competitor watchlist + snapshot** — tier, source URLs, last-checked date, changes, severity, field corroboration, battle-card version, owner. All 11 agent slugs referenced were verified against `AGENTS_INDEX.md`.

**Three guardrails worth noting**, since this loop is unusually easy to get wrong: (1) every claim must carry a source URL *and* the date the page was read, and an `act` verdict needs a second independent source or field corroboration — a battle card built on an invented competitor feature costs a deal the moment a prospect corrects the rep; (2) an explicit **public-sources-only ethical boundary** — no misrepresented identity to obtain trials/demos, nothing behind an unentitled login, no soliciting NDA-covered information from a competitor's employees or customers, with `ops-legal-compliance` named as the escalation path when a source's terms are unclear; (3) **a quiet week is a valid outcome** — the loop is written to report "nothing material moved" and stop, because manufacturing a weekly finding is the fastest way to make sales stop reading the digest. Also included: your own shipped changes get triaged in the same pass (your battle card goes stale from your side too), and source-URL decay is called out as the silent failure mode where a 404'd page reports "no change" forever.

**No fabricated benchmarks:** the measurement section names *what* to track (surprise rate, detection lead time, corroboration rate, false-alarm rate, battle-card freshness, source-coverage decay) with no invented numbers, and explicitly says win-rate-by-competitor moves on a deal-cycle timescale and must be read quarterly, never weekly.

**Also updated:** loops index table (`loops/README.md`), README loops section, `ROADMAP.md` (competitive-intel removed from "Next"), `CHANGELOG.md` `[Unreleased]`, backlog item marked done.

**Verified:** re-ran the full link check after all edits — 0 broken links, including the 2 new relative links in the loop file and the new README/loops-index entries; re-validated both manifests; confirmed every agent slug referenced in the loop exists in the index. `loops/` is browse-only (not shipped inside `plugins/`), so no dual-location copy was needed.

**Deferred:** the weekly content engine loop still has no Step 0 brand-context block (now the top open P1, and the only loop missing it — both loops added since the template have one); plus native subagents, README demo GIF, cross-editor install verification, and the higher-bar awesome-list submissions.

---

### 2026-07-22 — Monthly ABM loop added to the loops library (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across every `.md` in the repo; `marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; `guides/aeo-geo-playbook.md` last reviewed 2026-07-21 (inside the 90-day window); `scripts/lint-agents.sh` run across all 69 category `.md` files — **59/59 agent personas pass**. The 10 reported failures are all non-agent documents in `strategy/` (`QUICKSTART.md`, `EXECUTIVE-BRIEF.md`, `catalyst-strategy.md`, `coordination/handoff-protocols.md`, the six phase playbooks), which are not agent files and correctly do not carry the agent frontmatter/section schema. Not a P0; noted so future runs don't re-investigate.

**Shipped:** Top P1 backlog item — [`loops/monthly-abm-loop.md`](../loops/monthly-abm-loop.md). Deliberately *not* a rewrite of [`examples/workflow-abm-campaign.md`](../examples/workflow-abm-campaign.md), which stands a program up from zero over 3–4 weeks; this is what you run every month afterwards. The defining mechanic is a persistent **account ledger** (tier, stage, committee coverage, last touch, change-vs-last-cycle, next action + owner) that step 1 reads and step 6 rewrites, so each run starts from the previous run's evidence. Seven steps mapped to real agent filenames: `pmm-competitive-intelligence` → `analytics-customer-insights-researcher` → `pmm-messaging-architect`/`pmm-positioning-strategist` → `sales-enablement-content-creator` → `sales-outbound-strategist` + email/LinkedIn/paid builders → `sales-pipeline-analyst` + `analytics-performance-analyst` → `pm-campaign-coordinator`. Includes a Step 0 brand-context block matching the 13 skills, with an ABM-specific fabrication guard (account research is the easiest place in this repo for an agent to invent firmographics, funding, or named contacts — all must be sourced or `[NEEDS INPUT: …]`), suppression rules so accounts in live sales conversations are never auto-sequenced, and a "where this loop goes wrong" section.

**No fabricated benchmarks:** the measurement section defines *what* to track per account (progression, committee coverage, time-in-stage, first-touch channel, message resonance) and explicitly tells users to baseline from their own first three cycles, since published ABM benchmarks swing wildly with deal size and list quality. No invented numbers were added.

**Also updated:** loops index table (`loops/README.md`), README loops section, `ROADMAP.md` (ABM removed from "Next"), `CHANGELOG.md` `[Unreleased]`, backlog item marked done.

**Verified:** re-ran the full link check after edits — 0 broken links, including the 3 new relative links in the loop file and the new README/loops-index entries. Manifests re-validated. `loops/` is browse-only (not shipped inside `plugins/`), so no dual-location copy was needed.

**Deferred:** the weekly content engine loop predates `brand-context.md` and has no Step 0 block — worth adding for consistency, filed as a small backlog item rather than expanding this run.

---

### 2026-07-22 — Brand context wired into all 12 category skills (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links; `marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; `guides/aeo-geo-playbook.md` last reviewed 2026-07-21 (inside the 90-day window). No agent files touched this run, so no lint needed.

**Shipped:** Top P1 backlog item — added the same **Step 0: Load brand context** block that the CATALYST orchestrator already had to all 12 category `SKILL.md` files (`content-marketing`, `seo-growth`, `paid-media-ops`, `social-media-ops`, `email-marketing-ops`, `design-ops`, `sales-enablement`, `product-marketing-ops`, `marketing-analytics`, `marketing-project-mgmt`, `client-operations`, `saas-marketing-suite`). Invoking a category skill directly now loads `brand-context.md` first, hands it to the specialists it routes to, and applies the same anti-fabrication boundary — only proof recorded in the file may be asserted; everything else gets a `[NEEDS INPUT: …]` marker. Wording is identical across all 13 skills so the behaviour can't drift between entry points.

**Verified:** re-ran the link check (0 broken, including the 12 new `../../templates/brand-context.md` relative links, which resolve to the plugin-local template); re-validated both manifests; confirmed all 13 skills now contain the Step 0 heading and that frontmatter is intact.

**Deferred:** the remaining P1 items — ABM and competitive-intel loops, native subagents under `plugins/saas-marketing/agents/`, README demo GIF, cross-editor install verification, and the higher-bar awesome-list submissions.

---

### 2026-07-21 — Brand context template + CATALYST wiring (automated)

**Health check (all clean, no P0):** 0 broken internal `.md` links across the repo; `marketplace.json` and `plugins/saas-marketing/.claude-plugin/plugin.json` parse with required fields intact; all 13 skills have a `SKILL.md` with `name` + `description`; all 59 agents pass `scripts/lint-agents.sh`; `guides/aeo-geo-playbook.md` last reviewed 2026-07-21 (well inside the 90-day window).

**Shipped:** Top P1 backlog item — [`templates/brand-context.md`](../templates/brand-context.md), a 13-section fill-in template covering ICP, personas, positioning, messaging pillars, citable proof, competitors, voice/banned words, terminology, compliance, channels, and current goals. Wired the CATALYST orchestrator to load it as **Step 0** before routing any work (`plugins/saas-marketing/skills/catalyst-orchestrator/SKILL.md`), and added a "Prerequisite: Brand Context" section to `catalyst-strategy.md` (**both** dual-located copies, with correct relative link per location). Shipped a plugin-local copy at `plugins/saas-marketing/templates/` so plugin installs get the template too. Added pointers in the README quick start and `strategy/QUICKSTART.md`.

The template doubles as an anti-fabrication boundary: agents may only assert customer names, metrics, and certifications recorded in it, and must emit `[NEEDS INPUT: …]` markers otherwise.

**Verified:** re-ran the link check (0 broken, including the 4 new relative links), re-validated both manifests, re-linted the touched files.

**Deferred:** wiring the 12 category skills to read `brand-context.md` — filed as the next P1 item, since a user invoking a category skill directly still gets untailored output.

---

### 2026-07-21 — Distribution + discoverability (manual)

**Shipped:** Set 20 GitHub topics + a keyword-rich description. Submitted the repo to `jmedia65/awesome-ai-marketing` under *Workflow Automation → For Developers Building Custom Tools* ([PR #20](https://github.com/jmedia65/awesome-ai-marketing/pull/20)). Stood up the 4×/day maintenance routine.

**Deferred:** higher-bar awesome-lists (`hesreallyhim/awesome-claude-code` issue form, `VoltAgent/awesome-agent-skills` PR) until the repo has some traction; Anthropic community-marketplace submission needs the owner's in-app form (see backlog).

---

### 2026-07-21 — Bootstrap / v1.1.0 overhaul (manual)

**Shipped:**
- Packaged the 13 skills as an installable Claude Code plugin + marketplace (`.claude-plugin/marketplace.json`, `plugins/saas-marketing/`).
- Added the sourced [AEO/GEO Playbook](../guides/aeo-geo-playbook.md); refreshed the `seo-ai-search-optimizer` agent (both copies) with 2026 tactics.
- Added `llms.txt`, `ROADMAP.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CITATION.cff`, and the `loops/` library (weekly content engine loop).
- Rewrote the README for discoverability; fixed broken `content-blog-writer` path across 3 docs; corrected the documented frontmatter schema; fixed GitHub language detection (Markdown, not Shell).
- Set GitHub topics, description, and homepage; stood up this maintenance engine.

**Checked:** 59 agents present; all 13 skills have valid `SKILL.md`; both manifests parse and hold required fields; no broken internal `.md` links after fixes; no personal/sensitive data committed.

**Deferred (see [backlog.md](backlog.md)):** brand-context config, native subagents, additional loops, demo GIF, awesome-list submissions, community-marketplace submission.
