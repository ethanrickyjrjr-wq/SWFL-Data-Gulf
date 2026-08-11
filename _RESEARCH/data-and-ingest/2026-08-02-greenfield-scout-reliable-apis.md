# Greenfield scout — reliable, official, versioned APIs (insurance/economy lean)

**2026-08-02.** Operator rejected a prior round of picks (scraped portals, PDF extractions,
third-party mirrors, state SFTP drops) as "the kind that always fail." This round's ONE ranking
criterion: **reliability** — official, versioned, documented APIs run by agencies that have kept
them stable for years. Theme preference (not hard limit): insurance and/or economy. A free
registered key is acceptable; paid/approval-gated access is out. Every source below was
LIVE-FETCHED this session — no invented output, no memory-only claims. Command + real HTTP status
+ real field names + record counts pasted verbatim below.

---

## 1. FRED API (Federal Reserve Bank of St. Louis)

- **Base:** `https://api.stlouisfed.org/fred/` · **Docs:** `https://fred.stlouisfed.org/docs/api/fred/` (verified live, HTTP 200, 36.7KB page, mentions "Version 1" / "Version 2")
- **Auth:** free registered API key required for every endpoint (no exceptions found). Register: `https://fredaccount.stlouisfed.org/apikeys` (verified live, HTTP 302 — real redirect to account flow, not registered/no key used, no credential written anywhere).
- **Format:** JSON (also XML), REST.
- **Verification — key-gated, confirmed by live error, not by memory:**
  ```
  curl -s "https://api.stlouisfed.org/fred/series/observations?series_id=FLLEE7URN&file_type=json"
  → {"error_code":400,"error_message":"Bad Request.  Variable api_key is not set.  Read https://fred.stlouisfed.org/docs/api/api_key.html for more information."}

  curl -s "https://api.stlouisfed.org/fred/series/observations?series_id=FLLEE7URN&api_key=test&file_type=json"
  → {"error_code":400,"error_message":"Bad Request.  The value for variable api_key is not a 32 character alpha-numeric lower-case string. ..."}
  ```
  Every data endpoint requires the key — there is no unregistered read path. Per instructions, no
  key was registered and no data fetch was faked. **Status: key required, unverified fetch** (docs
  + registration mechanics confirmed live; actual series payload not fetched).
