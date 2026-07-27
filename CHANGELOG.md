# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Deal Strategist learns the third loss mode: buyer indecision** ([`sales/sales-deal-strategist.md`](sales/sales-deal-strategist.md)) — the agent modelled a lost deal as either *a competitor won* or *the buyer preferred the status quo*, which misses the largest category in late-stage enterprise pipeline: the buyer who wanted to change, agreed you were right, and never signed. Adds a section separating **indecision** (a *risk* problem — the buyer is already convinced and afraid of being personally wrong) from **status-quo preference** (a *value* problem), because the two take opposite plays and the cost-of-inaction reflex actively backfires on the first. The operational rule: **never escalate urgency on a stalled deal until you've diagnosed which mode you're in.** Then the four JOLT moves, adapted for multi-threaded deals — **judge the indecision and locate it** (champion's, economic buyer's, or a late skeptic's; graded low/medium/high with its evidence, since the stage model has no exit for a deal stuck at 85%), **offer a recommendation instead of options** (another comparison matrix is more surface area to be wrong about), **limit the exploration** (a fourth reference call is not an answer to anxiety), and **take risk off the table** by restructuring the downside — narrowed first phase, land-and-expand entry below the approval threshold, defined off-ramp, references matched to risk profile rather than logo value — all inside deal-desk, legal, and pricing-floor limits. Two additions are ours: **run the play through the champion** rather than around them, since they carry the most personal risk; and **classify every no-decision loss** by mode with evidence, plus a matching `No-Decision Loss Mix` success metric, so the biggest loss bucket stops being undifferentiated. Ideas-only, written from scratch; the JOLT framework attributed to Matthew Dixon & Ted McKenna (*The JOLT Effect*, 2022), the surfacing source credited in-file (MIT); statistics cited to two sources with a read-date, and the 84% figure flagged as inconsistently framed between them — direction evidenced, magnitude directional.
- **Marketing Ops Architect gains a web-analytics instrumentation audit (GA4)** ([`analytics/analytics-marketing-ops-architect.md`](analytics/analytics-marketing-ops-architect.md)) — the agent was thorough on CRM/MAP data quality and silent on the measurement layer feeding every downstream acquisition and campaign number. Adds a **read-only-by-default GA4 instrumentation audit** across six checks, each graded pass/needs-work/broken with *unknown never rounding up to pass*: **key-event configuration** (right events marked, reconciled to the MQL definition), **custom dimensions & metrics** within the standard-property quota (50 event-scoped / 25 user-scoped / 10 item-scoped custom dimensions, 50 custom + 5 calculated metrics) and correctly scoped, **PII in event parameters** as a fail-loud P0 against Google's explicit prohibition (with the Data-redaction remedy), **attribution model & lookback window** read from Admin and matched to the B2B sales cycle rather than assumed, **`(not set)` / *Unassigned* traffic** quantified and traced to cause, and **UTM → channel-grouping alignment** (case-sensitive reserved mediums, custom channel groups for legitimate exceptions). Ships with a *Web-Analytics Instrumentation Audit* deliverable folded into the weekly data-quality review. Ideas-only, written from scratch; the audit dimensions were surfaced by a paywalled (not adopted) third-party skill and one MIT source, both credited in-file; all limits, policy wording, and behavior cited to Google's own GA4 documentation with a 2026-07-27 read-date.
- **Quality Assurance Manager gains a copy-scoring rubric and an AI-tell screen** ([`client-ops/ops-quality-assurance.md`](client-ops/ops-quality-assurance.md)) — the agent was thorough on process (checklists, severity, legal, launch gates) but had no way to grade the *words*, so "copy quality" meant little more than spell-check. Adds a **Four U's scoring pass** (Useful / Ultra-specific / Unique / Urgent — each graded weak/adequate/strong with a diagnostic question and a fix), gated so a customer-facing headline or lead that grades weak on Useful *or* Ultra-specific goes back regardless of the other two. Plus an **AI-tell / banned-word screen** in two buckets: hollow modifiers that fail Ultra-specific by construction (*cutting-edge, world-class, seamless, robust, synergy, unlock, elevate…* — replace with the fact they stand in for, or cut) and machine-cadence tells (opener clichés, the "not just X, but Y" reflex, *delve/tapestry/realm/harness*, em-dash strings, a tacked-on "In conclusion"). The screen is explicitly a **flag, not a verdict** — it triggers a rewrite for concreteness, never an auto-reject or an authorship accusation, and reports no "percent-AI" figure. Ideas-only, written from scratch; the Four U's attributed to Michael Masterson / AWAI, the screen idea credited in-file to two MIT sources; no detection-accuracy claims.
- **Positioning Strategist gains a named-framework toolkit and a portfolio-first discipline** ([`product-marketing/pmm-positioning-strategist.md`](product-marketing/pmm-positioning-strategist.md)) — turns "do positioning" into a diagnosis-then-lens method instead of one favourite model applied to everything. Five canonical frameworks, each with an explicit *when to reach for it*: **Dunford's *Obviously Awesome*** five components for a mis-framed product (deepening the framework the deliverables already name); **Moore's *Crossing the Chasm*** beachhead / whole-product / reference-base moves when adoption stalls before the pragmatist majority; **Jobs-to-be-Done** (functional/emotional/social dimensions + the four forces of a switch) for the demand-side truth behind a purchase; **StoryBrand SB7** (customer-as-hero, brand-as-guide) as a top-of-funnel clarity discipline used to express a position, not find one; and **Blue Ocean's ERRC grid** to draw a divergent value curve out of a feature-parity category. Plus a **portfolio-before-message** rule: resolve company category → product-to-spine relationships → per-product buyer/job differences *before* any single product's positioning statement, so a growing SaaS doesn't accumulate contradictory site-wide narratives. Ideas-only, credited in-file to two MIT sources; frameworks attributed to their authors; no numeric claims.
- **Social Ads Specialist gains a creative-fatigue rule and a Meta Event Match Quality audit** ([`paid-media/paid-media-social-ads-specialist.md`](paid-media/paid-media-social-ads-specialist.md)) — the two slow leaks that erode a paid-social account without showing up in a single day's cost-per-lead. Creative fatigue is read as a **coordinated decline** (frequency climbing, first-time-impression ratio falling, CPM drifting up against flat/falling CTR, CVR dipping while CTR holds) with directional B2B refresh triggers (frequency ≥ 2.5 cold, 4–5 retargeting) and a fix framed as a queue, not a rescue — refresh hook/angle, one variable at a time, and tell creative fatigue apart from audience exhaustion. The **Event Match Quality audit** makes EMQ (Meta's out-of-10 match score) its own line item: run CAPI *alongside* the Pixel, send more matched parameters hashed to Meta's spec (`em`/`ph`/name/geo/`external_id` SHA-256; `client_ip_address`/`client_user_agent`/`fbc`/`fbp` un-hashed), deduplicate on a shared `event_id`+`event_name` inside Meta's 48-hour window, and target EMQ ≥ 7 on the primary conversion before scaling — under a hashed, consent-gated, aggregates-only PII boundary matching the email and PPC gates. Ideas-only, credited in-file to one MIT source; EMQ definition, parameter/hashing rules, and deduplication behaviour each cited to Meta's developer docs with a read-date. Numeric thresholds flagged directional.
- **PPC Strategist gains an evidence-graded audit, a spend-change gate, and a search-term loop** ([`paid-media/paid-media-ppc-strategist.md`](paid-media/paid-media-ppc-strategist.md)) — structure for the one discipline where being wrong costs money by the hour. Audits now score every check in **four states** (`pass`/`fail`/`unknown`/`not applicable`, where unknown never rounds to pass) and report **health and evidence coverage separately**, with graded / provisional / insufficient bands — below the bar you publish the missing access, not a score. Live-account changes pass a **blast-radius gate**: read-only by default, contained edits logged, budget/bid/targeting changes needing a before/after diff and approval inside a *written* ceiling, and structural or account-level changes needing explicit per-change approval — plus verify-state-before-write, pause-don't-remove, one variable per verification window, and a named rollback. Negative keywords become a recurring **search-term loop**: n-gram rollup → intent buckets → independent double-classification with disagreements routed to humans → a cross-level conflict check (negatives don't match close variants) → deliberate level choice inside Google's documented limits → gated apply → measure spend *and* conversions, so over-negation can't pass as optimization. Ideas-only, credited in-file to three MIT sources; negative-keyword behaviour and limits cited to Google Ads Help with a read-date.
- **AI Search Optimizer gains a measurement backbone** ([`seo/seo-ai-search-optimizer.md`](seo/seo-ai-search-optimizer.md)) — turns "optimize for AI citations" into a repeatable audit → monitor → benchmark loop: a **0–100 passage-citability score** whose weights track the GEO study's measured levers (quotations, statistics, outbound citations, extractable structure, author schema, freshness, minus a keyword-stuffing penalty); **citation-regression tests** that diff each page against a stored baseline and alert when a capsule, cited stat, schema, or held citation degrades; and an **AI Share-of-Voice heatmap** (queries × engines) that exposes per-engine gaps a single blended number hides. Composite weights flagged as directional editorial judgement, not a validated model; includes an honest-measurement note (sample each query N times, report frequency, never record a citation you didn't observe). Ideas-only, credited in-file to three MIT sources; effect sizes cited to Aggarwal et al. (KDD 2024).
- **Skill Scout — a second recurring job** ([`maintenance/SKILL_SCOUT.md`](maintenance/SKILL_SCOUT.md) + [`maintenance/scout-ledger.md`](maintenance/scout-ledger.md)): monitors GitHub/web for high-value marketing skills, compares them to our inventory, and either enhances an existing agent or adds a missing one — under a hard, ideas-only licensing guardrail. First pass evaluated 53 open-source sources → 7 enhance / 3 add-proposals / 5 already-have.
- **Attribution analyst gains a Bayesian-MMM measurement backbone**, and **the discovery coach gains a sales-methodology taxonomy** (MEDDPICC/SPIN/Challenger/Gap/Sandler/Value), both adapted ideas-only from open-source skills and credited in-file.
- **Marketing Automation Engineer gains a pre-send safety gate** ([`email/email-automation-engineer.md`](email/email-automation-engineer.md)) — the one place in this repo where an agent's mistake is unrecoverable. Classifies every send by blast radius (contained / segment / broadcast) with an escalating approval bar, sets ESP and CRM connections to **read-only by default** (write scopes opt-in per task, send never implied), and adds a 9-item pre-send checklist: audience resolved to a number, suppressions applied, cross-flow collision check, merge-field and link rendering, one-click-unsubscribe and lawful-basis compliance surface, SPF/DKIM/DMARC alignment and complaint-rate headroom, multi-client seed review, a named kill switch, and a warm-up ramp. Fails loud with `[NEEDS INPUT: …]` rather than sending on an assumption. Ideas-only, credited in-file; bulk-sender thresholds cited to Google's published sender guidelines.
- **README hero demo** ([`assets/catalyst-demo.svg`](assets/catalyst-demo.svg)) — an animated SVG showing the CATALYST
  orchestrator take one product-launch brief, load `brand-context.md` as Step 0, select CATALYST-Sprint mode, and
  route the work to named specialists across nine disciplines. Self-contained (no scripts, no external fonts or
  requests, ~8 KB), honours `prefers-reduced-motion`, and degrades to a complete, readable frame where CSS
  animation doesn't run. Every agent named in it is a real agent in this repo, and it is labelled an illustration
  rather than a recorded session.
