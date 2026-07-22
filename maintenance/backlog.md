# Maintenance Backlog

Prioritized queue for the [maintenance routine](ROUTINE.md). Each run pulls the top unblocked item. `P0` = correctness/health (do first). `P1` = high-leverage growth. `P2` = nice-to-have. Mark items `[x]` when done and note the date; keep this list honest.

## P0 — correctness & health (always first if present)
- [ ] (none open — health checks pass as of 2026-07-21)

## P1 — high-leverage
- [x] Add `brand-context.md` template + wire the CATALYST orchestrator to read it first, so agent output is tailored to a user's ICP/product/voice. — done 2026-07-21 (`templates/brand-context.md`; orchestrator Step 0).
- [x] Wire the 12 category skills to read `brand-context.md` too, so invoking a category skill directly (e.g. `/saas-marketing:content-marketing`) is as tailored as going through CATALYST. — done 2026-07-22 (Step 0 block in all 13 `SKILL.md` files).
- [x] Add a monthly ABM loop to `loops/` (account selection → tiered messaging → multi-channel sequencing → measurement). — done 2026-07-22 (`loops/monthly-abm-loop.md`; persistent account ledger carries state between runs).
- [x] Add a weekly competitive-intel loop to `loops/`. — done 2026-07-22 (`loops/weekly-competitive-intel-loop.md`; watchlist + snapshot carry state, severity triage gate, public-sources-only boundary).
- [ ] Add the Step 0 brand-context block to `loops/weekly-content-engine-loop.md` (it predates the template; the monthly ABM loop has one).
- [ ] Expose the 59 personas as native Claude Code subagents under `plugins/saas-marketing/agents/` (convert frontmatter to subagent format; keep skill-referenced copies working).
- [ ] Add a 60–90s demo GIF/asset for the README hero (orchestrator taking one brief and routing it).
- [ ] Verify install flow end-to-end for Cursor, Copilot, Aider, Windsurf; correct any drift in `integrations/README.md`.

## P1 — distribution (pre-approved lists only; follow each list's exact rules)
- [x] ~~Submit to `langgptai/awesome-claude-prompts`~~ — assessed 2026-07-21: it's a single-prompt library, not a repo-link list; not a clean fit, skipped.
- [x] Submit to `jmedia65/awesome-ai-marketing` — done 2026-07-21 ([PR #20](https://github.com/jmedia65/awesome-ai-marketing/pull/20)).
- [ ] Prepare + submit to `hesreallyhim/awesome-claude-code` (ISSUE form, human-written, no sales language) — only once README + install are polished.
- [ ] Prepare + submit to `VoltAgent/awesome-agent-skills` (PR, marketing category; lead with genuine usage).
- [ ] Submit the plugin to the Anthropic community marketplace (`anthropics/claude-plugins-community`) via the in-app form; run `claude plugin validate` first.
- [ ] Revisit `kyrolabs/awesome-agents` and `sindresorhus/awesome` once the repo has ≥40 stars and 30+ days of history.

## P2 — later
- [ ] Add a golden input/output example per agent.
- [ ] GitHub Pages catalog with copy-to-clipboard for all 59 agents.
- [ ] MCP tool recipes (GA4, GSC, HubSpot, Ahrefs) to move agents from advisory to executable.
- [ ] Evaluation harness: rubrics + regression checks for agent output.
- [ ] De-duplicate agent sources (single source of truth; generate the browseable and installable copies).

## Notes
- Social launch posts live in the maintainer's private launch kit and are **posted by a human**, never automated.
- Keep the README badge counts (agents: 59, skills: 13) and the agent index in sync when agents are added.
