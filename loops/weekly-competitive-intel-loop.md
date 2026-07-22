# Weekly Competitive Intel Loop

**Cadence:** Weekly (e.g., every Thursday, so the digest lands before the sales week ends)
**Owner agent:** CATALYST orchestrator
**Goal:** Every week, sweep a fixed competitor watchlist for what actually *changed*, separate signal from noise, and update only the messaging and battle cards the change genuinely invalidates — so sales never hears a competitive move from a prospect first.

This is the fast, narrow counterpart to the quarterly deep-dive work the [`pmm-competitive-intelligence`](../product-marketing/pmm-competitive-intelligence.md) agent does on its own. That agent builds full competitor dossiers, win/loss analysis, and positioning maps. **This loop does one thing weekly: detect change and route it.** The deep profiles stay quarterly; the diff is weekly.

> **Most weeks, the correct output of this loop is "nothing material moved."** A loop that manufactures a finding every week trains sales to ignore it. Quiet weeks are a feature — log them and stop.

---

## Step 0 (always first): Load brand context

Read `brand-context.md` from the project root (or `./.claude/brand-context.md`, `./docs/brand-context.md`) and pass it to every specialist in the loop. If it doesn't exist, point the user at [`templates/brand-context.md`](../templates/brand-context.md) and proceed with explicitly-labelled assumptions. The competitor list and your own positioning both live there — this loop is close to useless without them.

**Competitive research is the highest-risk step in this loop for fabrication.** Competitor pricing, funding rounds, customer counts, roadmap items, headcount, and "recently launched" features are all things an agent can invent fluently and plausibly. **Every claim in this loop's output must carry the URL of a page the agent actually read, with the date it was read.** Anything unsourced is written as a `[NEEDS INPUT: …]` marker, never as a fact. A battle card built on an invented competitor feature loses a deal the moment a prospect corrects your rep.

**Ethical boundary (non-negotiable).** Use public sources only: public pricing and product pages, published docs and changelogs, press releases and filings, public job posts, public review sites, and social/community posts. Do **not** misrepresent identity to obtain a demo or trial, access anything behind a login you aren't entitled to, solicit confidential information from a competitor's employees or customers, or ask a customer to share anything covered by an NDA. When a source's terms of use are unclear, treat that as a stop and escalate — `ops-legal-compliance` is the right agent to rule on it.

---

## Inputs

- **The watchlist** from last week's run (on the first run, the competitor set from `brand-context.md` instead)
- **Last week's snapshot** — the state each source was in when you last looked, which is what makes a diff possible
- **This week's ground truth from the field** — competitor mentions in sales calls, lost-deal reasons, support tickets, community threads
- **Your own changes** — anything you shipped or announced that changes the comparison

## The watchlist (the loop's memory)

One row per competitor, carried forward and updated every run. Keep it wherever you keep working docs — `competitor-watchlist.md`, a sheet, or your CI tool. Step 1 reads it; Step 7 rewrites it.

| Field | Why it's there |
|-------|----------------|
| Competitor | — |
| Tier (primary / secondary / emerging) | Decides how much attention it earns each week |
| Sources watched (URLs) | The diff is only as good as the source list; stale URLs are the top cause of silent misses |
| Last checked | Distinguishes "nothing changed" from "nobody looked" |
| Changes detected this week | With source URL + date read, or it doesn't go in |
| Severity (watch / notify / act) | The triage verdict from Step 4 |
| Field corroboration | Has this shown up in a real deal yet? |
| Battle card version + last updated | Ties intel to the artifact it should have changed |
| Open question + owner | Nothing sits in the watchlist without an owner |

**Tiers, plainly:** *Primary* = you meet them in deals regularly; check every source, every week. *Secondary* = occasional, or strong in one segment; check pricing, product, and positioning weekly, the rest monthly. *Emerging* = not in deals yet but moving fast; check funding, hiring, and launches only. Competitors move between tiers on deal frequency, not on how loudly they market.

## The loop

| # | Agent | Does | Hands off |
|---|-------|------|-----------|
| 1 | `pmm-competitive-intelligence` | Sweeps each watchlist source and **diffs against last week's snapshot**: pricing/packaging pages, product and changelog pages, homepage positioning, funding and press, public job posts, review-site sentiment. Records only what changed, each with source URL + date read | Raw change list + fresh snapshot |
| 2 | `seo-keyword-researcher` | Sweeps the search surface: new competitor pages ranking on your target terms, keywords they gained or lost, content they started publishing that you don't cover | Search-movement list |
| 3 | `seo-ai-search-optimizer` | Sweeps the answer-engine surface: which competitors get cited on your priority questions and which of those citations are new this week — the leading indicator that a positioning shift is landing | AI-citation share + deltas |
| 4 | `pmm-positioning-strategist` | **The triage gate.** Scores each detected change against your actual positioning and assigns severity — most changes are `watch`. Nothing proceeds past here without a severity and a stated reason | Triaged change list |
| 5 | `pmm-messaging-architect` | For `act` items only: updates the counter-narrative and comparison messaging. Honest framing required — where a competitor's move is genuinely better, say so and adjust positioning rather than spinning it | Messaging deltas |
| 6 | `sales-enablement-content-creator` + `sales-discovery-coach` (add `design-content-visual-designer` only when an asset ships externally) | Turns messaging deltas into **battle-card diffs** — what changed, what to say now, what to stop saying — plus the discovery questions that surface the new objection early | Updated battle cards + objection handling |
| 7 | `sales-pipeline-analyst`, then `pm-campaign-coordinator` | Corroborates the week's intel against real deals (is this showing up in losses, or only on the competitor's website?), then writes the weekly digest: what moved, what's now `act`, what was dismissed and why, owners and dates | Weekly digest + updated watchlist |

