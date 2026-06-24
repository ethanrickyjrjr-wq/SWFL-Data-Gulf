# ZIP Report Rebuild — Phase 0 (bugs) + Phase 1 (layout + crawl-fed summary) — Design

**Date:** 2026-06-24
**Surface:** `/r/zip-report/[zip]` (the canonical ZIP page — `/z/[zip]` now redirects here, `d97368fe`)
**Status:** design — approved to build; split across two parallel sessions (see §Parallel split)

---

## Problem

The ZIP page the homepage map + hero search land on must (a) look like the card design the
operator approved, (b) explain every number with grounded fact chips, (c) carry a **per-ZIP Quick
Summary fed by fresher-than-lake crawled data**, and (d) stop shipping two defects:

- **Backwards dates.** `formatDate(updatedAt)` = `toISOString().slice(0,10)` → `2026-06-03`
  (year-first ISO). Violates Rules of Engagement rule 5 ("state the as-of date MM/DD/YYYY once").
- **Internal jargon in city data.** cre-swfl emits `"The SWFL CRE pack covers 27 verified corridors
  across Lee and Collier counties."` (`refinery/packs/cre-swfl.mts:1546`), baked into
  `brains/cre-swfl.md` / `brains/master.md`. `CRE pack` / `verified corridors` = jargon (rule 5).

## Decisions (brainstorm 2026-06-24)

1. **crawl4ai = crawl once → store cited → render fast**, and **folded INTO Phase 1** — the web has
   fresher per-ZIP data than our lake, so the Quick Summary launches on crawled data.
2. **City-data rewrite = BOTH** — render-time scrub + lint now (Phase 0) AND pack-emitter rewrite +
   rebuild (Phase 3, own spec).
3. **Sequencing:** Phase 0 (bugs) → Phase 1 (page + crawl-fed summary) → Phase 3 (source clean).
4. **Spec scope:** THIS spec = Phase 0 + Phase 1. Phase 3 (cre-swfl source rewrite) = own spec.
5. **Parallel build:** Phase 1 splits into **Section A (crawl pipeline, handed off)** + **Section B
   (page + bugs, this session)**, joined by the `ZipQuickSummary` contract below.

---

## The contract (the seam between A and B) — `lib/zip-summary/`

Both sections build to this. B renders from it with an **empty-tolerant** loader so the page ships
before A populates the store; A fills the store + the loader's real query.

```ts
// lib/zip-summary/types.ts  (owned by B; stable; A imports it)
export interface ZipSummaryFigure {
  key: string;             // "population", "median_household_income", ...
  label: string;           // "Population", "Median household income"
  value: string;           // display-ready: "28,400", "$74,200"
  source_url: string;      // named public source — the citation (four-lane lane 3)
  source_label: string;    // "U.S. Census ACS 2023"
  as_of?: string;          // MM/DD/YYYY
}
export interface ZipQuickSummary {
  zip: string;
  figures: ZipSummaryFigure[];   // [] when nothing stored yet
  as_of?: string;                // MM/DD/YYYY, newest figure
}

// lib/zip-summary/load.ts
// B ships an empty-tolerant STUB: returns { zip, figures: [] }.
// A replaces the body with the real lake query (conforming to the types above).
export async function loadZipQuickSummary(zip: string): Promise<ZipQuickSummary>;
```

**Invariants:** every figure carries a real `source_url` (no invention; four-lane rule). Empty
store → `figures: []` → B renders the section header + "summary populating" affordance, never a
fabricated number. `value` is display-ready and date strings are MM/DD/YYYY.

---

## Phase 0 — the two bugs (no brain rebuild) — Section B

### 0.1 Date → single as-of, MM/DD/YYYY
- Show ONE as-of date in the header, `MM/DD/YYYY`, derived from the freshness token (never the raw
  `SWFL-…-YYYYMMDD` token). Remove the redundant ISO "Updated" line. Audit the page for any other
  date display; force the same format.
- **Guard:** extend `refinery/render/display-leak.test.mts` (or sibling) to fail on any user-facing
  `\d{4}-\d{2}-\d{2}`. Verify against the prior as-of fix (`04e6c4a7` / `8bd1874b`) — don't regress
  the freshness-token leak guard.

