# Run Log

Append-only log of every maintenance run. Newest first. Each entry: date, what shipped, what was checked, what was deferred. See [ROUTINE.md](ROUTINE.md) for the process.

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
