# Phase C — ZIP-radius pulse news Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 15 files, keywords: migration, schema, architecture

**Goal:** Pulse news items gain a location anchor + geocoded lat/lon/ZIP so the zip page can render "What's happening near {ZIP}" ordered point → neighborhood → city, with bigger grains visibly labeled.

**Architecture:** The distillers (city + corridor twins) emit a nullable `location_anchor` in the SAME forced-tool call (zero extra LLM cost). A post-distill plain-code geocode ladder (`ingest/lib/geo_ladder.py`) resolves anchors — Census geocoder for addresses, SWFL-bounded Nominatim for landmarks/neighborhoods, Census coords→ZCTA for point-in-ZIP — through a permanent cache table. Rows gain `location_anchor, lat, lon, zip_code, geo_grain`; the city-pulse pack emits a `pulse_by_zip` detail table (Gate 3 / brain-first in the same PR); the zip page mounts a `PulseNearby` section beside `NarrativeSections`.

**Tech Stack:** Python (requests, psycopg via existing `_get_connection`), Postgres migration via `bun scripts/run-migration.ts`, TS pack + Next.js server component, bun:test + pytest.

**Spec:** `docs/superpowers/specs/2026-07-09-zip-page-destination-design.md` §Phase C · Handoff: `docs/handoff/2026-07-09-zip-page-phases-cde-handoff.md` · Check: `zip_page_destination_live_verify`

## Vendor evidence (verified live 07/09/2026 — SESSION_LOG entry of same date)

- **Mapbox OUT** (3 disqualifiers, live docs): Geocoding v6 Temporary default — "Temporary results are not allowed to be cached"; Search Box (only POI product) — "only available for temporary use… contact Mapbox sales"; Permanent tier — "cannot be used for distribution or sublicense" (our zips render publicly).
- **US Census Geocoder IN** (address rung): free, no key, public domain, no storage restriction. Probed: `geographies/onelineaddress?…&layers=all` → coords + `"2020 Census ZIP Code Tabulation Areas"`; `geographies/coordinates?…&layers=2020 Census ZIP Code Tabulation Areas` → `ZCTA5`. Batch endpoints OMIT ZCTA — single-record REST only. ALL-CAPS input silently returns no matches (title-case first — proven in `ingest/utils/zip_approx.py`).
- **Nominatim IN** (landmark/neighborhood rung): caching REQUIRED, scheduled scripts ≤ 4 req/min single-thread, identifying User-Agent, OSM attribution where displayed, ODbL. Volume: a handful of unique anchors/week, each resolved once ever via the cache.

## Deviations from the handoff (evidence-based)

1. **Rung 3 (neighborhood → communities-swfl name-join) reroutes through Nominatim.** Verified: `data_lake.neighborhood_stats` + `community_profiles` hold NO lat/lon/zip (migrations 20260706, grep-proven) — a name-join cannot produce a ZIP. Non-address anchors (landmark AND neighborhood) go through SWFL-bounded Nominatim → Census coords→ZCTA; Nominatim's `class`/`type` distinguishes `neighborhood` from `point` grain.
2. **City-wide items store `zip_code = NULL`** (not a city→ZIP mapping): a city spans many ZIPs; storing one invents precision. The page joins city items via `fixtures/swfl-place-zip-crosswalk.json` reverse lookup at read time. G1 stays clean: `zip_code` column holds only location-derived point/neighborhood ZIPs.
3. **Corridor rows' fallback `geo_grain` is NULL** (native corridor grain — spec enum has no `corridor`); anchored corridor items resolve to `point` like city items.

## Global Constraints

- **G1:** `zip_code` from resolved lat/lon via Census ZCTA polygons ONLY. A miss at every rung stays native grain — never invent a ZIP.
- **$0 vendor spend:** Census + Nominatim only; no Mapbox/paid geocoder calls anywhere.
- **Nominatim policy:** ≥15s between calls (4/min), single thread, User-Agent `SWFLDataGulf-pulse-geocode/1.0 (https://www.swfldatagulf.com)`, results cached permanently in `data_lake.geo_anchor_cache`, OSM attribution rendered when Nominatim-resolved items display.
- **Ingest rules (ingest/CLAUDE.md):** no new destructive writes (all changes additive); no LLM cost change; grant + `NOTIFY pgrst, 'reload schema'` after table creation.
- **Gate 3 / brain-first:** pack `pulse_by_zip` detail table ships in the same PR as the storage change.
- **Gate 5:** pack touch → `catalog.test.mts` mirror + pack `bun:test` green. Vocab: run `bun refinery/tools/check-vocab-coverage.mts --all`; register any flagged slug same commit.
- **Page:** additive + empty-tolerant (no rows → section hidden); phone standard (no horizontal scroll, no hover-gated affordances); no system nouns in copy; as-of dates MM/DD/YYYY.
- **No push without operator confirmation** (standing rule). Commit per task.

---

### Task 1: `location_anchor` in both distillers

**Files:**
- Modify: `ingest/pipelines/city_pulse/distill.py` (EXTRACT_TOOL, prompt, `rows_from_extraction`)
- Modify: `ingest/pipelines/city_pulse_corridors/distill.py` (same three)
- Test: `ingest/pipelines/city_pulse/test_distill.py`, `ingest/pipelines/city_pulse_corridors/test_distill.py`

**Interfaces:**
- Produces: every row dict from `rows_from_extraction` carries `"location_anchor": str | None` (trimmed, `None` when absent/empty). NOT yet in `_INSERT_COLUMNS` (Task 4, after the migration) — extra dict keys are ignored by the explicit-column INSERT.

- [x] **Step 1: Write the failing tests** (mirror in the corridors test file, keyed on `corridor`):

