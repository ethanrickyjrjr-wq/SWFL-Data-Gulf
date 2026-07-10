# Insiders Edition centerpiece page (/insiders)

**Date:** 2026-07-10
**Operator directive (07/10/2026):** "just make a page on swfldatagulf.com. Make it something to be
proud of! This will be the centerpiece of the entire marketing campaign moving forward. We have no
users, so push the limits… look up some designs if you need to, but other than that, take the wheel."
Design authority fully delegated; brainstorm run autonomously under that delegation.

## Problem

The Insiders Edition (spec `2026-07-10-insiders-edition-design.md`, Phases A+B built) has no public
face. There is nowhere to subscribe, nothing that explains what it is, and no page the marketing
campaign can point at. The homepage sells the campaign builder; the weekly read has a capture strip;
the flagship monthly — the single most differentiated artifact we ship — is invisible.

## Goal

One page, `/insiders`, that is simultaneously:
1. **The pitch** — why this newsletter is unlike anything else in the market.
2. **The proof** — live data + real charts on the page itself, obeying the same no-invention rule
   the newsletter enforces (the page IS a demo of the guarantee).
3. **The capture** — email signup wired to a real subscriber table from day one.

## Research evidence (RULE 0.4 — crawl4ai, 07/10/2026)

- **bklit.com/docs/components** (operator ref): a React chart-component registry (bklit/bklit-ui) —
  Area/Bar/Candlestick/Choropleth/Composed/Funnel/Gauge/Heatmap/Line/Profit-Loss/Live-Line/Pie/
  Radar/Ring/Scatter/Sankey/Sunburst + utilities (Legend, Grid, Reference Area, **Projection Line**,
  Tooltip, **Brush**, axes, useChart). Verdict for THIS build: do not vendor a second chart system
  into the centerpiece; our in-house recharts components (`MetroAreaChart` etc.) are lake-wired,
  brand-tokened, and already premium (range selector, series toggles, draw-in reveal). bklit
  adoption for the wider site is parked as check `bklit_charts_evaluation` (opened same session).
- **notice.md** (operator ref "Notice.md"): resolves to a rickroll video — dead end; no repo file
  named Notice.md exists either. Treated as a stray reference; bklit is the operative pointer.
- **sherwood.news** (Chartr's successor, data-editorial benchmark): confirms the tone (chart-forward
  financial editorial) but is a news grid, not a subscribe centerpiece — nothing structural to copy.

## What we're building

### Concept — "the anatomy of an honest newsletter"

A dark editorial masthead page that sells the Insiders Edition by **dissecting it**. The visual
centerpiece is a cream "printed issue" specimen — the front page of Issue 001 rendered as paper on
the dark desk — with teal margin annotations explaining the guarantee behind each section. Around
it: live wire figures, two real charts, the four printing rules, the pipeline story, and capture.

**The page obeys the newsletter's own rule and says so:** every figure rendered on `/insiders` is
read live from our data (Zillow ZHVI/ZORI series for the three metros) with its as-of date, or it
does not render. Sample metrics never display as real (loader `sample`/`error` flags collapse the
block). This is the marketing claim made structural.

### Sections (top → bottom)

1. **Masthead hero** — kicker `SWFL DATA GULF PRESENTS`, nameplate **THE INSIDERS EDITION** in a
   display serif (Instrument Serif via next/font — the one new font; Geist stays for everything
   else), dek: monthly Southwest Florida market intelligence, written by Claude Fable 5 (Anthropic's
   flagship model) and fact-gated by code that will not let it invent a number. `ISSUE 001 — JULY
   2026` badge. Inline email capture (single field). Fine print: free · monthly · unsubscribe anytime.
2. **The wire** — a thin ticker band of live figures: latest median home value + rent for Cape
   Coral / Fort Myers / Naples, read as written from the pivoted lake views, one as-of. CSS-only
   marquee, static under `prefers-reduced-motion`, hidden entirely if the loaders degrade.
3. **The specimen** — the cream paper front page: nameplate, THE READ (drop cap, live figure with
   `[1]`), THE STORIES headline stubs, THE FORWARD LOOK (direction call **with its falsifier
   printed**), numbered SOURCES footer. Five teal margin annotations pin to the sections:
   the read = the month's thesis, every claim traced; stories = what happened / what our data
   shows / the historical analog; dashboard = charts drawn only from series we hold; forward look
   = one call per issue, printed with the number that kills it; sources = every figure resolves.
   A rotated `FACT-CHECKED BY MACHINE` press stamp. Specimen prose contains **no free digits** —
   the only numbers are the live-injected figures and their citation markers.
