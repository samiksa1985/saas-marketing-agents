# Run Log

Append-only log of every maintenance run. Newest first. Each entry: date, what shipped, what was checked, what was deferred. See [ROUTINE.md](ROUTINE.md) for the process.

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
