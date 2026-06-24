# HANDOFF — Section A: crawl4ai per-ZIP Quick Summary pipeline

**For:** a parallel Claude session. **Paired with:** Section B (ZIP page rebuild) running on `main`.
**Design spec:** `docs/superpowers/specs/2026-06-24-zip-report-rebuild-design.md` (read it first).
**One-line goal:** populate a cited, fresher-than-lake per-ZIP "Quick Summary" dataset and wire it
behind `loadZipQuickSummary(zip)` — for the 57 in-scope SWFL ZIPs.

---

## Why this exists
The canonical ZIP page (`/r/zip-report/[zip]`) is getting a "Quick data summary of [ZIP]" block.
The web has fresher per-ZIP demographics than our lake, so we source it via crawl4ai. Section B
(the page) renders it from the contract below with an **empty-tolerant** loader — so B is NOT
blocked by you; your data just lights the section up when it lands.

## The contract you MUST conform to (do not change it — B owns it)
`lib/zip-summary/types.ts` (Section B creates this; import it, don't redefine):
```ts
interface ZipSummaryFigure { key, label, value, source_url, source_label, as_of? }  // value = display-ready string
interface ZipQuickSummary  { zip, figures: ZipSummaryFigure[], as_of? }
loadZipQuickSummary(zip): Promise<ZipQuickSummary>   // B ships an empty stub; YOU replace its body with the real lake query
```
Empty store → `{ zip, figures: [] }`. Every figure MUST carry a real `source_url`.

## Your scope
1. **RESEARCH FIRST (RULE 0.4 + 0.5).** Before building: (a) `crawl4ai` what per-ZIP figures are
   reliably available from NAMED public sources (population, median household income, owner-occupancy,
   etc.); (b) confirm what we ALREADY hold so you don't re-fetch — check Census/CBP (`npm run
   ingest:cbp`, `data_lake.*`), the lake views (`mcp__lake__list_views`). Target the GAPS only.
   Write findings to `SESSION_LOG.md` before touching code.
2. **Pipeline.** Build the crawl4ai ingest (one-time backfill of all 57 ZIPs + weekly cron). Source
   = `fixtures/swfl-zip-county.json`. crawl4ai is the ONLY crawl tool —
   `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe` (NOT Firecrawl).
3. **Store.** A lake table (e.g. `data_lake.zip_quick_summary`) — one row per (zip, figure_key) with
   `value`, `source_url`, `source_label`, `as_of`. Idempotent merge; guard destructive replace
   (ingest Gate 4). `GRANT SELECT … TO service_role; NOTIFY pgrst,'reload schema'` after table create.
4. **Wire.** Replace the body of `lib/zip-summary/load.ts` with the real query → `ZipQuickSummary`,
   conforming to the types. Dates → MM/DD/YYYY. This is the ONLY file you share with B.

## Hard rules (this repo will block you otherwise)
- **NO INVENTION.** A figure ships ONLY with a real named `source_url`. No placeholder numbers ever.
- **PROBE FIRST** before any multi-minute crawl (smallest page the source honors; guard load-bearing
  columns before any replace). Standards: `docs/standards/data-and-build-bible.md` §0.1–0.2.
- **Brain-first / consuming-surface gate.** The consuming surface (the page block) exists in B's PR —
  don't ship a Tier-2 table with no consumer.
- **ODD scaffold** (source may be flaky): empty-tolerant consumer ✔ (the stub), parked cadence entry,
  Tier-1 cold target, `source_tag` provenance, idempotent merge. See the Operation Dumbo Drop plan.
- **Pipeline-freshness:** ship the GHA cron wrapper + `--dry-run` in the SAME PR. `docs/standards/
  pipeline-freshness.md`. Register cadence in `ingest/cadence_registry.yaml`.
- **ZIP scope:** the 6-county set (`fixtures/swfl-zip-county.json`). `zip_code` from real geography.

## Isolation (RULE 1.5)
- `node scripts/worktree.mjs new zip-crawl` → work in `../bp-zip-crawl` on branch `wt/zip-crawl`.
- You only overlap B on `lib/zip-summary/load.ts` (interface is stable, so B never breaks).
- Land: `node scripts/worktree.mjs land zip-crawl` (rebases, prints finish cmds — does NOT auto-push).
- **Never push without the operator's explicit OK.** SESSION_LOG entry before any push.

## Done when
- All 57 ZIPs have ≥1 cited figure in the store (or a logged reason where a source has none).
- `loadZipQuickSummary(zip)` returns real cited figures; empty ZIPs return `{figures: []}` cleanly.
- Pipeline `--dry-run` works; cron wrapper + cadence entry committed.
- `bun test` green · `bunx next build` clean. Hand back to B for the live wire-up.

## Do NOT touch (Section B owns these)
`app/r/zip-report/[zip]/page.tsx`, the ZIP-page CSS, `refinery/render/speaker.mts`,
`lib/zip-summary/types.ts`. Coordinate through the contract only.
