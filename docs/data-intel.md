# Data Intelligence Map

_Last updated 2026-05-27. Single source of truth for what data we have, what's partial, what we know how to get, and what's still a gap. Read this before building a new source or assuming a metric doesn't exist._

**Related:** `docs/data-coverage.md` — operational bug notes on specific pipelines (permits breakage, Collier nulls, etc.)

---

## Status Legend

| Badge                  | Meaning                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| ✅ **LIVE**            | In Postgres `data_lake.*`, brain actively consuming it                          |
| 📦 **COLD**            | In Tier 1 Storage (Parquet), brain consuming it — no Postgres write needed      |
| 🟡 **PARTIAL**         | Ingested but with known gaps (broken pipeline, first-page only, Lee-only, etc.) |
| 🔄 **PIPELINE EXISTS** | Code shipped, GHA cron never fired — zero rows in DB                            |
| 🟠 **SCRAPED**         | Firecrawl scrape available, not a pipeline — one-off, stale on next run         |
| 🔍 **SOURCE KNOWN**    | Not built yet, but we know exactly where to get it                              |
| ❓ **GAP**             | We need this signal; no confirmed source yet                                    |

---

## Real Estate — Prices & Appreciation

| Dataset                                     | Status                 | Table / Location                                              | Brain                  | Notes                                                                                                                                                        |
| ------------------------------------------- | ---------------------- | ------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FHFA House Price Index                      | ✅ **LIVE**            | `data_lake.fhfa_hpi`                                          | `macro-swfl`           | MSA-level appreciation index; quarterly                                                                                                                      |
| LeePA parcel values                         | ✅ **LIVE**            | `data_lake.leepa_parcels_tier2`                               | `properties-lee-value` | Lee County only. Sales velocity z-score + SOH gap. ~300k parcels                                                                                             |
| NeighborhoodScout home values               | 🟠 **SCRAPED**         | `.firecrawl/neighborhoodscout-fort-myers-real-estate.md`      | —                      | Free: median $344k, appreciation table Q3 2025. Paywall: neighborhood-level detail                                                                           |
| Redfin SWFL market trends                   | 🔄 **PIPELINE EXISTS** | `lake-tier1/market/redfin_swfl.parquet`                       | —                      | GHA never fired. Redfin Data Center CSVs are free — worth unblocking                                                                                         |
| ATTOM property data                         | 🔍 **SOURCE KNOWN**    | API — `api.attomdata.com`                                     | —                      | Has API. Per-parcel AVM, deed history, foreclosure. Paid but has SWFL coverage                                                                               |
| Collier County parcel values                | ❓ **GAP**             | —                                                             | —                      | No Collier appraiser pipeline. Parallel to LeePA but different portal                                                                                        |
| RentCast                                    | 🔍 **SOURCE KNOWN**    | `developers.rentcast.io`                                      | —                      | Real-time US property + rental data. Has AVM, rental estimates, market stats by ZIP. apiKey, free tier. Addresses both Collier parcel gap and STR rental gap |
| Realie Property Data API                    | 🔍 **SOURCE KNOWN**    | `realie.ai/real-estate-data-api`                              | —                      | Direct from local municipal records, 100+ fields per parcel. apiKey. Second path to Collier County parcel values if appraiser portal remains blocked         |
| Zillow ZORI rents                           | ✅ **LIVE**            | `data_lake.zori_swfl` + `lake-tier1/market/zori_swfl.parquet` | `rentals-swfl`         | ZIP-level median asking rent. Monthly cadence                                                                                                                |
| Census RHFS (Rental Housing Finance Survey) | 🔍 **SOURCE KNOWN**    | `api.census.gov/data/*/rhfs`                                  | —                      | Financial + mortgage characteristics of rental properties. Updated Aug 2024. Census API key required                                                         |

---

## Real Estate — Permits & Construction

