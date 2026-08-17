# Monthly ABM Loop

**Cadence:** Monthly (e.g., first working week of each month)
**Owner agent:** CATALYST orchestrator, with [`abm-account-based-strategist`](../abm/abm-account-based-strategist.md) owning the account list, the tiers, and the scoreboard throughout
**Goal:** Every month, re-score your target accounts, refresh tiered messaging for the ones that moved, ship the next multi-channel touch, and retire what isn't working — so account coverage compounds instead of restarting each quarter.

This is the recurring counterpart to the one-shot [ABM campaign workflow](../examples/workflow-abm-campaign.md). That workflow stands a program up from zero over 3–4 weeks. **This loop is what you run forever after.** The difference that matters: this loop carries a persistent **account ledger** from month to month, so each run starts from what the last run learned rather than from a blank target list.

> ABM is a slow loop by nature. Most B2B buying cycles are longer than one cycle of this loop, so judge it on account *progression* between runs, not on closed revenue inside a single run.

---

## Step 0 (always first): Load brand context

Read `brand-context.md` from the project root (or `./.claude/brand-context.md`, `./docs/brand-context.md`) and pass it to every specialist in the loop. If it doesn't exist, point the user at [`templates/brand-context.md`](../templates/brand-context.md) and proceed with explicitly-labelled assumptions.

**Account research is the highest-risk step in this loop for fabrication.** Firmographics, funding, headcount, tech stack, named contacts, and "recent initiatives" are all things an agent can invent fluently. Anything not sourced from a document the user supplied, a tool result, or a live page the agent actually read must be written as a `[NEEDS INPUT: …]` marker — never as a plausible-sounding fact. A wrong detail in a personalized outbound email is worse than a missing one.

---

## Inputs

- **The account ledger** from last month's run (on the first run, the seed target list instead)
- **Any new intent / engagement data** you have: site visits, content downloads, ad engagement, inbound replies, sales-call notes, CRM stage changes
- **Capacity** — how many accounts your sales side can genuinely work this month (this is the real constraint; set it before you select)
- **New-account candidates** — anything the last month surfaced as worth adding

## The account ledger (the loop's memory)

One row per account, carried forward and updated every run. Keep it wherever you keep working docs — `abm-ledger.md`, a sheet, or your CRM. The loop reads it at Step 1 and rewrites it at Step 6.

| Field | Why it's there |
|-------|----------------|
| Account | — |
| Tier (1 / 2 / 3) | Drives how much personalization the account earns this month |
| Entered ledger | Distinguishes "not working" from "not yet" |
| Buying-committee contacts known | Coverage of the committee, not just one champion |
| Last touch (channel + date) | Prevents both silence and over-touching |
| Engagement signals this cycle | The evidence behind a tier change |
| Stage | Unaware → Aware → Engaged → In pipeline → Closed / Retired |
| Change vs last cycle | The single most useful column — this is what you review |
| Next action + owner | Nothing sits in the ledger without an owner |

**Tiers, plainly:** Tier 1 = one-to-one, individually researched and individually written. Tier 2 = one-to-few, a cluster sharing an industry or use case gets shared messaging with light personalization. Tier 3 = one-to-many, programmatic coverage. Accounts move between tiers based on engagement, not on how much you like the logo.

## The loop

