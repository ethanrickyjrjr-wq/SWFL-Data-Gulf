# Greenfield scout — Restaurants/Hospitality/Tourism (Lee + Collier, FL)

**Date:** 08/02/2026
**Scope:** proof-of-pipeline demo, NOT real estate. Industry = restaurants/hospitality/tourism.
Every source below was fetched live in this session (curl or `crawl4ai`). No field, count, or URL
here is from training memory — see "verified-how" per source for the exact command run.

---

## Source 1 — FL DBPR Division of Hotels & Restaurants: Active Food Service Licenses

- **URL:** `https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood7.csv`
  (found via `https://www2.myfloridalicense.com/hotels-restaurants/public-records/`)
- **Access method:** direct HTTP GET, bulk CSV, no auth, no API key.
- **Format:** quote/comma-delimited ASCII text (DBPR's own description, confirmed on the
  disclaimer page).
- **Full field list (34 columns, header row read verbatim):** Board Code, License Type Code,
  Licensee Name, Rank Code, Modifier Code, Mailing Name, Mailing Street Address, Mailing Address
  Line 2, Mailing Address Line 3, Mailing City, Mailing State Code, Mailing Zip Code, Primary
  Phone Number, Mailing County Code, Business Name, Filler, Location Street Address, Location
  Address Line 2, Location Address Line 3, Location City, Location State Code, Location Zip Code,
  Location County Code, Location County, Secondary Phone Number, District, Region, License
  Number, Primary Status Code, Secondary Status Code, License Expiry Date, Last Inspection Date,
  Number of Seats or Rental Units, Base Risk Level, Secondary Risk Level.
- **Live-verified counts:** District 7 (Fort Myers — the district covering Lee AND Collier)
  file = 7,936 total rows. Filtered: **Lee = 2,662**, **Collier = 1,378** (≈4,040 combined —
  fits "low thousands," filterable by the `Location County` column with no join needed).
- **Cadence:** DBPR states data is refreshed weekly (per the disclaimer page); file has no
  date-versioning — it's a live current-state extract re-downloaded each run.
- **Auth:** none. Free public record.
- **Terms:** DBPR public-records disclaimer (`.../public-records-read-medisclaimer/`, fetched
  live) — data provided under Ch. 119, Florida Statutes (public records law) as a "free
  download." No redistribution restriction stated. DBPR disclaims tech support and format-fidelity
  only, not use rights.
- **Verified-how:** `curl -s -L "https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood7.csv" -o d7_licenses.csv -w "HTTP %{http_code}, size %{size_download} bytes\n"` → `HTTP 200, size 2498613 bytes`. County counts via `grep -c '"Lee"' d7_licenses.csv` → 2662, `grep -c '"Collier"' d7_licenses.csv` → 1378.

## Source 2 — FL DBPR Division of Hotels & Restaurants: Food Service Inspections

- **URL:** `https://www2.myfloridalicense.com/sto/file_download/extracts/7fdinspi.csv`
  (District 7, current fiscal year — July 1 through run date)
- **Access method:** direct HTTP GET, bulk CSV, no auth. Same access shape as Source 1, same
  division, but a materially different dataset — joins to Source 1 on License Number.
- **Format:** quote/comma-delimited ASCII text.
- **Full field list (78 columns):** District, County Number, County Name, License Type Code,
  License Number, Business (DBA) Name, Location Address, Location City, Location Zip Code,
  Inspection Number, Visit Number, Inspection Class, Inspection Type, Inspection Disposition,
  Inspection Date, Number of Critical/Noncritical/Total/High Priority/Intermediate/Basic
  Violations, PDA Status, Violation 01 through Violation 58 (per-code violation-count columns),
  License ID, Inspection Visit ID.
- **Live-verified counts:** District 7 current-FY file = 1,220 rows (FY started 07/01/2026, so
  ~1 month of inspections at fetch time). Filtered: **Lee = 407**, **Collier = 172**.
  Five prior fiscal years of the same District 7 file are also live (e.g.
  `.../hr/1fdinspi_2021.csv` through `_1819.csv`, `_1718.csv`, `_1617.csv`) if more historical
  volume is wanted for the demo.
- **Cadence:** weekly refresh (same disclaimer language as Source 1); current-FY file resets
  each July 1.
