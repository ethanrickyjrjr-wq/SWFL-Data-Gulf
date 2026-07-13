# HANDOFF: /ops Data Inventory Page

**Date:** 2026-06-15  
**Status:** BUILT IN WRONG REPO — needs to be built in swfldatagulf-ops repo  
**Context was compacting — read this before doing anything**

---

## What the user asked for

A new page on the ops dashboard (`https://swfldatagulf-ops.vercel.app/`) showing all data lake pipelines organized by ingestion cadence, highlighting which ones don't have ZIP grain. Should match the /ops site colors and style.

Layout requirements:
- Excel-style table, dark theme matching /ops colors
- Sections by cadence: Daily → Weekly → Monthly → Quarterly → Annual
- Within each section: **non-ZIP grain datasets first** (these are the ZIP grain machine candidates)
- Show grain level (ZIP / county / state / national / MSA / submarket / station / corridor / city / parcel / route / track)
- Show ingestion schedule (cron) and notes/issues
- **Button at end of each non-Daily section** that Claude or operator can click when ZIP grain routing for that section is done — with a notes field for issues/updates/keywords

---

## What went wrong this session

I built it in `brain-platform` (swfldatagulf.com — the USER-FACING site) instead of the `swfldatagulf-ops` repo. This was wrong. I have reverted all changes to brain-platform:
- `app/ops/` directory deleted
- `components/landing/Header.tsx` restored to HEAD
- `SESSION_LOG.md` / `build-queue.md` bad entries reverted
- Two bad commits (`0e2244b`, `7a89e39`) were soft-reset — they were never pushed

**brain-platform is now clean.** The bad commits are gone from history locally. Nothing was pushed.

---

## The correct repo

The ops dashboard is a **separate repo** at a different path on this machine. Find it — it's the repo that deploys to `swfldatagulf-ops.vercel.app`. Likely named `swfldatagulf-ops` somewhere in `C:\Users\ethan\dev\`.

---

## The data catalog (already researched — use this)

All 48 pipelines from `brain-platform/ingest/cadence_registry.yaml` have been cataloged. The full TypeScript data object is below. Copy it into the ops repo — don't redo the research.

### Cadence summary
- **Daily (1):** city_pulse — city grain, no ZIP
- **Weekly (7):** swfl_inc, dbpr_press_releases, dbpr_public_notices, corridor pulse ×2 (all no ZIP) + lee_permits (partial ZIP), crexi_listings (partial ZIP, ODD window)
- **Monthly (24):** ~11 non-ZIP, 3 partial, 10 full ZIP
- **Quarterly (10):** ~8 non-ZIP/partial + fhfa (full ZIP)
- **Annual (9):** ~6 non-ZIP/partial + mhs_permits (partial ZIP), airdna (full ZIP, not running)

### Non-ZIP datasets that NEED the ZIP grain machine (priority order):
1. **FEMA NFIP** (448K claims) — raw data HAS `zip_code` column, just needs brain surface
2. **Collier permits** — site address present, needs G2 geocoding
3. **NOAA GHCN rainfall** — 4 fixed stations, trivial ZIP mapping
4. **USGS gauges** — station coords present, point-in-polygon join needed
5. **DBPR SIRS condos** — building identifiers present, geocodable
6. **CRE submarket family** (marketbeat_swfl, colliers_industrial, mhs_databook, lee_associates) — all need same submarket→ZIP crosswalk
7. **LeePA parcels** — G2 DEFERRED (check: parcels_lee_zip_source_layer)
8. **Collier parcels** — site address present, G2 geocoding needed
9. **FDOT traffic** — station lat/lon present, spatial join needed
10. **Census CBP** — Census ZBP is a separate product, not yet wired
11. **SBA Franchise** — ZIP-approx supplemental planned, not yet running

---

## Full data catalog TypeScript (copy into ops repo)

