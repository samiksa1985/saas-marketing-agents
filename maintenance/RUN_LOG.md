# Run Log

Append-only log of every maintenance run. Newest first. Each entry: date, what shipped, what was checked, what was deferred. See [ROUTINE.md](ROUTINE.md) for the process.

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
