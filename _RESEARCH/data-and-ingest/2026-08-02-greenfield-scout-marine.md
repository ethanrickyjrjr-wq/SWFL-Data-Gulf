# Greenfield scout — Marine/Boating (Lee + Collier, FL) — 08/02/2026

Mission: find + live-verify 4-6 FREE public data sources for a tiny demo pipeline (hundreds-to-low-thousands
rows/source), heterogeneous access shapes, marine/boating industry, SWFL-flavored (Lee + Collier).
No prior marine research existed in `_RESEARCH/INDEX.md` — this is new ground.

5 sources verified live. Ranked pick + buyer-email idea at the bottom.

---

## 1. FWC Derelict Vessels — ArcGIS REST (MapServer query)

- **URL:** `https://gis.myfwc.com/mapping/rest/services/Open_Data/Derelict_Vessels/MapServer/5`
- **Access method:** ArcGIS REST `/query` endpoint (JSON in, JSON/GeoJSON out). No key.
- **Format:** JSON (esri feature format), paginated via `resultRecordCount`/`resultOffset`.
- **Full field list (28 fields, confirmed via `?f=json` on the layer):** OBJECTID, UniqueKey, ReportType,
  VesselDeterminationType, VesselDeterminationTypeDisplay, ReportCaseStatus, ReportNumber, ReportDateTime,
  ReportingAgencyCaseNumber, ReportCaseStatusType, OfficerAgencyName, OfficerPhone, County, Latitude,
  Longitude, VesselType, VesselLength, VesselRegNo, PhotoURL, last_edited_date, GlobalID, VesselYear,
  VesselMake, VesselHIN, NaturalDisasterType, BodyOfWater, VesselColor, SHAPE (geometry).
- **Live-verified counts:** statewide **567**, Lee+Collier (`County='Lee' OR County='Collier'`) **63**.
  (Prior pass 07/18/2026 recorded 552 statewide / 63 Lee+Collier — statewide count moved up ~15 in two
  weeks, consistent with an actively-updated feed; Lee+Collier held steady.)
- **Sample record (Lee County, full field pull):** `ReportNumber: FLDV-0011982`, `ReportCaseStatus: UNDER
  INVESTIGATION`, `County: LEE`, `BodyOfWater: CRESCENT ISLAND`, `Latitude/Longitude` present,
  `OfficerAgencyName: FLORIDA FISH AND WILDLIFE CONSERVATION COMMISSION`. Several attribute fields
  (VesselType, VesselLength, VesselMake, VesselHIN) were null on this record — sparse fill is normal for
  this dataset, not a fetch error.
- **Cadence:** rolling/continuously updated (`last_edited_date` field present); no published SLA found.
- **Auth:** none.
- **Terms:** FWC Open Data license text (confirmed on the sibling Marinas Florida item, same publisher —
  see source 3): attribute FWC as data source; FWC disclaims liability for misuse; no redistribution
  prohibition found. Not separately re-confirmed on this exact item id — same `gis.myfwc.com` Open_Data
  portal as source 3, so terms almost certainly identical, but flagging as inferred-not-directly-quoted
  for this one layer.
- **Geographic filterability:** `County` field, exact match, confirmed working (`Lee`, `Collier`).
- **Verified how:**
  `curl "https://gis.myfwc.com/mapping/rest/services/Open_Data/Derelict_Vessels/MapServer/5?f=json"` → HTTP 200, field list confirmed.
  `curl ".../5/query?where=1%3D1&returnCountOnly=true&f=json"` → `{"count":567}`.
  `curl ".../5/query?where=County%3D%27Lee%27+OR+County%3D%27Collier%27&returnCountOnly=true&f=json"` → `{"count":63}`.
  `curl ".../5/query?where=County%3D%27Lee%27&resultRecordCount=1&outFields=*&f=json"` → full sample record above.

---

## 2. NOAA CO-OPS Tides & Currents API — JSON REST

- **URL (station list):** `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions`
- **URL (data):** `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter`
- **Access method:** REST GET with query params (`station`, `product`, `date`, `datum`, `time_zone`,
  `units`, `format`). No key.
- **Format:** JSON (also supports CSV/XML, not tested).
- **SWFL stations confirmed in the station list:**
  - `8725520` — **Fort Myers** (26.6478, -81.8711) — has live water-level/met sensor.
  - `8725110` — **Naples (outer coast)** (26.1317, -81.8075) — tide-prediction-only (subordinate/harmonic
    station, no live water-level or air-pressure sensor — confirmed empirically, see below).
  - `8725114` — Naples, Naples Bay, north end — found in list, not separately queried.