```typescript
// Derived from brain-platform/ingest/cadence_registry.yaml (2026-06-14)

export type Cadence = "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Annual";
export type Grain = "zip" | "county" | "state" | "national" | "msa" | "submarket" | "station" | "corridor" | "city" | "parcel" | "route" | "track";
export type PipelineStatus = "active" | "odd-window" | "not-yet-running" | "dead-end";
export type ZipStatus = "full" | "partial" | "none";

export interface Pipeline {
  id: string;
  label: string;
  cadence: Cadence;
  lane: "tier-1" | "tier-1-duckdb" | "tier-2";
  grain: Grain;
  zipStatus: ZipStatus;
  zipNote?: string;
  table: string;
  pipelineStatus: PipelineStatus;
  notes: string;
  cronNotes: string;
  ghWorkflow?: string;
}

export const PIPELINES: Pipeline[] = [
  // DAILY
  { id: "city_pulse", label: "City Pulse (7 SWFL cities)", cadence: "Daily", lane: "tier-1", grain: "city", zipStatus: "none", table: "lake-tier1/city_pulse/ → data_lake.city_pulse", pipelineStatus: "active", notes: "Daily web_search current-events for 7 SWFL cities. City grain only — no sub-city ZIP breakdown possible.", cronNotes: "Daily — city-pulse-daily.yml", ghWorkflow: "city-pulse-daily.yml" },

  // WEEKLY — non-ZIP first
  { id: "swfl_inc", label: "SWFL Inc. Announcements", cadence: "Weekly", lane: "tier-2", grain: "county", zipStatus: "none", table: "public.swfl_inc_announcements", pipelineStatus: "active", notes: "Lee County EDO blog scrape via Firecrawl. No zip_code field.", cronNotes: "Mon 08:00 UTC — swfl-inc-weekly.yml", ghWorkflow: "swfl-inc-weekly.yml" },
  { id: "dbpr_press_releases", label: "FL DBPR Press Releases", cadence: "Weekly", lane: "tier-2", grain: "state", zipStatus: "none", table: "public.dbpr_press_releases", pipelineStatus: "active", notes: "Statewide FL DBPR releases; SWFL-filtered. geographic_mentions extracted but no zip_code column.", cronNotes: "Mon 09:00 UTC — dbpr-press-releases-weekly.yml", ghWorkflow: "dbpr-press-releases-weekly.yml" },
  { id: "dbpr_public_notices", label: "FL DBPR Public Notices", cadence: "Weekly", lane: "tier-2", grain: "county", zipStatus: "none", table: "public.dbpr_public_notices", pipelineStatus: "active", notes: "Enforcement notices for Lee/Collier/Charlotte/Sarasota/Manatee/Hendry/Monroe. County scope, no ZIP.", cronNotes: "Mon 10:00 UTC — dbpr-public-notices-weekly.yml", ghWorkflow: "dbpr-public-notices-weekly.yml" },
  { id: "city_pulse_corridors_t1", label: "Corridor Pulse (Tier-1 Parquet)", cadence: "Weekly", lane: "tier-1", grain: "corridor", zipStatus: "none", table: "lake-tier1/city_pulse_corridors/", pipelineStatus: "active", notes: "Weekly CRE current-events for SWFL corridors. Corridor grain — no ZIP breakdown.", cronNotes: "Sun 10:00 UTC — corridor-pulse-weekly.yml", ghWorkflow: "corridor-pulse-weekly.yml" },
  { id: "city_pulse_corridors_t2", label: "Corridor Pulse (Tier-2 Postgres)", cadence: "Weekly", lane: "tier-2", grain: "corridor", zipStatus: "none", table: "data_lake.city_pulse_corridors", pipelineStatus: "active", notes: "Postgres promotion. Recency watchdog only (0 rows on quiet news weeks is valid).", cronNotes: "Same cron as Tier-1 corridor pulse" },
  { id: "lee_permits", label: "Lee County Building Permits", cadence: "Weekly", lane: "tier-2", grain: "zip", zipStatus: "partial", zipNote: "Site ZIP via geocoding (G2). Lehigh Acres: 0/119 rows have lat/lon from Accela → geocoding blocked.", table: "data_lake.lee_building_permits", pipelineStatus: "active", notes: "v2 pagination fixed 2026-06-06. Weekly Accela scrape. ~1.2 permits/day.", cronNotes: "Weekly — lee-permits-weekly.yml", ghWorkflow: "lee-permits-weekly.yml" },
  { id: "crexi_listings", label: "Crexi Active CRE Listings", cadence: "Weekly", lane: "tier-2", grain: "zip", zipStatus: "partial", zipNote: "Only covers ZIPs 33928 (Estero) + 33931 (FMB) — not full SWFL ZIP coverage.", table: "data_lake.active_listings_cre", pipelineStatus: "odd-window", notes: "Table exists. Pipeline NOT YET activated — first GHA run needed.", cronNotes: "Weekly Firecrawl agent (planned) — GHA NOT yet created" },

  // MONTHLY — non-ZIP first
  { id: "storm_history_swfl", label: "NOAA Storm Events SWFL", cadence: "Monthly", lane: "tier-1-duckdb", grain: "county", zipStatus: "none", table: "lake-tier1/environmental/storm_events_swfl.parquet", pipelineStatus: "active", notes: "County-grain storm records 1996–2025. NOAA GHCND events don't carry ZIP fields.", cronNotes: "Monthly — storm-events-monthly.yml" },
  { id: "usgs_t1", label: "USGS Water Gauges (Tier-1)", cadence: "Monthly", lane: "tier-1-duckdb", grain: "station", zipStatus: "none", zipNote: "Station coords present — ZIP derivable via point-in-polygon join but not stamped.", table: "lake-tier1/environmental/usgs_water_swfl.parquet", pipelineStatus: "active", notes: "Daily readings 2000–2026 for ~4 SWFL anchor gauges.", cronNotes: "Monthly — usgs-monthly.yml" },
  { id: "fred_g17", label: "FRED G.17 Industrial Production", cadence: "Monthly", lane: "tier-1", grain: "national", zipStatus: "none", table: "lake-tier1/macro/fred_g17/", pipelineStatus: "active", notes: "National industrial production index. No sub-national grain available.", cronNotes: "Monthly — fred-g17-monthly.yml" },
  { id: "bls_ppi", label: "BLS Producer Price Index", cadence: "Monthly", lane: "tier-1", grain: "national", zipStatus: "none", table: "lake-tier1/macro/bls_ppi/", pipelineStatus: "active", notes: "National PPI series. ZIP grain not possible.", cronNotes: "Monthly — bls-ppi-monthly.yml" },
  { id: "census_vip", label: "Census VIP Building Permits Survey", cadence: "Monthly", lane: "tier-1", grain: "county", zipStatus: "none", table: "lake-tier1/macro/census_vip/", pipelineStatus: "active", notes: "County grain for Lee + Collier. No ZIP breakdown in VIP series.", cronNotes: "Monthly — census-vip-monthly.yml" },
  { id: "fred_laus_alfred", label: "FRED LAUS ALFRED Vintage (PIT)", cadence: "Monthly", lane: "tier-1", grain: "county", zipStatus: "none", table: "lake-tier1/macro/fred_laus_alfred/", pipelineStatus: "active", notes: "Point-in-time LAUS vintages. 231 vintages ~19yr. Enables backtesting.", cronNotes: "Monthly — fred-laus-alfred-monthly.yml" },
  { id: "bls_laus", label: "BLS LAUS (Unemployment)", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "none", table: "data_lake.bls_laus", pipelineStatus: "active", notes: "Lee + Collier + FL labor force/unemployment. BLS LAUS doesn't publish ZIP-level.", cronNotes: "Monthly — bls-laus-monthly.yml" },
  { id: "usgs_t2", label: "USGS Daily Readings (Tier-2 Postgres)", cadence: "Monthly", lane: "tier-2", grain: "station", zipStatus: "none", table: "data_lake.usgs_daily", pipelineStatus: "active", notes: "Postgres copy of gauge readings. usgs_sites legacy table → DROP once env-swfl migrates.", cronNotes: "Monthly — usgs-monthly.yml" },
  { id: "redfin_collier", label: "Redfin County Tracker — Collier", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "none", table: "data_lake.redfin_collier_market", pipelineStatus: "active", notes: "~782 rows county-level aggregates. Use redfin_swfl parquet for ZIP grain.", cronNotes: "Monthly — redfin-monthly.yml" },
  { id: "redfin_lee", label: "Redfin County Tracker — Lee", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "none", table: "data_lake.redfin_lee_market", pipelineStatus: "active", notes: "~660 rows county-level. Use redfin_swfl parquet for ZIP grain.", cronNotes: "Monthly — redfin-monthly.yml" },
  { id: "fl_dor_tdt", label: "FL DOR Tourist Development Tax", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "none", table: "public.fl_dor_tdt_collections", pipelineStatus: "active", notes: "Tourist tax collections Lee + Collier FY1999–present. County level only.", cronNotes: "20th of month 10:00 UTC — fl-dor-tdt-monthly.yml", ghWorkflow: "fl-dor-tdt-monthly.yml" },
  { id: "fl_dor_sales_tax", label: "FL DOR Sales Tax Collections", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "none", table: "public.fl_dor_sales_tax", pipelineStatus: "active", notes: "40K rows by county + SIC code cy2002–present.", cronNotes: "15th of month 11:00 UTC — fl-dor-sales-tax-monthly.yml", ghWorkflow: "fl-dor-sales-tax-monthly.yml" },
  { id: "fgcu_reri", label: "FGCU RERI Economic Indicators", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "none", table: "public.fgcu_reri_indicators", pipelineStatus: "active", notes: "8 indicators/month. Lee + Collier + Charlotte. ~2-mo data lag.", cronNotes: "5th of month 14:00 UTC — fgcu-reri-monthly.yml", ghWorkflow: "fgcu-reri-monthly.yml" },
  { id: "rsw_airport", label: "RSW Airport Monthly Stats", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "none", table: "public.rsw_airport_monthly", pipelineStatus: "active", notes: "5 metrics from LCPA PDFs. Airport = Lee County grain.", cronNotes: "8th of month 15:00 UTC — rsw-airport-monthly.yml", ghWorkflow: "rsw-airport-monthly.yml" },
  { id: "collier_permits", label: "Collier County Permits", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "partial", zipNote: "Site address present — ZIP derivable via geocoding (G2), not yet built.", table: "data_lake.collier_building_permits", pipelineStatus: "active", notes: "XLSX-loaded monthly. Has site address but no zip_code field extracted.", cronNotes: "Monthly — collier-permits-monthly.yml", ghWorkflow: "collier-permits-monthly.yml" },
  { id: "noaa_ghcn", label: "NOAA GHCN Annual Rainfall", cadence: "Monthly", lane: "tier-2", grain: "station", zipStatus: "partial", zipNote: "4 fixed stations (FMY, RSW, Naples Muni, Naples COOP) — trivial to map to 4 ZIPs, not stamped.", table: "data_lake.noaa_ghcn_rainfall", pipelineStatus: "active", notes: "Annual totals for 4 SWFL anchor stations.", cronNotes: "5th of month 14:00 UTC — noaa-ghcn-rainfall-monthly.yml", ghWorkflow: "noaa-ghcn-rainfall-monthly.yml" },
  { id: "fl_dbpr_licenses", label: "FL DBPR Contractor Licenses", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "none", table: "data_lake.fl_dbpr_licenses", pipelineStatus: "active", notes: "Lee 6,342 + Collier 3,281 active. Licensee has mailing ZIP (owner ZIP — G1 violation to use as site ZIP).", cronNotes: "5th of month 10:00 UTC — ingest-fl-dbpr-licenses.yml", ghWorkflow: "ingest-fl-dbpr-licenses.yml" },
  { id: "fl_dbpr_applicants", label: "FL DBPR Construction Applicants", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "none", table: "data_lake.fl_dbpr_applicants", pipelineStatus: "active", notes: "Lee 6,031 / Collier 2,696 applicants. Same cron as fl_dbpr_licenses.", cronNotes: "5th of month 10:00 UTC — ingest-fl-dbpr-licenses.yml", ghWorkflow: "ingest-fl-dbpr-licenses.yml" },
  { id: "dbpr_sirs", label: "FL DBPR SIRS Condo Reports", cadence: "Monthly", lane: "tier-2", grain: "county", zipStatus: "partial", zipNote: "Building identifiers present — ZIP addressable via geocoding, not implemented.", table: "data_lake.dbpr_sirs_submissions", pipelineStatus: "active", notes: "239 rows: Lee 83 / Collier 159. Qlik hypercube result_truncated=true expected. Positive signal only.", cronNotes: "First Monday of month 07:00 UTC — dbpr-sirs-monthly.yml", ghWorkflow: "dbpr-sirs-monthly.yml" },
  { id: "swfl_search_demand", label: "SWFL Search Demand (DataForSEO)", cadence: "Monthly", lane: "tier-2", grain: "national", zipStatus: "none", table: "public.swfl_search_demand", pipelineStatus: "active", notes: "Google Ads volume proxy. Operator-internal only. No consuming brain.", cronNotes: "2nd of month 16:00 UTC — swfl-search-demand-monthly.yml", ghWorkflow: "swfl-search-demand-monthly.yml" },
  { id: "estero_edc", label: "Estero EDC Development Pipeline", cadence: "Monthly", lane: "tier-2", grain: "city", zipStatus: "none", table: "data_lake.local_cre_context", pipelineStatus: "odd-window", notes: "6 active Estero development rows. estero-fl.gov returns 526. First GHA run pending.", cronNotes: "Monthly — ingest-local-cre-context.yml (ODD window)" },
  { id: "airdna", label: "AirDNA STR (Short-Term Rental)", cadence: "Monthly", lane: "tier-1-duckdb", grain: "zip", zipStatus: "full", zipNote: "ZIP is AirDNA's native grain. Tier-1 slot reserved until subscription acquired ($179/mo FL state).", table: "lake-tier1/market/airdna_str_swfl.parquet (reserved)", pipelineStatus: "not-yet-running", notes: "ODD source — manual portal. Consumer (investor-zip-swfl) already empty-tolerant.", cronNotes: "Not running — manual ODD drop needed" },
  // Monthly ZIP grain
  { id: "zori_t1", label: "ZORI Rent Index ZIP — Tier-1", cadence: "Monthly", lane: "tier-1-duckdb", grain: "zip", zipStatus: "full", table: "lake-tier1/market/zori_swfl.parquet", pipelineStatus: "active", notes: "Zillow ZORI ZIP-level observed rent. ~126 SWFL ZIPs monthly.", cronNotes: "22nd of month — zori-tier1-monthly.yml" },
  { id: "zhvi_t1", label: "ZHVI Home Value Index ZIP — Tier-1", cadence: "Monthly", lane: "tier-1-duckdb", grain: "zip", zipStatus: "full", table: "lake-tier1/market/zhvi_swfl.parquet", pipelineStatus: "active", notes: "Zillow ZHVI ZIP all-homes middle-tier smoothed+SA.", cronNotes: "22nd of month — zhvi-tier1-monthly.yml" },
  { id: "tier_divergence_t1", label: "ZHVI Tier Split ZIP — Tier-1", cadence: "Monthly", lane: "tier-1-duckdb", grain: "zip", zipStatus: "full", table: "lake-tier1/market/tier_divergence_swfl.parquet", pipelineStatus: "active", notes: "Top 0.67-1.0 luxury vs bottom 0.0-0.33 starter tier.", cronNotes: "21st of month — tier-divergence-tier1-monthly.yml" },
  { id: "redfin_swfl", label: "Redfin Market Data ZIP", cadence: "Monthly", lane: "tier-1-duckdb", grain: "zip", zipStatus: "full", table: "lake-tier1/market/redfin_swfl.parquet", pipelineStatus: "active", notes: "66,672 rows / 125 ZIPs. Median sale price, DOM, listings, sales count.", cronNotes: "Monthly — redfin-monthly.yml" },
  { id: "redfin_price_drops", label: "Redfin Price Drops ZIP", cadence: "Monthly", lane: "tier-1-duckdb", grain: "zip", zipStatus: "full", table: "lake-tier1/market/redfin_price_drops.parquet", pipelineStatus: "active", notes: "9,955 rows / 126 ZIPs.", cronNotes: "15th of month 17:00 UTC — redfin-price-drops-monthly.yml" },
  { id: "redfin_cancellations", label: "Redfin Contract Cancellations ZIP", cadence: "Monthly", lane: "tier-1-duckdb", grain: "zip", zipStatus: "full", table: "lake-tier1/market/redfin_contract_cancellations.parquet", pipelineStatus: "active", notes: "9,955 rows / 126 ZIPs.", cronNotes: "15th of month 18:00 UTC — redfin-cancellations-monthly.yml" },
  { id: "redfin_delistings", label: "Redfin Delistings + Relistings ZIP", cadence: "Monthly", lane: "tier-1-duckdb", grain: "zip", zipStatus: "full", table: "lake-tier1/market/redfin_delistings_relistings.parquet", pipelineStatus: "active", notes: "9,955 rows / 126 ZIPs.", cronNotes: "15th of month 19:00 UTC — redfin-delistings-monthly.yml" },
  { id: "zori_t2", label: "ZORI ZIP — Tier-2 Postgres", cadence: "Monthly", lane: "tier-2", grain: "zip", zipStatus: "full", table: "data_lake.zori_zip_latest (view)", pipelineStatus: "active", notes: "5,185 rows. Liveness view probed daily.", cronNotes: "Monthly — zori-tier2-monthly.yml" },
  { id: "zhvi_t2", label: "ZHVI ZIP — Tier-2 Postgres", cadence: "Monthly", lane: "tier-2", grain: "zip", zipStatus: "full", table: "data_lake.zhvi_zip_latest (view)", pipelineStatus: "active", notes: "Liveness view probed daily.", cronNotes: "23rd of month — zhvi-tier2-monthly.yml" },
  { id: "tier_divergence_t2", label: "ZHVI Tier Split ZIP — Tier-2 Postgres", cadence: "Monthly", lane: "tier-2", grain: "zip", zipStatus: "full", table: "data_lake.tier_divergence_zip_latest (view)", pipelineStatus: "active", notes: "~107 SWFL ZIPs both tiers. Liveness view probed daily.", cronNotes: "22nd of month — tier-divergence-tier2-monthly.yml" },

  // QUARTERLY — non-ZIP first
  { id: "bls_qcew", label: "BLS QCEW (Employment by Industry)", cadence: "Quarterly", lane: "tier-2", grain: "county", zipStatus: "none", table: "data_lake.bls_qcew", pipelineStatus: "active", notes: "32 rows (Lee + Collier by sector). County-level only.", cronNotes: "Quarterly — bls-qcew-quarterly.yml" },
  { id: "fema_nfip", label: "FEMA NFIP Flood Claims", cadence: "Quarterly", lane: "tier-2", grain: "county", zipStatus: "partial", zipNote: "Raw FEMA data includes zip_code field — not currently surfaced at brain layer. Quick win.", table: "data_lake.fema_nfip_claims", pipelineStatus: "active", notes: "448K claims. Has zip_code in raw rows — needs surface in consuming brain.", cronNotes: "Quarterly — fema-nfip-quarterly.yml" },
  { id: "fdle_crime", label: "FBI CDE Crime Rates SWFL", cadence: "Quarterly", lane: "tier-2", grain: "county", zipStatus: "none", table: "public.fdle_crime_swfl", pipelineStatus: "active", notes: "6 rows (2022-2024 × Lee+Collier). No sub-county ZIP from FBI CDE.", cronNotes: "Quarterly 1st Jan/Apr/Jul/Oct 12:00 UTC — fdle-crime-quarterly.yml", ghWorkflow: "fdle-crime-quarterly.yml" },
  { id: "marketbeat_swfl", label: "C&W MarketBeat CRE Reports", cadence: "Quarterly", lane: "tier-2", grain: "submarket", zipStatus: "none", zipNote: "Needs submarket→ZIP crosswalk to route CRE vacancy/rent to ZIP grain.", table: "data_lake.marketbeat_swfl (source_name=cw_marketbeat)", pipelineStatus: "active", notes: "109 rows (7 qtrs × ~15 submarkets). Manual ODD PDF drop.", cronNotes: "Quarterly Jan/Apr/Jul/Oct 15 — marketbeat-pdf-ingest.yml", ghWorkflow: "marketbeat-pdf-ingest.yml" },
  { id: "colliers_industrial", label: "Colliers Industrial Reports", cadence: "Quarterly", lane: "tier-2", grain: "submarket", zipStatus: "none", zipNote: "Needs submarket→ZIP crosswalk.", table: "data_lake.marketbeat_swfl (source_name=colliers_industrial)", pipelineStatus: "active", notes: "132 rows. Same table+cron as C&W. Q4 2024 form-gated.", cronNotes: "Quarterly — marketbeat-pdf-ingest.yml", ghWorkflow: "marketbeat-pdf-ingest.yml" },
  { id: "fmb_recovery", label: "Fort Myers Beach Recovery Pipeline", cadence: "Quarterly", lane: "tier-2", grain: "city", zipStatus: "none", table: "data_lake.local_cre_context (source_name=fmb_planning)", pipelineStatus: "odd-window", notes: "$1.107B CDBG-DR. 8 rows live. First GHA run pending.", cronNotes: "Quarterly — ingest-local-cre-context.yml (ODD window)" },
  { id: "lee_associates", label: "Lee & Associates SWFL Reports", cadence: "Quarterly", lane: "tier-2", grain: "submarket", zipStatus: "none", zipNote: "Needs submarket→ZIP crosswalk.", table: "data_lake.marketbeat_swfl (source_name=lee_associates)", pipelineStatus: "odd-window", notes: "Fort Myers Q1-2026 loaded (20 rows). GHA cron NOT yet green.", cronNotes: "Quarterly 20th Feb/May/Aug/Nov (planned) — NOT YET ACTIVATED" },
  { id: "premier_commercial", label: "Premier Commercial (Dead End)", cadence: "Quarterly", lane: "tier-2", grain: "submarket", zipStatus: "none", table: "data_lake.marketbeat_swfl (source_name=premier_commercial)", pipelineStatus: "dead-end", notes: "NO MARKET REPORTS. premcomm.com is brokerage-only. Stub exits 1.", cronNotes: "N/A — stub only" },
  { id: "svn_florida", label: "SVN Florida (Transaction News Only)", cadence: "Quarterly", lane: "tier-2", grain: "submarket", zipStatus: "none", table: "data_lake.marketbeat_swfl (source_name=svn_florida)", pipelineStatus: "dead-end", notes: "Transaction news only — not vacancy/rent surveys.", cronNotes: "N/A — stub only" },
  { id: "sba_franchise", label: "SBA FOIA Franchise Outcomes", cadence: "Quarterly", lane: "tier-1-duckdb", grain: "county", zipStatus: "partial", zipNote: "ZIP-approx supplemental parquet planned — not yet running.", table: "lake-tier1/franchise/sba_foia_franchise_county.parquet", pipelineStatus: "not-yet-running", notes: "453 franchise rows. First cron run pending.", cronNotes: "15th Jan/Apr/Jul/Oct 08:00 UTC — franchise-outcomes-quarterly.yml", ghWorkflow: "franchise-outcomes-quarterly.yml" },
  // Quarterly ZIP
  { id: "fhfa", label: "FHFA House Price Index (HPI)", cadence: "Quarterly", lane: "tier-2", grain: "zip", zipStatus: "full", table: "data_lake.fhfa_hpi", pipelineStatus: "active", notes: "133K rows. ZIP-level HPI tracks included.", cronNotes: "Quarterly — fhfa-quarterly.yml" },

  // ANNUAL — non-ZIP first
  { id: "hurdat2", label: "HURDAT2 Hurricane Tracks (FL)", cadence: "Annual", lane: "tier-1-duckdb", grain: "track", zipStatus: "none", zipNote: "ZIP exposure derivable via storm track buffer → ZIP centroid spatial join.", table: "lake-tier1/environmental/hurdat2_fl.parquet", pipelineStatus: "active", notes: "Historical hurricane tracks 1851–2024.", cronNotes: "Annual — hurdat2-annual.yml" },
  { id: "faf5", label: "FAF5 Freight Analysis Framework", cadence: "Annual", lane: "tier-1", grain: "route", zipStatus: "none", table: "lake-tier1/faf5/faf_flows.parquet", pipelineStatus: "active", notes: "FAF zones map to county clusters — no ZIP breakdown possible.", cronNotes: "Annual — faf5-annual.yml" },
  { id: "bls_oews_t1", label: "BLS OEWS Occupation Wages — Tier-1", cadence: "Annual", lane: "tier-1", grain: "msa", zipStatus: "none", table: "lake-tier1/labor/bls_oews_swfl/", pipelineStatus: "active", notes: "MSA-level wages. 220 rows 2021-2025. Next BLS release ~Apr 2027.", cronNotes: "15 May annually — bls-oews-swfl-annual.yml" },
  { id: "bls_oews_t2", label: "BLS OEWS Occupation Wages — Tier-2", cadence: "Annual", lane: "tier-2", grain: "msa", zipStatus: "none", table: "data_lake.bls_oews_swfl", pipelineStatus: "active", notes: "Postgres copy of OEWS data. MSA grain only.", cronNotes: "15 May annually — bls-oews-swfl-annual.yml" },
  { id: "census_cbp", label: "Census County Business Patterns", cadence: "Annual", lane: "tier-2", grain: "county", zipStatus: "none", zipNote: "Census ZIP Business Patterns (ZBP) is a separate product — not yet wired.", table: "data_lake.census_cbp_fl", pipelineStatus: "active", notes: "255K FL rows (county × industry). ZBP available separately.", cronNotes: "Annual — census-cbp-annual.yml" },
  { id: "leepa", label: "LeePA Parcels (Lee County)", cadence: "Annual", lane: "tier-2", grain: "parcel", zipStatus: "none", zipNote: "G2 DEFERRED — needs LeePA MapServer probe → FOLIOID join → site-ZIP via centroid point-in-polygon. Check: parcels_lee_zip_source_layer.", table: "data_lake.leepa_parcels", pipelineStatus: "active", notes: "548K parcels. No zip_code. G2 check open: parcels_lee_zip_source_layer.", cronNotes: "Annual roll ~August — leepa-annual.yml" },
  { id: "collier_parcels", label: "Collier County Parcels", cadence: "Annual", lane: "tier-2", grain: "parcel", zipStatus: "partial", zipNote: "Site address present — ZIP derivable via geocoding (G2), not yet implemented.", table: "data_lake.collier_parcels", pipelineStatus: "active", notes: "291K unique parcels. SOH gap median 36.47%.", cronNotes: "Annual roll ~August — collier-parcels-annual.yml" },
  { id: "fdot", label: "FDOT AADT Traffic Counts (FL)", cadence: "Annual", lane: "tier-2", grain: "route", zipStatus: "partial", zipNote: "Station lat/lon present — ZIP derivable via spatial join, not implemented.", table: "data_lake.fdot_aadt_fl", pipelineStatus: "active", notes: "103K statewide FL traffic count stations. tfctr ÷100 at source.", cronNotes: "Annual — fdot-annual.yml" },
  { id: "mhs_databook", label: "MHS Data Book (Commercial)", cadence: "Annual", lane: "tier-2", grain: "submarket", zipStatus: "none", zipNote: "Needs submarket→ZIP crosswalk (same as MarketBeat family).", table: "data_lake.marketbeat_swfl (source_name=mhs_databook)", pipelineStatus: "active", notes: "48 rows (16 submarkets × 3 sectors). Manual ODD — mhsappraisal.com blocks auto-fetch. COLLISION: mhs_databook wins over C&W.", cronNotes: "Annual ~March — manual PDF drop. Next: Mar 2027." },
  // Annual ZIP
  { id: "mhs_permits", label: "MHS Commercial Permits SWFL", cadence: "Annual", lane: "tier-2", grain: "zip", zipStatus: "partial", zipNote: "184/281 rows geocoded to site zip_code. 97 rows still without ZIP.", table: "data_lake.mhs_permits_swfl", pipelineStatus: "active", notes: "281 commercial permits 2025. GRADUATED J3 2026-06-10.", cronNotes: "Annual ~March — manual PDF drop. Next: Mar 2027." },
];
```

---

## What to build next session

1. Open the `swfldatagulf-ops` repo (find it on the machine)
2. Look at an existing page there to get the color scheme and component patterns
3. Create a new page (probably `pages/data-inventory.tsx` or `app/data-inventory/page.tsx` depending on the router)
4. Add a link to it from the main `/ops` page nav
5. Use the PIPELINES data above — don't re-research
6. The page design spec is in the original request above

## DO NOT touch brain-platform for this task
