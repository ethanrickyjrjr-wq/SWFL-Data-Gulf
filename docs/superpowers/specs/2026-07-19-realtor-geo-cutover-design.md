# Realtor geo medians parallel run + Redfin cutover

**Date:** 2026-07-19 (stub); build executed 07/18/2026, operator-driven in session (design settled
interactively — "build it and commit push it all when done"). Registered post-hoc same session.

## Problem

The user-facing home-value surfaces served the Zillow ZHVI index labeled as a "median" — a statistic
the source never produced — while the platform holds REAL sold medians. And the sold-median concept
had two vendors (Redfin city/county monthly files + realtor.com per-ZIP via the API) with no plan for
which one is THE root. Operator direction: serve real medians, converge on ONE ongoing vendor feed,
never splice two vendors into one line (verified 07/18: realtor "Naples" is the broad sweep at $619k
vs Redfin city-proper $1.235M — a splice would print a fake 50% crash).

## Goal

One sold-median concept, honestly labeled, auto-updating, with a verified path to retiring the Redfin
pull so the series continues from a single vendor (realtor.com) with no stitched seam.

## What we're building (all live as of 07/18/2026)

1. **`data_lake.redfin_metro_sold_pivoted`** (view, `docs/sql/20260718_redfin_metro_sold_pivoted.sql`)
   — 3-metro monthly median sale price in the exact `zhvi_pivoted` column shape; the metro chart
   surfaces (`/charts`, chart gallery, zip-report trend) swapped to it by view name. Naples series
   labeled "Naples (city)" (`REDFIN_METRO_SOLD_SERIES` in `lib/charts/series.ts`).
2. **Homepage map value layer** → `market_details_swfl_latest.median_sold_price` (drops the
   `zhvi_zip_latest` read; the map already reads that view for DOM — net source-count reduction).
3. **Email figure feed** → ZHVI home-value figure deleted (the realtor per-ZIP sold median was
   already in the same email — duplicate concept removed). ZHVI/ZORI remain internal (investor yield).
4. **`geo-trends` resource** in `ingest/pipelines/market_aggregates/` —
   `/neighborhood-market-trends` off 3 verified anchor properties → `data_lake.realtor_geo_medians`
   (city + county + neighborhood medians, vendor-verbatim, monthly,
   `.github/workflows/realtor-geo-trends-monthly.yml`). First live run 07/18: 9 rows.
5. **`data_lake.realtor_redfin_median_overlap`** (view) — the cutover instrument: latest realtor vs
   latest Redfin medians with delta_pct. 07/18 baseline: Lee 0.0% / Collier 1.2% / Cape Coral 1.4% /
   Fort Myers -1.8% / Naples -49.9% (definitional, not a disagreement).

## Cutover criteria (check `realtor_redfin_overlap_cutover`, operator sign-off required)

2-3 consecutive overlap months with city/county deltas inside a stated tolerance (~±3%; Naples
exempt — different boundary by operator-chosen definition: broad Naples go-forward). Then: retire the
Redfin ingest crons, keep `redfin_*` tables as frozen history, continue the served series from
`realtor_geo_medians`, repoint `redfin_metro_sold_pivoted`'s successor view, delete the duplicates
per the data-roots walk (never before consumers repoint — RULE 0.55).
