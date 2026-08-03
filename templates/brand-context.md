# Brand Context

> **This is a template.** Copy it to `brand-context.md` in the root of the project or folder you work from, then fill it in. Every agent in this repo reads it before producing anything, so the output sounds like *your* company instead of generic B2B SaaS.
>
> **Fill in what you know; delete what you don't.** A half-filled file is far better than none — agents treat missing sections as "unknown" and will ask rather than invent. Aim for 15 minutes on the first pass, then improve it as you go.
>
> Angle brackets `<like this>` mark placeholders to replace.

---

## Rules for agents reading this file

These are binding on every agent and take precedence over the agent's own defaults:

1. **Never invent facts about this company.** Customer names, revenue, headcount, funding, logos, integrations, certifications, and performance numbers may only be used if they appear below or the user supplies them in the request. If a claim would strengthen the copy but isn't here, leave a `[NEEDS INPUT: …]` marker instead of guessing.
2. **Only use metrics from "Proof we can actually cite."** Anything else is an unsubstantiated claim.
3. **Honor the voice, terminology, and banned-words lists.** These are not suggestions.
4. **Respect "Constraints & compliance"** — regulated claims, required disclaimers, and no-go topics are non-negotiable.
5. **If a section below is empty or still shows placeholders,** ask the user for it before producing final copy, or clearly flag the assumption you made.
6. **When you discover a fact here is wrong, flag it for correction — don't just fix it downstream.** If, mid-task, you or the user find that something in this file is outdated or that a cited proof point no longer holds — a reference customer that churned or pulled logo approval, a metric that was revised, a persona pain that field data contradicts — surface it with a `[CORRECT BRAND CONTEXT: <what to change and why>]` marker, the same way you flag `[NEEDS INPUT: …]`. A correction that lives only in the one deliverable that caught it leaves every other agent still reading the stale fact — including a withdrawn proof point that must stop appearing in public copy. Confirmed corrections get logged in §14.

---

## 1. Company & product

- **Company name:** `<Company>`
- **Website:** `<https://example.com>`
- **What we sell (one sentence, no jargon):** `<e.g. "Session-replay tooling that shows engineers exactly how a bug happened in production.">`
- **Category we compete in:** `<e.g. "observability", "revenue intelligence" — the label a buyer would search for>`
- **Stage & size:** `<e.g. Seed / Series B / bootstrapped; ~N employees>`
- **Pricing model:** `<self-serve tiers / annual contract / usage-based; typical ACV if relevant>`
- **Go-to-market motion:** `<product-led / sales-led / hybrid / channel>`

## 2. Ideal customer profile (ICP)

- **Company type:** `<industry / vertical>`
- **Company size:** `<employees, revenue, or seat count>`
- **Geography:** `<regions you actually sell into>`
- **Technical or operational triggers:** `<what has to be true for us to be a fit — e.g. "runs Kubernetes", "50+ SDRs", "processes payments in the EU">`
- **Who we explicitly do *not* sell to:** `<anti-ICP — the disqualifiers. This one line prevents a lot of off-target copy.>`

## 3. Buyer personas

Add a block per persona. Three is usually enough.

### `<Persona name — e.g. "VP of Engineering">`
- **Role in the deal:** `<economic buyer / champion / end user / blocker>`
- **What they're measured on:** `<their KPIs, in their words>`
- **Top pains, in their language:** `<quote them if you have real voice-of-customer notes>`
- **What makes them skeptical of us:** `<the objection they raise first>`
- **Where they actually spend attention:** `<communities, publications, events, podcasts>`

## 4. Positioning

- **Positioning statement:** For `<target customer>` who `<need or trigger>`, `<Product>` is a `<category>` that `<key benefit>`. Unlike `<primary alternative>`, we `<the differentiator>`.
- **The status quo we replace:** `<spreadsheets / an incumbent tool / an internal script / doing nothing>`
- **Why we win, honestly:** `<the 1–2 things that are genuinely true and hard to copy>`
- **Where we lose, honestly:** `<knowing this keeps copy credible and stops agents overclaiming>`

## 5. Messaging pillars

Three to five. Each needs proof, or it's a slogan.

| # | Pillar | What it means | Proof point |
|---|--------|---------------|-------------|
| 1 | `<pillar>` | `<one line>` | `<verifiable proof — see §6>` |
| 2 | `<pillar>` | `<one line>` | `<verifiable proof>` |
| 3 | `<pillar>` | `<one line>` | `<verifiable proof>` |

## 6. Proof we can actually cite

**Only list things you could defend to a customer or a regulator.** Agents will treat this as the complete set of usable evidence.

