# Greenfield scout — new-business formation / local banking signals (Lee + Collier, FL)

**Date:** 2026-08-02. **Scope:** proof-of-pipeline demo, 4 heterogeneous FREE sources, hundreds–low-thousands rows each. NOT real estate. All entries below were live-fetched in this session; commands and raw responses are pasted verbatim, not recalled from memory or from the prior 07/18/2026 lead list (which is re-verified here, not trusted).

---

## 1. FDIC BankFind Suite API — bank branches + deposits

- **URL (docs/portal):** https://banks.data.fdic.gov/ — **live API host is now `api.fdic.gov`** (the `banks.data.fdic.gov` host issues an HTTP 301 redirect to it; the old host still works transparently via `-L`).
- **Access method:** REST JSON API, no key.
- **Format:** JSON.
- **Endpoints verified (3):**
  - `/institutions` — bank entities (HQ-level). Fields requested and returned: `NAME, CITY, STALP, COUNTY, ASSET, ESTYMD, ACTIVE, ID`. Full field catalog is much larger (financials, regulator codes, holding-company links, charter class) — not enumerated field-by-field here, but the returned record shape confirms rich metadata.
  - `/locations` — physical branch offices. Fields seen: `NAME, OFFNAME, ADDRESS, CITY, COUNTY, ZIP, LATITUDE, LONGITUDE, CBSA/CBSA_METRO_NAME, SERVTYPE_DESC, MAINOFF, ESTYMD, CERT, UNINUM`. ~30 fields per record.
  - `/sod` (Summary of Deposits) — branch-level **deposit dollars** ($000s), annual as of June 30. Fields seen: `NAME, OFFNAME, CITY, COUNTY, DEPSUMBR, ADDRESBR, ZIPBR`.
- **Live-verified counts (Lee + Collier, FL):**
  - Active HQ institutions: **3** (`STALP:FL AND (COUNTY:Lee OR COUNTY:Collier) AND ACTIVE:1`)
  - All-time HQ institutions (incl. historical/failed): **51** for Lee alone
  - Branch locations: **295** (`/locations`, Lee+Collier combined)
  - SOD deposit records, 2025: **26** (Lee 12071 + Collier 12021 combined, this is a smaller subset than `/locations` — SOD reports one deposit figure per branch per year, `/locations` is the live directory)
- **Cadence:** `/institutions` and `/locations` update continuously (index build timestamp seen: `2026-07-31`). `/sod` is annual, as-of June 30 each year.
- **Auth:** none.
- **Terms:** public U.S. government data, no redistribution restriction found on the portal pages fetched.
- **Verified how:**
  ```
  curl -s -L "https://banks.data.fdic.gov/api/institutions?filters=STALP:FL%20AND%20COUNTY:Lee&fields=NAME,CITY,STALP,COUNTY,ASSET,ESTYMD,ACTIVE&limit=5&format=json"
  → HTTP 200, meta.total=51, 5 real records returned (Lee County Bank, First National Bank in Fort Myers, etc.)

  curl -s -L "https://banks.data.fdic.gov/api/locations?filters=STALP:FL%20AND%20(COUNTY:Lee%20OR%20COUNTY:Collier)&limit=3&format=json"
  → HTTP 200, meta.total=295

  curl -s -L "https://banks.data.fdic.gov/api/sod?filters=STALP:FL%20AND%20(STCNTY:12071%20OR%20STCNTY:12021)%20AND%20YEAR:2025&fields=NAME,OFFNAME,CITY,COUNTY,DEPSUMBR,ADDRESBR,ZIPBR&limit=3&format=json"
  → HTTP 200, meta.total=26, real dollar figures (DEPSUMBR: 170188, 109628, 65697 = $000s)
  ```

---

## 2. FL Division of Corporations ("Sunbiz") daily Corporate Data File — SFTP