```python
def test_extract_tool_has_location_anchor():
    props = EXTRACT_TOOL["input_schema"]["properties"]["facts"]["items"]
    assert "location_anchor" in props["properties"]
    assert props["properties"]["location_anchor"]["type"] == ["string", "null"]
    assert "location_anchor" in props["required"]

def test_rows_carry_location_anchor():
    capture = {"city": "Naples", "run_at": "2026-07-09T10:00:00Z",
               "citations": [{"url": "https://x.example/a", "title": "T", "cited_text": "c"}]}
    extraction = {"facts": [
        {"topic": "business", "fact": "F1", "cite": 1, "story_key": "s-one",
         "location_anchor": "  Coconut Point  "},
        {"topic": "business", "fact": "F2", "cite": 1, "story_key": "s-two",
         "location_anchor": None},
        {"topic": "business", "fact": "F3", "cite": 1, "story_key": "s-three"},
    ]}
    rows = rows_from_extraction(capture, extraction)
    assert rows[0]["location_anchor"] == "Coconut Point"
    assert rows[1]["location_anchor"] is None
    assert rows[2]["location_anchor"] is None
```

- [x] **Step 2: Run to verify failure.** `python -m pytest ingest/pipelines/city_pulse/test_distill.py -k location_anchor -v` → FAIL (KeyError / missing key).

- [x] **Step 3: Implement.** In BOTH `EXTRACT_TOOL`s add to `items.properties` and append `"location_anchor"` to `items.required`:

```python
"location_anchor": {"type": ["string", "null"],
    "description": "The MOST SPECIFIC place this fact names below city grain: a street address ('4125 Cleveland Ave'), an intersection, a named plaza/mall/landmark ('Coconut Point'), or a named neighborhood/subdivision ('Pelican Bay'). null when the fact is city-wide or names no sub-city place. Copy the place text verbatim from the span — never guess one."},
```

In BOTH `rows_from_extraction` row dicts add:

```python
"location_anchor": ((f.get("location_anchor") or "").strip() or None),
```

In the city prompt (after the story_key sentence) and in `build_distill_prompt` (corridors):

```python
"Set `location_anchor` to the most specific place each fact names below city "
"grain (street address, intersection, plaza/landmark, or neighborhood), "
"verbatim from the span — or null when the fact is city-wide. "
```

- [x] **Step 4: Run both test files.** `python -m pytest ingest/pipelines/city_pulse/test_distill.py ingest/pipelines/city_pulse_corridors/test_distill.py -v` → all PASS (existing tests too).

- [x] **Step 5: Commit.** `git add ingest/pipelines/city_pulse/distill.py ingest/pipelines/city_pulse/test_distill.py ingest/pipelines/city_pulse_corridors/distill.py ingest/pipelines/city_pulse_corridors/test_distill.py && git commit -m "feat(pulse): distillers emit nullable location_anchor (zero extra LLM cost)"`

---

### Task 2: migration — geo columns + `geo_anchor_cache`

**Files:**
- Create: `migrations/20260710_pulse_geo.sql`

**Interfaces:**
- Produces: `data_lake.city_pulse` + `data_lake.city_pulse_corridors` gain `location_anchor TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, zip_code TEXT, geo_grain TEXT` (CHECK `geo_grain IN ('point','neighborhood','city','county')`); new `data_lake.geo_anchor_cache` keyed `(anchor_norm, city)`.

- [x] **Step 1: Write the migration** (idempotent — ADD COLUMN IF NOT EXISTS, constraint via exception guard):

```sql
-- Phase C (zip-page spec): pulse rows gain location provenance. zip_code is
-- location-derived ONLY (G1): written by ingest/lib/geo_ladder.py from a
-- resolved lat/lon via Census ZCTA polygons; NULL = native grain (city/corridor).
ALTER TABLE data_lake.city_pulse
  ADD COLUMN IF NOT EXISTS location_anchor TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS geo_grain TEXT;
ALTER TABLE data_lake.city_pulse_corridors
  ADD COLUMN IF NOT EXISTS location_anchor TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS geo_grain TEXT;
DO $$ BEGIN
  ALTER TABLE data_lake.city_pulse
    ADD CONSTRAINT city_pulse_geo_grain_chk
    CHECK (geo_grain IS NULL OR geo_grain IN ('point','neighborhood','city','county'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE data_lake.city_pulse_corridors
    ADD CONSTRAINT city_pulse_corridors_geo_grain_chk
    CHECK (geo_grain IS NULL OR geo_grain IN ('point','neighborhood','city','county'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nominatim policy REQUIRES caching results; this is the permanent cache.
-- One row per (normalized anchor, unit context). provider='miss' rows are
-- negative-cache entries, re-tried by the ladder after 30 days.
CREATE TABLE IF NOT EXISTS data_lake.geo_anchor_cache (
  anchor_norm  TEXT NOT NULL,
  city         TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lon          DOUBLE PRECISION,
  zip_code     TEXT,
  geo_grain    TEXT,
  provider     TEXT NOT NULL,  -- 'census' | 'nominatim' | 'miss'
  resolved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (anchor_norm, city)
);
GRANT SELECT ON data_lake.city_pulse, data_lake.city_pulse_corridors,
  data_lake.geo_anchor_cache TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [x] **Step 2: Run it.** `bun scripts/run-migration.ts migrations/20260710_pulse_geo.sql` → `✓ done`.

- [x] **Step 3: Verify.** Re-run the same command (idempotency proof — still `✓ done`), then confirm columns exist via a Bun.SQL one-liner or `scripts/run-migration.ts` with a `SELECT location_anchor, geo_grain FROM data_lake.city_pulse LIMIT 0;` probe file (throws on a missing column).

- [x] **Step 4: Commit.** `git add migrations/20260710_pulse_geo.sql && git commit -m "feat(pulse): geo columns on pulse tables + geo_anchor_cache (migration RUN)"`

---

### Task 3: geocode ladder — `ingest/lib/geo_ladder.py`

**Files:**
- Create: `ingest/lib/geo_ladder.py`
- Test: `ingest/lib/test_geo_ladder.py` (offline — every vendor call mocked)

**Interfaces:**
- Consumes: rows carrying `location_anchor` (Task 1); `data_lake.geo_anchor_cache` (Task 2); `ingest.lib.tier1_inventory._get_connection`.
- Produces: `annotate_geo(rows, context, fallback_grain, dry_run=False) -> list[dict]` — sets `lat`, `lon`, `zip_code`, `geo_grain` on EVERY row (resolved or fallback). Also `is_address(anchor) -> bool`, `resolve_anchor(anchor, context) -> dict` for tests.

- [x] **Step 1: Write failing tests:**

```python
from unittest import mock
import ingest.lib.geo_ladder as gl