- **Auth:** none.
- **Terms:** same DBPR public-records disclaimer as Source 1.
- **Verified-how:** `curl -s -L "https://www2.myfloridalicense.com/sto/file_download/extracts/7fdinspi.csv" -o d7_inspect.csv -w "HTTP %{http_code}, size %{size_download} bytes\n"` → `HTTP 200, size 574266 bytes`. `wc -l d7_inspect.csv` → 1220. County filter via `grep -c '"Lee"'` → 407, `grep -c '"Collier"'` → 172.

## Source 3 — FDOT Annual Average Daily Traffic (AADT)

- **URL:** `https://gis.fdot.gov/arcgis/rest/services/RCI_Layers/FeatureServer/0`
  (layer 0, "Annual Average Daily Traffic," inside the FDOT `RCI_Layers` service — root
  discovered at `https://gis.fdot.gov/arcgis/rest/services?f=json`)
- **Access method:** ArcGIS REST FeatureServer, query endpoint, JSON responses, no auth, no key.
- **Format:** JSON (Esri feature-service query response).
- **Full field list (23 fields):** OBJECTID, YEAR_, DISTRICT, COSITE, ROADWAY, DESC_FRM,
  DESC_TO, AADT, AADTFLG, KFLG, K100FLG, DFLG, TFLG, COUNTYDOT, COUNTY, MNG_DIST, BEGIN_POST,
  END_POST, KFCTR, K100FCTR, DFCTR, TFCTR, SHAPE_LENG (+ geometry: polyline).
- **Live-verified counts:** `COUNTY='LEE'` → **534** road-segment records; `COUNTY='COLLIER'`
  → **215** records. Sample record confirms 2025 as the current AADT year (e.g. I-75 segment
  near Daniels Pkwy, Lee County, AADT 25,000).
- **Cadence:** FDOT's Traffic Characteristics Inventory (TCI) — annual AADT vintage, per-segment
  `YEAR_` field lets you track vintage per record; typically updated annually.
- **Auth:** none — public ArcGIS REST endpoint.
- **Terms:** not separately fetched this session (public FDOT open-data service; standard Esri
  REST query semantics, `returnCountOnly`/`resultRecordCount`/`where` all confirmed working
  live). Flag for review before production use: no explicit ToS page crawled.
- **Verified-how:** `curl -s "https://gis.fdot.gov/arcgis/rest/services/RCI_Layers/FeatureServer/0/query?where=COUNTY=%27LEE%27&returnCountOnly=true&f=json"` → `{"count":534}`; same query with `COUNTY='COLLIER'` → `{"count":215}`. Field list from `.../RCI_Layers/FeatureServer/0?f=json`.

## Source 4 — DBPR Restaurant/Food Service Emergency Closures (weekly, HTML-discovered)

- **URL (index to crawl):** `https://www2.myfloridalicense.com/hotels-restaurants/public-records/`
  — the weekly `.xlsx` file links are dated in the filename (e.g.
  `EOS_Weekly_Extract_2026-07-26.xlsx`) and only discoverable by parsing the index page's link
  list; there is no stable "latest.csv" URL, which is the genuinely different access shape here
  (HTML crawl to resolve a moving target) vs. Sources 1/2's stable filenames.
- **Access method:** `crawl4ai` the index page to enumerate current weekly links, then HTTP GET
  the resolved `.xlsx`.
