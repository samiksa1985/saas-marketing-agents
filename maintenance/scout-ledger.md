# Scout Ledger

Persistent memory for the [Skill Scout](SKILL_SCOUT.md) job. One row per third-party marketing
skill/collection evaluated, so the scout compounds knowledge instead of re-scanning the same
sources. **Verdicts:** `adopted-new` (added a new skill), `enhanced-ours` (improved one of ours
using ideas from it), `dismissed` (with reason), `watch` (revisit / proposed for human review).

Do not delete rows — they are the audit trail of what we looked at and why we did or didn't act.

## First pass — 2026-07-21 (53 sources surveyed across 5 disciplines → 7 enhance, 3 add-proposals, 5 have)

| Date | Source | License | Discipline | Verdict | Notes |
|------|--------|---------|------------|---------|-------|
| 2026-07-21 | [pymc-labs/pymc-marketing](https://github.com/pymc-labs/pymc-marketing) | Apache-2.0 | Paid / attribution | **enhanced-ours** | Added Bayesian-MMM measurement backbone (adstock/saturation, uncertainty, holdout incrementality) to `paid-media-attribution-analyst`. Ideas only. |
| 2026-07-21 | [gtm-skills/gtm](https://github.com/gtm-skills/gtm), [gtmagents/gtm-agents](https://github.com/gtmagents/gtm-agents) | MIT | Sales | **enhanced-ours** | Added a discovery methodology taxonomy (SPIN/Gap/MEDDPICC/Challenger/Sandler/Value) to `sales-discovery-coach`. Industry-standard frameworks, our words. |
| 2026-07-21 | [Auriti-Labs/geo-optimizer-skill](https://github.com/Auriti-Labs/geo-optimizer-skill), [AgricIDaniel/claude-seo](https://github.com/AgricIDaniel/claude-seo), [seranking/seo-skills](https://github.com/seranking/seo-skills) | MIT | SEO / AEO | **enhanced-ours** (queued) | 0-100 passage-citability rubric + "citation regression tests" + AI SoV heatmap → `seo-ai-search-optimizer`. Backlog. |
| 2026-07-21 | [fourteenwm/ppc-ai-skills](https://github.com/fourteenwm/ppc-ai-skills), [AgriciDaniel/claude-ads](https://github.com/AgriciDaniel/claude-ads) | MIT | Paid / PPC | **enhanced-ours** (queued) | Verify-before-write mutation guardrail, negative-keyword pipeline, weighted audit score → `paid-media-ppc-strategist`. Backlog. |
| 2026-07-21 | [TheMattBerman/meta-ads-kit](https://github.com/TheMattBerman/meta-ads-kit) | MIT | Paid / social ads | **enhanced-ours** (queued) | Creative-fatigue rule + CAPI/EMQ audit → `paid-media-social-ads-specialist`. Backlog. |
| 2026-07-21 | [wondelai/skills](https://github.com/wondelai/skills), [realjaymes/marketingagentskills](https://github.com/realjaymes/marketingagentskills) | MIT | Product marketing | **enhanced-ours** (queued) | Named positioning frameworks (Dunford/Moore/JTBD/StoryBrand/Blue Ocean) + portfolio-before-messaging → `pmm-positioning-strategist`. Backlog. |
| 2026-07-21 | [cgallic/kai-cmo-harness](https://github.com/cgallic/kai-cmo-harness), [sergebulaev/linkedin-skills](https://github.com/sergebulaev/linkedin-skills) | MIT | Client ops / QA | **enhanced-ours** (queued) | Four U's copy-scoring + AI-tell/banned-word screen → `ops-quality-assurance`. Backlog. |
| 2026-07-21 | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills), [kostja94/marketing-skills](https://github.com/kostja94/marketing-skills) | MIT | SEO | **watch** (proposal) | Genuine gap: no owner for programmatic/scaled template-page SEO. Proposed new agent `seo-programmatic-strategist` (issue). |
| 2026-07-21 | [GTM-Strategist/gtm-strategist-skills](https://github.com/GTM-Strategist/gtm-strategist-skills) | MIT | Architecture | **watch** (mostly done) | "Shared context first + cascading state" pattern — largely already implemented via `brand-context.md` + loop state ledgers; revisit for cross-skill state-passing. |
| 2026-07-21 | [indranilbanerjee/digital-marketing-pro](https://github.com/indranilbanerjee/digital-marketing-pro) | MIT | Client ops / legal | **watch** (proposal) | AI-disclosure (EU AI Act Art. 50) + C2PA content provenance → `ops-legal-compliance`. Needs human/legal validation before shipping. |
| 2026-07-21 | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (41k★) | MIT | Content / copy | **dismissed** (have) | Category reference, but prompt-only operator checklists and one worldview; we already cover copy/blog/newsletter/optimization as dedicated agents. |
| 2026-07-21 | [AgriciDaniel/claude-email](https://github.com/AgriciDaniel/claude-email) | MIT | Email | **dismissed** (have) | Runnable SPF/DKIM/DMARC script is nice, but our deliverability agent (244 lines) is deeper; audit/plan/check split is a minor structural note only. |
| 2026-07-21 | [Shubhamsaboo/awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) | Apache-2.0 | Product marketing / CI | **dismissed** (have) | Reference blueprints for battlecard gen; our competitive-intelligence agent already covers battle cards, win/loss, pricing, sentiment. |
| 2026-07-21 | [kostja94/marketing-skills](https://github.com/kostja94/marketing-skills) | MIT | Social | **dismissed** (have) | Trends toward formulaic hook/viral/humanizer tactics that are off-brand for B2B trust-building; our per-platform organic agents cover the space. |
| 2026-07-21 | [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills), [wshobson/agents](https://github.com/wshobson/agents) | MIT | (discovery layers) | **dismissed** | Awesome-lists / general dev agents — distribution targets, not skills to adopt (tracked in the distribution backlog instead). |
| 2026-07-21 | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | none/unlicensed | (discovery layer) | **dismissed** | Unlicensed — do NOT reuse any content. Index only. |
| 2026-07-21 | contains-studio/agents, msitarzewski/agency-agents | MIT / mixed | (studio clones) | **dismissed** | Studio-agent org-charts; marketing buried and generic; credibility-suspect metrics on some. No adoptable marketing skill. |