def test_is_address():
    assert gl.is_address("4125 Cleveland Ave")
    assert gl.is_address("12345 S Tamiami Trl Unit 4")
    assert not gl.is_address("Coconut Point")
    assert not gl.is_address("Pelican Bay")

def test_parse_census_oneline():
    payload = {"result": {"addressMatches": [{
        "coordinates": {"x": -81.872073, "y": 26.641435},
        "geographies": {"2020 Census ZIP Code Tabulation Areas": [{"ZCTA5": "33901"}]}}]}}
    assert gl._parse_census_oneline(payload) == {
        "lat": 26.641435, "lon": -81.872073, "zip_code": "33901"}
    assert gl._parse_census_oneline({"result": {"addressMatches": []}}) is None

def test_parse_census_coords():
    payload = {"result": {"geographies": {
        "2020 Census ZIP Code Tabulation Areas": [{"ZCTA5": "34135"}]}}}
    assert gl._parse_census_coords(payload) == "34135"
    assert gl._parse_census_coords({"result": {"geographies": {}}}) is None

def test_parse_nominatim_grain():
    hit = [{"lat": "26.40", "lon": "-81.80", "class": "shop", "type": "mall"}]
    assert gl._parse_nominatim(hit) == (26.40, -81.80, "point")
    nb = [{"lat": "26.2", "lon": "-81.8", "class": "place", "type": "suburb"}]
    assert gl._parse_nominatim(nb) == (26.2, -81.8, "neighborhood")
    assert gl._parse_nominatim([]) is None

def test_resolve_anchor_ladder_order(monkeypatch):
    monkeypatch.setattr(gl, "_cache_get", lambda a, c: None)
    monkeypatch.setattr(gl, "_cache_put", lambda **kw: None)
    monkeypatch.setattr(gl, "census_onelineaddress",
                        lambda a, c: {"lat": 1.0, "lon": 2.0, "zip_code": "33901"})
    called = []
    monkeypatch.setattr(gl, "nominatim_search",
                        lambda a, c: called.append(a) or None)
    out = gl.resolve_anchor("4125 Cleveland Ave", "Fort Myers, FL")
    assert out == {"lat": 1.0, "lon": 2.0, "zip_code": "33901", "geo_grain": "point"}
    assert called == []  # address rung never falls through to Nominatim on a hit

def test_resolve_anchor_landmark(monkeypatch):
    monkeypatch.setattr(gl, "_cache_get", lambda a, c: None)
    monkeypatch.setattr(gl, "_cache_put", lambda **kw: None)
    monkeypatch.setattr(gl, "nominatim_search", lambda a, c: (26.4, -81.8, "point"))
    monkeypatch.setattr(gl, "census_coords_to_zcta", lambda lat, lon: "34135")
    out = gl.resolve_anchor("Coconut Point", "Estero, FL")
    assert out == {"lat": 26.4, "lon": -81.8, "zip_code": "34135", "geo_grain": "point"}

def test_resolve_anchor_total_miss(monkeypatch):
    monkeypatch.setattr(gl, "_cache_get", lambda a, c: None)
    monkeypatch.setattr(gl, "_cache_put", lambda **kw: None)
    monkeypatch.setattr(gl, "nominatim_search", lambda a, c: None)
    assert gl.resolve_anchor("Somewhere Vague", "Naples, FL") == {}

def test_annotate_geo_fallbacks(monkeypatch):
    monkeypatch.setattr(gl, "resolve_anchor", lambda a, c: {})
    rows = [{"city": "Naples", "location_anchor": "X"},
            {"city": "Naples", "location_anchor": None}]
    out = gl.annotate_geo(rows, context="Naples, FL", fallback_grain="city")
    for r in out:
        assert r["lat"] is None and r["lon"] is None and r["zip_code"] is None
        assert r["geo_grain"] == "city"
    out2 = gl.annotate_geo([{"corridor": "US 41", "location_anchor": None}],
                           context="FL", fallback_grain=None)
    assert out2[0]["geo_grain"] is None

def test_annotate_geo_dry_run_never_resolves(monkeypatch):
    def boom(a, c):
        raise AssertionError("network in dry-run")
    monkeypatch.setattr(gl, "resolve_anchor", boom)
    out = gl.annotate_geo([{"city": "Naples", "location_anchor": "Coconut Point"}],
                          context="Naples, FL", fallback_grain="city", dry_run=True)
    assert out[0]["zip_code"] is None and out[0]["geo_grain"] == "city"
```

- [x] **Step 2: Run to verify failure.** `python -m pytest ingest/lib/test_geo_ladder.py -v` → FAIL (module not found).

- [x] **Step 3: Implement `ingest/lib/geo_ladder.py`:**

```python
"""Geocode ladder for pulse rows (Phase C, zip-page-destination spec).

Vendor terms verified live 07/09/2026 (SESSION_LOG same date): Census geocoder
free/public-domain/storable (single-record REST carries ZCTA; batch does NOT);
Nominatim public API requires caching + <=4 req/min for scheduled scripts +
identifying User-Agent + OSM attribution (ODbL); Mapbox excluded (temporary
results may not be cached; Search Box POI is temporary-use only; Permanent
tier bars distribution/sublicense).

Ladder (G1: a ZIP is written ONLY from a resolved lat/lon via Census ZCTA
polygons — never invented):
  cache -> address? Census onelineaddress (coords+ZCTA in one call)
        -> else Nominatim (SWFL-bounded) -> Census coords->ZCTA
        -> miss => {} (row keeps native grain; geo fields NULL)
"""
from __future__ import annotations

import re
import time
from typing import Any, Optional

import requests

from ingest.lib.tier1_inventory import _get_connection