- **URL (portal):** https://dos.fl.gov/sunbiz/other-services/data-downloads/daily-data/ — live, confirmed by crawl4ai fetch (full nav + content rendered).
- **URL (field spec):** https://dos.sunbiz.org/data-definitions/cor.html — live, confirmed by crawl4ai fetch. Full 1440-char fixed-width layout retrieved: Corporation Number, Name, Status (A/I), Filing Type (DOMP/DOMNP/FORP/FORNP/DOMLP/FORLP/FLAL/FORL/NPREG/TRUST/AGENT), Address 1/2, City, State, Zip, Country, Mailing Address block, File Date, FEI Number, Last Transaction Date, up to 3 Annual Report year/date pairs, Registered Agent name/type/address, up to 6 Officer blocks (title/type/name/address) — **40+ fields** in the Corporate Data File alone, plus a separate Corporate Event File.
- **Access method:** SFTP. Host `sftp.floridados.gov`, published publicly on the state portal page above (state-published credential — cited here by portal URL only, not written into this file; do not commit the literal string).
- **Format:** fixed-width ASCII text, 1440 bytes/record.
- **Live-verified — actually transferred data, not just portal-verified:**
  - `curl --list-only "sftp://sftp.floridados.gov/Public/"` → listed `doc`, `WELCOME.TXT`
  - `.../Public/doc/` → `AG, cor, cornp, DHE, fic, ficevent-Year2000, FLR, gen, notes, Quarterly, tm`
  - `.../Public/doc/cor/` → yearly folders 2011–2021, **then individual daily files `20220103c.txt` … `20260801c.txt`** (i.e. the file for 08/01/2026 — one calendar day before this scout ran — is already posted), plus `Events`, `Filings`, `Prior to 2011`, README files.
  - **Downloaded `20260801c.txt` in full** (544,698 bytes): **378 records**, one statewide business day. Confirmed line length clusters at 1437/1439/1440 chars — matches the documented 1440-byte fixed record (trailing-space trim on the shorter lines).
  - First record sample: `L26000399760SABOR CUBANO BAKERY & RESTAURANT LLC ... AFLAL 1703 NEW HAVEN RD ...`
  - Zip field (position 335, len 10, per spec) extracted with `cut -c335-344` — populated, real Florida zips (33914 Cape Coral, 33132 Miami, etc. seen in the sample).
  - **Lee/Collier filterable:** zip-prefix `339` (Lee-area) appears **16 times** in this single 378-record statewide day — confirms county-level filtering is possible via zip, since the file itself carries no county field.
- **Cadence:** daily (business days), verified current through 08/01/2026 at time of this scout (08/02/2026). Also quarterly full-file drops.
- **Auth:** state-published public SFTP login, portal cites it directly — use it, never write it to a repo file.
- **Terms:** public state records; no additional redistribution restriction found on the portal/spec pages fetched.
- **Note on scale:** one statewide day (378 rows) is itself already in the "low-thousands" demo band; filtered to Lee+Collier zips it's a much smaller daily trickle (tens/day) — for a demo, pull a week or two of daily files and filter by zip to get a few hundred rows.

---

## 3. FL DBPR — Alcoholic Beverages & Tobacco Daily Activity extract

