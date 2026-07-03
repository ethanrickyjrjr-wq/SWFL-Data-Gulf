# Homepage hero map — color + scope bugs (operator report 07/03/2026)

## What the operator said, verbatim intent

1. Colors across all three pills (Home Value / Market Activity / Days on Market) are
   "basically the same" — should pop for ZIPs with higher metrics or bigger increases,
   instead everything reads as one flat shade with maybe one outlier.
2. Collier County looks like it got "taken out" on some pills but not others — some ZIPs
   render differently map to map.
3. **Scope correction (operator, hard stop):** the platform deals with **Lee, Collier, and
   Hendry**. Sarasota/Charlotte/Glades being off the map is fine. Hendry being off the map
   is NOT fine — operator's exact words: "THEY AREN'T EVEN ON THE FUCKING MAP" — Hendry
   isn't grayed-out-for-missing-data, it structurally doesn't exist on the map asset at all.
   Note: this narrows the CLAUDE.md `SCOPE:` line (6-county: Charlotte/Collier/Glades/
   Hendry/Lee/Sarasota) for THIS surface specifically — reconcile before touching other
   scope-gated surfaces.

## Root causes found by reading code (not yet fixed, not yet confirmed against live lake rows)

### 1. Flat/washed-out colors — `lib/map/zip-color.ts` `computeZipGradient`
Straight linear min→max interpolation across the full ZIP set (`t = (val - low) / (high -
low)`). One outlier ZIP stretches the whole scale; every other ZIP gets compressed into a
narrow band near `c0`. This is a real scale bug, not user perception — a robust choropleth
scale (percentile/quantile breaks, or clamped outlier handling) would fix it. Same function
feeds all three pills via `lib/landing/load-home-map-data.ts` `metricFromRows` (which just
takes raw min/max, no outlier trimming).

### 2. Collier inconsistent across pills — `lib/landing/load-home-map-data.ts`
- Home Value pulls from `data_lake.zhvi_zip_latest` (Zillow — broad coverage, includes
  Collier `341xx` ZIPs — confirmed present in `lib/landing/home-map-data.ts` placeNames and
  fixture data).
- Market Activity + Days on Market both pull from ONE query against
  `data_lake.active_listings_residential_zip_stats`.
- If that scrape table has thin/no Collier coverage, Collier ZIPs get `FALLBACK_COLOR`
  (`#2a3942`, dark gray, `lib/map/zip-color.ts:15`) on those two pills only, while Home
  Value renders Collier normally. **This is unconfirmed against live data** — two lake
  queries to check county-level row counts in `active_listings_residential_zip_stats` vs
  `zhvi_zip_latest` were blocked by the operator mid-session before returning results. Next
  session should run them (read-only COUNT/GROUP BY, no writes) before touching code.

### 3. Hendry never drawn — `public/map/lee-collier.svg`
`components/landing/Hero.tsx:119` fetches `/map/lee-collier.svg` — the base contractor SVG
asset itself is Lee+Collier only by name and by construction. `lib/landing/home-map-data.ts`
`placeNames` (the drawable ZIP set gate in `load-home-map-data.ts` `MAP_ZIPS`) has zero
Hendry entries. Adding Hendry requires a new/extended SVG asset, not just a data change —
the shapes don't exist to color.

## Not yet done
- Live lake queries to confirm county coverage gap in `active_listings_residential_zip_stats`.
- Any code fix (scale, Collier data gap, Hendry SVG). This doc is diagnosis only, per
  operator's direct ask for a handoff of the problem, not a fix.

## Files in play
- `lib/map/zip-color.ts` — gradient math
- `lib/landing/load-home-map-data.ts` — live loader, per-pill data source
- `lib/landing/home-map-data.ts` — fixture fallback + drawable placeNames/ZIP set
- `components/landing/Hero.tsx` — fetches `public/map/lee-collier.svg`
- `public/map/lee-collier.svg` — base map asset (Lee+Collier only, no Hendry shapes)

---

## RESOLUTION (2026-07-03, verified against live prod + lake)

This diagnosis was partly stale. Corrected findings after probing the live site and lake:

### Bug #1 (flat colors) — ALREADY FIXED before this handoff.
`computeZipGradient` (the linear scale this doc blamed) only feeds the **zip-report** page, not the
homepage. `components/landing/Hero.tsx` already colors via `blendedT` (½ rank + ½ log-magnitude) +
`rampColor` (commit `b03804cb`), and it's deployed — the live Home Value pill spreads correctly
(coral on the $2.3M Naples coast, tan mid-range). No color-scale work was needed.

### Bug #2 (Collier "taken out") — REAL, and the actual cause of the "flat/same" perception. FIXED.
Market Activity + Days on Market both read `data_lake.active_listings_residential_zip_stats`, whose
Collier coverage had collapsed to **3 of ~21 ZIPs**: the crawl4ai scrape is WAF-blocked from the
datacenter/runner IP and `_fetch_county` keeps only rows gathered before the 403 (documented in
`ingest/pipelines/active_listings/extract.py`). So two of three pills were Lee-only with a giant gray
void — reading identically. **Fix:** repointed both pills onto fully-covered lake sources the loader
already reaches — Market Activity ← `data_lake.listing_active_stats` (active inventory / SteadyAPI
feed), Days on Market ← `data_lake.market_details_swfl_latest.median_days_on_market` (realtor.com).
Coverage of the 57-ZIP map: Activity 34→49, DOM 3→53, Home Value 53. Full Collier on all three.
Follow-up (fanned-out subagent): a per-county coverage guard so a future single-county scrape
collapse can't pass the pipeline's total-row guards silently.

### Bug #3 (Hendry not on the map) — HELD by operator ruling.
Hendry has ~no lake data (0 ZHVI, ~1 listing/ZIP), so it would render gray on every pill. Adding it
means grafting Hendry ZCTA geometry into the hand-drawn contractor SVG (real geospatial work; the
ZCTA-generated map was tried and reverted before — see `docs/map-failure-log.md`). Operator ruling
07/03/2026: **hold until Hendry has real data.** No SVG work done.