CENSUS_ONELINE = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
CENSUS_COORDS = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
ZCTA_LAYER = "2020 Census ZIP Code Tabulation Areas"
# Identifying UA per Nominatim policy (stock library UAs are rejected).
USER_AGENT = "SWFLDataGulf-pulse-geocode/1.0 (https://www.swfldatagulf.com)"
# Lee + Collier bounding box (left,top,right,bottom) — bounded=1 hard-limits hits.
SWFL_VIEWBOX = "-82.35,27.10,-81.20,25.75"
# Policy: scripts at regular intervals <= 4 req/min.
NOMINATIM_MIN_INTERVAL_S = 15.0
MISS_RETRY_DAYS = 30

_last_nominatim_at = 0.0

# Nominatim place types that mean a named area, not a pin.
_NEIGHBORHOOD_TYPES = {"suburb", "neighbourhood", "quarter", "hamlet", "village",
                       "residential"}


def normalize_anchor(anchor: str) -> str:
    return re.sub(r"\s+", " ", anchor.strip().lower())


def is_address(anchor: str) -> bool:
    """Street-number-first strings are Census-geocodable addresses."""
    return bool(re.match(r"^\d{1,6}\s+\S", anchor.strip()))


def _parse_census_oneline(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    matches = (payload.get("result") or {}).get("addressMatches") or []
    if not matches:
        return None
    m = matches[0]
    coords = m.get("coordinates") or {}
    lat, lon = coords.get("y"), coords.get("x")
    zctas = (m.get("geographies") or {}).get(ZCTA_LAYER) or []
    zcta = zctas[0].get("ZCTA5") if zctas else None
    if lat is None or lon is None or not zcta:
        return None
    return {"lat": float(lat), "lon": float(lon), "zip_code": str(zcta)}


def _parse_census_coords(payload: dict[str, Any]) -> Optional[str]:
    zctas = ((payload.get("result") or {}).get("geographies") or {}).get(ZCTA_LAYER) or []
    return str(zctas[0]["ZCTA5"]) if zctas and zctas[0].get("ZCTA5") else None


def _parse_nominatim(hits: list[dict[str, Any]]) -> Optional[tuple[float, float, str]]:
    if not hits:
        return None
    h = hits[0]
    try:
        lat, lon = float(h["lat"]), float(h["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    grain = ("neighborhood"
             if h.get("class") == "place" and h.get("type") in _NEIGHBORHOOD_TYPES
             else "point")
    return (lat, lon, grain)


def census_onelineaddress(anchor: str, context: str) -> Optional[dict[str, Any]]:
    """Address -> {lat, lon, zip_code} in ONE free call. Title-cased: the Census
    geocoder silently returns no matches for ALL-CAPS input (zip_approx lesson)."""
    try:
        resp = requests.get(CENSUS_ONELINE, params={
            "address": f"{anchor.strip().title()}, {context}",
            "benchmark": "Public_AR_Current", "vintage": "Current_Current",
            "layers": ZCTA_LAYER, "format": "json"}, timeout=8)
        resp.raise_for_status()
        return _parse_census_oneline(resp.json())
    except Exception:
        return None


def census_coords_to_zcta(lat: float, lon: float) -> Optional[str]:
    try:
        resp = requests.get(CENSUS_COORDS, params={
            "x": lon, "y": lat,
            "benchmark": "Public_AR_Current", "vintage": "Current_Current",
            "layers": ZCTA_LAYER, "format": "json"}, timeout=8)
        resp.raise_for_status()
        return _parse_census_coords(resp.json())
    except Exception:
        return None


def nominatim_search(anchor: str, context: str) -> Optional[tuple[float, float, str]]:
    """SWFL-bounded landmark/neighborhood lookup. Throttled to policy."""
    global _last_nominatim_at
    wait = NOMINATIM_MIN_INTERVAL_S - (time.monotonic() - _last_nominatim_at)
    if wait > 0:
        time.sleep(wait)
    _last_nominatim_at = time.monotonic()
    try:
        resp = requests.get(NOMINATIM_SEARCH, params={
            "q": f"{anchor}, {context}", "format": "jsonv2", "limit": 1,
            "countrycodes": "us", "viewbox": SWFL_VIEWBOX, "bounded": 1},
            headers={"User-Agent": USER_AGENT}, timeout=8)
        resp.raise_for_status()
        return _parse_nominatim(resp.json())
    except Exception:
        return None


def _cache_get(anchor_norm: str, city: str) -> Optional[dict[str, Any]]:
    """Best-effort cache read. Returns {} for a fresh miss row (negative cache),
    a resolved dict for a hit, None for absent/stale-miss/DB-unavailable."""
    try:
        conn = _get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT lat, lon, zip_code, geo_grain, provider, resolved_at "
                    "FROM data_lake.geo_anchor_cache "
                    "WHERE anchor_norm = %(a)s AND city = %(c)s "
                    # MISS_RETRY_DAYS is a module-literal int, safe to inline;
                    # psycopg params cannot live inside a quoted interval.
                    f"AND (provider <> 'miss' OR resolved_at > now() - interval '{MISS_RETRY_DAYS} days')",
                    {"a": anchor_norm, "c": city})
                row = cur.fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        lat, lon, zip_code, geo_grain, provider, _ = row
        if provider == "miss":
            return {}
        return {"lat": lat, "lon": lon, "zip_code": zip_code, "geo_grain": geo_grain}
    except Exception:
        return None


def _cache_put(anchor_norm: str, city: str, provider: str,
               lat=None, lon=None, zip_code=None, geo_grain=None) -> None:
    try:
        conn = _get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO data_lake.geo_anchor_cache "
                    "(anchor_norm, city, lat, lon, zip_code, geo_grain, provider, resolved_at) "
                    "VALUES (%(a)s, %(c)s, %(lat)s, %(lon)s, %(z)s, %(g)s, %(p)s, now()) "
                    "ON CONFLICT (anchor_norm, city) DO UPDATE SET "
                    "lat=EXCLUDED.lat, lon=EXCLUDED.lon, zip_code=EXCLUDED.zip_code, "
                    "geo_grain=EXCLUDED.geo_grain, provider=EXCLUDED.provider, "
                    "resolved_at=EXCLUDED.resolved_at",
                    {"a": anchor_norm, "c": city, "lat": lat, "lon": lon,
                     "z": zip_code, "g": geo_grain, "p": provider})
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass  # cache is an optimization + policy nicety, never a failure source


