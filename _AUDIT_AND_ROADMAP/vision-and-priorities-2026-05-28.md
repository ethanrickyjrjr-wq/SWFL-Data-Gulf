# Vision & Priorities — 2026-05-28

> **"The Proof Is In The Data"** — working slogan

---

## HIGHEST PRIORITY (start every Claude session here)

1. **Two new data pipelines per day, minimum.** New data every day is the product moat. The Notion premise-data page is the current guide for what to pull next.
2. **Master synthesizer — system-generated output.** The `outputProducer` on master must read downstream OUTPUT blocks and emit `conclusion + key_metrics + caveats + contradicts`. Goal: deterministic, math-driven synthesis. Not Opus improvising — the system produces the answer.
3. **Broker data strategy.** Will be our best first leads. Prioritize sourcing, cleaning, and ingesting broker/agent-level data ASAP.
4. **26 corridor voices polished.** Corridor agents fully voiced and grounded before we go wide.

---

## LANDING PAGE — "The Proof Is In The Data"

**Scrap the fancy website. One page. One idea. One comparison.**

### The Ask
Side-by-side answer comparison:
- Left panel: our MCP / brain stack answers a SWFL question
- Right panel: the same question answered by a paid-tier AI (no names, wrapped/proxied)

### The Mechanic
- Single prompt input at top
- What you type copies into both panels simultaneously
- Hit Enter → both answers stream in real time
- Our logo over the left panel, a dollar-sign tier label over the right (no brand names — avoid TOS issues)
- **Sign-up / email capture at the bottom of the answer**, after the user sees the difference

### Why it works
We crush any SWFL question if we have the data and the corridor agents set up. The comparison IS the pitch. No copy needed.

---

## AD MODEL — Corridor-Triggered Ads (ChatGPT bottom-ad style, but smarter)

ChatGPT puts ads at the bottom of free answers. We do the same — but targeted by corridor intent.

### How it works
- User asks a question. If enough signals point to a specific corridor (e.g. 124th St market, Cape Coral SE, etc.), a relevant local ad pops at the bottom of the answer.
- Corridor-specific: asking about a neighborhood → the business that operates there sees the ad slot.
- Tracked clicks → specific landing pages or phone numbers → clean conversion data.

### The early-adopter play
- Identify 3–5 local corridor businesses (brokers, lenders, title, contractors).
- Approach: *"We built something. Here's a free ad for a month. Look at what people are asking and what we're answering. You'll be instantly impressed."*
- Close #1: they use the product. Close #2: they advertise. Two closes in one meeting.
- Show conversion data early → upsell to paid placements.

### Why this is the right order
Ads are most convincing when the underlying answer is genuinely impressive. Polishing the corridor voices and deepening the data come first. Then we flip the ad switch.

---

## WHAT TO BUILD (sequenced)

| # | Item | Why now |
|---|------|---------|
| 1 | Two new ingest pipelines / day | Data is the moat; every day without new data is a day behind |
| 2 | Master synthesizer (system-generated) | Closes the OUTPUT contract; makes every response auditable |
| 3 | Broker data pipeline | First-mover on leads layer |
| 4 | 26 corridor voices polished | Required before the landing page comparison is credible |
| 5 | Landing page (side-by-side comparison) | The pitch IS the product demo |
| 6 | Email capture on answer page | Turns demos into a list |
| 7 | Corridor-triggered ad slots | Monetization once quality is there |

---

## PUSHBACK / HONEST FLAGS

**On the side-by-side comparison:**
- Wrapping a paid AI API (GPT-4, Gemini, etc.) and displaying its output next to ours on a public page is likely a ToS violation for most providers. Options: (a) use a model with permissive terms, (b) run a local/open-weight model as the "other," (c) pre-record representative answers rather than live calls, (d) consult counsel before launch. Do not assume you can call OpenAI's API and display the result as a "comparison" — check their usage policy first.
- If we go open-weight for the comparison side, we also control the narrative more cleanly — pick a capable but clearly-behind model and the contrast is still real.

**On "two pipelines a day":**
- Quantity without quality contracts defeats the Brain Factory validation layer. Each pipeline still needs: GHA cron, `--dry-run` flag, cadence_registry entry, and a consuming PackDefinition in the same PR. Speed is good; skipping the gates turns the lake into noise. The standard is in `docs/standards/pipeline-freshness.md`.

**On broker data:**
- MLS/IDX data has strict licensing. Confirm the source and licensing terms before building the ingest. County recorder data (public) is clean. Broker-reported survey data is clean. Licensed MLS feeds require a vendor agreement.

**On the slogan:**
- "The Proof Is In The Data" is strong — direct, earned, not generic. Worth protecting early (trademark search, domain check).

**On timeline ("a week or two"):**
- The corridor voices + master synthesizer alone are 1–2 weeks of focused engineering. The landing page and ad layer can be shimmed in parallel once the data quality holds. Realistic: landing page MVP in 2 weeks if synthesizer ships in week 1 and corridor voices are green-lit by end of week 2. Don't let the landing page distract from the pipeline work — the page is only as good as what's behind it.

---

## ADD-ONS WORTH CONSIDERING (bottom-of-file)

- **Question history / session persistence** — returning users see their past SWFL questions; builds stickiness and helps us understand what people actually care about.
- **Corridor "report card" pages** — each corridor gets a public URL (`/corridor/cape-coral-se`) with the current brain output rendered. Good for SEO, shareable, and doubles as an ad for the product.
- **Weekly email digest** — once we have emails: "Here's what changed in SWFL data this week." Low cost, high retention.
- **Operator dashboard** — show ad click-throughs, corridor query heatmap, pipeline freshness status in one internal page. Makes the corridor ad pitch to local businesses much more concrete.
- **"Ask a follow-up" threading** — after the side-by-side answer, let the user keep drilling. Our corridor agents shine on depth; most paid AIs will hallucinate on the third follow-up. That's where we win.

---

*File created 2026-05-28. Append corrections; do not overwrite past entries.*
