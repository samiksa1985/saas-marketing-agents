# Weekly Content Engine Loop

**Cadence:** Weekly (e.g., every Monday)
**Owner agent:** CATALYST orchestrator
**Goal:** Every week, ship one publish-ready, AEO/GEO-optimized content asset and the plan to distribute it — with zero manual coordination between specialists.

This loop turns a topic into a finished, cited, distribution-ready asset by routing work through six specialists in sequence. It bakes in the [AEO/GEO Playbook](../guides/aeo-geo-playbook.md) so the output is built to be *cited by AI engines*, not just to rank.

---

## Step 0 (always first): Load brand context

Read `brand-context.md` from the project root (or `./.claude/brand-context.md`, `./docs/brand-context.md`) and pass it to every specialist in the loop. If it doesn't exist, point the user at [`templates/brand-context.md`](../templates/brand-context.md) and proceed with explicitly-labelled assumptions. The ICP, messaging pillars, voice rules, and banned words all live there — without them this loop produces competent writing about the wrong reader.

**Citations are the highest-risk step in this loop for fabrication.** This loop actively rewards cited statistics and direct quotations, because they are among the strongest levers for getting an asset cited by AI engines — which makes it the exact place an agent will invent a plausible number, attribute a quote to a real analyst who never said it, or link to a source that doesn't say what the sentence claims. **Every statistic and quotation must come from a page the agent actually read, and carry the source name, the URL, and the date of the underlying data.** Anything unsourced is written as a `[NEEDS INPUT: …]` marker, never as a fact. The same applies to your own proof: customer names, metrics, integrations, and certifications may only be asserted if they are recorded in `brand-context.md`.

A fabricated statistic is worse here than anywhere else in this repo, because this loop is designed to make content *quotable* — and a published fake number gets picked up and repeated with your name on it.

---

## Inputs

- **Topic focus** for the week (or "auto" — let the strategist pick from the content gap list)
- **ICP / audience** (buyer persona, stage)
- **Primary keyword / question** the asset should own
- **Channels** you distribute on (blog, LinkedIn, newsletter, YouTube, etc.)

## The loop

| # | Agent | Does | Hands off |
|---|-------|------|-----------|
| 1 | `seo-keyword-researcher` | Confirms the target question, search intent, and related entities; checks it's not already covered | Keyword + entity brief |
| 2 | `content-blog-strategist` | Turns the brief into an outline with an **answer-first** opening and Q&A structure | Content outline |
| 3 | `content-copywriter` | Drafts the asset with **cited statistics, direct quotations, and outbound source links** (the strongest GEO levers) and a named author byline | Draft + citation list |
| 4 | `seo-ai-search-optimizer` | Optimizes for AI citation: answer block in first ~150 words, entity coverage, `Article`/`Person` JSON-LD, freshness date | AEO/GEO-ready asset + schema |
| 5 | `seo-content-optimizer` | Final on-page pass: headings, internal links, meta, readability | Publish-ready asset |
| 6 | `social-*` + `email-newsletter-*` | Produces the distribution plan: LinkedIn post, newsletter blurb, and (optionally) a YouTube/short angle — the off-page signals that most correlate with AI visibility | Weekly distribution kit |

## Outputs

- One **publish-ready asset** (answer-first, cited, schema-tagged, dated)
- A **distribution kit** (per-channel copy)
- An updated **content gap list** so next week's run doesn't repeat this topic

## Handoff rule

Each step receives *only* the previous step's structured output plus the original brief and the brand context — not the whole thread. This keeps specialists focused and context-lean (the hand-off discipline that makes multi-agent loops reliable). Brand context is the exception to the context-lean rule: it travels with every step, because voice and proof constraints apply just as much to the distribution copy in step 6 as to the draft in step 3.

## Weekly checklist (what "done" looks like)

- [ ] Opens with a self-contained 40–60 word answer
- [ ] Contains ≥2 cited statistics and ≥1 credible quotation
- [ ] Every statistic and quotation names its source, links to it, and dates the underlying data — and the linked page actually says what the sentence claims
- [ ] No `[NEEDS INPUT: …]` markers survive into the published version
- [ ] Has ≥3 outbound links to authoritative sources
- [ ] Named author byline + `Person` JSON-LD
- [ ] Dated, with a genuine ~90-day refresh reminder set
- [ ] Distribution kit covers at least one off-page signal (Reddit/YouTube/LinkedIn)

## Run it

```
"Run the weekly content engine loop.
 Topic: [topic or 'auto'].
 ICP: [persona].
 Primary question: [question].
 Channels: [list]."
```

The orchestrator will execute steps 1–6 and return the asset + distribution kit. Re-running with the same week and topic is a no-op.