- **Weekly competitive-intel loop** ([`loops/weekly-competitive-intel-loop.md`](loops/weekly-competitive-intel-loop.md)) — a
  fast weekly change-detection loop, distinct from the quarterly deep-dive the `pmm-competitive-intelligence` agent
  runs on its own. Three parallel sweeps (public sources, search surface, AI-answer citations) diff against last
  week's snapshot, then a **triage gate** assigns `watch` / `notify` / `act` severity, and only `act` items reach
  messaging and battle cards. Carries a **competitor watchlist + snapshot** between runs, requires a source URL and
  read-date on every claim, requires a second source or field corroboration before acting, sets an explicit
  public-sources-only ethical boundary (no fake trials, no NDA-fishing), and treats a quiet week as a valid outcome
  rather than manufacturing a finding.
- **Monthly ABM loop** ([`loops/monthly-abm-loop.md`](loops/monthly-abm-loop.md)) — the recurring counterpart to the
  one-shot ABM workflow. Seven steps across account re-scoring, buying-committee coverage, tiered messaging, asset
  refresh, multi-channel sequencing, measurement, and next-cycle planning. Carries a persistent **account ledger**
  between runs, so each month starts from what the last month learned; includes suppression rules for accounts in
  live sales conversations and a fabrication guard on account research.
