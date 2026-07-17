# Redfin ingest retarget — redfin_data_center feed + source-staleness tripwire

**Date:** 07/16/2026 (registered 07/17 UTC) · **Status:** approved by operator ("go")
**Check:** `redfin_datacenter_retarget_live_verify` · **Related:** `digest_housing_window_one_cycle_stale`, `data_vintage_tripwire_missing`

## Problem (evidence, all verified live this session)

Redfin redesigned its data center ~early June 2026. The old static dump our
`redfin_swfl` pipeline pulls (`redfin_market_tracker/zip_code_market_tracker.tsv000.gz`)
froze at `Last-Modified: 06/02/2026` (ETag `c173c1aa…`) but still serves HTTP 200 —
so the 06/15 and 07/15 crons both "succeeded" while re-downloading identical bytes
(67,536 rows / 124 ZIPs, newest window Mar 1–May 30). The live housing brain served
"at 03/01/2026" in mid-July with every monitor green.

The successor feed lives in the SAME public bucket under the NEW prefix
`redfin_data_center/`. ZIP grain, verified by HEAD + header/row reads 07/16:

- `housing_market/monthly/all_zips.csv` — 662 MB plain CSV, `Last-Modified 07/14/2026`,
  newest window **Apr 1–Jun 30 2026** (the missing cycle). All-property-types rollup.
- `property_types/monthly/all_zips.csv` — 1.42 GB, per-property-type ONLY (no
  all-residential rollup; file is property-type-major sorted and opens with
  Condo/Co-op — an "All…" label would sort first). Stays UNPULLED (source ceiling).
- `price_drops/monthly/all_zips.csv` — price-drops split into its own dataset.
  Stays UNPULLED (source ceiling); the brain never read `price_drops`.

Release calendar (operator-supplied): monthly tracker with June data shipped Jul 13;
S3 object stamped Jul 14. Our cron on the 15th monthly still lands after their drop.

## Goal

Housing serves the current Redfin window again (Apr–Jun as of 07/16), future source
freezes turn the ingest RED instead of silently green, and the retargeted numbers are
reconciled against the source file and the operator's independently downloaded weekly
metro CSV before being declared live.

## What we're building

### 1. Source swap — parquet stores the vendor AS-WRITTEN; the source seam converts

**Implemented deviation from the presented design (better, matching the in-repo
pattern):** instead of the pipeline emitting the legacy ALL_CAPS contract with
synthesized constants, the Tier-1 parquet stores the new feed AS-WRITTEN —
snake_case names with unit suffixes (`_pct`, `_ppts`), exactly like the sibling
`redfin_price_drops` pipeline that already consumed this feed family. The
parquet stays row-comparable to the vendor file (which made the reconciliation
an exact-units diff), and unit conversion happens ONCE at the consumer seam.

`ingest/duckdb_pipelines/redfin_swfl/` retargets to
`https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_data_center/housing_market/monthly/all_zips.csv`.

- `REGION NAME` (bare 5-digit) → `zip_code`; `METRO` → `metro`; SWFL filter is
  `"REGION TYPE" = 'Zip' AND METRO LIKE` over the same `SWFL_METRO_SUBSTRINGS`
  (the new file has NO `STATE_CODE`/`CITY`/`STATE` columns)
- ALL 50 source columns pulled (FULL-SCOPE-FIRST); `TRY_CAST` turns Redfin's
  literal `"NA"` into SQL NULL

### 2. Unit normalization (rescaling only — never recomputation)

`refinery/sources/housing-source.mts` is the ONE place vendor units become
contract units — `mapHousingRow` (exported, unit-tested) divides by 100 once:

- `avg_sale_to_list_pct` 96.12 → `avg_sale_to_list` 0.9612 (ratio ~1.0)
- `sold_above_list_pct` / `off_market_in_two_weeks_pct` → fractions 0–1
- `*_yoy_pct` / `*_mom_pct` → decimal fractions
- `avg_sale_to_list_yoy_ppts` → absolute ratio delta (ppts ÷ 100)

