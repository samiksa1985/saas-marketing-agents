<div align="center">

# 🚀 SaaS Marketing Agents

**An open-source AI marketing team for B2B SaaS — 59 specialist agents, one orchestrator, real playbooks.**

Install a full B2B SaaS marketing org into Claude Code: 59 role-based agent personas, packaged as **13 skills**, coordinated by the **CATALYST** multi-agent orchestrator — with worked ABM, launch & demand-gen workflows and an actively-maintained **AEO/GEO** playbook for the AI-search era.

[![Stars](https://img.shields.io/github/stars/shalintripathi/saas-marketing-agents?style=social)](https://github.com/shalintripathi/saas-marketing-agents/stargazers)
[![License: MIT](https://img.shields.io/github/license/shalintripathi/saas-marketing-agents)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/shalintripathi/saas-marketing-agents)](https://github.com/shalintripathi/saas-marketing-agents/commits)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://makeapullrequest.com)
[![Agents](https://img.shields.io/badge/agents-59-blue)](AGENTS_INDEX.md)
[![Skills](https://img.shields.io/badge/Claude%20skills-13-8A2BE2)](plugins/saas-marketing)
[![Built for Claude Code](https://img.shields.io/badge/built%20for-Claude%20Code-D97757)](https://claude.com/claude-code)

[Quick start](#-quick-start) · [The 59 agents](#-the-team-59-agents) · [Skills](#-skills) · [CATALYST](#️-catalyst-orchestrator) · [Loops](#-marketing-loops) · [AEO/GEO](#-built-for-ai-search-aeogeo) · [Contributing](#-contributing)

</div>

---

## What this is

Most "marketing prompt" collections are a flat grab-bag: you get 50 clever prompts, but **you're still the manager** — deciding which to run, in what order, and how the outputs fit together.

This is the opposite. It's a marketing team shaped like a real **B2B SaaS marketing org** — 59 specialist agents with defined roles and hand-offs, plus an orchestrator that turns one brief into assigned sub-tasks. You brief the team; it routes the work.

- 🧑‍💼 **59 role-based agents** across 11 disciplines — content, SEO/AEO, paid media, social, email, design, sales enablement, product marketing, analytics, project management, and client ops — coordinated by the CATALYST orchestrator.
- 🎛️ **CATALYST orchestrator** — coordinates the specialists for large, multi-channel initiatives.
- 🔁 **Worked workflows & loops** — ABM, product launch, demand gen, and a weekly content engine you can actually run.
- 🤖 **AI-search native** — a sourced [AEO/GEO playbook](guides/aeo-geo-playbook.md) we maintain, so your content gets *cited* by ChatGPT, Perplexity, Google AI Overviews, and Copilot.
- 🧩 **Runs anywhere** — installable as a Claude Code plugin, or copy the plain-Markdown agents into Cursor, Copilot, Aider, or Windsurf.

---

## ⚡ Quick start

### Install as a Claude Code plugin (recommended)

```
/plugin marketplace add shalintripathi/saas-marketing-agents
/plugin install saas-marketing@saas-marketing-agents
```

That's it — the 13 skills load as `/saas-marketing:<skill>` (e.g. `/saas-marketing:seo-growth`, `/saas-marketing:catalyst-orchestrator`). Then just describe what you need:

> "Plan a product-launch campaign for [feature] targeting [ICP]."

The orchestrator routes positioning to product marketing, assets to content & design, distribution to social/email/paid, and measurement to analytics.

### Or use the files directly

Every agent is plain Markdown, so it works in any AI tool:

```bash
git clone https://github.com/shalintripathi/saas-marketing-agents.git
cd saas-marketing-agents

# Claude Code / Cursor / Copilot / Aider / Windsurf — reference an agent file:
#   content/content-blog-strategist.md
#   seo/seo-ai-search-optimizer.md

# Or install the skills locally without the marketplace:
./scripts/install.sh --tool cowork
```

See the [Integrations Guide](integrations/README.md) for tool-by-tool setup.

---

## 📋 The team (59 specialist agents)

| Discipline | Count | What they do |
|-----------|-------|--------------|
| **Content Marketing** | 7 | Blog, case study, whitepaper, newsletter, copywriting, video scripts, thought leadership |
| **SEO & Organic Growth** | 6 | Keyword strategy, technical SEO, link building, **AI/AEO/GEO**, local & international |
| **Paid Media** | 6 | PPC, creative strategy, budget optimization, programmatic, attribution, social ads |
| **Social Media** | 6 | LinkedIn, YouTube, Reddit, Twitter/X, community, influencer partnerships |
| **Email Marketing** | 5 | Lifecycle, copywriting, automation, deliverability, newsletter growth |
| **Design** | 5 | Landing pages, brand identity, presentations, visual content, ad creative |
| **Sales Enablement** | 6 | Outbound, discovery, battle cards, proposals, pipeline, enablement content |
| **Product Marketing** | 5 | Positioning, messaging, launch, competitive intel, customer advocacy |
| **Analytics** | 5 | CRO, customer insights, data storytelling, marketing ops, performance |
| **Project Management** | 4 | Campaign coordination, resource allocation, scrum, client success |
| **Client Operations** | 4 | Reporting, QA, legal/compliance, financial tracking |

_These 11 disciplines hold all 59 specialist agents. On top sits the **[CATALYST orchestrator](#️-catalyst-orchestrator)**, which coordinates them._

**→ Full [Agent Index](AGENTS_INDEX.md)** with every agent's role and when to use it.

---

## 🧩 Skills

The agents are grouped into **13 installable skills**, each triggered by natural language:

| Skill | Agents | Triggers on |
|-------|--------|-------------|
| **CATALYST Orchestrator** | all 59 | "GTM launch", "campaign plan", "marketing strategy" |
| **SaaS Marketing Suite** (router) | — | "help with marketing", "what can you do" |
| **Content Marketing** | 7 | "blog", "case study", "whitepaper", "newsletter" |
| **SEO Growth** | 6 | "SEO audit", "keyword research", "AEO", "link building" |
| **Paid Media Ops** | 6 | "Google Ads", "LinkedIn Ads", "ROAS", "attribution" |
| **Social Media Ops** | 6 | "LinkedIn strategy", "YouTube", "community" |
| **Email Marketing Ops** | 5 | "email sequence", "nurture", "deliverability" |
| **Design Ops** | 5 | "landing page", "brand identity", "ad creative" |
| **Sales Enablement** | 6 | "outbound", "battle card", "proposal", "MEDDPICC" |
| **Product Marketing Ops** | 5 | "positioning", "product launch", "competitive intel" |
| **Marketing Analytics** | 5 | "CRO", "A/B testing", "dashboards", "attribution" |
| **Marketing Project Mgmt** | 4 | "sprint planning", "resource allocation", "QBR" |
| **Client Operations** | 4 | "client reporting", "QA", "compliance", "budget" |

Skill sources live in [`plugins/saas-marketing/skills/`](plugins/saas-marketing/skills).

---

## 🎛️ CATALYST orchestrator

**CATALYST** is the coordination layer that runs a multi-agent campaign end to end:

**C**oordination · **A**nalysis · **T**argeting · **A**daptation · **L**everaging · **Y**ield · **S**trategy · **T**eamwork

Instead of prompting each specialist by hand, you give CATALYST a brief and it decomposes the work, assigns specialists, and manages the hand-offs. See the [Workflow Guide](WORKFLOW_GUIDE.md) and the [phased playbooks](strategy/playbooks/).

---

## 🔁 Marketing loops

Workflows are one-shot; **loops repeat**. The [`loops/`](loops/README.md) library holds recurring, agent-run workflows on a cadence:

- **[Weekly Content Engine](loops/weekly-content-engine-loop.md)** — every week, ship one publish-ready, AEO/GEO-optimized asset + its distribution plan, with zero manual coordination.
- _Monthly ABM, quarterly launch, and weekly competitive-intel loops are on the [roadmap](ROADMAP.md)._

---

## 📚 Example workflows

Full worked campaigns live in [`examples/`](examples/README.md):

- [Product launch](examples/workflow-product-launch.md) · [ABM campaign](examples/workflow-abm-campaign.md) · [Demand-gen campaign](examples/workflow-demand-gen-campaign.md) · [Content engine](examples/workflow-content-engine.md)

---

## 🔎 Built for AI search (AEO/GEO)

Buyers increasingly ask an AI engine instead of clicking ten links — so the vendors an engine *cites* shape the shortlist. The **[AEO/GEO Playbook](guides/aeo-geo-playbook.md)** is a sourced, practitioner-grade guide to getting cited by ChatGPT, Perplexity, Google AI Overviews, and Copilot: what measurably works (quotations, statistics, cited sources), how each engine differs, and what *not* to do. It's a **living document** we intend to keep current as the answer engines change.

---

## 🤝 Contributing

Contributions are welcome — new agents, better agents, new loops, and freshness fixes. See [CONTRIBUTING.md](CONTRIBUTING.md), the [ROADMAP](ROADMAP.md), and the [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md). Good first contributions are listed in the [maintenance backlog](maintenance/backlog.md).

---

## ⭐ Star this repo

If this saves you time, a star genuinely helps other marketers find it — and it's the signal that tells us which parts to invest in next. Thank you.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and distribute.

<div align="center">

Built by [**Shivaa Tripathi**](https://github.com/shalintripathi) · [Report an issue](https://github.com/shalintripathi/saas-marketing-agents/issues) · [Changelog](CHANGELOG.md)

</div>
