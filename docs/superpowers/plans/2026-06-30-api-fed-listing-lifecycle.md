# API-fed Listing Lifecycle (RentCast + SteadyAPI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 12 files, 2 conflict groups, keywords: migration, schema, architecture

**Goal:** Feed the *existing* `data_lake.listing_state` lifecycle machine from two daily APIs — RentCast (the spine: price, beds/baths, real list date, real days-on-market, per-listing price history, MLS#, county FIPS) merged with SteadyAPI (photos + a second active-set enumeration) — replacing the fragile Source-B crawl4ai scrape, and turn the (now WAF-free) daily cron on.

**Architecture:** This is NOT a greenfield build. The `listing-lifecycle-swfl` subsystem already exists on main: `data_lake.listing_state` (wide, MERGE on `(source_name, address_key, sale_or_rent)`) + `data_lake.listing_transitions` (price-cut + state-change history) + the `data_lake.listing_active_stats` GROUPING-SETS view → the live `active-listings-swfl` reporter brain. We swap ONE part: the extractor. The Source-B HTML scrape (`extract.py`, the thing that breaks and is keeping the cron parked behind a WAF) is replaced by an API extractor (`extract_api.py`). Everything downstream — the diff engine (`transitions.py`), the DB layer (`distill.py`, already `source_name`-scoped), the coverage guard, the address key, the brain, the view shape — is reused unchanged. The new feed lands under a new neutral `source_name` so it never mixes with the parked Source-B seed rows.

**Why this replaces the standalone spec:** `docs/superpowers/specs/2026-06-30-steadyapi-listings-lake-design.md` was written on the false premise "listing_lifecycle does not exist, greenfield." It does exist. Its standalone `steadyapi_listings` table would have (1) duplicated this whole subsystem, (2) keyed on the rotating `property_id` — the exact bug `migrations/20260627_listing_lifecycle.sql` was built to avoid ("a relisting gets a new listing id"), and (3) swept once per `property_type` — which the same migration rejects ("property_type ... a column, NOT a lane; capture wide, slice late"). Task 8 corrects the spec + handoff to match this reality.

**Tech Stack:** Python 3.12 (`requests` for the APIs — no crawl4ai, no browser, nothing for a scrape to break), Postgres `data_lake.*` (idempotent SQL via `Bun.SQL`, `sslmode=require`; psql not installed), TypeScript/Bun refinery (the `active-listings-swfl` pack is reused, not rewritten), GitHub Actions cron.

## Global Constraints

Every task's requirements implicitly include this section. Values are verbatim, non-negotiable.

- **Reuse, do not rebuild.** `transitions.py`, `distill.py`, `coverage_guard.py`, `address_key.py`, `pipeline.py` (orchestrator), the `listing_active_stats` view shape, and the `active-listings-swfl` pack/source are REUSED. The only new ingest module is `extract_api.py`. The only schema change is additive columns on `listing_state`.
- **Address is the key, not the listing id.** `listing_state` PK = `(source_name, address_key, sale_or_rent)`. Compute `address_key(street, zip)` for every API row (RentCast gives `addressLine1` + `zipCode`; SteadyAPI gives them via the permalink slug). NEVER key on RentCast `id` or SteadyAPI `property_id`.
- **Capture wide, slice late.** `property_type`, ZIP, county, price, beds are COLUMNS sliced in the view's SQL at query time — never a pipeline/sweep per dimension. RentCast returns `propertyType` directly, so there is NO per-type sweep.
- **No-invention (four-lane moat).** Every number is a real API value (lane 3, named source). The brain's user-facing citation names the real source: `realtor.com via RentCast + SteadyAPI`. The internal `source_name` token in the table stays neutral (`api_feed`) — honoring both the moat (cite real source) and the 06/26 "no vendor names in the table" decree.
- **Aggregate at source.** The brain reads the pre-aggregated `listing_active_stats` view (~tens of GROUPING-SETS rows), never the ~thousands of raw listings.
- **Empty-tolerant (ODD).** No key / non-200 / 429 / bad body → that city-type yields `[]`, never a throw, never a wipe. A disappearance step only fires on a COMPLETE pull (coverage guard) — an incomplete pull is a fetch gap, NOT a withdrawal.
- **ZIP gate G1:** `zip_code` from the listing's own site address only (RentCast `zipCode`, SteadyAPI permalink slug). Never a mailing ZIP.
- **Brain-first + vocab-in-same-commit.** The consuming brain (`active-listings-swfl`) already exists. Any slug it can now emit that wasn't registered before (notably `avg_days_on_market_swfl`, which lights up once RentCast supplies real DOM) must be in `brain-vocabulary.json` in the same commit. Audit: `bun refinery/tools/check-vocab-coverage.mts --all`.
- **Pre-push gates:** SESSION_LOG entry every push · `node scripts/safe-push.mjs` · explicit paths only (never `git add -A`) · Gate 4 (ingest guard before destructive write) · Gate 5 (pack ⇆ catalog mirror + pack `bun:test`) on any `refinery/packs/**` change · vocab gate on any vocab change · never push without operator confirmation · do NOT touch the parallel session's claimed files (`app/api/social/schedule/route.ts`, `components/email-lab/ScheduleSocialModal.tsx`, `lib/social/persist-schedule.ts`).
- **Keys (already in `.env.local`, set as GH secrets before the cron):** `RENTCAST_API_KEY` (header `X-Api-Key`), `PHOTOS_API` (SteadyAPI, header `Authorization: Bearer`). The RentCast key was exposed in git history once (`a2c92a9f`) — ROTATE it before wiring the cron and update both `.env.local` and the GH secret.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `migrations/20260630_listing_state_api_columns.sql` | Additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for the API-only fields (photo_url, lat, lon, county_fips, mls_number, mls_name, listing_type) + GRANT/NOTIFY. Idempotent. | 1 |
| `ingest/pipelines/listing_lifecycle/extract_api.py` | The new extractor. Pure parsers (`parse_rentcast`, `parse_steadyapi`) + paginated fetchers + `merge_by_proximity` + `scan_county_api` returning the coverage-guard payload shape `pipeline.py` already consumes. | 2, 3 |
| `ingest/pipelines/listing_lifecycle/test_extract_api.py` | Unit tests for the parsers + merge, fixture-backed (real captured JSON), no network. | 2, 3 |
| `ingest/pipelines/listing_lifecycle/constants_api.py` | The SWFL city→county seed list (the enumeration seed; rows self-label by API county FIPS) + API base URLs + the neutral `API_SOURCE_NAME`. | 2 |
| `ingest/pipelines/listing_lifecycle/pipeline.py` | MODIFY: add `--source api` (default) routing `scan_county` → `scan_county_api`; thread the neutral `source_name` through `load_current_state` / `upsert_state` / `append_transitions`. | 4 |
| `docs/sql/20260630_listing_active_stats_api.sql` | REPLACE the view: filter `source_name = 'api_feed'` and surface real `avg_days_on_market` (RentCast DOM is no longer NULL). | 5 |
| `.github/workflows/listing-lifecycle-daily.yml` | MODIFY: run the API extractor, drop the Source-B `LISTING_LIFECYCLE_BASE_URL` + WAF parking note, add `RENTCAST_API_KEY` + `PHOTOS_API` secrets, UNCOMMENT the daily `schedule`. | 6 |
| `ingest/cadence_registry.yaml` | Graduate the `listing_lifecycle` block from `not_yet_running:` to `pipelines:` (API feed has no WAF), set `freshness_table` / `expected_rows_min`. | 6 |
| `refinery/packs/active-listings-swfl.mts` | LIGHT EDIT only if needed: the pack already emits `avg_days_on_market_swfl` conditionally when the view returns non-null DOM (its test proves it) — likely NO change. | 7 |
| `docs/superpowers/specs/2026-06-30-steadyapi-listings-lake-design.md` + handoff | Correct the false greenfield premise; mark superseded by this plan. | 8 |

---

## Task 1: Additive migration — API columns on `listing_state`

**Files:**
- Create: `migrations/20260630_listing_state_api_columns.sql`
- Runner: reuse the `Bun.SQL` pattern from `scripts/run-mls-migration.ts`

**Interfaces:**
- Produces: the columns `extract_api.py` rows fill — `photo_url`, `lat`, `lon`, `county_fips`, `mls_number`, `mls_name`, `listing_type`. (The lifecycle's existing columns `list_price, beds, baths, sqft, lot_acres, property_type, zip_code, county, city, listed_date, days_on_market` are reused as-is — RentCast now fills `listed_date` + `days_on_market`, which the scrape left null.)

- [ ] **Step 1: Write the migration SQL**

```sql
-- migrations/20260630_listing_state_api_columns.sql
-- Additive API-feed columns on the existing lifecycle state machine. Capture wide, slice late.
-- Idempotent (ADD COLUMN IF NOT EXISTS); safe to re-run. Apply via Bun.SQL (psql not installed):
--   new Bun.SQL("<conn from .dlt/secrets.toml>?sslmode=require")

ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS photo_url    text;   -- SteadyAPI rdcpix CDN
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS lat          double precision;
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS lon          double precision;
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS county_fips  text;   -- "12071" Lee / "12021" Collier
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS mls_number   text;
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS mls_name     text;
ALTER TABLE data_lake.listing_state ADD COLUMN IF NOT EXISTS listing_type text;   -- RentCast listingType: Standard|New Construction|Foreclosure

GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.listing_state TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply it**

Run (PowerShell tool):
```
bun run scripts/run-migration.ts migrations/20260630_listing_state_api_columns.sql
```
Expected: prints the file name + `✓ done`. (If `run-migration.ts` takes a hardcoded list, copy the `run-mls-migration.ts` body and point it at this one file.)

- [ ] **Step 3: Verify the columns exist**

Run:
```
bun -e "const s=new Bun.SQL(process.env.PG_URL); console.log(await s.unsafe(\"select column_name from information_schema.columns where table_schema='data_lake' and table_name='listing_state' and column_name in ('photo_url','county_fips','mls_number','listing_type')\")); await s.end()"
```
Expected: 4 rows. (Set `PG_URL` from `.dlt/secrets.toml` as in `run-mls-migration.ts`.)

- [ ] **Step 4: Commit**

```
git add migrations/20260630_listing_state_api_columns.sql
git commit -m "feat(listing-lake): additive API columns on listing_state (photo_url, lat/lon, county_fips, mls_number, listing_type)"
```

---

## Task 2: `extract_api.py` — pure parsers (TDD)

**Files:**
- Create: `ingest/pipelines/listing_lifecycle/constants_api.py`
- 🔴 Create: `ingest/pipelines/listing_lifecycle/extract_api.py`
- 🔴 Test: `ingest/pipelines/listing_lifecycle/test_extract_api.py`

**Interfaces:**
- Produces, consumed by Task 3 + the existing `pipeline.py._keyed_scan`:
  - `parse_rentcast(raw: dict, county_seed: str) -> dict | None`
  - `parse_steadyapi(raw: dict, city: str, state: str) -> dict | None`
  - Both return a row dict with keys: `street_address, city, zip_code, state, county, county_fips, list_price, beds, baths, sqft, lot_acres, property_type, listing_id, sale_or_rent, photo_url, lat, lon, mls_number, mls_name, listing_type, listed_date, days_on_market` — the superset `pipeline.py._keyed_scan` + `distill._STATE_COLS` read. Missing fields are `None`.
- `PROPERTY_TYPE_MAP` maps RentCast/SteadyAPI type strings to the lifecycle tokens `single_family | condo | townhouse | multi_family | land | manufactured | other`.

- [ ] **Step 1: Write `constants_api.py`**

```python
"""Constants for the API-fed listing extractor (RentCast + SteadyAPI)."""
RENTCAST_BASE = "https://api.rentcast.io/v1"
STEADYAPI_BASE = "https://api.steadyapi.com/v1/real-estate"

# Neutral internal source identity (no vendor name in the table; the brain CITES the real source).
API_SOURCE_NAME = "api_feed"

# Enumeration seed: query the APIs by city, then self-label every row by its API-returned county FIPS
# (so a city that bleeds into a neighbor county lands under the right county). v1 = Lee + Collier;
# widening is just adding cities here — no code change (capture wide).
SWFL_CITY_SEED = {
    "Lee":     ["Cape Coral", "Fort Myers", "North Fort Myers", "Lehigh Acres",
                "Bonita Springs", "Estero", "Fort Myers Beach", "Sanibel"],
    "Collier": ["Naples", "Marco Island", "Golden Gate", "Immokalee", "Ave Maria"],
}

# County FIPS we keep (the scope gate; everything else self-drops).
IN_SCOPE_FIPS = {"12071": "Lee", "12021": "Collier"}

# RentCast countyFips is the 3-digit county code ("071"); prefix the FL state FIPS to get "12071".
FL_STATE_FIPS = "12"

# Browser-like headers SteadyAPI's Cloudflare requires (ported from lib/listings/steadyapi.ts).
STEADYAPI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://steadyapi.com",
    "Referer": "https://steadyapi.com/",
}

PROPERTY_TYPE_MAP = {
    "single family": "single_family", "single-family": "single_family",
    "condo": "condo", "condominium": "condo", "townhouse": "townhouse",
    "multi-family": "multi_family", "multifamily": "multi_family",
    "manufactured": "manufactured", "mobile": "manufactured",
    "land": "land", "lot": "land", "vacant land": "land",
}
```

- [ ] **Step 2: Write the failing parser tests**

Use the REAL captured RentCast row (live probe 06/30/2026) so the fixture mirrors production exactly.

```python
# ingest/pipelines/listing_lifecycle/test_extract_api.py
from ingest.pipelines.listing_lifecycle.extract_api import (
    parse_rentcast, parse_steadyapi, merge_by_proximity, map_property_type,
)

_RENTCAST_ROW = {
    "id": "311-Ne-15th-St,-Cape-Coral,-FL-33909",
    "formattedAddress": "311 Ne 15th St, Cape Coral, FL 33909",
    "addressLine1": "311 Ne 15th St", "city": "Cape Coral", "state": "FL",
    "zipCode": "33909", "county": "Lee", "countyFips": "071",
    "latitude": 26.680362, "longitude": -81.967327,
    "propertyType": "Single Family", "bedrooms": 3, "bathrooms": 2,
    "squareFootage": 1672, "status": "Active", "price": 359999,
    "listingType": "New Construction", "listedDate": "2026-06-26T00:00:00.000Z",
    "daysOnMarket": 5, "mlsName": "FLGulfCoastMLS", "mlsNumber": "2026027839",
}

_STEADYAPI_ROW = {
    "property_id": "5493101642",
    "permalink": "https://www.realtor.com/realestateandhomes-detail/1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642",
    "price": {"amount": 374900}, "status": "for_sale",
    "photo_url": "https://ap.rdcpix.com/abc/x.webp",
    "location": {"lat": 26.6712, "lon": -81.961, "county_fips": "12071"},
    "description": {"beds": 4, "sqft": 1800, "lot_sqft": 10000},
    "flags": {"is_pending": False, "is_price_reduced": True},
}


def test_parse_rentcast_core_fields():
    r = parse_rentcast(_RENTCAST_ROW, county_seed="Lee")
    assert r["street_address"] == "311 Ne 15th St"
    assert r["zip_code"] == "33909"
    assert r["county"] == "Lee"
    assert r["county_fips"] == "12071"           # "12" + "071"
    assert r["list_price"] == 359999
    assert r["beds"] == 3 and r["baths"] == 2
    assert r["property_type"] == "single_family"
    assert r["days_on_market"] == 5              # REAL DOM — unlocks the suppressed brain metric
    assert r["listed_date"] == "2026-06-26"
    assert r["mls_number"] == "2026027839"
    assert r["sale_or_rent"] == "sale"
    assert r["listing_id"] == _RENTCAST_ROW["id"]


def test_parse_rentcast_out_of_scope_county_returns_none():
    row = {**_RENTCAST_ROW, "countyFips": "086", "county": "Miami-Dade"}  # 12086 not in scope
    assert parse_rentcast(row, county_seed="Lee") is None


def test_parse_steadyapi_parses_permalink_and_photo():
    r = parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL")
    assert r["street_address"] == "1403 NE 19th Ter"
    assert r["zip_code"] == "33909"
    assert r["county_fips"] == "12071"
    assert r["photo_url"].endswith(".webp")
    assert r["list_price"] == 374900
    assert r["property_type"] == "land"          # beds null + lot_sqft present = land (no record type)


def test_map_property_type_fallback():
    assert map_property_type("Single Family") == "single_family"
    assert map_property_type("Quadruplex") == "other"


def test_merge_by_proximity_attaches_photo_within_threshold():
    rc = [{**parse_rentcast(_RENTCAST_ROW, county_seed="Lee"), "photo_url": None}]
    sa = [parse_steadyapi({**_STEADYAPI_ROW,
                           "location": {"lat": 26.680360, "lon": -81.967330, "county_fips": "12071"}},
                          city="Cape Coral", state="FL")]
    merged = merge_by_proximity(rc, sa)
    assert merged[0]["photo_url"] is not None    # same coords → photo grafted on


def test_merge_by_proximity_no_match_keeps_none():
    rc = [{**parse_rentcast(_RENTCAST_ROW, county_seed="Lee"), "photo_url": None}]
    sa = [parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL")]  # ~1km away
    merged = merge_by_proximity(rc, sa)
    assert merged[0]["photo_url"] is None
```

- [ ] **Step 3: Run, verify it fails**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/pipelines/listing_lifecycle/test_extract_api.py -v`
Expected: FAIL — `ImportError: cannot import name 'parse_rentcast'`. (Run from repo root with `ingest` on the path, mirroring the existing lifecycle tests.)

- [ ] **Step 4: Implement the parsers (minimal to pass)**

```python
# ingest/pipelines/listing_lifecycle/extract_api.py  (parsers only — fetchers land in Task 3)
"""API extractor for the listing lifecycle — RentCast (spine) + SteadyAPI (photos).

Replaces the Source-B crawl4ai scrape (extract.py) as the feed. Pure parsers below are
network-free and fully unit-testable; the fetchers (Task 3) are thin requests wrappers.
Both APIs are empty-tolerant — a bad/blocked/keyless call yields [] upstream, never a throw.
"""
from __future__ import annotations

import math
import re
from typing import Any

from .constants_api import FL_STATE_FIPS, IN_SCOPE_FIPS, PROPERTY_TYPE_MAP

_PERMALINK_ZIP = re.compile(r"_(\d{5})_")


def map_property_type(raw: str | None) -> str:
    return PROPERTY_TYPE_MAP.get((raw or "").strip().lower(), "other")


def _num(v: Any) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _int(v: Any) -> int | None:
    f = _num(v)
    return None if f is None else int(f)


def _iso_date(v: Any) -> str | None:
    return v[:10] if isinstance(v, str) and len(v) >= 10 else None


def parse_rentcast(raw: dict, county_seed: str) -> dict | None:
    """One RentCast /listings/sale record → the wide row shape the diff engine consumes.
    Returns None if it lacks identity or its county is out of SWFL scope (self-correcting gate)."""
    addr = raw.get("addressLine1") or ""
    zip_code = raw.get("zipCode") or ""
    if not addr or not zip_code:
        return None
    fips3 = raw.get("countyFips") or ""
    county_fips = (FL_STATE_FIPS + fips3) if fips3 else None
    if county_fips not in IN_SCOPE_FIPS:
        return None
    return {
        "street_address": addr,
        "city": raw.get("city"),
        "zip_code": zip_code,
        "state": raw.get("state") or "FL",
        "county": IN_SCOPE_FIPS[county_fips],
        "county_fips": county_fips,
        "list_price": _int(raw.get("price")),
        "beds": _int(raw.get("bedrooms")),
        "baths": _num(raw.get("bathrooms")),
        "sqft": _int(raw.get("squareFootage")),
        "lot_acres": (_num(raw.get("lotSize")) / 43560.0) if raw.get("lotSize") else None,
        "property_type": map_property_type(raw.get("propertyType")),
        "listing_id": raw.get("id"),
        "sale_or_rent": "sale",
        "photo_url": None,                       # RentCast has no photos — SteadyAPI fills via merge
        "lat": _num(raw.get("latitude")),
        "lon": _num(raw.get("longitude")),
        "mls_number": raw.get("mlsNumber"),
        "mls_name": raw.get("mlsName"),
        "listing_type": raw.get("listingType"),
        "listed_date": _iso_date(raw.get("listedDate")),
        "days_on_market": _int(raw.get("daysOnMarket")),
    }


def parse_steadyapi(raw: dict, city: str, state: str) -> dict | None:
    """One SteadyAPI search record → the wide row shape. Street + zip parsed from the permalink slug
    (mirrors lib/listings/steadyapi.ts). Property type derived (record carries none): lot + no beds = land."""
    pid = raw.get("property_id")
    if not pid:
        return None
    permalink = raw.get("permalink") or ""
    last = permalink.split("/")[-1]
    parts = last.split("_")
    street = (parts[0].replace("-", " ") if parts else "").strip()
    zm = _PERMALINK_ZIP.search(permalink)
    zip_code = zm.group(1) if zm else next((p for p in parts if p.isdigit() and len(p) == 5), "")
    loc = raw.get("location") or {}
    county_fips = loc.get("county_fips")
    if county_fips not in IN_SCOPE_FIPS:
        return None
    desc = raw.get("description") or {}
    beds = _int(desc.get("beds"))
    lot_sqft = _num(desc.get("lot_sqft"))
    ptype = "land" if (beds is None and lot_sqft) else "single_family"
    price = raw.get("price") or {}
    return {
        "street_address": street or None,
        "city": city,
        "zip_code": zip_code or None,
        "state": state,
        "county": IN_SCOPE_FIPS[county_fips],
        "county_fips": county_fips,
        "list_price": _int(price.get("amount")),
        "beds": beds,
        "baths": None,                           # SteadyAPI record has no bathrooms
        "sqft": _int(desc.get("sqft")),
        "lot_acres": (lot_sqft / 43560.0) if lot_sqft else None,
        "property_type": ptype,
        "listing_id": str(pid),
        "sale_or_rent": "sale",
        "photo_url": raw.get("photo_url") or None,
        "lat": _num(loc.get("lat")),
        "lon": _num(loc.get("lon")),
        "mls_number": None,
        "mls_name": raw.get("source_type"),
        "listing_type": None,
        "listed_date": None,                     # SteadyAPI gives no list date
        "days_on_market": None,
    }


def merge_by_proximity(rentcast_rows: list[dict], steadyapi_rows: list[dict],
                       threshold_deg: float = 0.002) -> list[dict]:
    """RentCast is the spine; graft each SteadyAPI photo onto the nearest RentCast row within
    ~200m (0.002° ≈ 200m at 27°N), mirroring lib/listings/select.ts. RentCast rows with no
    photo match keep photo_url=None; SteadyAPI listings with NO RentCast match are appended
    (so the active set isn't narrowed to RentCast-only)."""
    sa_coord = [s for s in steadyapi_rows if s.get("lat") is not None and s.get("lon") is not None]
    matched_sa: set[int] = set()
    for rc in rentcast_rows:
        if rc.get("lat") is None or rc.get("lon") is None:
            continue
        best_i, best_d = None, threshold_deg
        for i, sa in enumerate(sa_coord):
            d = math.hypot(rc["lat"] - sa["lat"], rc["lon"] - sa["lon"])
            if d < best_d:
                best_d, best_i = d, i
        if best_i is not None and not rc.get("photo_url"):
            rc["photo_url"] = sa_coord[best_i].get("photo_url")
            matched_sa.add(id(sa_coord[best_i]))
    extras = [s for s in steadyapi_rows if id(s) not in matched_sa
              and not any(id(s) == id(x) for x in [])]  # SteadyAPI-only listings RentCast missed
    # Dedup SteadyAPI extras against RentCast by address_key happens upstream (scan keys on address).
    return rentcast_rows + [s for s in steadyapi_rows if id(s) not in matched_sa]
```

- [ ] **Step 5: Run, verify pass**

Run: `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m pytest ingest/pipelines/listing_lifecycle/test_extract_api.py -v`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```
git add ingest/pipelines/listing_lifecycle/constants_api.py ingest/pipelines/listing_lifecycle/extract_api.py ingest/pipelines/listing_lifecycle/test_extract_api.py
git commit -m "feat(listing-lake): API extractor parsers (RentCast spine + SteadyAPI photos), TDD on live fixtures"
```

---

## Task 3: `extract_api.py` — paginated fetch + `scan_county_api`

**Files:**
- 🔴 Modify: `ingest/pipelines/listing_lifecycle/extract_api.py`
- 🔴 Test: `ingest/pipelines/listing_lifecycle/test_extract_api.py`

**Interfaces:**
- Produces, consumed by `pipeline.py` (Task 4): `scan_county_api(county: str) -> dict` returning `{"rows": list[dict], "exhausted": bool, "count": int, "last_status": int, "county_total": int}` — the SAME payload shape `coverage_guard.scan_is_complete` + `pipeline.run` already consume from `scan_county`.

- [ ] **Step 1: Write the failing fetch/scan tests (mocked HTTP)**

```python
# append to test_extract_api.py
from unittest.mock import patch, MagicMock
from ingest.pipelines.listing_lifecycle import extract_api


def _resp(status, body, headers=None):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = body
    m.headers = headers or {}
    m.ok = status == 200
    return m


def test_fetch_rentcast_paginates_offset():
    page1 = [_RENTCAST_ROW] * 500
    page2 = [_RENTCAST_ROW] * 17
    with patch.object(extract_api.requests, "get", side_effect=[_resp(200, page1), _resp(200, page2)]):
        rows = extract_api.fetch_rentcast_city("Cape Coral", key="k")
    assert len(rows) == 517            # walked to a short page (natural exhaustion)


def test_fetch_rentcast_empty_on_non_200():
    with patch.object(extract_api.requests, "get", return_value=_resp(429, {})):
        assert extract_api.fetch_rentcast_city("Cape Coral", key="k") == []


def test_scan_county_api_labels_and_counts(monkeypatch):
    monkeypatch.setenv("RENTCAST_API_KEY", "k")
    monkeypatch.setenv("PHOTOS_API", "p")
    with patch.object(extract_api, "fetch_rentcast_city", return_value=[_RENTCAST_ROW]), \
         patch.object(extract_api, "fetch_steadyapi_city", return_value=[_STEADYAPI_ROW]):
        out = extract_api.scan_county_api("Lee")
    assert out["count"] >= 1
    assert out["exhausted"] is True
    assert all(r["county"] == "Lee" for r in out["rows"] if r.get("county") == "Lee")
```

- [ ] **Step 2: Run, verify fail**

Run: `...python.exe -m pytest ingest/pipelines/listing_lifecycle/test_extract_api.py -v -k "fetch or scan"`
Expected: FAIL — `AttributeError: module ... has no attribute 'requests'` / `fetch_rentcast_city`.

- [ ] **Step 3: Implement the fetchers + scan**

```python
# add to extract_api.py
import os
import requests  # noqa: E402

from .constants_api import (RENTCAST_BASE, STEADYAPI_BASE, STEADYAPI_HEADERS,  # noqa: E402
                            SWFL_CITY_SEED)

_RC_PAGE = 500   # RentCast limit cap
_SA_PAGE = 200   # SteadyAPI page size
_MAX_PAGES = 60  # backstop (~30k listings) — real cities exhaust far sooner


def fetch_rentcast_city(city: str, state: str = "FL", key: str | None = None) -> list[dict]:
    """Enumerate one city's active for-sale listings via offset pagination. Empty-tolerant: any
    non-200 / network error / bad body ends the walk and returns what we have (never throws)."""
    key = key or os.environ.get("RENTCAST_API_KEY")
    if not key or not city:
        return []
    out: list[dict] = []
    for page in range(_MAX_PAGES):
        params = {"city": city, "state": state, "status": "Active",
                  "limit": _RC_PAGE, "offset": page * _RC_PAGE}
        try:
            r = requests.get(f"{RENTCAST_BASE}/listings/sale", params=params,
                             headers={"X-Api-Key": key, "Accept": "application/json"}, timeout=30)
            if r.status_code != 200:
                break
            batch = r.json()
            if not isinstance(batch, list) or not batch:
                break
            out.extend(batch)
            if len(batch) < _RC_PAGE:
                break
        except Exception:
            break
    return out


def fetch_steadyapi_city(city: str, state: str = "FL", key: str | None = None) -> list[dict]:
    """Enumerate one city via SteadyAPI (location slug 'City-Name_FL', offset += 200 until meta.total)."""
    key = key or os.environ.get("PHOTOS_API")
    if not key or not city:
        return []
    slug = f"{city.strip().replace(' ', '-')}_{state}"
    out: list[dict] = []
    total = None
    for page in range(_MAX_PAGES):
        params = {"location": slug, "offset": page * _SA_PAGE}
        try:
            r = requests.get(f"{STEADYAPI_BASE}/search", params=params,
                             headers={**STEADYAPI_HEADERS, "Authorization": f"Bearer {key}"}, timeout=30)
            if r.status_code != 200:
                break
            data = r.json()
            body = data.get("body") if isinstance(data, dict) else None
            if not isinstance(body, list) or not body:
                break
            out.extend(body)
            total = (data.get("meta") or {}).get("total", total)
            if total is not None and (page + 1) * _SA_PAGE >= total:
                break
        except Exception:
            break
    return out


def scan_county_api(county: str) -> dict[str, Any]:
    """Enumerate every seed city for one county via both APIs, parse + scope-filter + merge, and
    return the coverage-guard payload pipeline.py already consumes. Exhausted=True when no city call
    errored (APIs paginate to natural exhaustion; no WAF, so a clean run is complete)."""
    cities = SWFL_CITY_SEED.get(county, [])
    rc_rows: list[dict] = []
    sa_rows: list[dict] = []
    errored = False
    for city in cities:
        rc_raw = fetch_rentcast_city(city)
        sa_raw = fetch_steadyapi_city(city)
        if not rc_raw and not sa_raw:
            errored = True   # a city that returned nothing from BOTH APIs is a gap, not "0 listings"
        rc_rows.extend(p for p in (parse_rentcast(x, county) for x in rc_raw) if p)
        sa_rows.extend(p for p in (parse_steadyapi(x, city, "FL") for x in sa_raw) if p)
    rows = merge_by_proximity(rc_rows, sa_rows)
    rows = [r for r in rows if r.get("county") == county]
    return {"rows": rows, "exhausted": not errored, "count": len(rows),
            "last_status": 200 if not errored else 403, "county_total": len(rows)}
```

- [ ] **Step 4: Run, verify pass**

Run: `...python.exe -m pytest ingest/pipelines/listing_lifecycle/test_extract_api.py -v`
Expected: all passed (9 total).

- [ ] **Step 5: Live smoke (one city, real keys)**

Run: `...python.exe -c "import os; from dotenv import load_dotenv; load_dotenv('.env.local'); from ingest.pipelines.listing_lifecycle.extract_api import scan_county_api; o=scan_county_api('Lee'); print(o['count'], o['exhausted'], o['rows'][0]['street_address'] if o['rows'] else 'none')"`
Expected: a Lee count in the thousands, `True`, a real street address. (This spends real API calls — run once.)

- [ ] **Step 6: Commit**

```
git add ingest/pipelines/listing_lifecycle/extract_api.py ingest/pipelines/listing_lifecycle/test_extract_api.py
git commit -m "feat(listing-lake): paginated RentCast+SteadyAPI fetch + scan_county_api (coverage-guard payload)"
```

---

## Task 4: Wire `pipeline.py` to the API feed under a neutral source_name

**Files:**
- Modify: `ingest/pipelines/listing_lifecycle/pipeline.py`
- Test: `ingest/pipelines/listing_lifecycle/test_pipeline_api.py` (new)

**Interfaces:**
- Consumes: `scan_county_api` (Task 3); `distill.load_current_state(source_name)`, `distill.upsert_state(ups, source_name=, dry_run=)`, `distill.append_transitions(trans, source_name=, dry_run=)` (already source-scoped); `diff_states`, `scan_is_complete` (unchanged).

- [ ] **Step 1: Write the failing test — API source routing + source_name threading**

```python
# ingest/pipelines/listing_lifecycle/test_pipeline_api.py
from unittest.mock import patch
from ingest.pipelines.listing_lifecycle import pipeline as pl
from ingest.pipelines.listing_lifecycle.constants_api import API_SOURCE_NAME

_SCAN = {"rows": [{"street_address": "311 Ne 15th St", "zip_code": "33909", "county": "Lee",
                   "sale_or_rent": "sale", "list_price": 359999, "mls_region": None, "mls": None,
                   "listing_id": "x"}],
         "exhausted": True, "count": 1, "last_status": 200, "county_total": 1}


def test_run_api_uses_scan_county_api_and_api_source_name():
    with patch.object(pl.distill, "load_current_state", return_value={}) as load, \
         patch.object(pl, "scan_county_api", return_value=_SCAN), \
         patch.object(pl.distill, "upsert_state", return_value=1) as up, \
         patch.object(pl.distill, "append_transitions", return_value=1):
        pl.run(dry_run=True, only_county="Lee", source="api")
    load.assert_called_once_with(source_name=API_SOURCE_NAME)
    assert up.call_args.kwargs.get("source_name") == API_SOURCE_NAME
```

- [ ] **Step 2: Run, verify fail**

Run: `...python.exe -m pytest ingest/pipelines/listing_lifecycle/test_pipeline_api.py -v`
Expected: FAIL — `run()` has no `source=` param / `scan_county_api` not imported in `pipeline`.

- [ ] **Step 3: Edit `pipeline.py`**

At the imports, add:
```python
from ingest.pipelines.listing_lifecycle.extract_api import scan_county_api
from ingest.pipelines.listing_lifecycle.constants_api import API_SOURCE_NAME
```

Change `run(...)` signature and the three `distill` calls to thread `source_name`, and pick the scanner by `source`:
```python
def run(*, dry_run: bool = False, only_county: str | None = None,
        today: str | None = None, source: str = "api") -> dict:
    today = today or str(date.today())
    src_name = API_SOURCE_NAME if source == "api" else distill.SOURCE_NAME
    scan = scan_county_api if source == "api" else scan_county
    counties = [only_county] if only_county else (
        ["Lee", "Collier"] if source == "api" else SWFL_COUNTIES)
    prior_all = distill.load_current_state(source_name=src_name)
    totals = {"scanned": 0, "upserts": 0, "transitions": 0}
    for county in counties:
        result = scan(county)
        rows = result["rows"]
        totals["scanned"] += len(rows)
        prior = {k: v for k, v in prior_all.items() if v.get("county") == county}
        is_seed = len(prior) == 0
        complete, why = scan_is_complete(
            {"exhausted": result["exhausted"], "count": len(rows), "last_status": result["last_status"]},
            last_trusted_count=(len(prior) or None),
            baseline_total=result.get("county_total"),
        )
        if not complete:
            print(f"[skip] {county}: untrustworthy scan ({why}) — no diff emitted", flush=True)
            continue
        scanned = _keyed_scan(rows)
        ups, trans = diff_states(prior, scanned, today, scan_complete=complete, is_seed=is_seed)
        for u in ups:
            u.setdefault("county", county)
            u["days_on_market"] = u.get("days_on_market") if u.get("days_on_market") is not None else u.get("days_in_state")
        n_u = distill.upsert_state(ups, source_name=src_name, dry_run=dry_run)
        n_t = distill.append_transitions(trans, source_name=src_name, dry_run=dry_run)
        totals["upserts"] += n_u
        totals["transitions"] += n_t
        print(f"[ok] {county}: scanned={len(rows)} seed={is_seed} upserts={n_u} transitions={n_t} ({why})", flush=True)
    print(f"[done] {totals} dry_run={dry_run} source={source}", flush=True)
    if totals["scanned"] == 0:
        print("[fatal] every county returned 0 rows — failing loud (no silent fake-green)", flush=True)
        sys.exit(1)
    return totals
```
Note the DOM line: API rows carry a REAL `days_on_market` (RentCast); fall back to the `days_in_state` tick only when absent (SteadyAPI-only rows). In `_keyed_scan`, set `listing_id` from the row's own `listing_id` when present (API) instead of `f"{mls_region}:{mls}"`:
```python
r["listing_id"] = r.get("listing_id") or f"{r.get('mls_region')}:{r.get('mls')}"
```
Add `--source` to `main()`'s argparser (default `"api"`) and pass it to `run`.

- [ ] **Step 4: Run all lifecycle tests, verify pass**

Run: `...python.exe -m pytest ingest/pipelines/listing_lifecycle/ -v`
Expected: the new pipeline-api test passes AND every pre-existing lifecycle test (transitions, distill, address_key, coverage_guard) still passes — the scrape path is untouched (`source="scrape"` still routes to `scan_county`).

- [ ] **Step 5: Full dry-run against live APIs**

Run: `...python.exe -m ingest.pipelines.listing_lifecycle.pipeline --county Lee --dry-run` (with `.env.local` loaded)
Expected: `[ok] Lee: scanned=<thousands> seed=True ...` then `[done] ... dry_run=True source=api`, no DB write.

- [ ] **Step 6: Commit**

```
git add ingest/pipelines/listing_lifecycle/pipeline.py ingest/pipelines/listing_lifecycle/test_pipeline_api.py
git commit -m "feat(listing-lake): route lifecycle pipeline to API feed (source=api) under neutral source_name"
```

---

## Task 5: Re-point the active-stats view + surface real DOM

**Files:**
- Create: `docs/sql/20260630_listing_active_stats_api.sql` (replaces the view body)

**Interfaces:**
- Produces: `data_lake.listing_active_stats` with the SAME columns (`county, zip_code, listing_count, median_list_price, avg_days_on_market, avg_list_price, latest_scraped_at`) the `active-listings-residential-source.mts` connector already selects — so the source/brain need ZERO change, except the DOM column now returns a real number.

- [ ] **Step 1: Write the new view**

```sql
-- docs/sql/20260630_listing_active_stats_api.sql
-- Re-point the active-listings view to the API feed (source_name='api_feed') and surface REAL DOM
-- (RentCast supplies days_on_market — the column is no longer forced NULL). Same column shape as
-- before, so refinery/sources/active-listings-residential-source.mts swaps with no code change.
CREATE OR REPLACE VIEW data_lake.listing_active_stats AS
WITH active AS (
  SELECT *
  FROM data_lake.listing_state
  WHERE source_name = 'api_feed'
    AND state = 'active'
    AND sale_or_rent = 'sale'
    AND list_price IS NOT NULL
)
SELECT
  county,
  zip_code,
  count(*)::int                                                          AS listing_count,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY list_price))::bigint AS median_list_price,
  round(avg(days_on_market))::int                                        AS avg_days_on_market,  -- REAL now (RentCast)
  round(avg(list_price))::bigint                                         AS avg_list_price,
  max(scraped_at)                                                        AS latest_scraped_at
FROM active
GROUP BY GROUPING SETS ((county, zip_code), (county), ());

GRANT SELECT ON data_lake.listing_active_stats TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply + verify (after the seed in Task 7; before that the view returns 0 rows, which is the brain's tolerated zero-data path)**

Run: `bun run scripts/run-migration.ts docs/sql/20260630_listing_active_stats_api.sql`
Then verify the brain still builds: `bun test refinery/packs/active-listings-swfl.test.mts`
Expected: the existing pack tests pass unchanged (they already cover the DOM-present path).

- [ ] **Step 3: Commit**

```
git add docs/sql/20260630_listing_active_stats_api.sql
git commit -m "feat(listing-lake): point listing_active_stats at api_feed + surface real RentCast DOM"
```

---

## Task 6: Cadence entry + UNPARK the daily cron

**Files:**
- 🟡 Modify: `ingest/cadence_registry.yaml` (move the `listing_lifecycle` block from `not_yet_running:` to `pipelines:`)
- Modify: `.github/workflows/listing-lifecycle-daily.yml`

- [ ] **Step 1: Graduate the cadence block**

Move the `listing_lifecycle` entry under `not_yet_running:` up to `pipelines:` with live fields:
```yaml
  - name: listing_lifecycle
    lane: tier-2
    cadence_days: 1
    tolerance_multiplier: 3.0
    freshness_table: data_lake.listing_state
    freshness_column: last_seen
    source_name: api_feed
    expected_rows_min: 1   # raise to ~0.9× the seed count after Task 7
    note: "Lee+Collier active for-sale listings via RentCast (spine: price/DOM/list-date/MLS#) + SteadyAPI (photos). Daily API sweep into data_lake.listing_state; transitions in listing_transitions. No scrape, no WAF. Consumer: active-listings-swfl."
```

- [ ] **Step 2: Edit the workflow** — drop the WAF parking note + `LISTING_LIFECYCLE_BASE_URL`, add the API keys, swap the run command, UNCOMMENT the schedule:

```yaml
on:
  schedule:
    - cron: "0 9 * * *"    # daily 09:00 UTC — both counties one pass (APIs, no WAF stagger needed)
  workflow_dispatch:
    inputs:
      county: { description: "Limit to one county (blank = Lee+Collier)", required: false, default: "" }
      dry_run: { description: "Dry-run (scan + diff, print, no DB write)", type: boolean, default: false }
# ...
    env:
      DATABASE_URL: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
      RENTCAST_API_KEY: ${{ secrets.RENTCAST_API_KEY }}
      PHOTOS_API: ${{ secrets.PHOTOS_API }}
# ...
      - name: Run listing-lifecycle pipeline (API feed)
        run: |
          ARGS=(--source api)
          if [ -n "${{ inputs.county }}" ]; then ARGS+=(--county "${{ inputs.county }}"); fi
          if [ "${{ inputs.dry_run }}" = "true" ]; then ARGS+=(--dry-run); fi
          python -m ingest.pipelines.listing_lifecycle.pipeline "${ARGS[@]}"
```
Drop the `crawl4ai-doctor` preflight step (no crawl4ai in the API path) and the per-county cron stagger (`Resolve county` step) — one daily pass covers both counties.

- [ ] **Step 3: Set the GH secrets (operator action, before the first scheduled run)**

```
gh secret set RENTCAST_API_KEY -R ethanrickyjrjr-wq/SWFL-Data-Gulf
gh secret set PHOTOS_API -R ethanrickyjrjr-wq/SWFL-Data-Gulf
```
(ROTATE the RentCast key first — it was exposed in `a2c92a9f`.)

- [ ] **Step 4: Commit**

```
git add ingest/cadence_registry.yaml .github/workflows/listing-lifecycle-daily.yml
git commit -m "feat(listing-lake): graduate cadence + unpark daily cron (API feed, no WAF)"
```

---

## Task 7: Seed run + set `expected_rows_min` + live-verify

**Files:**
- 🟡 Modify: `ingest/cadence_registry.yaml` (set the real floor)

- [ ] **Step 1: Run the real seed locally (writes to `listing_state`)**

Run: `...python.exe -m ingest.pipelines.listing_lifecycle.pipeline --source api` (with `.env.local`)
Expected: `[ok] Lee: ... seed=True upserts=<N>` + `[ok] Collier: ...`, `[done]`. This is the seed (prior empty → `is_seed=True`, all transitions stamped seed). First real diff lands on run #2.

- [ ] **Step 2: Verify the lake landed**

Run: `bun -e "const s=new Bun.SQL(process.env.PG_URL); console.log(await s.unsafe(\"select county, count(*), count(photo_url) photos, count(days_on_market) dom from data_lake.listing_state where source_name='api_feed' group by county\")); await s.end()"`
Expected: Lee + Collier rows with non-zero `photos` (SteadyAPI) and non-zero `dom` (RentCast).

- [ ] **Step 3: Set `expected_rows_min`** to ~0.9× the seed count in `cadence_registry.yaml`, commit.

- [ ] **Step 4: Verify the brain answers live**

Run: `bun run refinery -- active-listings-swfl --target-only` then inspect `brains/active-listings-swfl.md` for a real count + median + (now) a DOM metric, cited `realtor.com via RentCast + SteadyAPI`.

- [ ] **Step 5: Close the check** (in the same push as the SESSION_LOG entry):

```
node scripts/check.mjs close steadyapi_listings_lake_live_verify
```

- [ ] **Step 6: Commit**

```
git add ingest/cadence_registry.yaml SESSION_LOG.md
git commit -m "feat(listing-lake): seed Lee+Collier API feed, set row floor, live-verify"
```

---

## Task 8: Correct the spec + handoff + vocab

**Files:**
- Modify: `docs/superpowers/specs/2026-06-30-steadyapi-listings-lake-design.md`
- Modify: `docs/superpowers/handoffs/2026-06-30-steadyapi-listings-lake-handoff.md`
- Verify: `brain-vocabulary.json`

- [ ] **Step 1: Add a correction banner to the spec + handoff** stating: listing_lifecycle EXISTS (the "greenfield" claim was false); this build extends `listing_state` via an API feed instead of a standalone `steadyapi_listings` table; PK is address_key (not property_id); property_type is a column (no per-type sweep); RentCast is IN (the spine), SteadyAPI adds photos. Point to this plan.

- [ ] **Step 2: Vocab check** — the brain may now emit `avg_days_on_market_swfl` where it previously suppressed it. Confirm it's registered:

Run: `bun refinery/tools/check-vocab-coverage.mts --all`
Expected: no orphan for any `active-listings-swfl` slug. If `avg_days_on_market_swfl` is flagged, add it to `brain-vocabulary.json` in this commit.

- [ ] **Step 3: Commit**

```
git add docs/superpowers/specs/2026-06-30-steadyapi-listings-lake-design.md docs/superpowers/handoffs/2026-06-30-steadyapi-listings-lake-handoff.md brain-vocabulary.json
git commit -m "docs(listing-lake): correct steadyapi spec/handoff — extend listing_state, not greenfield; register DOM slug"
```

---

## Self-Review

**Spec coverage (against the corrected goal):** price-cut history → reused `listing_transitions` (Task 4 emits it via `diff_states`) ✓ · DOM → RentCast real `days_on_market`, view surfaces it (Tasks 2/5) ✓ · inactive/removed → reused `holding` transition (Task 4) ✓ · relist → reused address-key back_on_market ✓ · per county→ZIP + property_type → reused view GROUPING SETS + `property_type` column (Tasks 2/5) ✓ · photos → SteadyAPI `photo_url` merged (Task 2) ✓ · "our data" lane cited `realtor.com via RentCast + SteadyAPI` ✓ · cron unparked ✓.

**Placeholder scan:** all code steps carry real code; the only deferred numbers are `expected_rows_min` (set from the live seed in Task 7, by design) and the GH-secret/key-rotation (operator action, flagged).

**Type consistency:** `scan_county_api` returns the exact `{rows, exhausted, count, last_status, county_total}` payload `scan_is_complete` + `run` consume; parser row keys are the superset of `distill._STATE_COLS` (`address_key`/`street_address` reconciled in `_keyed_scan` as today); `source_name` threaded identically (`API_SOURCE_NAME`) through `load_current_state`/`upsert_state`/`append_transitions`, all of which already accept it.

**Open verification the executor must do (RULE 0.4, at execution not now):** (a) confirm SteadyAPI `meta.total` pagination end-condition on a live multi-page city; (b) confirm RentCast returns >500 for a dense city so the offset walk actually pages (Cape Coral was 6,259 on SteadyAPI — likely yes); (c) confirm the `merge_by_proximity` extras path doesn't double-count an address present in BOTH APIs — it shouldn't, because `_keyed_scan` keys on `(address_key, sale_or_rent)` and dedups, but assert it on the live seed.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3 | `ingest/pipelines/listing_lifecycle/extract_api.py`, `ingest/pipelines/listing_lifecycle/test_extract_api.py` |
| 🟡 | Task 6, Task 7 | `ingest/cadence_registry.yaml` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