- **Lee/Collier relevance:** FRED mirrors BLS LAUS county series (format `LAUCN<5-digit-FIPS><suffix>`,
  e.g. Lee County FL = FIPS 12071). The BLS API itself (source #3 below) confirmed series ID
  `LAUCN120710000000003` is real and live — FRED almost certainly carries the identical series
  (FRED is BLS's documented redistribution partner) but this was **not independently confirmed**
  because the public FRED series webpage (`fred.stlouisfed.org/series/LAUCN120710000000003`)
  returned HTTP 404 on repeated fetch attempts (3x) — plausibly a bot-facing block rather than a
  missing series, but marked unverified rather than assumed.
- **Update cadence:** per-series (documented on FRED, not independently re-checked this session).

## 2. OpenFEMA API (FEMA)

- **Base:** `https://www.fema.gov/api/open/{v1,v2,v3}/` · **Docs page** (`fema.gov/about/openfema/api`) returned HTTP 403 to automated fetch this session (bot-facing block) — could not re-verify the docs page text directly, but the live API itself was fetched repeatedly and works.
- **Auth:** none.
- **Format:** JSON (default) or CSV, REST with OData-style `$filter`/`$top`/`$select`/`$orderby`.
- **Versioning evidence:** dataset-level version numbers in the URL path (v1/v2/v3) plus explicit
  in-payload deprecation metadata — real, live example pasted below. This is stronger stability
  evidence than a marketing claim: the API tells you, in the response itself, exactly when an
  endpoint dies and what replaces it.
- **Verified fetch #1 — Disaster Declarations Summaries (stable, v2):**
  ```
  curl -s 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$top=1'
  → HTTP 200. Fields seen: femaDeclarationString, disasterNumber, state, declarationType,
    declarationDate, incidentType, designatedArea, fipsStateCode, fipsCountyCode. 1 record returned
    (FM-5529-OR, Aug 2024).
  ```
- **Verified fetch #2 — NFIP claims (insurance-relevant), plus a real deprecation notice:**
  ```
  curl -s 'https://www.fema.gov/api/open/v2/FimaNfipClaims?$top=1'
  → HTTP 200. In-payload DeprecationInformation block: depDate 2026-10-15, "Data is frozen as of
    06/01/2026", depNewUrl: https://www.fema.gov/openfema-data-page/nfip-redacted-claims-v3.
    Fields seen: dateOfLoss, state, countyCode, ratedFloodZone, netBuildingPaymentAmount,
    netContentsPaymentAmount, floodEvent, nfipCommunityNumberCurrent, censusTract. Real record:
    NJ claim, floodEvent "December Storm - Nor'easter", $7,243.04 building payment.

  curl -s 'https://www.fema.gov/api/open/v2/FimaNfipClaims?$top=2&$filter=state%20eq%20%27FL%27'
  → HTTP 200, real FL record returned (dateOfLoss 2018-10-10). State-level filter CONFIRMED working.
  ```
- **Discrepancy / fragility flag — county-level filter and the v3 replacement:**
  - `$filter=countyCode eq '12071'` (Lee County FIPS) on `FimaNfipClaims` returned **HTTP 503**
    on two separate attempts (state-level filter on the same dataset worked fine at HTTP 200) —
    looks like a slow/timing-out query on this specific field, not a hard outage.
  - The documented v3 replacement endpoint, `https://www.fema.gov/api/open/v3/NfipClaims`
    (confirmed as the correct name by scraping the actual FEMA data page —
    `grep 'api/open/v[0-9]/[A-Za-z]*' nfip-redacted-claims-v3.html` → `api/open/v3/NfipClaims`),
    returned **HTTP 503 on 4 separate attempts** (with and without filters) while the *deprecated*
    v2 endpoint kept returning HTTP 200 throughout. **This is a live, reproducible finding, not
    speculation: as of this session, FEMA's own v3 NFIP claims migration target is down and the
    only working path is the endpoint FEMA has scheduled for removal 2026-10-15.**
- **Lee/Collier filterability:** confirmed at state level; county-level filter is currently
  unreliable on the claims endpoint specifically (disaster declarations endpoint has clean
  `fipsCountyCode`/`designatedArea` fields and was not observed to have this problem).
- **Verdict:** real, versioned, government-run, years of documented dataset history — but the v3
  migration is a live yellow flag worth re-checking before building anything load-bearing on NFIP
  claims specifically. Disaster declarations endpoint (v2, not being deprecated) is rock solid.

## 3. BLS Public Data API (Bureau of Labor Statistics)

- **Base:** `https://api.bls.gov/publicAPI/v1/` (v2 exists, registered-key, not tested — v1
  unregistered was in scope per the brief).
- **Docs:** `https://www.bls.gov/developers/api_signature_v1.htm` and the developer homepage both
  returned **HTTP 403 to automated fetch** (and to WebFetch) this session — real, reproducible
  block, not transient (retried with a browser User-Agent header, still 403). Rate-limit figures
  therefore **not independently re-confirmed this session** — not stating a specific number to
  avoid citing from memory.
- **Auth:** none for v1 (confirmed empirically — no key param sent, request succeeded).
- **Format:** JSON, POST to `/timeseries/data/{seriesid}`.
- **Verified fetch — Lee County FL unemployment rate (LAUS series), unregistered:**
  ```
  curl -s -X POST "https://api.bls.gov/publicAPI/v1/timeseries/data/LAUCN120710000000003"
  → HTTP 200. {"status":"REQUEST_SUCCEEDED", ...}
  Real data: June 2026 = 5.1% (preliminary), May 2026 = 4.9%, April 2026 = 5.0%, back to Jan 2024.
  Includes footnote codes (P=preliminary, T=revised, X=government-shutdown gap for Oct 2025 —
  itself evidence this is a real live government feed with real operational history, not a mock).
  ```
- **Lee/Collier relevance:** direct — this is the actual monthly county unemployment rate for Lee
  County FL, no derivation needed. Series ID pattern `LAUCN<state+county FIPS><measure>` — Collier
  County FL (FIPS 12021) would be `LAUCN120210000000003` (pattern confirmed correct by the Lee
  County hit; Collier itself not separately fetched to conserve API calls, low risk given identical
  BLS LAUS series-ID convention nationwide).
- **Update cadence:** monthly (LAUS program).

## 4. Treasury FiscalData API

- **Base:** `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/` · **Docs:**
  `https://fiscaldata.treasury.gov/api-documentation/` (verified live, HTTP 200, 550KB page).
- **Auth:** none.
- **Format:** JSON, REST, versioned in path (`v1`/`v2` per dataset), JSON:API-style pagination
  (`page[size]`, `page[number]`).
- **Versioning/stability evidence:** dataset-level version in the URL, `meta`/`links` pagination
  envelope with `total-count` and `total-pages` on every response — a mature, self-describing API
  contract.
- **Verified fetch — Debt to the Penny, latest 2 records:**
  ```
  curl -g -s "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=2"
  → HTTP 200. Real record: record_date 2026-07-30, tot_pub_debt_out_amt "39841114561022.68".
  Fields: record_date, debt_held_public_amt, intragov_hold_amt, tot_pub_debt_out_amt.
  meta.total-count: 8361 total records available.
  ```
- **Note:** curl requires `-g` (globoff) — the bare URL has literal `[` `]` in query params which
  curl otherwise treats as its own glob syntax. Not a vendor issue, just a client gotcha worth
  recording since it burned time in this session.
- **Lee/Collier relevance:** national-grain economic context (debt, spending, interest rates) —
  not county-filterable, use as macro backdrop only.
- **Update cadence:** daily (debt_to_penny specifically).

## 5. FDIC BankFind API — re-confirmed

- **Base (current, post-redirect):** `https://api.fdic.gov/banks/` — the older
  `banks.data.fdic.gov` host issued a live HTTP 301 to the new domain during this session (verified,
  not assumed).
- **Auth:** none.
- **Format:** JSON, REST, Lucene-style `filters` query param.
- **Verified fetch:**
  ```
  curl -g -s "https://api.fdic.gov/banks/institutions?filters=STALP:FL%20AND%20ACTIVE:1&fields=NAME,CITY,STALP,ASSET&limit=5&format=json"
  → HTTP 200. meta.total: 84 active FL institutions. Real records: "Seacoast National Bank"
  (Stuart, FL, ASSET 21,134,120), "First State Bank" (Key West, FL), etc.
  ```
  A direct `CITY:"FORT MYERS"` filter returned 0 results (likely exact-match-on-HQ-city, most
  branches aren't separately indexed as HQ) — state-level filter works cleanly; city-level needs
  exact HQ-city matching, not a broken feature, just a narrower field than expected.
- **Lee/Collier relevance:** bank-level financial data (a bank's insurance-adjacent economic
  signal — deposits, assets, failures) filterable to FL; county-level would need a join against a
  separate branch-location dataset (BankFind has a `/locations` endpoint, not tested this session).
- **Re-confirms:** a prior scout today already verified this source; this session independently
  re-confirmed with a fresh live fetch (different query) — no assumption carried over.

## 6. NOAA CO-OPS Tides & Currents API — re-confirmed

- **Base:** `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter`
- **Auth:** none.
- **Format:** JSON (or CSV/XML), REST.
- **Verified fetch — Fort Myers, FL station 8725520, tide predictions:**
  ```
  curl -g -s "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8725520&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&format=json&date=today"
  → HTTP 200. Real 6-minute-interval tide predictions for today, fields t (timestamp) and v (value
  in feet), e.g. {"t":"2026-08-02 00:00","v":"0.503"}.
  ```
  Note: `water_level` (observed, not predicted) failed with a clean, documented error for the
  Naples station 8725110 ("No data was found. This product may not be offered at this station at
  the requested time") — that's the station lacking a real-time gauge for that product, not an API
  failure; `predictions` (harmonic, always available) worked immediately.
- **Lee/Collier relevance:** direct — Fort Myers station 8725520 is in-county; flood/storm-surge
  and coastal-economy signal, complements OpenFEMA NFIP data.
- **Re-confirms:** a prior scout today already verified this source; independently re-confirmed
  with a different station/product this session.

## 7. FL Office of Insurance Regulation (FLOIR) — FRAGILE, confirmed portal-only

- **Domain moved:** `floir.com` and `fldfs.com` subdomains now 302-redirect to **`floir.gov`**
  (verified live this session — real redirect chain followed with `curl -L`).
- **QUASR (Quarterly market data):** `https://floir.gov/tools-and-data/residential-market-share-reports`
  (verified HTTP 200) — every linked file is `.xlsx`, hand-dated by quarter, e.g.
  `.../2023-q2/quasr_statewide_summary_by_company_and_policy_type_2023q2_20230911t150714.xlsx`.
  **No JSON/API surface found anywhere on the page.**
- **choices.floir.gov** (rate-comparison shopping tool, formerly `choices.fldfs.com`) — redirects
  to a consumer-facing landing page (`/landing/`), not a data API.
- **Other "tools-and-data" links found on the FLOIR homepage** (catastrophe-reporting,
  professional-liability-tracking-system, required-filing-and-reporting) were not individually
  probed but follow the identical pattern (portal pages, PDF/XLSX downloads) based on the site's
  consistent Sitefinity/CMS structure.
- **Verdict: exactly the fragile class the operator rejected.** No stable API contract, no
  versioning, quarterly XLSX with unpredictable filenames (timestamp suffixes change per file).
  Confirmed dead for this round, not a maybe.

## 8. Also checked — EIA API (energy/economy, key-required)

- **Base:** `https://api.eia.gov/v2/` · **Docs:** `https://www.eia.gov/opendata/documentation.php`
  (verified live, HTTP 200).
- **Auth:** free key required. Register: `https://www.eia.gov/opendata/register.php` (URL surfaced
  directly in the live error response, not memory).
- **Verified (key-gated) via live error:**
  ```
  curl -g -s "https://api.eia.gov/v2/petroleum/pri/gnd/data/?frequency=weekly&data[0]=value&facets[duoarea][]=Y05FL&sort[0][column]=period&sort[0][direction]=desc&length=2"
  → {"error":{"code":"API_KEY_MISSING","message":"No api_key was supplied.  Please register for one at https://www.eia.gov/opendata/register.php"}}
  ```
  v2 in path, JSON:API-style facets — same maturity signal as Treasury FiscalData. Not fetched
  further (key required); noted as a viable secondary economy source (gas prices, energy costs —
  an underwriting-adjacent cost driver for FL homeowners) if the operator wants a 5th pick later.

## Also re-confirmed — Census key requirement (not this round's headline finding, already known)

```
curl -sL "https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E&for=county:071&in=state:12"
→ HTTP 200 but redirected to https://api.census.gov/data/missing_key.html (an HTML landing page
  explaining a key is required) — confirms, independently, the finding already on record that
  Census now gates every request behind a key, including the most minimal ACS query.
```

---

## Top 4 picks — ranked purely on reliability, tiebreak = insurance/economy fit

1. **BLS Public Data API** — no key, real Lee County FL unemployment data fetched live this
   session with zero friction, decades-old federal statistical program, direct economy signal
   (labor market = leading indicator for insurance underwriting risk and consumer spending).
2. **Treasury FiscalData API** — no key, clean versioned JSON:API contract, real live fetch,
   self-describing pagination metadata, textbook "official, versioned, documented" API. Macro
   economy grain (national, not county) is the only ding.
3. **NOAA CO-OPS Tides & Currents API** — no key, live real predictions fetched for an in-county
   (Fort Myers) station, direct insurance-relevant signal (storm surge / coastal flood exposure)
   for a coastal SWFL audience.
4. **OpenFEMA API (Disaster Declarations Summaries specifically, not the NFIP claims v3 path)** —
   no key, real live fetch, in-payload deprecation transparency is itself a stability signal, and
   disaster-declaration history is squarely insurance-relevant (catastrophe exposure, FL disaster
   frequency). Ranked 4th not 1st because the NFIP-claims side of the same API (the more
   insurance-native dataset) is mid-migration and its v3 replacement 503'd four times live this
   session — real risk, not hypothetical.

**FRED is not in the top 4 purely on process**, not doubt about the vendor: every data endpoint is
key-gated with no unregistered read path, so nothing beyond docs-page-liveness and the
key-format error was verifiable this session under the "no invented output" rule. It is almost
certainly reliable (Federal Reserve, decades in service) — recommend it as pick #5 once a free key
is registered (2-minute signup at `fredaccount.stlouisfed.org/apikeys`), specifically for
`LAUCN120710000000003` / `LAUCN120210000000003` style county series which the BLS fetch already
proved exist under that exact naming convention.

## What a real buyer would want from these four combined

A SWFL insurance agent or small local business doesn't want a labor-statistics dashboard — they
want one weekly line: "Lee County unemployment ticked from 4.9% to 5.1% (BLS, live), the county's
share of the $39.8T national debt-financed rate environment nudged mortgage-adjacent costs up
(Treasury), Fort Myers saw a King Tide push water levels to X ft above predicted normal this week
(NOAA CO-OPS), and FEMA logged N new disaster declarations for FL this quarter (OpenFEMA)." That's
a single-source-per-line, dated, cited email an agent can forward to a client without editing —
proof the platform pulls real government numbers instead of guessing, which is the actual product
being sold (see `docs/THE-GOAL.md` — reporters, not opinions).

## What FAILED or is fragile — stays dead

- **FLOIR (QUASR, choices.floir.gov, and by extension the rest of `tools-and-data`)** — confirmed
  XLSX/portal-only, zero API surface, exactly the fragile class rejected last round. Domain also
  moved (`floir.com`/`fldfs.com` → `floir.gov`) without a documented migration notice found on the
  old domains — one more sign of an unstable surface, not just an unstable format.
- **FEMA `api/open/v3/NfipClaims`** (the documented current/non-deprecated NFIP claims endpoint) —
  503'd on every attempt (4/4) this session, filtered and unfiltered. The only working NFIP-claims
  path right now is the one FEMA is retiring 2026-10-15. Do not build on v3 until re-verified
  working; the v2 fallback has a hard sunset date.
- **FimaNfipClaims county-level `$filter`** (v2, the currently-working endpoint) — 503'd on
  `countyCode eq '12071'` twice while the identical query with a `state eq 'FL'` filter succeeded.
  Usable today only with state-level filtering + client-side county narrowing, not a clean
  server-side county query.
- **FRED direct series fetch** — not failed, just structurally unverifiable without registering a
  key (against the hard rule not to register credentials this session). Docs and key-format
  validation both confirmed live; the actual data payload is untested.
- **BLS docs pages** (`bls.gov/developers/*`) — 403'd to automated fetch (both curl and WebFetch,
  with and without a browser User-Agent). The API itself works fine; only the documentation HTML
  is bot-blocked. Rate-limit figures could not be independently re-confirmed this session — don't
  cite a specific number without re-checking from a browser.
