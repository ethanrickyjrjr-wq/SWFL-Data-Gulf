# rsw-airport v3 redesign — 5-metric throughput + snowbird-proof direction

**Date:** 2026-06-13
**Status:** Implemented (diff-first, pending operator review + push)
**Brain:** `rsw-airport` (leaf, hospitality domain)

## Context / problem

The `rsw-airport` brain has only ever read **enplanements (boardings = departures)** — the
original pipeline regex matched `enplane*` only. The v3 pipeline now ingests all 5 LCPA metrics
into `public.rsw_airport_monthly` (2,580 rows, 1983–2026, **100% RSW** — PGD has 0 rows):
enplanements, deplanements, total_passengers, aircraft_operations, total_freight_lbs. The brain
was running a tourism-demand indicator off the wrong half of the signal (departures, not arrivals)
and ignoring capacity and air cargo entirely.

## Decisions (operator-locked)

1. **RSW-only.** Drop all PGD logic. PGD (Punta Gorda / Charlotte County) is a separate operator
   with no LCPA source; if it ever gets one it is a separate brain. (PGD = 0 rows live → pure
   dead-code removal.)
2. **Direction = trailing-12-month `total_passengers` YoY** (rolling last-12 vs prior-12),
   replacing single-month enplanements YoY.

## Why (research-backed, reputable sources, verified in-session)

- **RSW is an extreme snowbird-seasonal airport** (Jan–Mar peak; ACI World: >50% of airports peak
  Jul–Aug — RSW is the inverse outlier). Single-month YoY throws false flips; BTS notes monthly
  comparisons are distorted by day-count/holiday timing. A rolling 12-month total is the standard
  deseasonalizer. *Real-data proof:* April 2026 single-month total passengers is −2.2% YoY, but the
  trailing-12 is +2.4% → correctly **bullish**. The old signal would have falsely flipped bearish.
- **RSW is a point-to-point O&D destination**, not a hub, so the TRB/ACRP caveat that "enplanements
  mislead at hubs" doesn't bite — but `total_passengers` is the canonical throughput KPI RSW
  publicizes, lower-variance, and the cleanest citation story.
- **Direction Counting Error** (DWU): `total_passengers = enplanements + deplanements` is one
  underlying movement. total_passengers is the **sole** direction input; enplanements + deplanements
  are decomposition context, never separate vote inputs.
- **Pairings** (Zonda/Realtor + Builder + ACI + IATA): airport boardings lead housing demand and
  signal STR/second-home/service-sector activity; arrivals proxy migration; air cargo is a
  goods-economy signal. Sources: crp.trb.org, dwuconsulting.com, bts.gov, blog.aci.aero,
  realtor.com, builderonline.com, iata.org (scrapes under `.firecrawl/`).

## Design as built

**Direction signal.** `t12_yoy = (sum(last 12 total_passengers) − sum(prior 12)) / sum(prior 12)`.
bullish/bearish/neutral on sign; `null` (<24 months) → neutral + caveat. Computed from `value`
(all 516 months non-null), **not** the stored `yoy_pct_change` column (only 12 months populated).

**Magnitude.** `min(|t12_yoy| / 15, 1.0)`. Divisor 15 ≈ P85 of the normal-regime (COVID-excluded)
distribution of |trailing-12 total_passengers YoY| over 1985–2026 (P85=14.7%, P90=18.1%, n=463).
Recalibrated UP from the legacy single-month `/20`, which under-registered the lower-variance
trailing-12 signal. Current +2.4% → magnitude 0.16 (appropriately weak).

**key_metrics roster (9):** `rsw_trailing_12mo_total_passengers_yoy` (driver) ·
`rsw_trailing_12mo_total_passengers` · `rsw_total_passengers` (+ single-month momentum in its
direction) · `rsw_deplanements` (arrivals) · `rsw_monthly_enplanements` (departures) ·
`rsw_aircraft_operations` · `rsw_freight_lbs` · `rsw_pax_per_operation` (utilization PROXY) ·
`rsw_seasonality_ratio` (characterizing: peak ÷ median trailing-12; live value 1.71).

**grain_boundary honesty lines:** O&D/PDEW not published (we proxy with throughput); deplanements =
arrivals/inbound throughput, not a visitor count; pax/operation ≠ airline load factor; seasonality
ratio is characterizing, not a signal; PGD out of scope.

**Source window:** widened 15 → **30 months** (`rsw-airport-source.mts`). Trailing-12 YoY needs 24
months of DATA; with LCPA's ~2–3 month publishing lag a 30-month wall-clock window yields ~27–28
months of data — headroom above the 24 floor. (26 months landed exactly at 24 → too tight.)

## Vocab

Added 8 output-slug concepts + 4 raw-metric concepts (`deplanements`, `total_passengers`,
`aircraft_operations`, `total_freight_lbs` — the fragment `metric` column values that Stage 2.5
normalize resolves) + all slug_index entries. Removed `rsw_trailing_12mo_enplanements`,
`pgd_monthly_enplanements`, `pgd_yoy_pct_change` (grep-cleared: no constitution/master/pack/lib
reference). Kept `rsw_monthly_enplanements` (still emitted) and `rsw_yoy_pct_change` (dormant).

## Pairings (master synthesizes — leaf emits only, thin pipe)

`tourism-tdt` (arrivals vs hotel/STR tax) · `home-values-swfl`/`rentals-swfl` (boardings lead
housing) · `cre-swfl` (service/retail absorption) · `labor-demand-swfl` (leisure-hospitality jobs)
· `logistics-swfl` (air freight ↔ truck freight).

## Files

`refinery/sources/rsw-airport-source.mts` · `refinery/packs/rsw-airport.mts` ·
`refinery/packs/rsw-airport.test.mts` · `refinery/packs/catalog.mts` (scope mirror) ·
`refinery/vocab/brain-vocabulary.json` · `refinery/__fixtures__/rsw-airport.sample.json` (real
29-month pull) · `brains/rsw-airport.md` (re-rendered v5).

## Verification (run, green)

- `bun test refinery/packs/rsw-airport.test.mts` → 8/8.
- `bun test refinery/packs/catalog.test.mts` → 4/4 (after scope mirror).
- `bun refinery/tools/check-vocab-coverage.mts --all` → OK, all 30 brains, every emitted metric
  resolves.
- `bun refinery/cli.mts rsw-airport --force` → renders v5, 0 orphans, direction bullish (+2.4%).
- `refinery:typecheck` → no NEW production errors (test-file `bun:test`/`Parameters` hits are the
  pre-existing accepted baseline pattern).

## Out of scope

PGD/Charlotte County sourcing · DB schema change (seasonality_ratio + pax/op are pack-derived) ·
cadence cron change · O&D/PDEW/RPM/ASM/load-factor (LCPA doesn't publish) · live MCP re-verify
(post-deploy).