- **Named customers we may reference publicly:** `<names + whether logo use is approved>`
- **Metrics & outcomes:** `<e.g. "Cut mean time to resolution from 4h to 40m at <Customer>" — include the source and date>`
- **Case studies / testimonials:** `<links>`
- **Third-party validation:** `<certifications, audits, analyst mentions, review-site ratings — with links>`
- **Under NDA / do not reference:** `<customers or numbers that must never appear in public copy>`

## 7. Competitors

| Competitor | How they position | Where they beat us | Where we beat them | How we talk about them |
|---|---|---|---|---|
| `<name>` | `<their claim>` | `<be honest>` | `<be specific>` | `<e.g. "never name directly" / "direct comparison OK">` |

- **Competitive-messaging policy:** `<Do we name competitors in public content? In sales enablement? Any legal constraints on comparison claims?>`

## 8. Voice & tone

- **We sound:** `<3–5 adjectives — e.g. "direct, technical, dry-humored, never breathless">`
- **We never sound:** `<e.g. "salesy, hype-driven, corporate-formal">`
- **Reading level / register:** `<e.g. "write for a senior engineer; assume domain fluency, don't explain what an API is">`
- **Person & tense:** `<e.g. "second person, present tense; 'you' not 'users'">`
- **Formatting habits:** `<sentence-case headings, Oxford comma, em dashes, short paragraphs, etc.>`
- **Banned words & phrases:** `<e.g. "revolutionary", "seamless", "game-changing", "in today's fast-paced world", "leverage" as a verb>`
- **A short passage that sounds exactly like us:**
  > `<paste 3–5 sentences of real, on-voice copy. This is the single highest-value field in the file — agents pattern-match on it.>`

## 9. Terminology

- **Product & feature names, spelled and capitalized correctly:** `<e.g. "Flightpath (not FlightPath, not the Flightpath product)">`
- **Words we use / words we avoid:** `<e.g. "we say 'workspace', never 'tenant'; we say 'customers', never 'clients'">`
- **How we refer to the company:** `<singular or plural — "Acme is" vs "Acme are"; "we" vs the company name>`

## 10. Constraints & compliance

- **Regulatory context:** `<GDPR, HIPAA, SOC 2, FINRA, FDA — whatever applies>`
- **Claims requiring legal review:** `<e.g. security claims, ROI figures, "#1" or "fastest" superlatives, comparative advertising>`
- **Required disclaimers:** `<exact text and where it must appear>`
- **No-go topics:** `<subjects the brand does not comment on — politics, customer incidents, unreleased roadmap, etc.>`
- **Approval workflow:** `<who signs off on what before publication>`

## 11. Channels & cadence

- **Channels we actually run:** `<blog, LinkedIn, newsletter, YouTube, paid search, paid social, events, community, docs>`
- **Channels we deliberately skip:** `<and why — stops agents proposing them every time>`
- **Publishing cadence:** `<e.g. "2 blog posts/week, 1 newsletter/week, LinkedIn 3x/week">`
- **CTA hierarchy:** `<primary CTA (e.g. "start free trial"), secondary (e.g. "book a demo"), and which content types get which>`

## 12. Current goals

- **This quarter's marketing objective:** `<one sentence>`
- **Primary KPI + target:** `<e.g. "SQLs: 120/quarter">`
- **Secondary KPIs:** `<pipeline sourced, trial-to-paid rate, organic sessions, share of AI citations>`
- **Known problem we're trying to fix:** `<e.g. "great top-of-funnel traffic, terrible trial activation">`

## 13. Reference material

Point agents at the real sources so they don't work from memory.

- **Brand/style guide:** `<link or path>`
- **Existing messaging doc:** `<link or path>`
- **Best-performing content to emulate:** `<2–3 links>`
- **Product docs:** `<link>`
- **Customer research / VoC notes:** `<link or path>`

## 14. Corrections & learnings

> When a fact above is corrected during real work — a proof point withdrawn, a metric revised, a persona pain disproven — **fix it in the section above first**, then log it here with a date. That way the change reaches every agent at once instead of drifting into whichever single deliverable happened to catch it. This log is the audit trail, not the fix. Its most important job is withdrawn proof: an entry here is the standing record that a customer, logo, or number must now *stop* appearing in public copy.

| Date | What changed (section) | Why / evidence | What agents should now do differently |
|---|---|---|---|
| `<YYYY-MM-DD>` | `<e.g. §6 — removed <Customer> from the referenceable list>` | `<e.g. logo approval withdrawn; confirmed with legal 2026-05>` | `<e.g. never name <Customer> in public copy; the MTTR stat was theirs — pull it too>` |

---

**Last updated:** `<YYYY-MM-DD>` · **Owner:** `<name or team>`

_Review this file whenever positioning, pricing, or ICP changes — stale brand context is worse than none, because agents will confidently apply it._