| Dataset                       | Status              | Table / Location                                                                                                                               | Brain          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lee County building permits   | 🟡 **PARTIAL**      | `data_lake.lee_permits`                                                                                                                        | `permits-swfl` | Accela scrape. First-page only (v1); pagination + detail fetch is v2. Pipeline broke 2026-05-24 — returns 0 rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Collier County permits        | 🔍 **SOURCE KNOWN** | Monthly XLSX — `collier.gov/Business-Resources/Building-Permits-Construction/Meetings-Advisory-Boards-Reports/Monthly-Building-Permit-Reports` | —              | **NOT the CityView portal (blank JS app).** County publishes direct XLSX downloads for every month back to 2020 — no auth, no scraping. 23 cols: Permit Number, Declared Value, Building Type, Permit Class, Permit Type Desc, Permit Status, **Site Address**, Property ID, Date Issued, Date Applied, **Total SF**, Total Units, Const Type, Owner Name, Contractor. ~5k rows/month. Two series: Issued + Applied. URL pattern 2026: `.../monthly-building-permit-reports/YYYY-M-issued-permits.xlsx`; 2025 and back: `.../bldg-reports/YYYY-M-issued.xlsx`. Unblocks all 10 Collier corridor null fields in `docs/data-coverage.md` |
| Census building permits (C40) | 🔍 **SOURCE KNOWN** | `census.gov/construction/bpermits/`                                                                                                            | —              | Free annual ZIP-code level permit counts. Could backstop Accela gaps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## Demographics & Population

| Dataset                               | Status                 | Table / Location                                          | Brain           | Notes                                                                                                                                                           |
| ------------------------------------- | ---------------------- | --------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Census CBP (County Business Patterns) | ✅ **LIVE**            | `data_lake.census_cbp`                                    | `macro-florida` | Annual establishment counts + employment by industry/ZIP                                                                                                        |
| Census VIP (ACS demographic pull)     | 🔄 **PIPELINE EXISTS** | `lake-tier1/macro/census_vip/`                            | —               | GHA never fired. Income, education, housing, age distributions                                                                                                  |
| NeighborhoodScout demographics        | 🟠 **SCRAPED**         | `.firecrawl/neighborhoodscout-fort-myers-demographics.md` | —               | Free: pop 99,918 · HH income $62,160 · poverty 16.8% · race breakdown · industry mix. Source: ACS. Paywall: neighborhood-level                                  |
| ACS direct (Census API)               | 🔍 **SOURCE KNOWN**    | `api.census.gov/data/*/acs/acs5`                          | —               | NeighborhoodScout's upstream. Free. B-table pulls give tract/ZIP-level detail without a subscription. **Census API key now required for all queries**           |
| CDC county health data                | 🔍 **SOURCE KNOWN**    | `tools.cdc.gov/api/`                                      | —               | County-level public health: mortality rates, chronic disease prevalence, birth rates. CDC WONDER API. Free. Demographics-adjacent signal for corridor character |
| Medicare.gov provider data            | 🔍 **SOURCE KNOWN**    | `dev.medicare.gov/`                                       | —               | Healthcare provider locations, quality scores, claims by county. Free, no auth. Useful for healthcare corridor density (hospitals, clinics) in SWFL             |

---

## Employment & Economy