### 0.2 Jargon scrub + lint
- `scrubJargon(text)` in `refinery/render/speaker.mts` (the canonical scrub home), applied to all
  dossier/city prose on the ZIP page: `CRE pack`/`… pack`/pack ids → dropped/plain noun;
  `verified corridors` → `commercial corridors`; bare internal acronyms → expanded or dropped.
- **Guard:** jargon blocklist in the speaker/display lint; any token reaching a rendered surface
  fails CI. Blocklist documented as the single maintenance point.

> Phase 3 rewrites the cre-swfl emitters at source + rebuilds; 0.2 then becomes a safety net.

---

## Phase 1 — layout rebuild — Section B (renders A's data)

Port the approved `/z/` card design (`app/z/[zip]/zip-page.css` reusable) onto the real report.
Order top → bottom:

1. **Header / identity** — ZIP, place, county-in-text, single as-of (MM/DD/YYYY).
2. **Top stat bar — 3 boxes, centered, NO County.** Real + cited: Annual Flood Loss (env-swfl),
   Median Home Value (housing-swfl), New Permits (permits-swfl). `—` where a ZIP lacks a figure
   (confirm `permits-swfl` per-ZIP granularity; if absent, substitute the next real headline metric,
   never fabricate).
3. **"[ZIP] at a glance"** — percentile-bar breakdown (reuse `.zp-metric-block` + `.zp-bar-*`). Drop
   the "Sample data · fixture" badge.
4. **"Quick data summary of [ZIP]"** — grounded plain-English explainer + headline numbers from
   `loadZipQuickSummary(zip)` (Section A's crawled, cited data). Every number a fact chip. Empty
   store → section header + "summary populating" note (never fabricated). Prose composed
   deterministically from the figures (label + value + source), not free-form invented.
5. **ZIP-level data** — housing + flood tables (`DataRow`/`MetricsTable`).
6. **City info** — dossier rollups through the Phase-0 `scrubJargon`.
7. Citations, digest CTA, color legend, footer — unchanged.

**Fact chips on all cards:** every number via `FactChip`/`DataRow`/`MetricsTable`; route already
mounts `ReportHighlightBridge`; grounding-coverage guard covers it.

**Section B touches:** `app/r/zip-report/[zip]/page.tsx`, CSS (adapt `zip-page.css`),
`refinery/render/speaker.mts` (scrub), `lib/zip-summary/types.ts` + `load.ts` (stub).

---

## Phase 1 — crawl pipeline — Section A (HANDED OFF)

Brief: `docs/superpowers/plans/2026-06-24-zip-quick-summary-crawl-HANDOFF.md`. Summary:

- crawl4ai (the ONLY crawl tool; `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`) pulls per-ZIP
  figures from **named public sources** for the 57 in-scope ZIPs. One-time backfill + weekly cron.
- Store in a lake table with `source_url` + `source_label` + as-of per figure. Replace the
  `loadZipQuickSummary` stub with the real query, conforming to `lib/zip-summary/types.ts`.
- Full data-pipeline standards: **PROBE FIRST**, brain-first ingest gate (consuming surface in same
  PR — the page is it), ODD scaffold (empty-tolerant consumer ✔ via the stub), cadence registry,
  pipeline-freshness GHA cron + `--dry-run`. **NO INVENTION** — only figures with a real source.
- ⚠️ Confirm what we ALREADY hold (Census/CBP `ingest:cbp`) before crawling — target the gaps, don't
  re-fetch. crawl4ai/RULE 0.4 research FIRST; write findings to SESSION_LOG.
- Isolate in a worktree (`node scripts/worktree.mjs new zip-crawl`) — overlaps B only on `load.ts`.

## Phase 3 — out of scope here (own spec)
cre-swfl source rewrite (`cre-swfl.mts:1546` et al.) → clean prose + rebuild.

## Parallel split (RULE 1.5)
- **B (this session):** Phase 0 + Phase 1 page, on `main` (or worktree). Owns the contract types +
  empty-tolerant `load.ts` stub.
- **A (handoff):** crawl pipeline, in worktree `zip-crawl`; lands after, replacing the `load.ts`
  stub body. Only overlap = `load.ts` (interface stable, so B never breaks).

## Testing & gates
- Date-format test (no user-facing `YYYY-MM-DD`) · jargon-lint · existing grounding-coverage guard ·
  A: pipeline `--dry-run` + freshness probe. `bun test` green · `bunx next build` clean before push.
