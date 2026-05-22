# 01 — Product Brief

## What we're building

**SWFL Data Lake** — a real-time analyst-grade data product for Southwest
Florida (Lee, Collier, Charlotte counties). Covers housing, commercial real
estate, building permits, traffic, tourism, hurricane risk, logistics, and
macro context. **Every number has a source citation. Nothing is invented.**

## How it's accessed

- **Through AI assistants** (Claude, ChatGPT, Cursor, etc.) via the MCP
  protocol — this is the inline widget surface.
- **Through a web app** — full report pages at `/r/{report_id}`.
- **Through `/connect`** — landing page where new users install the MCP
  integration into their AI.

## Who it's for

Analysts, investors, developers, and smart locals who want **real answers
about SWFL**. Not vibes, not guesses. They will come back weekly. They run
this on a second monitor.

## Design philosophy

> Make people go "wow, that's cool AND informative" at the same time.

Data should feel like it's **surfacing** — like something emerging from
deep water. Not bouncing, not flashy. **Deliberate, smooth, surgical.** The
most important insight hits first. The hierarchy is ruthless — if something
doesn't earn its place above the fold, it doesn't get it.

> What if a premium research firm had the soul of a great data
> visualization studio?

## Hard "do nots"

- Don't lead with filler. A traffic chart is not the hook.
- Don't look like a government data portal.
- Don't look like a tourist brochure.
- Don't use stock-chart cliches (red/green candles, ticker tape).
- Don't over-animate. Every animation must earn its place.

## Hard "dos"

- Let the data speak through the design.
- Make the hierarchy feel inevitable — the eye lands where it should.
- Use animation to **reveal insight**, not to decorate.
- Design for someone who will come back every week.

## What success looks like

A user opens the report page and thinks: "This is more polished than
anything I've seen in Florida real estate data." The animations make data
feel alive without being gratuitous. The hierarchy is so clean they never
feel lost. When they see it render inline in their Claude conversation,
they immediately want to share it.

We show the great data. You show the great design.

## Data shape (so the design fits the content)

Every report carries:

- **Direction** — `bullish` / `bearish` / `mixed` / `neutral`. This is the
  headline verdict.
- **Key metrics** — each with a value, trend direction, and source URL
  (federal/state agencies, public datasets).
- **Drivers** — what's pushing the direction.
- **Caveats** — known limitations, data gaps, contradictions.
- **Freshness token** — when this data was last computed
  (e.g. `SWFL-7421-v5-20260522`).
- **Upstream links** — if this is a master report, it aggregates several
  upstream reports (housing, CRE, permits, tourism, etc.).

## Tiers (three views of the same report)

- **Tier 1** — Conversational, 2-5 sentence summary. Executive glance.
- **Tier 2** — Structured. Conclusion + metrics table + caveats. **The
  main view.** Default tab.
- **Tier 3** — Raw audit with full citation table. For people verifying
  every number.

All three are tabs/views on the same page, not separate pages.

## Animation engine

**Anime.js v4** for all motion. See `00-START-HERE.md` for the v4 module
surface and `02-motion-rules.md` for the personality.