def resolve_anchor(anchor: str, context: str) -> dict[str, Any]:
    """Full ladder for one anchor. Returns {lat, lon, zip_code, geo_grain} or {}."""
    anchor_norm = normalize_anchor(anchor)
    cached = _cache_get(anchor_norm, context)
    if cached is not None:
        return cached
    if is_address(anchor):
        hit = census_onelineaddress(anchor, context)
        if hit:
            out = {**hit, "geo_grain": "point"}
            _cache_put(anchor_norm, context, "census", **hit, geo_grain="point")
            return out
    else:
        nom = nominatim_search(anchor, context)
        if nom:
            lat, lon, grain = nom
            zcta = census_coords_to_zcta(lat, lon)
            if zcta:
                out = {"lat": lat, "lon": lon, "zip_code": zcta, "geo_grain": grain}
                _cache_put(anchor_norm, context, "nominatim", lat=lat, lon=lon,
                           zip_code=zcta, geo_grain=grain)
                return out
    _cache_put(anchor_norm, context, "miss")
    return {}


def annotate_geo(rows: list[dict[str, Any]], context: str,
                 fallback_grain: Optional[str], dry_run: bool = False) -> list[dict[str, Any]]:
    """Set lat/lon/zip_code/geo_grain on EVERY row. dry_run: no network, no DB —
    every row gets the fallback (offline-exercisable per pipeline --dry-run)."""
    for r in rows:
        geo: dict[str, Any] = {}
        anchor = r.get("location_anchor")
        if anchor and not dry_run:
            geo = resolve_anchor(anchor, context)
        r["lat"] = geo.get("lat")
        r["lon"] = geo.get("lon")
        r["zip_code"] = geo.get("zip_code")
        r["geo_grain"] = geo.get("geo_grain") or fallback_grain
    return rows
```

- [x] **Step 4: Run.** `python -m pytest ingest/lib/test_geo_ladder.py -v` → all PASS.

- [x] **Step 5: One live smoke (free, 3 calls total, NOT in tests).** `python -c "from ingest.lib.geo_ladder import census_onelineaddress, nominatim_search, census_coords_to_zcta; print(census_onelineaddress('2000 Main St', 'Fort Myers, FL')); h=nominatim_search('Coconut Point', 'Estero, FL'); print(h); print(census_coords_to_zcta(h[0], h[1]) if h else None)"` → expect `{'lat': 26.64…, 'lon': -81.87…, 'zip_code': '33901'}` and a Coconut Point hit resolving to `34135`. (Cache writes are best-effort; fine without DB creds.)

- [x] **Step 6: Commit.** `git add ingest/lib/geo_ladder.py ingest/lib/test_geo_ladder.py && git commit -m "feat(pulse): geocode ladder — Census + bounded Nominatim, cached, G1-clean"`

---

### Task 4: wire the ladder into both pipelines

**Files:**
- Modify: `ingest/pipelines/city_pulse/pipeline.py` (post-distill hook), `ingest/pipelines/city_pulse/distill.py` (`_INSERT_COLUMNS`)
- Modify: `ingest/pipelines/city_pulse_corridors/pipeline.py`, `ingest/pipelines/city_pulse_corridors/distill.py` (same)
- Test: both `test_pipeline.py` / `test_distill.py` files

**Interfaces:**
- Consumes: `annotate_geo` (Task 3); columns from Task 2.
- Produces: written pulse rows carry the five geo fields.

- [x] **Step 1: Failing tests.** Add to `ingest/pipelines/city_pulse/test_distill.py` (mirror for corridors):

```python
def test_insert_columns_include_geo():
    for col in ["location_anchor", "lat", "lon", "zip_code", "geo_grain"]:
        assert col in _INSERT_COLUMNS
```

- [x] **Step 2: Run to verify failure**, then extend BOTH `_INSERT_COLUMNS`:

```python
_INSERT_COLUMNS = [
    "city", "topic", "fact", "source_url", "source_title",
    "cited_text", "captured_at", "expires_at", "dedup_key", "run_at",
    "story_key", "location_anchor", "lat", "lon", "zip_code", "geo_grain",
]
```
(corridors: identical tail after `"corridor", …, "story_key"`.)

- [x] **Step 3: Hook the ladder.** `city_pulse/pipeline.py` — import `from ingest.lib.geo_ladder import annotate_geo`, then right after `rows = distill_capture(record, budget)`:

```python
rows = annotate_geo(rows, context=f"{city}, FL",
                    fallback_grain="city", dry_run=args.dry_run)
```

`city_pulse_corridors/pipeline.py` — same import; after its `distill_capture` call:

```python
rows = annotate_geo(rows, context="FL",
                    fallback_grain=None, dry_run=args.dry_run)
```

- [x] **Step 4: Full python suite.** `python -m pytest ingest/pipelines/city_pulse ingest/pipelines/city_pulse_corridors ingest/lib/test_geo_ladder.py -v` → PASS. Then offline proof: `python -m ingest.pipelines.city_pulse.pipeline --dry-run --city "Naples"` runs without geocoding network calls (dry_run short-circuit) and prints rows.

- [x] **Step 5: Commit.** `git add ingest/pipelines/city_pulse ingest/pipelines/city_pulse_corridors && git commit -m "feat(pulse): pipelines annotate geo post-distill; INSERT carries geo columns"`

---

### Task 5: pack — `pulse_by_zip` detail table (Gate 3 / brain-first)

**Files:**
- Modify: `refinery/sources/city-pulse-source.mts` (`CityPulseNormalized` + row mapping — five new nullable fields)
- Modify: `refinery/packs/city-pulse-swfl.mts` (detail table in `cityPulseOutputProducer`)
- Test: `refinery/packs/city-pulse-swfl.test.mts`

**Interfaces:**
- Consumes: lake columns from Task 2/4.
- Produces: `BrainOutput.detail_tables[0]` with `id: "pulse_by_zip"`, `grain: "zip"`, ONE row per ZIP (key = zip) — `fetchDetailRow` (lib/fetch-brain.ts:322) matches the FIRST row by exact key, so duplicate keys would shadow.

- [x] **Step 1: Failing test** (follow the existing test file's fixture pattern for building fragments):

```typescript
it("emits pulse_by_zip with one row per geocoded ZIP", () => {
  // three signals: two in 33901 (point), one ungeocoded city-wide
  const fragments = fragmentsFrom([
    row({ zip_code: "33901", geo_grain: "point", fact: "Newest 33901 fact",
          captured_at: "2026-07-09T12:00:00Z" }),
    row({ zip_code: "33901", geo_grain: "point", fact: "Older 33901 fact",
          captured_at: "2026-07-08T12:00:00Z" }),
    row({ zip_code: null, geo_grain: "city", fact: "City-wide fact" }),
  ]);
  cityPulseSwfl.corpusSummary!(fragments);
  const out = cityPulseSwfl.outputProducer!({} as PackOutput);
  const table = out.detail_tables?.find((t) => t.id === "pulse_by_zip");
  expect(table).toBeDefined();
  expect(table!.grain).toBe("zip");
  expect(table!.rows).toHaveLength(1);            // one row per ZIP
  expect(table!.rows[0].key).toBe("33901");
  expect(table!.rows[0].cells.items).toBe(2);
  expect(table!.rows[0].cells.latest_fact).toBe("Newest 33901 fact");
});

