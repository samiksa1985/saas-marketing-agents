# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
