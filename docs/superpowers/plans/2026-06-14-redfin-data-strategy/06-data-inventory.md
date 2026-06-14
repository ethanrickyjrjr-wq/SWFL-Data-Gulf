# SWFL Data Lake — Full Inventory Audit
_Compiled 2026-06-14. What we have, what's extra, what we still need._

---

## What We Have

### Housing / Real Estate (core)

| Dataset | Grain | Range | Rows | Status |
|---|---|---|---|---|
| `redfin_price_drops_swfl` | ZIP monthly | Apr 2019–May 2026 | 9,955 SWFL | Tier-1 Parquet ✅ (today) |
| `redfin_contract_cancellations_swfl` | ZIP monthly | Apr 2019–May 2026 | 9,955 SWFL | Tier-1 Parquet ✅ (today) |
| `redfin_delistings_relistings_swfl` | ZIP monthly | Apr 2019–May 2026 | 9,955 SWFL | Tier-1 Parquet ✅ (today) |
| `redfin_swfl` (old tracker) | ZIP monthly | ~2015–2026 | ~66K rows | Tier-1 ⚠️ price_drops column 100% NULL |
| `redfin_lee_market` | Lee County only | 2015–2026 | 660 rows | Tier-2 (county grain, single region) |
| `redfin_collier_market` | Collier County only | 2013–2026 | 782 rows | Tier-2 (county grain, single region) |
| `zhvi_swfl` | ZIP monthly | multi-year | 33,922 rows / 109 ZIPs | Tier-2 (Zillow home values, all-homes) |
| `zori_swfl` | ZIP monthly | multi-year | 5,185 rows / 94 ZIPs | Tier-2 (Zillow rents) |
| `fhfa_hpi` | Place-level | 1975–2026 | 133,226 rows / 472 places | Tier-2 (FHFA price index) |
| `leepa_parcels` | Parcel | current | 548,798 rows | Tier-2 (Lee County parcel data) |
| `collier_parcels` | Parcel | current | 290,973 rows | Tier-2 (Collier County parcel data) |

**Key stress signals now unlocked (all 3 Tier-1 tables, Apr 2019–May 2026):**
- `pct_active_with_drops` — % of active listings with a price cut (breadth, coincident)
- `avg_price_drop_pct` — average size of price cut (depth, lagging)
- `cancellation_rate_pct` — % of contracts that cancel (buyer exit, lagging ~30-60 days)
- `share_delisted_pct` — % of listings pulled from market (seller exit, LEADING)
- `share_relisted_pct` — % of delistings returning to market (stale inventory recycling)

### Permits / Construction

| Dataset | Rows | Status |
|---|---|---|
| `collier_building_permits` | 4,975 | Tier-2 ✅ |
| `lee_building_permits` | 194 | Tier-2 ⚠️ first-page only — pagination bug |
| `mhs_permits_swfl` | 281 | Tier-2 ✅ manufactured housing |
| `dbpr_sirs_submissions` | 240 | Tier-2 ✅ condo safety inspections (SB 4-D special assessment signal) |

### Economic / Labor

| Dataset | Rows | Status |
|---|---|---|
| `bls_laus` | 328 | Tier-2 ✅ unemployment, Lee+Collier+FL |
| `bls_oews_swfl` | 220 | Tier-2 ✅ labor demand by occupation |
| `bls_qcew` | 32 | Tier-2 ✅ employment by sector |
| `census_cbp_fl` | 255,563 | Tier-2 ✅ County Business Patterns |
| FRED G17, LAUS-ALFRED | — | Tier-1 ✅ macro indicators |

### Risk / Environmental

| Dataset | Rows | Status |
|---|---|---|
| `fema_nfip_claims_swfl` | 89,504 | Tier-2 ✅ flood claims — AAL per ZIP is insurance-shock signal |
| `hurdat2_fl` | — | Tier-1 ✅ hurricane tracks |
| `storm_events_swfl` | — | Tier-1 ✅ |
| `usgs_daily` | 605 | Tier-2 ✅ water levels |
| `noaa_ghcn_rainfall` | 6 | Tier-2 ⚠️ very sparse |

### Airport / Tourism / Traffic (SWFL-specific context)

| Dataset | Rows | Status |
|---|---|---|
| `rsw_airport_monthly` | 2,580 | Tier-2 ✅ 5 metrics, 1983–2026 — snowbird seasonality proxy |
| `fdot_aadt_swfl_yearly` | 3,655 | Tier-2 ✅ traffic volumes |
| `marketbeat_swfl` | 309 | Tier-2 ✅ Cushman & Wakefield CRE quarterly |
| `fdle_crime_swfl` | — | Tier-2 ✅ |
| `fl_dbpr_licenses` | 12,291 | Tier-2 ✅ business licenses |
| `city_pulse_corridors` | 125 | Tier-2 ✅ corridor activity |