4. **The dashboard, live** — two real `MetroAreaChart`s side by side: home values (`zhvi_pivoted`,
   area variant) and rents (`zori_pivoted`, line variant), each with eyebrow/title/as-of + named
   source line. This is the actual chart surface subscribers get, not a mock.
5. **The rules we print by** — four cards, plain language, no system nouns: (a) every number names
   its source — our data, your documents, a named public source, or a figure you hand us; an
   invented number is the one thing that cannot ship; (b) inference is labeled, with the base value
   and one falsifier; (c) facts and calls are separated — one direction call per issue; (d) a
   machine reads every sentence before send — an unsourced figure blocks the issue.
6. **How an issue is made** — four numbered steps: the desk (our Lee + Collier data — permits,
   listings, rents, flood, tourism — plus the month's news, compiled into a briefing) → the writer
   (Claude Fable 5, two passes: draft, then its own editor) → the gate (code checks every number
   against the briefing; no source, no send) → the send (one email a month; charts only from real
   series).
7. **Issue ledger** — `001 · JULY 2026 · IN PRODUCTION` row + "your inbox gets it before the
   archive does." (Archive pages are Phase C of the parent build.)
8. **Final capture** — repeat signup + quiet links to `/guides` and `/r`.

### Copy guardrails (locked)

- No system nouns anywhere: no "master", "brain(s)", "pack", "payload", "grain", "dossier".
- Never the phrase "ZIP-level intelligence" (kills lanes 2–4 of the moat).
- Naming the model IS on-brand: "Written by Claude Fable 5" is the flagship positioning.
- Every rendered figure: real loader value + named source (Zillow ZHVI / Zillow ZORI via SWFL Data
  Gulf) + as-of date stated MM/DD/YYYY. No fixture/sample values ever display.

### Architecture

- `app/insiders/page.tsx` — server component; `Promise.all([loadMetroTrend("zhvi_pivoted"),
  loadMetroTrend("zori_pivoted")])`; `revalidate = 3600`; full `Metadata`; assembles sections.
  Loaders already degrade (empty + error, never throw) → every data block collapses gracefully.
- `app/insiders/insiders.css` — page CSS (per-page css idiom, like `home-explorer.css`).
- `app/insiders/_components/insiders-capture.tsx` — client form (email only) →
  `POST /api/insiders/subscribe`; states idle/submitting/done/error; mirrors `WeeklyReadCapture`.
- `app/insiders/_components/specimen.tsx`, `wire-ticker.tsx` — server components taking live figures.
- `app/api/insiders/subscribe/route.ts` — mirrors weekly-read subscribe minus the ZIP gate
  (regional monthly): normalizeEmail/isValidEmail/sanitizeSource, server-side consent text, upsert
  on email into `public.insiders_subscribers`, reactivation on re-subscribe.
- `docs/sql/20260710_insiders.sql` — idempotent `insiders_subscribers` (email PK-unique, status,
  source, consent_text, consent_at, timestamps) run via Bun.SQL per RULE 1 (verify after).
  `insiders_issues` lands with Phase C archive, not now (YAGNI).
- `components/nav/nav-config.ts` — **Insiders as a top-level tab** (it's the campaign centerpiece,
  not an Explore child) + `nav-config.test.ts` updated in the SAME commit (pinned shape guard).
- `components/nav/SiteFooter.tsx` — Insiders link.
- `app/sitemap.ts` — `/insiders` entry.
- Font: `Instrument_Serif` added in `app/insiders/` scope (imported in the page, variable
  `--font-instrument-serif`), NOT in the root layout — zero weight on every other page.

### Out of scope (parked where, per RULE 2.4)

- Issue archive pages `/insiders/[issue]` — parent plan Phase C (`insiders_edition_live_verify`).
- Send/batching/unsubscribe-link plumbing — parent plan Phase C.
- Homepage strip advertising /insiders — follow-up once the page is approved.
- bklit-ui adoption — check `bklit_charts_evaluation`.

### Testing

- `nav-config.test.ts` extended for the new tab (hook-enforced same-commit rule).
- Subscribe route logic is thin over already-tested `lib/email/validation`; verified via
  `bunx next build` + a live POST against the dev/prod route during live-verify.
- Page renders verified via `bunx next build` (the repo's blessed check) + manual view.
- Migration verified by row-zero select after create (idempotent re-run safe).

### Success criteria

`/insiders` builds clean, renders premium on mobile + desktop, shows only real sourced figures (or
collapses the block), the form writes a real `insiders_subscribers` row, nav/footer/sitemap all
point at it, and the operator is proud to make it the campaign centerpiece.