- **Products available per station (varies by station type):** `predictions` (6-min interval tide curve or
  `interval=hilo` high/low only), `water_level` (live gauge, sensor stations only), `wind` (speed/direction/
  gust, met-equipped stations only), `air_pressure`, `air_temperature`, `water_temperature`, `datums`,
  `currents` (current-equipped stations only). Full product catalog not exhaustively probed — this is what
  was hit live.
- **Live-verified pulls:**
  - Fort Myers (8725520) `predictions`, today, 6-min interval, MLLW datum, English units → HTTP 200, 240
    real timestamped values (`{"t":"2026-08-02 00:00","v":"0.503"}` ... through 23:54). Full day returned.
  - Fort Myers (8725520) `wind`, latest → HTTP 200, live reading: `{"t":"2026-08-02 00:48","s":"3.11",
    "d":"143.0","dr":"SE","g":"4.86"}` (speed 3.11 kt, direction 143°/SE, gust 4.86 kt).
  - Naples (8725110) `predictions`, `interval=hilo`, today → HTTP 200: 2 highs / 2 lows for the day
    (`2.714 ft @03:37 H`, `1.005 ft @09:25 L`, `2.909 ft @15:08 H`, `0.658 ft @21:44 L`).
  - Naples (8725110) `water_level`, latest → HTTP 200 but **no data** (`"No data was found. This product
    may not be offered at this station"`) — confirms Naples outer coast is prediction-only, not a live
    sensor. Same result for `air_pressure`. **Don't assume every station in the list offers every product
    — check per-station before building a consumer.**
- **Cadence:** predictions are deterministic (computed from harmonic constants, available indefinitely
  past/future); live sensor products (water_level, wind) update every 6 minutes at equipped stations.
- **Auth:** none.
- **Terms:** NOAA/NWS data — U.S. government work, public domain. No redistribution restriction.
- **Geographic filterability:** by station id; Fort Myers and Naples both sit inside Lee/Collier waters.
- **Verified how:**
  `curl "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions"` → HTTP 200, grepped for Fort Myers / Naples station ids.
  `curl ".../datagetter?station=8725520&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&format=json&date=today"` → HTTP 200, full-day series.
  `curl ".../datagetter?station=8725110&product=predictions&...&interval=hilo"` → HTTP 200, 4 hi/lo values.
  `curl ".../datagetter?station=8725520&product=wind&...&date=latest"` → HTTP 200, live wind reading.
  `curl ".../datagetter?station=8725110&product=water_level&...&date=latest"` → HTTP 200, empty/no-data response (negative result, still a live verification).