- **Format:** Excel `.xlsx` (confirmed via `file` on the downloaded bytes: "Microsoft Excel
  2007+").
- **Full field list (8 columns, per DBPR's own column-definition block on the index page):**
  District, Date, License Number, Business Name, Business Address, Business City, Condition for
  Closure, Date of Order to Vacate.
- **Live-verified:** downloaded the "Week ending July 26, 2026" file — `HTTP 200`, 41,937 bytes,
  confirmed real `.xlsx` binary. Statewide (all districts, incl. D7/Lee/Collier); row count not
  extracted this pass (binary, would need an xlsx reader — noted as a follow-up, not blocking:
  the file is real and the shape is proven).
- **Cadence:** weekly, new file posted each week, historical weeks archived separately
  ("Reports & Statistics Archive").
- **Auth:** none.
- **Terms:** same DBPR public-records disclaimer as Sources 1–2.
- **Verified-how:** `crawl4ai "https://www2.myfloridalicense.com/hotels-restaurants/public-records/"` (returned the full dated link list, column definitions, and cadence note verbatim); `curl -s -L -o eos_latest.xlsx ".../EOS_Weekly_Extract_2026-07-26.xlsx" -w "HTTP %{http_code}, size %{size_download} bytes\n"` → `HTTP 200, size 41937 bytes`; `file eos_latest.xlsx` → `Microsoft Excel 2007+`.

## Source 5 — OpenStreetMap Overpass API (restaurant POIs)

- **URL:** `https://overpass-api.de/api/interpreter` (POST, Overpass QL query body)
- **Access method:** live JSON query API, no key, no signup, no auth — genuinely the "one JSON
  API" leg of the heterogeneity ask (Sources 1/2/4 are file downloads, Source 3 is a structured
  REST/JSON *query* endpoint but Esri-flavored; this is a free-text query language over HTTP
  returning JSON).
- **Format:** JSON.
- **Full field list:** open-ended OSM tag schema — live sample pull shows `name`, `cuisine`,
  `addr:housenumber`, `addr:street`, `addr:city`, `addr:postcode`, `addr:state`, `phone`,
  `website`, `opening_hours`, `outdoor_seating`, `indoor_seating`, `air_conditioning`, `takeaway`,
  `wheelchair`, `payment:credit_cards`, `payment:debit_cards` as populated per node (optional,
  crowd-sourced — not every node has every tag). This is the one field DBPR's own extracts
  **lack**: lat/lon geocoding and cuisine classification.
- **Live-verified counts:** bounding-box query (not exact county polygon — a rectangle
  approximation, flagged as such) → **Lee bbox = 200** restaurant nodes, **Collier bbox = 402**
  restaurant nodes. Sample pull (tight Fort Myers bbox) returned 5 real, named restaurants
  (Downtown Pizza, United Café Bar & Bistro, Blu Sushi, Ford's Garage, Capone's Coal Fired
  Pizza) with live tags as listed above.
- **Cadence:** live/real-time — reflects current OSM edit state, no fixed refresh cadence (OSM
  is continuously edited).
- **Auth:** none. Public instance is rate-limited (hit a 504/rate-limit on rapid repeated
  queries in this session — confirmed live, note this as an operational constraint: space
  queries out, or self-host Overpass for production volume).
- **Terms:** ODbL (Open Database License) — attribution required ("© OpenStreetMap
  contributors"), share-alike on derived database. This is the one source here with a
  redistribution condition that needs honoring in any public-facing deliverable.
- **Verified-how:** `curl -s -X POST --data-urlencode "data@overpass_bbox.txt" "https://overpass-api.de/api/interpreter"` with `[out:json]... out count;` → `{"tags":{"nodes":"200",...,"total":"200"}}` (Lee bbox); Collier bbox → `"total":"402"`; tag sample via a tight bbox `out tags 5;` → 5 named nodes with full tag dumps (shown above).

## Source 6 (bonus, lower priority) — BLS Quarterly Census of Employment & Wages (QCEW), NAICS 722

- **URL:** `https://data.bls.gov/cew/data/api/2024/a/area/12071.csv` (Lee, FIPS 12071) /
  `.../12021.csv` (Collier, FIPS 12021)
- **Access method:** direct HTTP GET, bulk CSV, no key, no signup — genuinely free (unlike
  Census CBP, see discrepancy note below).
- **Format:** CSV.
- **Full field list (35 columns):** area_fips, own_code, industry_code, agglvl_code, size_code,
  year, qtr, disclosure_code, annual_avg_estabs, annual_avg_emplvl, total_annual_wages,
  taxable_annual_wages, annual_contributions, annual_avg_wkly_wage, avg_annual_pay, plus
  location-quotient (`lq_*`) and over-the-year-change (`oty_*`) variants of each.
- **Live-verified counts:** each county file = ~2,022 rows covering ALL NAICS industries at all
  aggregation levels; filtered to NAICS 722 (Food Services and Drinking Places, private
  ownership) — Lee: **1,662 establishments**, 29,374 avg employment, $875.9M total wages (2024
  annual avg). Collier: **1,000 establishments**, 18,979 avg employment, $663.4M total wages.
  Sub-codes present down to 6-digit (722511 full-service, 722513 limited-service, 722410 bars,
  722515 snack/nonalcoholic, etc.) for both counties.
- **Cadence:** BLS QCEW publishes quarterly, with annual-average files; ~5-month lag typical.
- **Auth:** none.
- **Terms:** public federal statistical data, no restriction.
- **Verified-how:** `curl -s "https://data.bls.gov/cew/data/api/2024/a/area/12071.csv" -o qcew_lee_2024.csv` then `grep -E '^"12071","5","722'` → the establishment/employment/wage rows shown above; same for `12021.csv` (Collier).
- **Why not in the top-4 pick:** aggregate industry rollup, not restaurant-level rows — good for
  a "market context" stat, weak for the row-level heterogeneity the demo pipeline wants.

## Discrepancy: Census County Business Patterns is NOT signup-free (contradicts the brief's premise)

The candidate list assumed Census CBP needed "no key for small queries." **Live-verified false**
as of 08/02/2026: `curl -s -L "https://api.census.gov/data/2023/cbp?get=NAME&for=state:12"` and
every other CBP call this session returned HTTP 200 with an HTML "Missing Key" page — Census now
requires a free-but-registered API key on every request, including the most minimal one. Per the
mission's own hard rule ("FREE, no-signup sources only"), CBP is **dropped**, not silently
substituted. BLS QCEW (Source 6) fills the same "federal establishment-count" role without any
key requirement — verified live above.

Also dropped after live checks: FL DOR tourist development tax page (the guessed URL 404'd; the
DOR "Tax Data Portal" landing page has no direct downloadable file links, only PDF-summary-report
framing — would need deeper crawl than proportionate for this pass) and Lee VCB / Collier CVB
visitor-stats pages (both dead-ended into marketing-site 404s or partner-portal logins in this
pass, not confirmed free/public). Neither is fabricated as a finding — both are logged here as
**unverified, not included**, per the hard rule that an unfetched source gets labeled, not used.

---

## Ranked pick — best 4 for the demo pipeline

1. **DBPR Active Food Service Licenses** (Source 1, bulk CSV) — the anchor table: ~4,040
   Lee+Collier restaurants with address, license status, expiry, seats, risk level.
2. **DBPR Food Service Inspections** (Source 2, bulk CSV) — joins to #1 on License Number;
   ~579 Lee+Collier inspection rows this FY alone, real violation-code detail. Proves the
   pipeline can join two files from the same vendor with different row grains.
3. **FDOT AADT** (Source 3, ArcGIS REST/JSON) — 749 Lee+Collier road segments; different vendor,
   different protocol (Esri REST query vs. flat-file download), gives location-quality/traffic
   context per restaurant address.
4. **OpenStreetMap Overpass** (Source 5, live JSON query API) — fills the one gap DBPR leaves:
   lat/lon and cuisine tagging, for map-based or foot-traffic-adjacent framing. Different vendor,
   different protocol again (query language over HTTP, not REST-parameter or flat file), and the
   only source with a real live-query round trip (vs. static extract).

This set alone already hits the brief's heterogeneity target — one CSV-pair from a government
regulator, one ArcGIS/Esri REST layer, one live crowd-sourced JSON query API — while staying at
low-thousands row counts across the board. Source 4 (Emergency Closures, HTML-discovery shape)
and Source 6 (BLS QCEW, aggregate context) are good backups if a 5th/6th source is wanted, or if
the demo wants to show "discover a moving-target file from an HTML index" as its own pipeline
stage.

## What a real buyer would actually want from this combination

A restaurant operator, hospitality group, or chamber of commerce in Lee/Collier would pay
attention to one narrow, dangerous-sounding email: *"Here are the 12 restaurants within a mile of
you that got a High Priority violation or an emergency closure in the last 30 days — is yours
next, and here's the AADT/foot-traffic tier you're competing in."* That's DBPR licenses (who's
near you) + DBPR inspections (who's in trouble) + FDOT AADT (how much drive-by traffic your
competitors' locations get) + OSM (exact geocoding to compute "within a mile") — one alert a
chamber or operator group would forward internally, not archive.