it("omits pulse_by_zip when nothing is geocoded", () => {
  const fragments = fragmentsFrom([row({ zip_code: null, geo_grain: "city" })]);
  cityPulseSwfl.corpusSummary!(fragments);
  const out = cityPulseSwfl.outputProducer!({} as PackOutput);
  expect(out.detail_tables?.find((t) => t.id === "pulse_by_zip")).toBeUndefined();
});
```

- [x] **Step 2: Run to verify failure.** `bun test refinery/packs/city-pulse-swfl.test.mts` → FAIL.

- [x] **Step 3: Implement.** `city-pulse-source.mts`: add to `CityPulseNormalized` (all nullable) and thread through the defensive coercion + select:

```typescript
  location_anchor: string | null;
  lat: number | null;
  lon: number | null;
  zip_code: string | null;
  geo_grain: "point" | "neighborhood" | "city" | "county" | null;
```

`city-pulse-swfl.mts`: build the table inside `cityPulseOutputProducer` from `snapshot.signals` (which are already topic-priority/recency sorted — first hit per ZIP = latest within top topic):

```typescript
function pulseByZipTable(
  signals: CityPulseNormalized[],
  fetched_at: string,
): BrainOutputDetailTable | null {
  const geocoded = signals.filter(
    (s) => s.zip_code && (s.geo_grain === "point" || s.geo_grain === "neighborhood"),
  );
  if (geocoded.length === 0) return null;
  const byZip = new Map<string, CityPulseNormalized[]>();
  for (const s of geocoded) {
    const list = byZip.get(s.zip_code!) ?? [];
    list.push(s);
    byZip.set(s.zip_code!, list);
  }
  return {
    id: "pulse_by_zip",
    title: "Live local news signals by ZIP",
    grain: "zip",
    columns: [
      { id: "items", label: "Live signals" },
      { id: "latest_fact", label: "Most recent signal" },
      { id: "latest_place", label: "Named place" },
      { id: "latest_source", label: "Source" },
    ],
    rows: [...byZip.entries()].map(([zip, items]) => {
      const latest = [...items].sort((a, b) =>
        b.captured_at.localeCompare(a.captured_at),
      )[0];
      return {
        key: zip,
        label: zip,
        cells: {
          items: items.length,
          latest_fact: latest.fact,
          latest_place: latest.location_anchor,
          latest_source: latest.source_url,
        },
      };
    }),
    source: {
      url: "https://www.swfldatagulf.com/r/source/city_pulse",
      fetched_at,
      tier: 2,
      citation:
        "Distilled, citation-backed SWFL news signals; each row's items carry per-item source URLs in data_lake.city_pulse.",
    },
    note: "ZIPs are location-derived from each item's named place (address/landmark geocode); city-wide items carry no ZIP and are excluded here.",
  };
}
```

Wire into the producer's non-empty return: `detail_tables: table ? [table] : undefined` (build `const table = pulseByZipTable(snapshot.signals, fetched_at)` first). Import `BrainOutputDetailTable` type.

- [x] **Step 4: Gates.** `bun test refinery/packs/city-pulse-swfl.test.mts refinery/packs/catalog.test.mts` → PASS. `bun refinery/tools/check-vocab-coverage.mts --all` → clean (detail-table ids are not metric slugs; if the tool flags anything, register it in `refinery/vocab/brain-vocabulary.json` in this same commit). `bun test refinery/lib/corridor-aliases.test.mts` (pack-touch pre-push gate pair).

- [x] **Step 5: Commit.** `git add refinery/sources/city-pulse-source.mts refinery/packs/city-pulse-swfl.mts refinery/packs/city-pulse-swfl.test.mts && git commit -m "feat(pulse): city-pulse emits pulse_by_zip detail table (Gate 3 satisfied)"`

---

### Task 6: page section — "What's happening near {ZIP}"

**Files:**
- Create: `lib/pulse/nearby-rank.ts` (pure: banding + ordering), `lib/pulse/nearby-rank.test.ts`
- Create: `lib/pulse/nearby.ts` (loader, empty-tolerant)
- Create: `components/narratives/PulseNearby.tsx` (server component)
- Modify: `app/r/zip-report/[zip]/page.tsx` (parallel load + mount after `<NarrativeSections row={narrative} />` at line ~394)

**Interfaces:**
- Consumes: lake columns (Task 2/4); `fixtures/swfl-zip-centroids.json` (`{entries:[{zip,lat,lng}]}`); `fixtures/swfl-place-zip-crosswalk.json` (`{entries:[{place,zip,alt_zips,usps_preferred_city,…}]}`); `createServiceRoleClientUntyped` (pattern: `lib/zip-summary/load.ts`).
- Produces: `loadPulseNearby(zip: string): Promise<NearbyPulseItem[]>`; `<PulseNearby items={…} zip={…} />` renders nothing on `[]`.

- [x] **Step 1: Failing tests for the pure module** `lib/pulse/nearby-rank.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { haversineMiles, rankNearby, type PulseGeoRow } from "./nearby-rank";