### Live Brains (31 packs)

housing-swfl, home-values-swfl, rentals-swfl, properties-lee-value, properties-collier-value,
cre-swfl, macro-swfl, macro-florida, macro-us, safety-swfl, env-swfl, permits-swfl,
permits-commercial-swfl, rsw-airport, traffic-swfl, tourism-tdt, condo-sirs-swfl,
econ-dev-swfl, labor-demand-swfl, licenses-swfl, logistics-swfl, logistics-swfl-nowcast,
corridor-pulse-swfl, city-pulse-swfl, storm-history-swfl, fgcu-reri, investor-zip-swfl,
news-swfl, sector-credit-swfl, hurricane-tracks-fl, master

---

## What We Need — Priority Order

### P1 — Must-Build for Seller Stress (next PR)

| What | Why | Source | Note |
|---|---|---|---|
| `seller-stress-swfl` brain | Consumes all 3 new Tier-1 tables; confirmed moat (no competitor at ZIP + cancellations) | data already in Tier-1 | Spec: `docs/superpowers/specs/2026-06-14-seller-stress-swfl-design.md` |

### P2 — Housing Market New Format (ZIP tracker replacement)

| What | Why | Source |
|---|---|---|
| `housing_market/monthly/all_zips.csv` pipeline | Old `redfin_swfl` has NULL price_drops; new format gives DOM, inventory, pending, sold_above_list, off_market_in_2wks cleanly | Redfin S3 `redfin_data_center/` (567 MB plain CSV) |

### P3 — City-Level Grain (4 datasets × city)

Confirmed present in city file: Cape Coral, Fort Myers, Naples, Bonita Springs, Estero, Lehigh Acres.

| Dataset | Source path | Size |
|---|---|---|
| housing_market city | `housing_market/monthly/all_cities.csv` | 479 MB |
| price_drops city | `price_drops/monthly/all_cities.csv` | ~85 MB |
| contract_cancellations city | `contract_cancellations/monthly/all_cities.csv` | ~70 MB |
| delistings_relistings city | `delistings_relistings/monthly/all_cities.csv` | ~82 MB |

### P4 — Zillow ZHVI Tier Splits (luxury + starter)

| What | Status |
|---|---|
| `zhvi_swfl_top_tier` | URL confirmed live (200 OK, 145 MB) — luxury proxy (65th–95th pctile) |
| `zhvi_swfl_bottom_tier` | URL confirmed live (200 OK, 136 MB) — starter proxy (5th–35th pctile) |

Both URLs are in `docs/data-sources-discovery-2026-06-13.md`. No pipeline built yet.

### P5 — Neighborhood Grain (sub-ZIP canal analysis)

| Dataset | Source path | Size | Note |
|---|---|---|---|
| housing_market neighborhood | `housing_market/monthly/all_neighborhoods.csv` | 700 MB | Need SWFL spot-check first |
| price_drops neighborhood | `price_drops/monthly/all_neighborhoods.csv` | ~200 MB | |
| delistings_relistings neighborhood | `delistings_relistings/monthly/all_neighborhoods.csv` | ~200 MB | |

Critical for Cape Coral: canal-front vs inland ZIPs share the same ZIP code — neighborhood grain is the only way to split them.

---

## What We Have That's Extra (Context / Enrichment)

These datasets are live but don't yet have a consuming brain or are underutilized:

| Dataset | Gap |
|---|---|
| `fhfa_hpi` (133K rows, 1975–2026) | No brain yet; better long-run price index than ZHVI at some grains |
| `lee_building_permits` (194 rows) | Pagination bug — only first page; v2 needs fixing |
| `noaa_ghcn_rainfall` (6 rows) | Too sparse to use |
| Zillow ZHVI top/bottom tier | URLs confirmed, no pipeline |
| Redfin metro-weekly (83MB/39MB/33MB/39MB) | Confirmed live; excluded from build queue (metro-only, noisy, no ZIP grain) |

---

## Confirmed Not Available at ZIP Grain

These Redfin Data Center datasets exist at metro/census region only — no ZIP file exists, confirmed via HEAD probe:

- Balance of Power, Luxury, Starter Home, Investor Purchases, Financing Trends, RHPI

ZIP substitutes are mapped in `docs/data-sources-discovery-2026-06-13.md`.

---

## Moat Summary

**The key moat is Seller Stress at ZIP grain with cancellations.** No vendor publishes a composite at ZIP level that includes cancellation rate:
- Zillow MHI: equal-weight (page views + price cuts + pending speed), no cancellations, no ZIP grain
- Realtor.com Hotness: 50/50 views/DOM, buyer demand only
- NAR: separate diffusion indexes, not combined

7 years of ZIP-level monthly data (Apr 2019–May 2026) + 126 SWFL ZIPs + cancellations + delistings = structurally differentiated.
