# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