- **URL (portal):** https://www2.myfloridalicense.com/instant-public-records/ (live) → https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/public-records/ (live) → direct CSV: **https://www2.myfloridalicense.com/sto/file_download/extracts/daily.csv**
- **Access method:** direct HTTPS CSV download (bulk flat file, refreshed in place — this is the "one HTML page needing a crawl to find the link" shape: the CSV itself needed the ABT public-records page fetched and parsed to find the URL, since it isn't a documented/versioned API).
- **Format:** CSV, no header row. 17 columns per row, order observed: license-type code, **County**, license number, license class code, sub-class, business/DBA name, licensee/entity name, address line, address line 2, address line 3, city, state, zip, license/transaction date, transaction code, transaction description, blank trailer field.
- **Live-verified counts:**
  - Full file: **417 rows**, statewide, dated mostly 07/29/2026 (a few days of processing activity).
  - `grep -c '"Lee"'` → **5 rows**
  - `grep -c '"Collier"'` → **4 rows**
  - Sample Lee row: `"4002","Lee","4601766","ODP","","MUSIC WALK","BROTHERHOOD RIDE, INC.","FIRST STREET","","","FORT MYERS ","FL","33901","07/29/2026","1030","Limited One Two Three Day Permit",""`
- **Cadence:** described on-portal as "Daily license processing activity" — appears to be a short rolling window (days), not a full historical archive; a demo pipeline would need to poll and accumulate.
- **Auth:** none.
- **Terms:** portal links a "ReadMe/Disclaimer" (https://www2.myfloridalicense.com/public-records-read-medisclaimer/) — page confirmed live (crawl4ai fetch, HTTP content rendered) but full disclaimer text not read in depth this pass; treat as standard state-public-records terms pending a closer read before production use.
- **Lee/Collier filterability:** direct — County is an explicit labeled column, no zip inference needed (unlike Sunbiz).
- **Why this one and not a bigger DBPR file:** the ABT public-records page lists 15 other extract CSVs (brands, distributors, retail licenses, revoked licenses, etc. — all at `https://www2.myfloridalicense.com/sto/file_download/extracts/*.csv`) — same access shape, larger row counts, available if the demo wants a second DBPR angle instead of a second source entirely.

---

## 4. U.S. Census Bureau County Business Patterns (CBP) API

- **URL:** https://api.census.gov/data/2023/cbp — data endpoint; https://www.census.gov/programs-surveys/cbp.html — program page (HTTP 200, live).
- **Access method:** REST JSON API. **Requires a free registered key as of this session** (verified live, see below) — this is a change from older "small-request no-key" behavior sometimes assumed from memory; do not trust that assumption.
- **Format:** JSON.
- **Fields:** metadata endpoint returned **543,719 bytes** of variable definitions (`/2023/cbp/variables.json`, HTTP 200, no key needed for metadata). Core load-bearing fields for this use case: `ESTAB` (establishment count), `EMP` (employment), `PAYANN` (annual payroll), `NAICS2017`/`NAICS2017_LABEL` (industry). Full variable list is large (noise ranges, flags, multiple NAICS vintages) — not fully enumerated here per full-scope-first, but the field catalog is confirmed live and large.
- **Geography — verified via `/2023/cbp/geography.json`:** supports `us`, `state`, **`county`** (requires state), `metropolitan statistical area`, `combined statistical area`, `congressional district`, and `zip code`. **County-level and ZIP-level are both available** — this is the one source in the set that could give an actual Lee-County-vs-Collier-County establishment/employment comparison by NAICS industry (e.g., finance & insurance NAICS 52).
- **Auth / key gate — live-verified:**
  ```
  curl -sv "https://api.census.gov/data/2023/cbp?get=NAME,ESTAB&for=county:071&in=state:12"
  → HTTP/1.1 302, header: X-DataWebAPI-KeyError: 1, Location: https://api.census.gov/data/missing_key.html
  ```
  Key signup page confirmed live: `https://api.census.gov/data/key_signup.html` → HTTP 200. Free registration (email, instant), key is not written anywhere in this file per the no-credential rule.
- **Status:** **structure and geography fully verified live; actual row-level data pull is UNTESTED** because no key was registered in this pass. Label accordingly if used: "Census CBP — schema/geo verified live, data pull pending free key registration."
- **Cadence:** annual (2023 is the latest vintage seen in the URL path at time of this scout).
- **Terms:** U.S. government public data, no redistribution restriction.

### Related but rejected: Census Business Formation Statistics (BFS)

- **URL:** https://api.census.gov/data/timeseries/eits/bfs
- Same key gate as CBP (`X-DataWebAPI-KeyError: 1` on the data endpoint), but **`/timeseries/eits/bfs/geography.json` returns only `{"fips":[{"name":"us", ...}]}` — verified live, national level only, no state or county breakout.** BFS is thematically the closest match to "new business formation" (it's literally weekly business-application counts) but it cannot be filtered to Lee/Collier or even Florida, so it does not fit this SWFL-scoped demo. Noted here so it isn't re-investigated as a lead later.

---

## 5. NCUA credit union data — ATTEMPTED, NOT VERIFIED (dropped from the pick list)

- Tried: `https://ncua.gov/analysis/credit-union-corporate-call-report-data/...` (both the top-level and quarterly-data pages) — pages return HTTP 200 but are Angular single-page apps; crawl4ai's static fetch only returned nav/footer chrome, not the actual download links (JS-rendered body content not captured by a markdown-mode crawl).
- Tried a guessed direct file URL (`branchinfo.zip`) — **404**, not a real path, my guess was wrong.
- Tried `https://mapping.ncua.gov/api/CreditUnion` — returns HTTP 200 but is the Angular app's `index.html` shell (SPA catch-all route), not real API JSON.
- Tried `catalog.data.gov` API search — 404, endpoint likely moved/renamed since training-data vintage.
- **Conclusion:** NCUA branch/call-report data is very likely still obtainable (it's a well-known public dataset), but finding the real download/API path needs either JS execution (not available to a curl-only pass) or a slower manual site walk that wasn't proportionate to spend on a 4-source demo that already had 4 solid, differently-shaped verified sources. **Do not claim NCUA data is unavailable — only that this pass didn't locate the live path.** Worth a follow-up crawl4ai pass with JS rendering enabled, or a direct look at `ncua.gov/files/publications/` listing, if a 6th source is wanted later.

---

## Ranked pick — best 4 sources for the proof

1. **FL Sunbiz daily Corporate Data File (SFTP, fixed-width)** — the star: a brand-new LLC/corp filed yesterday, actually downloaded and parsed, zip-filterable to Lee/Collier. Proves the pipeline can handle a non-HTTP, non-JSON, fixed-width legacy shape.
2. **FDIC BankFind API (`/institutions`, `/locations`, `/sod`)** — proves a clean, no-key, well-documented REST JSON shape, and it's the one source that's directly "local banking" (branch locations + real deposit dollars by branch).
3. **FL DBPR ABT Daily Activity CSV** — proves the "found via crawling a portal page, then a flat bulk CSV" shape; County is a labeled column (easiest of all four to filter to Lee/Collier); new liquor licenses are a decent proxy signal for new restaurant/bar business formation.
4. **Census CBP (county + ZIP grain, key-gated)** — proves the "free-but-registered-key" REST JSON shape and is the only source giving an industry-level (NAICS) establishment/payroll comparison between Lee and Collier — needed for a banker's market-sizing narrative even though the actual key wasn't pulled yet.

(BFS and NCUA are documented above as investigated-and-set-aside, not silent gaps.)

## Buyer-email idea

A community banker or credit-union business-banking manager in Lee/Collier would want a short weekly note that says: "N new LLCs/corps filed in your ZIP footprint this week (Sunbiz), M of them in industries your branch already banks (Census CBP NAICS mix), and here's how your branch's deposit share (FDIC SOD) stacks up against the Q new liquor/restaurant licenses (DBPR) opening near you" — i.e., new-entity formation + industry mix + your own competitive deposit position, stitched into one "who just became a prospect near you" digest instead of four separate government portals they'd never check themselves.