Contract fields whose source vanished stay as permanent nulls, never mapped from
a lookalike: `median_list_price` (`MEDIAN NEW LISTING PRICE` is a DIFFERENT
concept), `price_drops` (own dataset/pipeline). The pack reads neither.

### 3. The one contract change — DOM YoY becomes a fraction (user-visible)

Old feed: `MEDIAN_DOM_YOY` = absolute day difference (empirically verified 06/03).
New feed: `MEDIAN DAYS ON MARKET YOY (%)` = percent. Back-solving days from the
percent is recomputation — banned. So:

- Contract: `MEDIAN_DOM_YOY` = decimal fraction (percent/100)
- `housing-swfl.mts`: direction scoring unchanged (sign is sign); display switches
  from `formatDayDelta` day-copy to a percent format; detail column id
  `median_dom_yoy_days` → renamed to match semantics (verify no vocab-slug impact —
  key_metric slugs unchanged)
- `housing-source.mts` docstring updated; fixture + tests updated same commit

### 4. Source-staleness tripwire (in-pipeline, minimal honest version)

- **Pre-download:** HEAD the source; compare `ETag`/`Last-Modified` to the values the
  inventory row recorded last run. Unchanged → LOUD log "SOURCE UNCHANGED since
  MM/DD/YYYY" (not a failure — mid-cycle reruns are legitimate).
- **Post-load:** newest `PERIOD_END` must be within `MAX_CONTENT_AGE_DAYS = 40`
  of today — healthy pulls run ≤ ~25 days behind, ONE frozen cycle ≥ ~46, so 40
  trips RED on the first missed cycle (deliberately TIGHTER than the registry's
  30 × 2.0 probe threshold, per guards.py doctrine). Wired via the EXISTING
  `assert_content_fresh` / `ContentStaleError` seam. Volume floor
  `MIN_ROWS = 6_000` (healthy pull = 10,072 rows / 126 ZIPs, measured 07/16).
  Breach → exit 1 LOUD → GHA red. This is the "did we actually get anything" signal.
- Inventory row (`data_lake._tier1_inventory`) gains `source_etag`,
  `source_last_modified`, `max_period_end` (idempotent SQL migration, run directly).
- Keep the existing zero-row abort; add Gate 4 non-null guards via `ingest.lib.guards`
  on load-bearing columns (`MEDIAN_SALE_PRICE`, `PERIOD_BEGIN`, `zip_code`).
- The CLASS-wide vintage tripwire (all 32 brains) is NOT this build — stays open as
  `data_vintage_tripwire_missing`.

## Verification plan (operator decree: "make sure our numbers are matching up")

1. Local pipeline run → scratchpad parquet: assert newest window 04/01–06/30, ZIP
   count sane (~124), consumer query returns rows.
2. Spot-check: sampled SWFL ZIP rows in our parquet vs the source CSV verbatim (exact).
3. Real S3 run → targeted `housing-swfl` rebuild (decreed) → live serve shows the
   04/01 window.
4. Reconcile vs operator's downloaded weekly file
   (`Downloads/redfin_housing_market_weekly_all_metros_2026_May_to_2026_Jul.csv`,
   metro grain, rolling 4-week windows, 28 SWFL rows): band + direction agreement
   only — different window type and grain, NEVER forced to exact match. Report as
   "X verified, Y need review."
5. `ingest/cadence_registry.yaml`: `source_scope` block — confirmed = housing_market
   monthly all_zips fields we pull; ceiling = property_types + price_drops files +
   unpulled columns; `source_url` updated; `as_of` 07/16/2026.

## Out of scope

Class-wide data-vintage tripwire (`data_vintage_tripwire_missing`) · weekly-feed
ingest (the operator's weekly file is a verification instrument here, not a new
pipeline) · leaf-TTL policy change (35d TTL vs 30d source cadence — part of the
class check).

## Deployment note

The GHA cron executes the pipeline from origin/main — the retarget only protects
future crons after a push (currently gated on operator's word re: bundling the
parallel session's unpushed commit).