| Dataset                                     | Status                 | Table / Location                                                  | Brain                         | Notes                                                                                                                                                                                                        |
| ------------------------------------------- | ---------------------- | ----------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BLS LAUS (unemployment)                     | ✅ **LIVE**            | `data_lake.bls_laus`                                              | `macro-swfl`, `macro-florida` | 328 rows. Lee + Collier + FL. Monthly                                                                                                                                                                        |
| BLS QCEW (wages by industry)                | ✅ **LIVE**            | `data_lake.bls_qcew`                                              | `macro-florida-cbp-source`    | Quarterly wages + employment by NAICS. County level                                                                                                                                                          |
| BLS PPI (producer prices)                   | 🔄 **PIPELINE EXISTS** | `lake-tier1/macro/bls_ppi/`                                       | —                             | GHA never fired                                                                                                                                                                                              |
| FRED G17 (industrial production)            | 🔄 **PIPELINE EXISTS** | `lake-tier1/macro/fred_g17/`                                      | —                             | GHA never fired                                                                                                                                                                                              |
| NeighborhoodScout industry mix              | 🟠 **SCRAPED**         | `.firecrawl/neighborhoodscout-fort-myers-demographics.md`         | —                             | Healthcare 14.4%, Retail 13.2%, Construction 13.2%, Accommodation 8.1%, etc.                                                                                                                                 |
| Census QWI (Quarterly Workforce Indicators) | 🔍 **SOURCE KNOWN**    | `api.census.gov/data/timeseries/qwi/`                             | —                             | 32 employment flow indicators: employment, job creation/destruction, wages, hires. County × industry × quarter, 1990–present. **Census API key required.** Directly upgrades macro-swfl employment narrative |
| Census ZBP (ZIP Code Business Patterns)     | 🔍 **SOURCE KNOWN**    | `api.census.gov/data/*/zbp`                                       | —                             | ZIP-level establishment counts + employment by NAICS. Complements CBP (county-level, already LIVE). Best free source for corridor-level business density                                                     |
| EIA (Energy Information Administration)     | 🔍 **SOURCE KNOWN**    | `eia.gov/opendata/`                                               | —                             | US energy production, consumption, forecasts. Free API. County-level electricity rates + consumption could add utility-cost signal to corridor character                                                     |
| USDA NASS (agricultural statistics)         | 🔍 **SOURCE KNOWN**    | `nass.usda.gov/developer/`                                        | —                             | Agricultural production, crop reports, farm counts. Relevant for rural SWFL corridors (Immokalee, LaBelle). Free API                                                                                         |
| SEC EDGAR                                   | 🔍 **SOURCE KNOWN**    | `sec.gov/search-filings/edgar-application-programming-interfaces` | —                             | Public company financial filings. Useful for tracking major SWFL-area public employers; feeds sector-credit brain. Free, no key required                                                                     |
| OpenCorporates                              | 🔍 **SOURCE KNOWN**    | `opencorporates.com/api/`                                         | —                             | Corporate registry data — business formation/dissolution by jurisdiction. Free, no auth. Track whether corridors are gaining or losing registered businesses                                                 |
| Yelp Fusion API                             | 🔍 **SOURCE KNOWN**    | `yelp.com/developers`                                             | —                             | Local business search, ratings, categories, hours by location. OAuth, free tier. Demand-side corridor signal — business density + consumer activity type we have nowhere else                                |
| Adzuna jobs API                             | 🔍 **SOURCE KNOWN**    | `developer.adzuna.com`                                            | —                             | Job postings aggregator by location + industry. apiKey, free tier. Leading economic indicator — more timely than BLS quarterly data for SWFL employer demand shifts                                          |
| Socrata Open Data                           | 🔍 **SOURCE KNOWN**    | `dev.socrata.com`                                                 | —                             | Platform used by many FL county/city open data portals (Lee, Collier may have Socrata instances). OAuth. Meta-connector — single client, many local government datasets                                      |
| SWFL retail sales / sales tax receipts      | ❓ **GAP**             | —                                                                 | —                             | FL DOR publishes county-level sales tax data. Free, quarterly. Not yet investigated                                                                                                                          |

---

## Crime & Safety

| Dataset                        | Status              | Table / Location                                        | Brain | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------- | ------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NeighborhoodScout crime scores | 🟠 **SCRAPED**      | `.firecrawl/neighborhoodscout-fort-myers-crime.md`      | —     | Free: safety score 21/100, violent 3.28/1k, property 13.88/1k, crimes/sq-mi 42. Paywall: per-type breakdown (murder/rape/robbery/assault) at city level; neighborhood-level behind subscription                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| FBI UCR / NIBRS direct         | 🔍 **SOURCE KNOWN** | `cde.ucr.cjis.gov/LATEST/webapp/`                       | —     | NeighborhoodScout's upstream. Free API. Agency-level crime counts. Would give us the paywalled per-type breakdown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FDLE (FL Dept Law Enforcement) | 🔍 **SOURCE KNOWN** | `fdle.state.fl.us/FSAC/Crime-Data`                      | —     | Florida-specific; includes agencies not reporting to FBI. Agency lookup by county                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| SecurityGauge (Cotality)       | 🔍 **SOURCE KNOWN** | API / flat file — `neighborhoodscout.com/securitygauge` | —     | **Address-level** crime risk — entirely different product from NS city pages. Per-address: 8 crime type scores (1–5 severity), 0–5000 index vs county/state/nation, 5-year history + **5-year forecast to 2031**, perimeter risk factors (police stations, fire stations, hospitals with name + distance). 10-meter spatial resolution. Powered by Location Inc. + CoreLogic (parent now Cotality, Irvine CA). **Do not scrape** — explicit ToS prohibition. API + flat file licensing available; contact customerservice@securitygauge.com / 1-508-753-8029. Sample report structure fully readable at `/securitygauge/search/location/sample` |