const base = {
  fact: "F", topic: "business", city: "Fort Myers", location_anchor: null,
  source_url: "https://x.example", source_title: null, cited_text: null,
  captured_at: "2026-07-09T00:00:00Z",
};

describe("haversineMiles", () => {
  it("Fort Myers to Bonita ≈ 20mi", () => {
    const d = haversineMiles(26.6406, -81.8723, 26.3398, -81.7787);
    expect(d).toBeGreaterThan(18);
    expect(d).toBeLessThan(23);
  });
});

describe("rankNearby", () => {
  const center = { lat: 26.64, lng: -81.87 };
  it("point-in-band first, then neighborhood, then city; caps at limit", () => {
    const rows: PulseGeoRow[] = [
      { ...base, zip_code: null, lat: null, lon: null, geo_grain: "city" },
      { ...base, zip_code: "33901", lat: 26.64, lon: -81.87, geo_grain: "point" },
      { ...base, zip_code: "33901", lat: null, lon: null, geo_grain: "neighborhood" },
      // point 60mi away — outside the 3mi band AND a different zip: excluded
      { ...base, zip_code: "34102", lat: 26.14, lon: -81.79, geo_grain: "point" },
    ];
    const out = rankNearby(rows, "33901", center, 10);
    expect(out.map((r) => r.geo_grain)).toEqual(["point", "neighborhood", "city"]);
  });
  it("keeps an out-of-zip point inside the 3mi band", () => {
    const rows: PulseGeoRow[] = [
      { ...base, zip_code: "33916", lat: 26.65, lon: -81.85, geo_grain: "point" },
    ];
    expect(rankNearby(rows, "33901", center, 10)).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run to verify failure.** `bun test lib/pulse/nearby-rank.test.ts` → FAIL.

- [x] **Step 3: Implement `lib/pulse/nearby-rank.ts`:**

```typescript
/** Pure ranking for the zip page news section. Order: point items in the
 * ~3mi primary band (trade-area basis: ingest/event-radius-config.yaml) or in
 * the ZIP itself → neighborhood items in the ZIP → city-wide items. Bigger
 * grains are labeled by the renderer, never hidden. Newest first within grain. */
export interface PulseGeoRow {
  fact: string; topic: string; city: string;
  location_anchor: string | null;
  source_url: string; source_title: string | null; cited_text: string | null;
  captured_at: string;
  zip_code: string | null; lat: number | null; lon: number | null;
  geo_grain: "point" | "neighborhood" | "city" | "county" | null;
}
export interface NearbyPulseItem extends PulseGeoRow { distance_mi: number | null }

export const PRIMARY_BAND_MI = 3;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dphi = toRad(lat2 - lat1);
  const dlam = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlam / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GRAIN_ORDER = { point: 0, neighborhood: 1, city: 2, county: 3 } as const;

export function rankNearby(
  rows: PulseGeoRow[],
  zip: string,
  center: { lat: number; lng: number } | null,
  limit: number,
): NearbyPulseItem[] {
  const kept: NearbyPulseItem[] = [];
  for (const r of rows) {
    const grain = r.geo_grain;
    if (grain === "point") {
      const distance_mi =
        center && r.lat != null && r.lon != null
          ? haversineMiles(center.lat, center.lng, r.lat, r.lon)
          : null;
      if (r.zip_code === zip || (distance_mi != null && distance_mi <= PRIMARY_BAND_MI)) {
        kept.push({ ...r, distance_mi });
      }
    } else if (grain === "neighborhood") {
      if (r.zip_code === zip) kept.push({ ...r, distance_mi: null });
    } else if (grain === "city" || grain === "county") {
      kept.push({ ...r, distance_mi: null }); // caller pre-filtered to this ZIP's city
    }
  }
  kept.sort((a, b) => {
    const g = GRAIN_ORDER[a.geo_grain as keyof typeof GRAIN_ORDER] -
      GRAIN_ORDER[b.geo_grain as keyof typeof GRAIN_ORDER];
    if (g !== 0) return g;
    return b.captured_at.localeCompare(a.captured_at);
  });
  return kept.slice(0, limit);
}
```

- [x] **Step 4: Run.** `bun test lib/pulse/nearby-rank.test.ts` → PASS.

- [x] **Step 5: Loader `lib/pulse/nearby.ts`** (empty-tolerant contract, mirrors `lib/zip-summary/load.ts`):

```typescript
import centroids from "@/fixtures/swfl-zip-centroids.json";
import crosswalk from "@/fixtures/swfl-place-zip-crosswalk.json";
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { rankNearby, type NearbyPulseItem, type PulseGeoRow } from "./nearby-rank";

const LIMIT = 10;

function zipCentroid(zip: string): { lat: number; lng: number } | null {
  const hit = (centroids as { entries: { zip: string; lat: number; lng: number }[] })
    .entries.find((e) => e.zip === zip);
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

/** Reverse crosswalk: which pulse-covered city names claim this ZIP. Both the
 * place label and the USPS preferred city are candidates — pipeline CITIES use
 * the colloquial name (e.g. "Estero", "Fort Myers"). */
function citiesForZip(zip: string): string[] {
  const names = new Set<string>();
  for (const e of (crosswalk as {
    entries: { place: string; zip: string; alt_zips: string[]; usps_preferred_city: string }[];
  }).entries) {
    if (e.zip === zip || (e.alt_zips ?? []).includes(zip)) {
      names.add(e.place);
      if (e.usps_preferred_city) names.add(e.usps_preferred_city);
    }
  }
  return [...names];
}

/** Live pulse items near one ZIP: point (≤3mi band or in-ZIP) → neighborhood
 * (in-ZIP) → city-wide (this ZIP's city), newest first within grain. Empty-
 * tolerant: no creds / no rows / any error → [] (section hides). */
export async function loadPulseNearby(zip: string): Promise<NearbyPulseItem[]> {
  let supabase: ReturnType<typeof createServiceRoleClientUntyped>;
  try {
    supabase = createServiceRoleClientUntyped();
  } catch {
    return [];
  }
  const cities = citiesForZip(zip);
  try {
    const sel =
      "fact, topic, city, location_anchor, source_url, source_title, cited_text, captured_at, zip_code, lat, lon, geo_grain";
    const [geocoded, cityWide] = await Promise.all([
      supabase.schema("data_lake").from("city_pulse").select(sel)
        .in("geo_grain", ["point", "neighborhood"])
        .is("superseded_by", null)
        .gt("expires_at", new Date().toISOString())
        .order("captured_at", { ascending: false })
        .limit(200),
      cities.length
        ? supabase.schema("data_lake").from("city_pulse").select(sel)
            .in("city", cities)
            .or("geo_grain.eq.city,geo_grain.is.null")
            .is("superseded_by", null)
            .gt("expires_at", new Date().toISOString())
            .order("captured_at", { ascending: false })
            .limit(25)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (geocoded.error || cityWide.error) return [];
    const rows = [
      ...((geocoded.data ?? []) as PulseGeoRow[]),
      ...((cityWide.data ?? []) as PulseGeoRow[]).map((r) => ({
        ...r,
        geo_grain: "city" as const, // legacy NULL-grain rows are native city grain
      })),
    ];
    return rankNearby(rows, zip, zipCentroid(zip), LIMIT);
  } catch {
    return [];
  }
}
```

- [x] **Step 6: Component `components/narratives/PulseNearby.tsx`** (server component; sibling of NarrativeSections per the handoff's one-root rule; check `NarrativeSections.tsx` for the section-frame classes it uses and reuse them so the two sections read as one system):

```tsx
import type { NearbyPulseItem } from "@/lib/pulse/nearby-rank";

/** "What's happening near {ZIP}" — live pulse items ordered by grain
 * (point → neighborhood → city), bigger grains visibly labeled. Renders
 * nothing when there are no items (additive, empty-tolerant). Phone-first:
 * a plain stacked list, no horizontal scroll, no hover-only affordances. */
export function PulseNearby({ zip, items }: { zip: string; items: NearbyPulseItem[] }) {
  if (items.length === 0) return null;
  const asOf = (iso: string) => {
    const d = new Date(iso);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${mm}/${dd}/${d.getUTCFullYear()}`;
  };
  const grainLabel = (it: NearbyPulseItem) =>
    it.geo_grain === "point" || it.geo_grain === "neighborhood"
      ? (it.location_anchor ?? it.city)
      : `${it.city} — city-wide`;
  return (
    <section className="pulse-nearby" aria-label={`What's happening near ${zip}`}>
      <h2>What’s happening near {zip}</h2>
      <ul>
        {items.map((it, i) => (
          <li key={`${it.source_url}-${i}`}>
            <span className="pn-place">{grainLabel(it)}</span>
            <p className="pn-fact">{it.fact}</p>
            <p className="pn-src">
              <a href={it.source_url} target="_blank" rel="noopener noreferrer">
                {it.source_title ?? new URL(it.source_url).hostname}
              </a>{" "}
              · {asOf(it.captured_at)}
            </p>
          </li>
        ))}
      </ul>
      <p className="pn-attr">Location matching uses OpenStreetMap data © OpenStreetMap contributors.</p>
    </section>
  );
}
```

(Styling: follow whatever pattern `NarrativeSections.tsx` uses — its css file or module — same fonts/spacing; add the few `pulse-nearby` rules beside the narrative section's rules. The OSM attribution line satisfies the ODbL display requirement — keep it unconditional: cheap, honest, and simpler than tracking per-item provider through the read path.)

- [x] **Step 7: Mount.** In `app/r/zip-report/[zip]/page.tsx`: add `import { loadPulseNearby } from "../../../../lib/pulse/nearby";` + `import { PulseNearby } from "../../../../components/narratives/PulseNearby";`, add `loadPulseNearby(zip)` to the existing `Promise.all` (new `pulseNearby` binding), and directly after `<NarrativeSections row={narrative} />` (line ~394):

```tsx
      {/* ── Live local pulse — grain-ordered, empty-tolerant (Phase C) ── */}
      <PulseNearby zip={zip} items={pulseNearby} />
```

- [x] **Step 8: Verify.** `bun test lib/pulse/` → PASS. `bunx next build` → green (this is the repo's typecheck oracle — never `npx tsc`). Then phone check per spec §Phone: `bunx next start` + devtools at 390px width on `/r/zip-report/33901` — section absent today (no geocoded rows yet — legit), so verify no layout shift/errors; the rendered check re-runs at live-verify once the next pulse run lands geo rows.

- [x] **Step 9: Commit.** `git add lib/pulse components/narratives/PulseNearby.tsx app/r/zip-report/[zip]/page.tsx && git commit -m "feat(zip-page): What's happening near {ZIP} — grain-ordered pulse news section"`

---

### Task 7: log, checks, push checkpoint

- [x] **Step 1: SESSION_LOG entry** (top of file): Phase C built — distiller anchors, migration run, ladder (vendors + policy posture), pack table, page section; tests/build evidence; live-verify posture (news renders after the next scheduled pulse run writes geocoded rows; `zip_page_destination_live_verify` still open — narration bake + news render together close it).
- [x] **Step 2: Full gate sweep.** `python -m pytest ingest/ -v` (touched-pipeline scope at minimum) · `bun test refinery/packs/ lib/pulse/` · `bun refinery/tools/check-vocab-coverage.mts --all` · `bunx next build`.
- [x] **Step 3: STOP — show `git log --oneline` + summary to the operator and ask before ANY push** (standing rule: a question is not push authorization; pack OUTPUT-shape change + ingest surface = ask-first category regardless).

## Failure posture (spec §Error handling)

- Geocode miss at every rung → row stays native grain (`annotate_geo` fallback); never a fabricated ZIP.
- Vendor error/timeout → same as miss (every vendor fn returns None on any exception).
- Page: no lake creds / no rows / query error → `[]` → section renders nothing; page identical to today.
- Cache DB unavailable → ladder still works (cache is best-effort), Nominatim throttle still enforced in-process.