Steps 1–3 run in parallel — three independent sweeps of three different surfaces. Step 4 must wait for all three: triaging a pricing change without knowing whether their search and AI-citation footprint moved too is how a coordinated repositioning gets logged as three unrelated `watch` items.

## The triage gate (Step 4)

Severity is assigned, never assumed. The default is `watch`.

| Severity | What qualifies | What happens |
|---|---|---|
| **Watch** | Anything changed but nothing in your positioning is invalidated — a blog cadence shift, a homepage word swap, a routine hire | Logged in the watchlist. No downstream work. Most items land here. |
| **Notify** | A change a rep could plausibly meet in a live deal within the quarter — a new integration, a pricing-page tier rename, a review-sentiment shift on a theme you compete on | Named in the digest with a one-line "if it comes up, say this." No battle-card rewrite yet. |
| **Act** | A change that makes something you currently claim inaccurate, or that directly attacks a differentiator — a real pricing-model change, a launch that closes a gap you sell against, an explicit competitive campaign aimed at you | Proceeds to Steps 5–6 this week. Battle cards get versioned. |

Two rules keep this gate honest: **a single source is enough to log, but not to `act`** — an `act` item needs either a second independent source or field corroboration; and **your own shipped changes are triaged too**, because your battle card can go stale from your side of the comparison just as easily.

## Outputs

- An **updated watchlist + snapshot** — the input to next week's run
- A **weekly digest**: what moved, severity, what was dismissed and why (the dismissals matter — they're what makes the digest trustworthy)
- **Battle-card diffs** for `act` items only, versioned so a rep can see what changed since they last read it
- A short list of **decisions needing a human** — usually pricing responses and roadmap implications

## Handoff rule

Each step receives only the previous step's structured output plus the watchlist and brand context — not the whole thread. The watchlist and last week's snapshot are the shared state; the conversation is not.

## Weekly checklist (what "done" looks like)

- [ ] Every watchlist row has a `last checked` date from this run — including the rows where nothing changed
- [ ] Every claim carries a source URL and the date the page was read
- [ ] No claim sourced from behind a login, a misrepresented trial, or an NDA-covered conversation
- [ ] Every detected change has a severity and a stated reason
- [ ] Every `act` item has a second source or field corroboration before any battle card changes
- [ ] Battle cards touched this week are versioned, with a "what changed" line at the top
- [ ] Where a competitor is genuinely better, the messaging says so plainly rather than spinning it
- [ ] Dismissed items are recorded with the reason, not silently dropped
- [ ] Quiet week? The digest says "nothing material moved" and the loop stops — no manufactured findings

## Measuring it

The point of this loop is *detection lead time*, not volume. Track:

- **Surprise rate** — competitive moves sales learned about from a prospect instead of from this digest. The primary metric; target is zero, and it's the only one worth reporting upward.
- **Detection lead time** — days between a competitor's public change and it appearing in a digest
- **Corroboration rate** — share of `act` items later confirmed in a real deal. Low corroboration means the triage gate is too loose.
- **False-alarm rate** — `act` items that were downgraded later. Some is healthy; a lot means Step 4 is guessing.
- **Battle-card freshness** — days since each primary competitor's card was last verified against a live source
- **Source coverage decay** — watchlist URLs that 404 or moved. This is the silent failure mode: the loop keeps reporting "no change" from a page that no longer exists.

Win rate by competitor is the outcome that matters, but it moves on a deal-cycle timescale — read it quarterly, never weekly.

## Run it

```
"Run the weekly competitive intel loop.
 Watchlist: [path to competitor-watchlist.md, or 'first run' + competitor list].
 Last snapshot: [path, or 'none'].
 Field input this week: [call notes / lost-deal reasons / support themes].
 Our changes since last run: [what you shipped or announced]."
```

The orchestrator runs steps 1–7 and returns the digest, the battle-card diffs, and the updated watchlist. Re-running with the same week and snapshot is a no-op — it will not re-report changes already triaged this cycle.

## Where this loop goes wrong

- **Manufacturing a finding every week.** The fastest way to make sales stop reading the digest. Quiet weeks are real weeks.
- **Unsourced competitor claims.** See Step 0. A rep repeating an invented competitor fact loses credibility for every true thing they say next.
- **Crossing the ethical line for better intel.** Fake trial signups and NDA-fishing are not a research technique; they're a legal and reputational liability that outlives any deal they win.
- **A watchlist nobody prunes.** Dead URLs report "no change" forever. Re-verify source URLs on a schedule, not just their contents.
- **Skipping the triage gate under pressure.** Every competitor announcement feels urgent on the day it lands. Severity is what stops the loop from rewriting battle cards weekly.
- **Only ever looking outward.** Your own launches change the comparison too — triage them in the same pass.
- **Confusing this loop with the quarterly deep dive.** Weekly detects change. Quarterly rebuilds understanding. Neither substitutes for the other.