---

## Environmental & Flood

| Dataset                               | Status                    | Table / Location                                                      | Brain                 | Notes                                                                                                                                                            |
| ------------------------------------- | ------------------------- | --------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FEMA NFIP flood claims                | ✅ **LIVE**               | `data_lake.fema_nfip_tier2`                                           | `env-swfl`            | Storm vs. baseline + storm-shadow override. Lee + Collier                                                                                                        |
| USGS water levels                     | ✅ **LIVE** + 📦 **COLD** | `lake-tier1/environmental/usgs_water_swfl.parquet` + `data_lake.usgs` | `env-swfl`            | Daily gauge readings 2000–2026. Sites Parquet excluded                                                                                                           |
| HURDAT2 hurricane tracks              | 📦 **COLD**               | `lake-tier1/environmental/hurdat2_fl.parquet`                         | `hurricane-tracks-fl` | 1851–2024 historical range                                                                                                                                       |
| NOAA storm events SWFL                | 📦 **COLD**               | `lake-tier1/environmental/storm_events_swfl.parquet`                  | `storm-history-swfl`  | 1996–2025                                                                                                                                                        |
| FEMA flood zone shapefiles (FIRM)     | 🔍 **SOURCE KNOWN**       | `msc.fema.gov/api/`                                                   | —                     | Parcel-level flood zone assignment. Needed for per-corridor flood exposure scores                                                                                |
| Census Community Resilience Estimates | 🔍 **SOURCE KNOWN**       | `api.census.gov/data/*/cre`                                           | —                     | Block-group social vulnerability to disaster. Updated Jan 2026. env-swfl adjacent. Census API key required                                                       |
| NOAA CDO (Climate Data Online)        | 🔍 **SOURCE KNOWN**       | `ncdc.noaa.gov/cdo-web/webservices/v2`                                | —                     | Historical temperature, precipitation, drought by station. Different from storm events (which we have cold). Seasonal climate context for corridor character     |
| EPA Superfund / brownfields           | 🔍 **SOURCE KNOWN**       | `epa.gov/data/application-programming-interface-api`                  | —                     | EPA FRS API. Industrial site locations, brownfields, air quality monitors. Relevant for industrial corridor character. Free                                      |
| OpenAQ                                | 🔍 **SOURCE KNOWN**       | `docs.openaq.org/`                                                    | —                     | Open air quality aggregating EPA + global monitoring networks. No auth for basic access. Better US coverage than AQICN — pulls directly from EPA AirNow stations |
| AQICN (Air Quality Index)             | 🔍 **SOURCE KNOWN**       | `aqicn.org/api/`                                                      | —                     | Real-time AQI by city/station. PM2.5, ozone, CO. Free with apiKey. Complements EPA FRS (point sources) with ambient readings — env-swfl air quality signal       |
| Open-Meteo                            | 🔍 **SOURCE KNOWN**       | `open-meteo.com`                                                      | —                     | Free, no API key, open-source weather. Historical + 7-day forecast. Cleanest free weather source — no key needed, global coverage, hourly resolution             |
| NWS API (National Weather Service)    | 🔍 **SOURCE KNOWN**       | `weather.gov/documentation/services-web-api`                          | —                     | Free, no auth. Current conditions + 7-day forecasts specifically for US. Different from NOAA CDO (historical) and storm events (events). FL office coverage      |

---

## Commercial Real Estate (CRE)

| Dataset                                   | Status              | Table / Location                     | Brain      | Notes                                                                                                                 |
| ----------------------------------------- | ------------------- | ------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Corridor profiles (asking rent, vacancy)  | ✅ **LIVE**         | Supabase `corridor_profiles`         | `cre-swfl` | 26 corridors. 2 corridors null on `absorption_sqft` (large-format centers)                                            |
| MarketBeat / Cushman                      | ❌ **DEAD**         | —                                    | —          | Landing pages only — no data behind Firecrawl. `data_lake.marketbeat_swfl` is empty. Deleted pipeline                 |
| CoStar                                    | 🔍 **SOURCE KNOWN** | API — enterprise paywall             | —          | Gold standard for CRE. ~$10k+/yr. Required for absorption data on large-format centers                                |
| LoopNet / Crexi free listings             | 🔍 **SOURCE KNOWN** | Scrapeable                           | —          | Not broker-data quality but useful for listing-level vacancy signals                                                  |
| CBRE / JLL market reports (PDF)           | 🔍 **SOURCE KNOWN** | Published quarterly — Firecrawl-able | —          | SWFL market reports published as PDFs; some scrape-friendly                                                           |
| Census SOMA (Survey of Market Absorption) | 🔍 **SOURCE KNOWN** | `api.census.gov/data/*/soma`         | —          | Multifamily absorption data from new construction. Could fill cre-swfl `absorption_sqft` gap. Census API key required |

