# Vendor extraction-ceiling audit — full catalog vs. what we pull

**Date:** 07/08/2026
**Scope:** every vendor behind `ingest/cadence_registry.yaml`'s 72 pipeline entries, grouped into ~16 vendor families. For each: what we currently ingest, what the vendor's FULL catalog actually offers (crawl4ai/API-verified, not memory), what's a real gap on our side, and what's a genuine vendor-side ceiling (doesn't exist / discontinued / grain-limited).

**Method:** 16 parallel research agents, one per vendor family, each required to probe our own code first (RULE 0.5) then verify the vendor's real catalog live (RULE 0.4). No invented numbers — every claim below traces to either our code or a cited vendor source.

---

## Ranked by cheapest win first

1. **Collier/FDOR cadastral — `SALE_PRC1`/`SALE_PRC2` (actual sale price)** never pulled, despite sale year/month/qualification code being pulled in the same query. Same API call, zero new cost. Also free in that call: owner mailing address, building sqft, year built, land value/sqft. Vendor layer has 135 fields total; we pull 13.
2. **BLS QCEW industry-sector detail** — we call the API for all-industries headline and discard the industry cut that's returned in the same response.
3. **FDLE crime — city/offense breakdown** — we already fetch Fort Myers/Cape Coral/Naples PD detail, sum it to a county total, and discard the breakdown. Sitting in a variable we already compute.
4. **CRE — Cushman & Wakefield Medical Office sector** — same PDF pipeline as retail/industrial/office; the sector list is hardcoded and Medical Office was never added.
5. **NOAA storm-history — Flood/Waterspout event types** — absent from the allowlist, unlike Drought/Frost-Freeze which are excluded on purpose. Real gap for a Florida product.
6. **FEMA NFIP penetration rate** — our code uses a static guess (`INSURED_PENETRATION_FACTOR = 0.3`) where FEMA publishes a real cited "NFIP Residential Penetration Rates" dataset.
7. **NOAA rainfall pipeline** — the yearly file we already fetch also carries temperature/wind/humidity/pressure at zero extra cost; we only extract precipitation.
8. **USGS gauges** — same 60 sites, same fetch, also carry streamflow/discharge, water temp, salinity, dissolved oxygen, pH; we extract 4 parameters.
9. **Zillow** — ZHVF (forecast), bedroom/type-cut ZHVI, seasonally-adjusted ZORI: same ZIP grain, all free, unwired.
10. **DBPR** — we use 2 of 35 license boards; Community Association Managers board pairs directly with condo SIRS data we already pull.

## Real gaps requiring new pipeline work

- **Census Building Permits Survey** — county + permit-issuing-place grain, an independent government cross-check against our own scraped permits.
- **FRED county-level series** — house price index, county GDP, per-capita income, median household income, poverty rate, building permits — all annual, all Lee/Collier, confirmed FRED series IDs exist.
- **FDOT** — their own ArcGIS org runs 1,586 public layers; we use one (AADT). Crash/fatality data is the standout untouched safety signal. Also unused: bridge inventory/condition, 5-Year Work Program, transit ridership, bike/ped infrastructure.
- **Lee County GIS org** (orgId `LvWGAAhHwbCJ2GMP`) — real building-permit layers exist as structured ArcGIS (9,386 unincorporated-Lee permits, 719 commercial, 2,192 Cape Coral residential) that could replace the fragile Accela Angular-SPA scrape entirely. Also: 93,976-row code-enforcement/nuisance layer (new category), two manufactured-home layers 43,000+ lots (direct fix for the parked `land_manufactured_swfl` gap), 550,454-row parcel land-use/valuation table, subdivisions/plats layer, and separately confirmed ZoningCases (8,017 rows, not ingested).
- **LeePA's own ArcGIS layers 19–23** (Non CT Sales, Land Type, Delinquent Tax Advertising, Cert of Title Sales, Comparable Sales) — genuinely never inspected. **Unresolved**: live curl calls to these 5 layers timed out repeatedly post-session; fields unconfirmed. Full catalog is 24 layers, not the ~4 assumed; layers 1–8 confirmed as cartographic label duplicates of value layers 13–18 (not real gaps).
- **RSW airport** — Page Field (LCPA general aviation) is entirely unscraped alongside RSW.
- **Crexi/Brevitas for-sale listings** — 300+ active listings exist county-wide across Lee/Collier in categories we already check; our coverage is "1-4 leases per city," a small slice of what's live.
- **FMB Recovery** — real live dashboard shows a street-level repaving program, 19-street stormwater program, a lighting project, 4 county-owned parks; we hold 8 seed rows.
- **SteadyAPI Hendry asymmetry** — residential listings pulled, but zero rental or price-aggregate coverage for Hendry County — nobody had flagged this before.

## Vendor-side ceilings (not our fault — don't re-litigate these)

- FRED: MSA-level GDP discontinued since 2023; unemployment claims never publish finer than statewide.
- FHFA: current MSA-quarterly grain is a choice (county/ZIP annual variants exist) — not a ceiling, listed here only to flag it's revisitable.
- Redfin: migration flows, investor purchases, and their Home Price Index are metro-grain only, no county/ZIP cut.
- Zillow: inventory, days-on-market, price cuts, new construction, sales, and affordability categories exist only at metro/national grain.
- BLS: no metro CPI for Cape Coral or Naples MSA; ECI stops at census-region; JOLTS stops at state; LAUS has no sub-state demographic breakdown.
- SteadyAPI: land and manufactured-home listings genuinely cannot be filtered at the API level (land caught by heuristic, manufactured falls to "other").
- Collier County's own ArcGIS parcel layer (as opposed to FDOR) is a 10-field geometry shell with no values; Collier's own property-appraiser has no real API (bot-gated) — FDOR genuinely is the best available source.
- Estero EDC: source page is a flat 404. The registry comment's "526" is a Cloudflare SSL-handshake error code, not a row count — corrects an earlier misreading. Nothing is being missed; seed-only fallback is correct.
- SBA franchise (453 rows) already complete; search-demand's 275 keywords are deliberate curation against an unbounded vendor, not a cap.

## Correction to an earlier statement in this session

I told you the Estero registry comment meant "526 tracked items." It doesn't — 526 is a Cloudflare error code, the source is dead, and there's nothing left on the table there. Also corrected: an earlier hypothesis that SteadyAPI's `PROPERTY_TYPE_MAP` implied an unused filter — confirmed false; we already sweep every real filter value, land/manufactured are a genuine vendor-side gap.

---

## Not fully resolved

LeePA's own layer catalog (agent 16 of 16) never returned a clean synthesis — `/compact` fired mid-run and wiped its task handle. I chased it manually afterward via live curl: confirmed 24 layers total (not ~4), confirmed layers 1–8 are label duplicates, but layers 19–23's actual field schemas are still unconfirmed (repeated network timeouts against `gissvr.leepa.org` for those specific layer IDs — worth a retry from a clean session, not a vendor block based on what succeeded for layers 0/9/10/12).