- **Brand context template** ([`templates/brand-context.md`](templates/brand-context.md)) — a fill-in file capturing ICP,
  positioning, messaging pillars, citable proof, voice, terminology, and compliance constraints. The CATALYST
  orchestrator now loads it as Step 0 and passes it to every specialist, so output is tailored to your company —
  and agents may only assert facts recorded there, emitting `[NEEDS INPUT: …]` markers instead of inventing
  customers, metrics, or certifications. Shipped with the plugin at `plugins/saas-marketing/templates/`.

### Changed
- **All 12 category skills now load `brand-context.md` first**, not just the CATALYST orchestrator. Invoking a
  skill directly (e.g. `/saas-marketing:seo-growth`) applies the same brand tailoring and the same
  anti-fabrication boundary as going through the orchestrator.
- **The weekly content engine loop now has a Step 0 brand-context block** ([`loops/weekly-content-engine-loop.md`](loops/weekly-content-engine-loop.md)),
  matching the ABM and competitive-intel loops — all three loops now load brand context first. Its fabrication
  guard is aimed at the risk specific to this loop: it rewards cited statistics and direct quotations, which is
  exactly where an agent will invent a number, misattribute a quote, or cite a page that doesn't say what the
  sentence claims. Every statistic and quotation must now name its source, link to it, and date the underlying
  data, and two new checklist items enforce that before publish.