---

## Traffic & Logistics

| Dataset                         | Status              | Table / Location            | Brain            | Notes                                                                                 |
| ------------------------------- | ------------------- | --------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| FDOT AADT (road traffic counts) | ✅ **LIVE**         | `data_lake.fdot_aadt_tier2` | `traffic-swfl`   | Annual average daily traffic. `year_` column drift bug open — `docs/data-coverage.md` |
| FAF5 freight flows              | 📦 **COLD**         | `lake-tier1/faf5/`          | `logistics-swfl` | ORNL archive. Working cache in `data_lake.faf_flows`. No Tier-2 promotion yet         |
| FDOT freight data (future)      | 🔍 **SOURCE KNOWN** | FDOT GIS portal             | —                | Port + airport freight tonnage, beyond just AADT                                      |

---

## Tourism & Hospitality

| Dataset                          | Status              | Table / Location              | Brain         | Notes                                                                                                                                             |
| -------------------------------- | ------------------- | ----------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lee County TDT (Tourist Dev Tax) | ✅ **LIVE**         | Supabase (tourism brain)      | `tourism-tdt` | Monthly occupancy + revenue. Provenance page live at `/r/source/tdt`                                                                              |
| STR / AirDNA short-term rentals  | ❓ **GAP**          | —                             | —             | No source identified. STR market size is significant in SWFL                                                                                      |
| OpenSky Network (aviation)       | 🔍 **SOURCE KNOWN** | `opensky-network.org/apidoc/` | —             | Real-time + historical flight data, no auth. RSW (Fort Myers) + PGD (Punta Gorda) arrival/departure volume = proxy for tourism demand seasonality |

---

## Macro Indicators

| Dataset                          | Status                 | Table / Location                | Brain                | Notes |
| -------------------------------- | ---------------------- | ------------------------------- | -------------------- | ----- |
| FHFA HPI (national)              | ✅ **LIVE**            | `data_lake.fhfa_hpi`            | `macro-us`           |       |
| BLS LAUS national                | ✅ **LIVE**            | `data_lake.bls_laus`            | `macro-us`           |       |
| FRED G17 (industrial production) | 🔄 **PIPELINE EXISTS** | `lake-tier1/macro/fred_g17/`    | —                    |       |
| BLS PPI                          | 🔄 **PIPELINE EXISTS** | `lake-tier1/macro/bls_ppi/`     | —                    |       |
| Sector credit / loan data        | ✅ **LIVE**            | Supabase (sector credit source) | `sector-credit-swfl` |       |

---

## News & Narrative

| Dataset              | Status                 | Table / Location              | Brain | Notes                                                                                                                                                                                                                      |
| -------------------- | ---------------------- | ----------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SWFL news pipeline   | 🔄 **PIPELINE EXISTS** | `lake-tier1/news/`            | —     | GHA never fired — no successful Firecrawl run yet                                                                                                                                                                          |
| GDELT                | 🔍 **SOURCE KNOWN**    | `gdeltproject.org/data.html`  | —     | Real-time global media event + tone monitoring. Queryable by location + topic — no API key required for data files. Could replace Firecrawl-based news pipeline entirely. Covers 100+ languages, 2.5-second update cadence |
| County planning docs | 🔄 **PIPELINE EXISTS** | `lake-tier1/county-planning/` | —     | GHA never fired                                                                                                                                                                                                            |

---

## Corridor Character Grounding

| Dataset                                         | Status                 | Table / Location                                     | Brain | Notes                                                                                                                              |
| ----------------------------------------------- | ---------------------- | ---------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Corridor grounded NDJSON (Anthropic web_search) | 🔄 **PIPELINE EXISTS** | `lake-tier1/corridor_grounded/`                      | —     | Step 2 shipped. Quarterly cadence. GHA never fired — pending operator sign-off on Pine Ridge spot-check (Step 4)                   |
| NeighborhoodScout neighborhood pages            | 🔍 **SOURCE KNOWN**    | `neighborhoodscout.com/fl/fort-myers/<neighborhood>` | —     | Sub-pages per neighborhood visible from city overview. Crime + RE + demographics at neighborhood level. Paywalled at detailed tier |

