# ZIP Report Rebuild — Phase 0 (bug fixes) + Phase 1 (layout) — Design

**Date:** 2026-06-24
**Surface:** `/r/zip-report/[zip]` (the canonical ZIP page — `/z/[zip]` now redirects here, `d97368fe`)
**Status:** design — awaiting operator spec review

---

## Problem

The ZIP page the homepage map + hero search land on must (a) look like the card design the
operator approved, (b) explain every number with grounded fact chips, and (c) stop shipping two
defects the operator flagged with fury:

- **Backwards dates.** `app/r/zip-report/[zip]/page.tsx` renders `formatDate(updatedAt)` =
  `toISOString().slice(0,10)` → `2026-06-03` (year-first ISO). Violates Rules of Engagement
  rule 5 ("state the as-of date MM/DD/YYYY once").
- **Internal jargon in city data.** The cre-swfl pack emits the literal string
  `"The SWFL CRE pack covers 27 verified corridors across Lee and Collier counties."`
  (`refinery/packs/cre-swfl.mts:1546`), which bakes into `brains/cre-swfl.md` / `brains/master.md`
  and surfaces in the city section. `CRE pack` / `verified corridors` are internal jargon —
  violates rule 5 ("no internal IDs, no jargon").

## Decisions (locked in brainstorm, 2026-06-24)

1. **crawl4ai sourcing = crawl once → store cited → render fast** (Phase 2, separate spec).
2. **City-data rewrite = BOTH** — render-time scrub + lint now (Phase 0) AND pack-emitter rewrite +
   rebuild (Phase 3, separate spec).
3. **Sequencing:** Phase 0 (bugs) → Phase 1 (page) → Phase 2 (crawl enrich) → Phase 3 (source clean).
   Each independently shippable.
4. **Spec scope:** THIS spec = Phase 0 + Phase 1. Phase 2 (crawl pipeline) and Phase 3 (source
   rewrite) get their own specs when reached.

---

## Phase 0 — the two bugs (no brain rebuild)

### 0.1 Date → single as-of, MM/DD/YYYY
- **Root:** `formatDate()` (zip-report page) returns ISO `YYYY-MM-DD` for the "Updated" meta
  (`updatedAt = housing?.refined_at ?? env?.refined_at`). The header ALSO shows "Freshness:
  As of …" from `asOfFromToken` — so the ISO "Updated" line is both backwards AND redundant.
- **Fix:** Show exactly ONE as-of date in the header, formatted `MM/DD/YYYY`, derived from the
  freshness token (never the raw `SWFL-…-YYYYMMDD` token — that stays internal). Remove the ISO
  "Updated" line. Audit the page for any other date display and force the same format.
- **Guard:** Extend `refinery/render/display-leak.test.mts` (or a sibling test) to fail if a
  rendered date matches `\d{4}-\d{2}-\d{2}` (year-first ISO) anywhere user-facing.

### 0.2 Jargon scrub + lint
- **Fix (render-time):** Add a `scrubJargon(text)` pass in the speaker layer
  (`refinery/render/speaker.mts` — the canonical scrub home) and apply it to all dossier/city
  prose rendered on the ZIP page (the `cityLines`/`countyLines`/`swflLines` text, currently passed
  through `stripStatAnnotation`). Strips/rewrites internal jargon:
  - `CRE pack` / `the … pack` / pack ids → removed or replaced with plain nouns
  - `verified corridors` → `commercial corridors`
  - bare internal acronyms surfaced as place/jargon → expanded or dropped (per existing rule-5 list)
- **Guard:** Extend the speaker/display lint with a jargon blocklist so any of these tokens reaching
  a rendered surface fails CI. Blocklist seeded from the known offenders; documented as the single
  maintenance point.

> Phase 3 (separate spec) rewrites the cre-swfl emitters at the source + rebuilds, after which 0.2
> becomes a safety net rather than the primary fix.

---

## Phase 1 — layout rebuild (`/r/zip-report/[zip]`)

Port the approved `/z/` card design (`app/z/[zip]/zip-page.css` is reusable) onto the real,
grounded report. Page order, top → bottom:

1. **Header / identity** — ZIP, place name, county-in-text, single as-of date (MM/DD/YYYY).
2. **Top stat bar — 3 boxes, centered, NO County box.** Real + cited:
   - Annual Flood Loss (env-swfl)
   - Median Home Value (housing-swfl)
   - New Permits (permits-swfl)
   - `—` where a ZIP lacks a figure (no invention; four-lane rule). Confirm `permits-swfl` per-ZIP
     granularity during implementation; if absent per-ZIP, substitute the next real headline metric
     rather than fabricate.
3. **"[ZIP] at a glance"** — the percentile-bar breakdown card (reuse `.zp-metric-block` +
   `.zp-bar-*`). Drop the "Sample data · fixture" badge (data is now live).
4. **"Quick data summary of [ZIP]"** — grounded plain-English explainer with a few headline numbers.
   Phase 1: built from data we already hold (housing/flood/permits + dossier). Phase 2 enriches with
   crawled per-ZIP fields. Every number is a fact chip. Never renders an empty/invented section.
5. **ZIP-level data** — housing + flood tables (existing `DataRow`/`MetricsTable`).
6. **City info** — the dossier city/county/SWFL rollups, run through the Phase-0 `scrubJargon` pass.
7. Citations (`CitationList`), digest CTA, color legend, footer — unchanged.

**Fact chips on all cards:** every number routes through `FactChip`/`DataRow`/`MetricsTable` so it
carries its metric label + source and the assistant is grounded (the route already mounts
`ReportHighlightBridge`; the grounding-coverage guard already covers it).

**Components touched:**
- `app/r/zip-report/[zip]/page.tsx` — re-order sections, swap the stat bar to 3 centered boxes,
  add the "at a glance" + "Quick summary" blocks, apply scrub to city prose, fix the date.
- CSS — reuse/adapt `zip-page.css` (move into the report or a shared stylesheet; change stats grid
  `repeat(4,1fr)` → `repeat(3,1fr)` + center).
- `refinery/render/speaker.mts` — `scrubJargon` (Phase 0.2), shared by all surfaces.

---

## Out of scope (own specs, later)

- **Phase 2 — crawl4ai per-ZIP pipeline.** One-time + weekly-cron job → named public sources →
  store in lake (cited + freshness) → feed the Quick Summary. Must follow data-pipeline standards
  (PROBE FIRST, brain-first ingest gate, ODD scaffold, cadence registry, GHA cron wrapper). Flag:
  some basics (population, median income) may already be in the lake via Census/CBP — crawl4ai
  targets the gaps, not re-fetch. Exact figure list resolved when that spec is written.
- **Phase 3 — cre-swfl source rewrite + rebuild.** Rewrite the narrative emitters
  (`cre-swfl.mts:1546` et al.) to clean human prose; rebuild brains.

## Testing & gates

- Date-format test (no `YYYY-MM-DD` user-facing) — Phase 0.1.
- Jargon-lint (blocklist) in the speaker/display lint — Phase 0.2.
- Existing `lib/highlighter/grounding-coverage.test.ts` already asserts this route stays grounded.
- `bun test` green · `bunx next build` clean before any push.

## Open items to resolve during implementation
- `permits-swfl` per-ZIP granularity (box 3 real-data confirmation).
- Exact `asOfFromToken` format change vs. removing the redundant "Updated" line — verify against the
  prior as-of fix (`04e6c4a7` / `8bd1874b`) so we don't regress the freshness-token leak guard.
- Final jargon blocklist contents.