- **[`integrations/README.md`](integrations/README.md) rewritten against current vendor docs**, which are now cited
  in a `Sources` section with a `Last reviewed` date. Adds the Claude Code plugin install as the primary path,
  a verified `--tool` → destination table for `scripts/install.sh`, and per-tool notes on rules formats
  (Cursor requires `.mdc`; Windsurf's current location is `.devin/rules/`; Copilot needs `NAME.agent.md`).

### Fixed
- **`scripts/install.sh` installed GitHub Copilot agents to a location Copilot never reads.** It preferred
  `$HOME/.github/agents/` — but `.github/agents/` is repository-scoped, and the personal-scope directory is
  `~/.copilot/agents/`. Files also kept a plain `.md` extension instead of the required `NAME.agent.md`.
  Both corrected, and Copilot detection no longer keys off an unrelated `$HOME/.github` directory.
- **Stale and incorrect integration instructions.** `claude <file>` / `claude --context <file>` (not real
  invocations), `aider --model claude-opus` (not a valid alias — `opus` is), `/edit` described as output
  iteration (it opens an editor to compose a prompt), the dead `codeium.com/windsurf` URL, `windsurf.dev` in the
  install script's help text, and a hardcoded "Claude Code: up to 200k tokens" context claim.

_Tracked in [ROADMAP.md](ROADMAP.md). This project is actively maintained — see the roadmap for what's next._

## [1.1.0] — 2026-07-21

### Added
- **Installable Claude Code plugin + marketplace.** The 13 skills now install natively:
  `/plugin marketplace add shalintripathi/saas-marketing-agents` then
  `/plugin install saas-marketing@saas-marketing-agents`. No more copy-paste required.
- **AEO/GEO Playbook** ([`guides/aeo-geo-playbook.md`](guides/aeo-geo-playbook.md)) — a sourced, practitioner-grade
  guide to Answer Engine Optimization and Generative Engine Optimization for B2B SaaS, grounded in 2026
  Google/Bing guidance and the GEO research literature.
- **`llms.txt`** at the repo root for AI-crawler discoverability.
- **Marketing loops** ([`loops/`](loops/)) — recurring-cadence, agent-run workflow templates (starting with a weekly content engine loop).
- Repo hygiene: `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CITATION.cff`, `ROADMAP.md`, and this `CHANGELOG.md`.

### Changed
- **Rewrote the README** for discoverability and clarity: positioning, badges, a one-screen "what it is,"
  a 30-second quick start, an agent index table, and a star call-to-action.
- **Refreshed the AI Search Optimizer agent** with current AEO/GEO tactics (GEO effect sizes, Bing AI Performance
  reporting, entity/author signals, content-freshness cadence).
- Relocated the skill bundles from `cowork/` into `plugins/saas-marketing/skills/` to form the installable plugin.
  The `./scripts/install.sh --tool cowork` path still works and copies from the new location.
- Marked the repository as Markdown (not Shell) for accurate GitHub language statistics.

### Fixed
- Broken agent path referenced in the README, CONTRIBUTING, and integrations guide
  (`content-marketing/content-blog-writer.md` → `content/content-blog-strategist.md`).
- Corrected the documented agent frontmatter schema to match the real fields (`name` / `description` / `color` / `emoji`).

## [1.0.0] — 2026-04-02

### Added
- Initial release: 59 B2B SaaS marketing agent personas across 12 categories, the CATALYST orchestration
  framework, example workflows (ABM, product launch, demand gen, content engine), an integrations guide,
  and CI linting for agent files.