---

## High-Value Sources to Investigate Next

These are the best ROI items not yet assigned to a pipeline sprint.

| Priority | Dataset                       | What we'd get                                                                                                       | Cost       | Effort                                         |
| -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------- |
| 🔥 High  | **ACS direct API**            | ZIP/tract-level demographics, income, housing — feeds corridor character without NeighborhoodScout subscription     | Free       | Low (Census VIP pipeline can be extended)      |
| 🔥 High  | **Census ZBP**                | ZIP-level establishment counts + employment by NAICS — corridor business density, direct extension of CBP pipeline  | Free       | Low (extend census_cbp pipeline)               |
| 🔥 High  | **FBI UCR / NIBRS direct**    | Per-type crime breakdown without paywall — violent subtypes, property subtypes by agency                            | Free       | Low (JSON API, simple pipeline)                |
| 🔥 High  | **FL DOR sales tax receipts** | Retail activity proxy by county/quarter — no other free source for this                                             | Free       | Medium (PDF scrape or FOIA-style request)      |
| 🔥 High  | **GDELT**                     | Real-time SWFL media event + tone monitoring — no API key, no scraping, replaces Firecrawl news pipeline            | Free       | Medium (BigQuery or flat-file ingest)          |
| 🟡 Med   | **Census QWI**                | 32 quarterly employment flow indicators (job creation/destruction, wages, hires) by county × industry, 1990–present | Free       | Medium (new pipeline, Census API key required) |
| 🟡 Med   | **CDC county health**         | Mortality, chronic disease, birth rates by county — demographics signal for corridor character                      | Free       | Low (CDC WONDER API)                           |
| 🟡 Med   | **FEMA FIRM shapefiles**      | Parcel-level flood zone → corridor flood exposure score                                                             | Free       | Medium (geo join against LeePA)                |
| 🟡 Med   | **Open-Meteo**                | Free weather API (no key) — historical + forecast, hourly resolution. Clean drop-in for corridor climate context    | Free       | Low (simple HTTP, no auth)                     |
| 🟡 Med   | **OpenCorporates**            | Business formation/dissolution by jurisdiction — corridor business health signal, no auth needed                    | Free       | Low (REST API)                                 |
| 🟡 Med   | **Redfin Data Center**        | Median sale price, days on market, sale-to-list — free CSVs, ZIP-level                                              | Free       | Low (unblock existing pipeline)                |
| 🟡 Med   | **CBRE/JLL quarterly PDFs**   | CRE absorption + market narrative — free publications, scrape-friendly                                              | Free       | Medium (Firecrawl PDF scrape)                  |
| 🟡 Med   | **RentCast**                  | Real-time property + rental estimates by ZIP — plugs Collier parcel gap and STR rental gap in one shot              | Free tier  | Low (REST apiKey)                              |
| 🟡 Med   | **Yelp Fusion**               | Local business ratings + category density by corridor — demand-side signal we have nowhere else                     | Free tier  | Low (OAuth)                                    |
| 🟡 Med   | **Adzuna jobs**               | Job postings by location + industry — leading indicator, more timely than BLS quarterly                             | Free tier  | Low (apiKey)                                   |
| 🔵 Low   | **Socrata**                   | Meta-connector for FL county open data portals (Lee, Collier may have Socrata instances)                            | Free       | Low (OAuth client)                             |
| 🔵 Low   | **OpenSky Network**           | RSW + PGD flight arrivals/departures — tourism demand seasonality proxy, no auth                                    | Free       | Low (REST API)                                 |
| 🔵 Low   | **AQICN**                     | Real-time air quality by station — env-swfl ambient air signal to complement EPA point sources                      | Free       | Low (apiKey required)                          |
| 🔵 Low   | **ATTOM API**                 | Per-parcel AVM + deed history — best non-LeePA coverage for Collier                                                 | Paid ($)   | Medium                                         |
| 🔵 Low   | **CoStar**                    | Authoritative CRE absorption                                                                                        | Paid ($$$) | High                                           |