**Side finding (negative result, worth recording):** the NWS structured marine-zone forecast API
(`api.weather.gov/zones/forecast/{ZONE}/forecast`, tried zone `GMZ836` = "Charlotte Harbor and Pine Island
Sound", covering Lee County Gulf waters) returned **HTTP 404** with an explicit error: `"title": "Marine
Forecast Not Supported", "detail": "Forecasts for marine areas are not yet supported by this API."` Same
result on `/zones/marine/GMZ836/forecast`. This contradicts the "NOAA marine weather" lead as a viable
*structured* API today — api.weather.gov marine zone forecasts are not exposed, period, as of this check.
Live wind/gust data is available instead via the CO-OPS station itself (source 2 above), which is enough
for a demo but is not a general-purpose marine forecast feed. Verified via
`curl "https://api.weather.gov/zones/forecast/GMZ836/forecast" -H "User-Agent: ..."` → HTTP 404 with the
error body quoted above.

---

## 3. FWC Marinas Florida — ArcGIS REST + bulk CSV download

- **URL (ArcGIS layer):** `https://gis.myfwc.com/hosting/rest/services/Open_Data/Marinas_Florida/MapServer/6`
- **URL (bulk CSV, confirmed working):**
  `https://opendata.arcgis.com/api/v3/datasets/e5aab21bdec84aad9c9fdb8169a885d3_6/downloads/data?format=csv&spatialRefId=4326`
  (item id `e5aab21bdec84aad9c9fdb8169a885d3` resolved via ArcGIS Online item search for "Marinas Florida",
  owner `GISLibrarian`, source layer confirms `gis.myfwc.com/hosting/.../Marinas_Florida/MapServer/6`.)
- **Access method:** two shapes on the same underlying data — (a) ArcGIS REST `/query` JSON API, same
  pattern as source 1; (b) a single static-file CSV GET from the ArcGIS Hub download API — genuinely
  different fetch mechanics (one-shot file vs paginated query), even though same publisher platform.
- **Format:** CSV (bulk) or JSON (REST query).
- **Full field list (50 fields):** OBJECTID, Name, Street, City, Zip, County, Phone, Moorings, Transients,
  FDEP_Lease, Verificati, Clean_Mari, Clean_Boat, Clean_Pump, Notes, Status, FDEP_Deed, FDEP_Easem,
  Tran_Slips, Linkage, Repairs, Wet_Slips, Rack_Slips, Gas, Diesel, Dinghy, Usage, FSG_POI, Ground_Slips,
  P_O_Notes, Trail_Slips, Fuel_Access, Prim_Route, Prim_Side, Sec_Route, Sec_Side, Wat_Name, Prim_Mile,
  Sec_Mile, MF_Assoc, Rec_Or_Not, Pumpout_Access, Anch_Class, FWC_ID, Longitude, Latitude, PO_TYPE, Type,
  last_edited_date (plus X/Y in the CSV export). Covers slip counts (wet/dry/rack/ground/trailer), fuel
  (gas/diesel/dinghy access), pumpout access, transient slip availability, FDEP lease/deed status.
- **Live-verified counts:** statewide **10,326**, Lee+Collier (`County='Lee' OR County='Collier'`)
  **1,063**. CSV bulk download returned 10,329 lines (header + ~10,326 data rows, small variance likely
  from embedded newlines in a text field — not investigated further, doesn't affect row-count claim
  materially).
- **Description (from ArcGIS item metadata):** "An inventory of facilities, infrastructure and locations
  providing storage and essential services for small craft within coastal and inland Florida... Data was
  compiled during the course of 15 years through remote means including Google Earth, Microsoft Bing Maps,
  county property appraiser databases, and web searches."
- **Cadence:** has a `last_edited_date` field; compiled/maintained over 15 years per the description —
  reads as periodically-refreshed, not real-time. No cron/SLA published.
- **Auth:** none.
- **Terms (confirmed via ArcGIS item `licenseInfo`, quoted verbatim):** "Users are encouraged to read and
  fully comprehend the metadata record prior to using these data. Please acknowledge the Florida Fish and
  Wildlife Conservation Commission (FWC) as the data source for any products developed from these data...
  FWC shall not be liable for improper or incorrect use of these data." `access: public`. No redistribution
  ban — attribution required.
- **Geographic filterability:** `County` field, confirmed (`Lee`, `Collier` both present, case as shown).
- **Verified how:**
  `curl "https://gis.myfwc.com/hosting/rest/services/Open_Data/Marinas_Florida/MapServer/6?f=json"` → HTTP 200, 50 fields listed.
  `curl ".../6/query?where=1%3D1&returnCountOnly=true&f=json"` → `{"count":10326}`.
  `curl ".../6/query?where=County%3D%27Lee%27+OR+County%3D%27Collier%27&returnCountOnly=true&f=json"` → `{"count":1063}`.
  `curl "https://www.arcgis.com/sharing/rest/search?q=title:%22Marinas%20Florida%22&f=json"` → resolved item id.
  `curl "https://www.arcgis.com/sharing/rest/content/items/e5aab21bdec84aad9c9fdb8169a885d3?f=json"` → got `url`, `licenseInfo`, `accessInformation`.
  `curl -L "https://opendata.arcgis.com/api/v3/datasets/e5aab21bdec84aad9c9fdb8169a885d3_6/downloads/data?format=csv&spatialRefId=4326"` → HTTP 200, real CSV with header row `X,Y,OBJECTID,Name,Street,City,Zip,County,...` and real data rows (first row: a marina named "Goodla..." at -81.646,25.921 = Collier area).

---

## 4. Florida Healthy Beaches (floridahealthybeaches.com) — HTML crawl

- **URL:** `https://www.floridahealthybeaches.com/counties`, drill to
  `https://www.floridahealthybeaches.com/county/lee` and `/county/collier`.
- **Access method:** HTML page crawl (Next.js-rendered site). No API found/offered — crawl4ai render
  required (raw `curl` would only get the SSR shell, not confirmed either way since crawl4ai was used
  directly).
- **Format:** HTML → converted to markdown by crawl4ai; no JSON/CSV export observed on this site.
- **IMPORTANT — this is a third-party aggregator, not the primary agency.** Footer reads "Data provided
  by: Florida Health" linking to `floridahealth.gov`. The primary-source page I attempted to hit directly
  (`floridahealth.gov/.../beach-water-quality/index.html`) returned a **404** — the DOH's own current URL
  for this content was not located in this pass. **This source should carry a redistribution-provenance
  caveat**: it's Florida DOH's underlying enterococcus sampling data, but fetched via a hobbyist site
  (footer also shows a "Buy Me a Coffee" donation link, `epnoon` — an individual's side project, not an
  official government mirror). Fine for a demo/proof pipeline; would need the real DOH/DEP source located
  before any production use.
- **Fields observed per beach:** beach name, status (`Good` / `Moderate` / `Advisory`), latest sample date,
  Enterococcus level (raw count). Thresholds stated on the page: Good ≤35, Moderate 36-104, Poor/Advisory
  >104 (enterococcus bacteria count, standard recreational-water indicator).
  Full underlying DOH dataset almost certainly has more fields (station lat/lon, historical samples,
  sampling agency) — not exposed on this front-end, so "full scope" here is bounded by what the crawl
  target renders, not the true source ceiling. A real ingest would need to find DOH's own data endpoint.
- **Live-verified counts:**
  - Lee County: **12 monitored beaches** (Blind Pass/Turner Beach, Boca Grande Sea Grape, Bonita Beach
    Park, Bowditch Park, Bowmans Beach, Cape Coral Yacht Club, Lighthouse Beach, Little Hickory Island
    Park, Lovers Key State Park, Lynn Hall Park, Newton Park, Sanibel Causeway). Sample dates ranged
    7/20/2026–7/27/2026 (one outlier at Lynn Hall Park: 4/6/2026 — stale/infrequent sampling at that site).
    All 12 showed status "Good", enterococcus levels 10-42.
  - Collier County: **11 monitored beaches** (page fetched, count confirmed, not itemized here).
- **Cadence:** "Last Updated: 8/1/2026, 2:00:56 AM" shown site-wide; individual beach samples appear
  roughly weekly per the date spread observed (not confirmed as a fixed schedule).
- **Auth:** none.
- **Terms:** none stated for this third-party site specifically; underlying DOH data is public health
  surveillance data, typically public-domain, but not independently re-confirmed for this exact page.
- **Geographic filterability:** by county (URL path `/county/{slug}`), confirmed for `lee` and `collier`.
- **Verified how:**
  `crawl4ai "https://www.floridahealthybeaches.com/counties"` → real page, county list with per-county beach counts and status chips, "Last Updated" timestamp.
  `crawl4ai "https://www.floridahealthybeaches.com/county/lee"` → 12 beach entries with names/status/dates/enterococcus values, e.g. `BOCA GRANDE SEA GRAPE Moderate Latest Sample: 7/27/2026 Enterococcus Level: 42`.
  `crawl4ai "https://www.floridahealthybeaches.com/county/collier"` → confirmed 11 monitored beaches (`grep -o "Latest Sample" | wc -l` → 11).
  `crawl4ai "https://www.floridahealth.gov/.../beach-water-quality/index.html"` → 404 (primary DOH URL not found this pass — logged as a gap, not a claim).

---

## 5. FLHSMV Annual Vessel Statistics by County — bulk PDF report

- **Landing page:** `https://www.flhsmv.gov/motor-vehicles-tags-titles/vessels/vessel-owner-statistics/`
- **Direct PDF (2025, most recent):** `https://www.flhsmv.gov/pdf/vessels/vesselstats2025.pdf`
- **Access method:** direct PDF download, one file per year (2019–2025 all listed and linked). No key.
- **Format:** PDF (18 pages), extractable with a text-layer PDF parser (verified with `pypdf`, plain text
  extracted cleanly, no OCR needed).
- **Full scope:** one row per Florida county (67 counties + a "DHSMV" catch-all row), broken into **8
  vessel length classes** (Class A-1 <12', A-2 12'-15'11", Class 1 16'-25'11", Class 2 26'-39'11", Class 3
  40'-64'11", Class 4 65'-109'11", Class 5 110'+, plus Canoes), each split **Pleasure vs Commercial** counts,
  plus a summary page with **Dealer / Pleasure / Commercial / Overall Total** per county. That's the full
  field scope of this report — no additional columns hidden.
- **Live-verified data (Lee County, pulled directly from the PDF text layer):**
  Class A-1 Pleasure 7,846 / Commercial 40 · Class A-2 Pleasure 4,594 / Commercial 75 · Class 1 Pleasure
  27,337 / Commercial 654 · Class 2 Pleasure 7,591 / Commercial 218 · Class 3 Pleasure 777 / Commercial 55 ·
  Class 4 Pleasure 60 / Commercial 8 · Class 5 Pleasure 6 / Commercial 3 · Canoes Pleasure 396 / Commercial
  3 · Dealer 241 · **Overall Total: 49,904 vessels registered in Lee County.**
  **Collier County total: 25,510 vessels** (Dealer 108, Pleasure 24,563, Commercial 839) — confirmed on the
  same summary page.
- **Cadence:** annual, published as a distinct PDF per year; 2019–2025 all currently linked (7 years of
  history immediately available for a time-series demo without extra scraping).
- **Auth:** none.
- **Terms:** Florida public records / state agency publication; no explicit license text found on the
  landing page — treated as public-domain state statistical report pending a closer read if used beyond
  a demo.
- **Geographic filterability:** native — the report is already organized by county; no filtering needed.
- **Verified how:**
  `crawl4ai "https://www.flhsmv.gov/resources/driver-and-vehicle-reports/vehicle-and-vessel-reports-and-statistics/"` → found the "Annual Vessel Statistics by County" link (distinct from the vehicle-registration-by-county reports, which mix cars/trucks/motorcycles and are NOT vessel-specific — flagging so a future session doesn't grab the wrong PDF family).
  `crawl4ai ".../vessel-owner-statistics/"` → confirmed direct links for 2019–2025.
  `curl -L "https://www.flhsmv.gov/pdf/vessels/vesselstats2025.pdf" -o vesselstats2025.pdf` → HTTP 200, 190KB, valid PDF v1.6.
  `python3` + `pypdf.PdfReader` → 18 pages, extracted per-county rows above verbatim from the text layer.

---

## What was checked and dropped / not usable as a clean 4-6th source

- **FWC Boating Accident Statistical Reports** (`myfwc.com/boating/safety-education/accidents/`) — real
  and current (2025 report: 694 accidents, 51 fatalities statewide, per news coverage), but published as
  narrative PDF "books," not a structured per-record dataset. Searched ArcGIS Online for a structured FWC
  boating-accident layer (`title:"boating accident" owner:GISLibrarian`) — **zero results**. Not included
  as a source; would need PDF table-scraping of unknown structure, higher effort than the 5 sources above
  for uncertain row-level yield.
- **FLHSMV vehicle-registration-by-county PDFs** (the `cvr_*.pdf` series) — verified live (HTTP 200,
  real 2-page PDF) but these report ALL registered vehicle types (autos, trucks, motorcycles, buses) by
  county, not vessels specifically. The correct vessel-specific report is source 5 above — noted here so
  this dead-end isn't re-walked next session.
- **NWS marine zone forecasts** — confirmed NOT supported by `api.weather.gov` (see negative-result note
  under source 2). Not a usable structured source today.
- **USACE waterway data** — not checked this pass (time-boxed to the sources above); still an open lead
  if a 6th source is wanted.
- **Florida DEP beach/water quality (primary agency page)** — not located; floridahealthybeaches.com
  (source 4) is a third-party mirror of the underlying DOH data, not DEP directly. Worth a follow-up pass
  to find DEP's or DOH's own machine-readable endpoint if this becomes more than a demo.

---

## Ranked pick — best 4 for the proof-of-pipeline

1. **FWC Derelict Vessels** (ArcGIS REST/JSON) — 63 Lee+Collier rows, 28 fields, the known-good lead, now
   re-verified live.
2. **NOAA CO-OPS Tides & Currents** (JSON API) — Fort Myers + Naples stations, genuinely time-varying data
   (good for showing a pipeline handles a refreshing feed, not just a static table), zero auth friction.
3. **FWC Marinas Florida** (bulk CSV download) — 1,063 Lee+Collier rows from a single static-file GET,
   50 fields, cleanest "bulk CSV" shape of anything found, real slip/fuel/pumpout infrastructure detail.
4. **Florida Healthy Beaches** (HTML crawl) — 23 Lee+Collier beaches combined, forces the pipeline to
   handle an HTML-only source with no API, which is the point of including it — but flag the
   third-party-mirror caveat before shipping past a demo.

FLHSMV Annual Vessel Statistics (PDF) is the strong 5th — arguably the most *commercially* interesting
number (49,904 registered vessels in Lee, 25,510 in Collier = real market-sizing data a marina/dealer
would want) but PDF-table extraction is a heavier, more fragile parse than the other 4, so it's the one
to add second, not first.

## Buyer-email idea (one sentence)

A marina operator or waterfront HOA would want a short weekly brief that combines what's near them right
now — any newly reported derelict/abandoned vessel within their stretch of water, this week's tide
highs/lows for planning haul-outs and dockage, and the latest water-quality status at the beaches their
customers actually swim at — because that's the three things that change week to week and actually affect
whether their marina looks safe, navigable, and clean to a paying boater.
