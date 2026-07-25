# Maintenance Backlog

Prioritized queue for the [maintenance routine](ROUTINE.md). Each run pulls the top unblocked item. `P0` = correctness/health (do first). `P1` = high-leverage growth. `P2` = nice-to-have. Mark items `[x]` when done and note the date; keep this list honest.

## P0 — correctness & health (always first if present)
- [ ] (none open — health checks pass as of 2026-07-21)

## P1 — high-leverage
- [x] Add `brand-context.md` template + wire the CATALYST orchestrator to read it first, so agent output is tailored to a user's ICP/product/voice. — done 2026-07-21 (`templates/brand-context.md`; orchestrator Step 0).
- [x] Wire the 12 category skills to read `brand-context.md` too, so invoking a category skill directly (e.g. `/saas-marketing:content-marketing`) is as tailored as going through CATALYST. — done 2026-07-22 (Step 0 block in all 13 `SKILL.md` files).
- [x] Add a monthly ABM loop to `loops/` (account selection → tiered messaging → multi-channel sequencing → measurement). — done 2026-07-22 (`loops/monthly-abm-loop.md`; persistent account ledger carries state between runs).
- [x] Add a weekly competitive-intel loop to `loops/`. — done 2026-07-22 (`loops/weekly-competitive-intel-loop.md`; watchlist + snapshot carry state, severity triage gate, public-sources-only boundary).
- [x] Add the Step 0 brand-context block to `loops/weekly-content-engine-loop.md` (it predates the template; the monthly ABM loop has one). — done 2026-07-23 (all 3 loops now load brand context first; citation-specific fabrication guard + 2 checklist items).
- [ ] Expose the 59 personas as native Claude Code subagents under `plugins/saas-marketing/agents/` (convert frontmatter to subagent format; keep skill-referenced copies working). — scoped in [#1](https://github.com/shalintripathi/saas-marketing-agents/issues/1) (2026-07-23); blocked on two decisions in-thread (single source of truth vs. a 3rd hand-maintained copy; whether to rewrite all 59 descriptions to trigger-style) before implementation.
- [x] Add a demo GIF/asset for the README hero (orchestrator taking one brief and routing it). — done 2026-07-24 (`assets/catalyst-demo.svg`; animated SVG rather than a GIF, so it needs no screen recording, stays ~8 KB, and degrades to a readable static frame. ~12s reveal, not the 60–90s originally sketched — a hero asset that takes a minute to become legible works against the README).
- [x] Verify install flow end-to-end for Cursor, Copilot, Aider, Windsurf; correct any drift in `integrations/README.md`. — done 2026-07-23 (all 6 `--tool` paths exercised against a sandboxed `$HOME`; fixed the Copilot install target — `~/.copilot/agents/*.agent.md`, not `$HOME/.github/agents/*.md`; rewrote the guide against cited vendor docs and added a `Sources` section).

## P1 — distribution (pre-approved lists only; follow each list's exact rules)
- [x] ~~Submit to `langgptai/awesome-claude-prompts`~~ — assessed 2026-07-21: it's a single-prompt library, not a repo-link list; not a clean fit, skipped.
- [x] Submit to `jmedia65/awesome-ai-marketing` — done 2026-07-21 ([PR #20](https://github.com/jmedia65/awesome-ai-marketing/pull/20)).
- [ ] Prepare + submit to `hesreallyhim/awesome-claude-code` (ISSUE form, human-written, no sales language) — only once README + install are polished.
- [ ] Prepare + submit to `VoltAgent/awesome-agent-skills` (PR, marketing category; lead with genuine usage).
- [ ] Submit the plugin to the Anthropic community marketplace (`anthropics/claude-plugins-community`) via the in-app form; run `claude plugin validate` first.
- [ ] Revisit `kyrolabs/awesome-agents` and `sindresorhus/awesome` once the repo has ≥40 stars and 30+ days of history.

## P1 — skill curation (from scout 2026-07-21; the daily scout works these one per run — see [scout-ledger.md](scout-ledger.md))
- [x] Enhance `paid-media-attribution-analyst` with a Bayesian-MMM measurement backbone — done 2026-07-21 (src: pymc-marketing, Apache-2.0, ideas-only).
- [x] Enhance `sales-discovery-coach` with a methodology taxonomy (MEDDPICC/SPIN/Challenger/Gap/Sandler/Value) — done 2026-07-21 (src: gtm-skills, gtmagents; MIT).
- [ ] Enhance `seo/seo-ai-search-optimizer`: 0-100 passage-citability rubric + citation-regression "tests" + AI Share-of-Voice heatmap (src: Auriti-Labs/geo-optimizer-skill, AgricIDaniel/claude-seo, seranking/seo-skills; MIT, ideas-only).
- [ ] Enhance `paid-media/paid-media-ppc-strategist`: verify-before-write mutation guardrail + negative-keyword pipeline + weighted audit score (src: fourteenwm/ppc-ai-skills, AgriciDaniel/claude-ads; MIT).
- [ ] Enhance `paid-media/paid-media-social-ads-specialist`: creative-fatigue rule + Pixel/CAPI Event-Match-Quality audit (src: TheMattBerman/meta-ads-kit; MIT).
- [ ] Enhance `product-marketing/pmm-positioning-strategist`: named frameworks (Dunford Obviously Awesome, Crossing the Chasm, JTBD, StoryBrand, Blue Ocean ERRC) + portfolio-before-messaging (src: wondelai/skills, realjaymes/marketingagentskills; MIT).
- [ ] Enhance `client-ops/ops-quality-assurance`: Four U's copy-scoring rubric + AI-tell / banned-word screen (src: cgallic/kai-cmo-harness, sergebulaev/linkedin-skills; MIT).
- [x] Enhance `email/email-automation-engineer` with a pre-send safety gate (blast-radius tiers, read-only-by-default scopes, 9-item pre-send checklist) — done 2026-07-25 (src: CosmoBlk/email-marketing-bible, thatrebeccarae/claude-marketing; MIT, ideas-only).
- [ ] Enhance `analytics/analytics-marketing-ops-architect` with a **web-analytics instrumentation quality audit** (GA4 key-event config, custom dimensions, PII in event parameters, attribution/lookback settings, `(not set)` traffic diagnosis, UTM-to-channel-grouping alignment). The agent is thorough on CRM/MAP data quality and silent on the measurement layer feeding every other analytics agent (verified 2026-07-25). Ideas-only; the comparable third-party skill is paywalled, so write from Google's public GA4 docs with read-dates (src noted: cognyai/claude-code-marketing-skills, SpillwaveSolutions campaign skill).
- [ ] PROPOSAL (open an issue first) — new agent `seo/seo-programmatic-strategist` for scaled template-page SEO (integration / comparison / vs / alternatives / glossary pages, index-bloat guardrails). Net-new persona; decide scope/overlap with content-blog-strategist & pmm-competitive first (src: coreyhaines31, kostja94, claude-seo; MIT).
- [ ] PROPOSAL (needs legal validation) — `client-ops/ops-legal-compliance`: AI-disclosure readiness (EU AI Act Art. 50) + C2PA content-provenance posture (src: indranilbanerjee/digital-marketing-pro, cgallic/kai-cmo-harness; MIT).

## P2 — later
- [ ] Add a golden input/output example per agent.
- [ ] GitHub Pages catalog with copy-to-clipboard for all 59 agents.
- [ ] MCP tool recipes (GA4, GSC, HubSpot, Ahrefs) to move agents from advisory to executable. **Consider promoting to P1** — the 2026-07-25 scout found the market moving decisively this way (OpenClaudia's 34 skills wire straight into Resend/HubSpot/GA4 APIs). Any such work inherits the pre-send safety gate now in `email-automation-engineer`: read-only scopes by default, writes opt-in per task, sends never implied.
- [ ] Evaluation harness: rubrics + regression checks for agent output.
- [ ] De-duplicate agent sources (single source of truth; generate the browseable and installable copies).

## Notes
- Social launch posts live in the maintainer's private launch kit and are **posted by a human**, never automated.
- Keep the README badge counts (agents: 59, skills: 13) and the agent index in sync when agents are added.