| # | Agent | Does | Hands off |
|---|-------|------|-----------|
| 1 | `abm-account-based-strategist` (with `pmm-competitive-intelligence` for competitor and account news) | Re-scores the ledger against new signals and researched account news; proposes tier promotions, demotions, additions, retirements — each with the evidence behind it, and re-checks the list against current sales capacity before anything is promoted | Scored account list + proposed tier changes |
| 2 | `analytics-customer-insights-researcher` | For accounts that moved up, maps the buying committee: who else must be reached, what each role is measured on, which are still uncovered | Committee + coverage gaps per account |
| 3 | `pmm-messaging-architect` (with `pmm-positioning-strategist` on new Tier 1s) | Refreshes messaging per tier: one-to-one angles for Tier 1, cluster messaging for Tier 2, segment messaging for Tier 3 — reusing last month's winners, retiring what got no response | Tiered message set for this cycle |
| 4 | `sales-enablement-content-creator` (+ `design-content-visual-designer` when an asset needs to look finished) | Produces only the assets this month's touches actually need — not a full library. Reuses existing assets wherever the message didn't change | This cycle's asset set |
| 5 | `sales-outbound-strategist`, then `email-copywriter` + `email-automation-engineer`, `social-linkedin-strategist`, `paid-media-social-ads-specialist` | Sequences the month's multi-channel touches per tier and builds them: email steps, LinkedIn engagement, ad audiences refreshed against the current ledger. Suppression rules first — accounts already in an active sales conversation get handed to sales, not sequenced | Scheduled monthly touch plan per tier |
| 6 | `abm-account-based-strategist` (scoreboard + credit rule) with `sales-pipeline-analyst` + `analytics-performance-analyst` | Measures the cycle against the *previous* ledger: which accounts progressed a stage, which channels produced first contact, which messages got replies, which accounts have gone quiet long enough to retire | Updated ledger + this cycle's read-out |
| 7 | `pm-campaign-coordinator` | Turns the read-out into next month's inputs: owners, dates, and the shortlist of decisions a human has to make | Next cycle's brief |

Steps 2–4 can run in parallel across tiers once Step 1 has settled the tier list. Step 5 must wait for all of them — a touch plan built on stale messaging is the most common way this loop degrades.

## Outputs

- An **updated account ledger** — the input to next month's run
- A **scheduled monthly touch plan** per tier (email, LinkedIn, paid, sales)
- Only the **assets this cycle needs**, plus the retirement list for assets that stopped earning attention
- A **one-page read-out**: what moved, what stalled, what got retired, and the decisions needing a human

## Handoff rule

Each step receives only the previous step's structured output plus the ledger and brand context — not the whole thread. The ledger is the shared state; the conversation is not.

## Monthly checklist (what "done" looks like)

- [ ] Every ledger row has a tier, a stage, and a change-vs-last-cycle value
- [ ] Every tier change cites the signal that caused it
- [ ] Every account fact used in personalization is sourced, or marked `[NEEDS INPUT: …]`
- [ ] Accounts in active sales conversations are suppressed from automated sequencing
- [ ] Selected account count is within stated sales capacity
- [ ] At least one account was retired or demoted (if nothing ever leaves, the list isn't being worked)
- [ ] Buying-committee coverage recorded per Tier 1 account, not just a single contact
- [ ] Ad audiences and suppression lists rebuilt from the current ledger, not last month's
- [ ] Read-out names the decisions a human must make before the next run

## Measuring it

Track these **per account**, not just in aggregate — aggregate averages hide the fact that ABM outcomes are concentrated in a handful of accounts:

- **Account progression** — accounts that advanced a stage this cycle (the primary metric for this loop)
- **Committee coverage** — contacts reached per account vs contacts the committee actually requires
- **Time in stage** — how long accounts sit before moving; rising time-in-stage is the earliest signal a program is stalling
- **First-touch channel** — which channel produced the first real reply per account
- **Message resonance** — reply rate per message angle, so Step 3 retires losers on evidence

Set your own baselines from your first three cycles and compare against those. Published ABM benchmarks vary enormously with deal size, category, and list quality; treat any external number as directional at best.

## Run it

```
"Run the monthly ABM loop.
 Ledger: [path to abm-ledger.md, or 'first run' + seed account list].
 New signals: [intent data / engagement / CRM changes].
 Sales capacity this month: [N accounts].
 Channels: [email, LinkedIn, paid, ...]."
```

The orchestrator runs steps 1–7 and returns the updated ledger, the touch plan, and the read-out. Re-running with the same month and ledger is a no-op — it will not re-sequence accounts already touched this cycle.

## Where this loop goes wrong

- **The ledger never shrinks.** Adding accounts every month without retiring any turns Tier 1 into Tier 3 with extra steps.
- **Selecting past capacity.** Ten accounts worked properly beat fifty worked nominally; the constraint is sales attention, not agent throughput.
- **Personalization built on invented detail.** See Step 0. A confidently wrong fact about someone's own company ends the conversation.
- **Sequencing over live sales conversations.** Suppression rules are not optional.
- **Judging a single cycle.** One month is shorter than most buying cycles — read the trend across cycles.
