# Maintenance Routine

This is the instruction set an automated agent (or a human) follows on each scheduled run to keep this repository fresh, correct, and growing toward the [North Star](../ROADMAP.md). One run = one small, high-quality improvement. **Quality over cadence: a run that has nothing genuinely useful to do must do nothing and say so — never pad with empty or trivial commits.**

## Each run, in order

1. **Health check (fast).**
   - Broken internal links in Markdown docs (referenced `*.md` paths that don't exist).
   - Staleness: any guide/playbook whose "Last reviewed" date is > 90 days old.
   - Manifests still valid: `.claude-plugin/marketplace.json` and every `plugins/*/.claude-plugin/plugin.json` parse and keep required fields; every skill has a `SKILL.md` with `name` + `description`.
   - Agent lint passes: `bash scripts/lint-agents.sh <changed agent files>`.
   - Record findings. If any P0 (broken link, invalid manifest, lint failure) exists, **fix that first** this run.

2. **Pull the next backlog item.** Take the highest-priority unblocked item from [`backlog.md`](backlog.md). Do that one item well. Don't start three.

3. **Freshness pass (when the backlog is quiet).** Re-check the [AEO/GEO Playbook](../guides/aeo-geo-playbook.md) and the `seo-ai-search-optimizer` agent against current Google/Bing guidance and recent GEO research. Update effect sizes, engine behavior, and the "Last reviewed" date only if something genuinely changed. Cite sources; flag contested claims.

4. **Verify before claiming done.** Re-run the relevant health check on what you changed. If you edited an agent that exists in both `<category>/` and `plugins/saas-marketing/skills/`, update **both** copies.

5. **Log + commit.**
   - Append a dated entry to [`RUN_LOG.md`](RUN_LOG.md): what you did, what you checked, what you deferred.
   - Add a bullet to the `## [Unreleased]` section of [`CHANGELOG.md`](../CHANGELOG.md) if the change is user-facing.
   - Commit with a clear, scoped message. Push to `main`.

6. **Notify.** Send a short push notification summarizing the run (item shipped + anything that needs a human).

## Hard guardrails

- **Never commit personal or sensitive information** — no emails, keys, tokens, private notes, analytics data, or anything specific to the maintainer's other projects. Public author attribution only.
- **No fabricated metrics or testimonials.** Cite real sources; flag contested claims.
- **No empty/padding commits.** No work → no commit.
- **Do not post to social/forums or submit to third parties** beyond the pre-approved awesome-lists in [`backlog.md`](backlog.md). Social launch posts are drafted for human approval, never auto-posted.
- **Keep runs small.** One backlog item or one freshness fix per run. Large changes get proposed in an issue first.
- **Respect the lint schema and existing file conventions.**

## Promotion cadence (separate track)

On the promotion-focused runs: refresh awesome-list submissions only if a listing was accepted/rejected or a new legitimately-fitting list appears; keep the badge counts and index tables in the README accurate; never ask for stars/upvotes anywhere.
