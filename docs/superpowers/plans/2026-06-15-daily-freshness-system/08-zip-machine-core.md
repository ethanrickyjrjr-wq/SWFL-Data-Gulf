# 08 — ZIP Machine Core (Wave 1, independent)

> Build file for the Daily Freshness System. **Read `README.md` §3d (the `zip_stamp` signature) + the ZIP COLUMNS 3 GATES in CLAUDE.md (G1/G2/G3).** One scope-gated stamper that turns a site address or lat/lon into a SWFL `zip_code`, replacing three duplicated geocoders. Serves the broader ZIP-grain backlog the ops board tracks; independent of the pulse.

**Model:** Opus · **Repo:** brain-platform · **Wave:** 1 (independent) · **Depends:** —

**Goal:** `ingest/lib/zip_stamp.py` — one stamper with three modes (`geocode` from address, `pip` from lat/lon, `crosswalk` from CRE submarket), scope-gated to the 6-county footprint, honoring G1 (site location ONLY), so file 09 can route ~11 datasets through it.

---

## §0 corrections to build on (the original draft's anchors were off)

- The approx helper is at **`ingest/utils/zip_approx.py`** (NOT `ingest/lib/`) — `(city, county, state) → nearest ZCTA5 centroid` via Census `onelineaddress` geocoder + TIGER 2024 internal-point centroids + `fixtures/swfl-zip-county.json` county fast-path. **Fold it in** (move/re-export from `zip_stamp`, keep its tests passing) rather than duplicating.
- The three geocoders are `ingest/pipelines/lee_permits/geocoder.py`, `ingest/pipelines/collier_permits/geocoder.py`, `ingest/pipelines/mhs_permits_swfl/geocode.py` (note: mhs is `geocode.py` singular) — all POST to `https://geocoding.geo.census.gov/geocoder/locations/addressbatch` (benchmark `Public_AR_Current`, batch 9,999) but with **divergent return shapes** (lee `{addr:(lat,lon)}`; collier `{addr:(lat,lon,zip)}`; mhs `{street|city: zip}`) and divergent post-processing (lee/collier do haversine corridor assignment; mhs does the 6-county ZIP gate). **Dedupe the Census POST/parse loop; each caller keeps its own address-split + post-processing.**
- `public/maps/fl_zips.geojson` (verified): 983 FL ZCTA features, ZIP = **`ZCTA5CE10`**, centroids `INTPTLAT10`/`INTPTLON10`, geometry Polygon+MultiPolygon → usable for point-in-polygon.
- Scope authority: `fixtures/swfl-zip-county.json` (~109 ZIPs, 6 counties; `zip_approx` already reads it). The Python stamper gates against this file (the TS `resolveZip` is the refinery-side mirror).

---

## Files

- **Create:** `ingest/lib/zip_stamp.py` — the three-mode stamper + a shared `census_batch_geocode()` helper.
- **Create:** `ingest/lib/tests/test_zip_stamp.py`.
- **Create:** `fixtures/swfl-submarket-zip-crosswalk.json` — a **sourced** CRE submarket→ZIP map (cite the source per submarket; for the C&W/Colliers/MHS/Lee&Assoc family).
- **Reuse:** `ingest/utils/zip_approx.py` (centroid fallback), `public/maps/fl_zips.geojson` (PIP), `fixtures/swfl-zip-county.json` (scope gate).

---

## Task 1 — The stamper (TDD)

- [ ] **Step 1.1: Write failing tests** (`ingest/lib/tests/test_zip_stamp.py`):

```python
from ingest.lib import zip_stamp as Z

def test_pip_known_swfl_point():
    # a point in Cape Coral → 33904 (or 33914/33991/33993 depending on the exact coord); assert in-scope ZIP
    z = Z.zip_from_latlon(26.5629, -81.9495)   # Cape Coral
    assert z and Z.in_scope(z)

def test_pip_out_of_scope_returns_none():
    z = Z.zip_from_latlon(30.4383, -84.2807)   # Tallahassee — out of SWFL
    assert z is None or not Z.in_scope(z)       # stamper DROPS it, never invents an in-scope zip

def test_scope_gate_drops_out_of_scope():
    rows = [{"id": 1, "lat": 26.14, "lon": -81.79}, {"id": 2, "lat": 30.43, "lon": -84.28}]
    out = Z.stamp_zip(rows, mode="pip", lat_col="lat", lon_col="lon")
    assert any(r.get("zip_code") for r in out if r["id"] == 1)
    assert all(not r.get("zip_code") for r in out if r["id"] == 2)   # dropped/empty, not invented

def test_crosswalk_lookup():
    out = Z.stamp_zip([{"submarket": "South Fort Myers"}], mode="crosswalk", address_cols=["submarket"])
    assert out[0]["zip_code"] and Z.in_scope(out[0]["zip_code"])
    assert out[0]["zip_source"] == "submarket_crosswalk"

def test_g1_refuses_mailing_column():
    # G1: site location only. A mailing/owner column must not be accepted as a site source.
    import pytest
    with pytest.raises(ValueError, match="site"):
        Z.stamp_zip([{"owner_zip": "33901"}], mode="geocode", address_cols=["owner_zip"])
```

- [ ] **Step 1.2: Run — expect fail.**

- [ ] **Step 1.3: Implement `zip_stamp.py`:**

```python
"""Scope-gated post-ingest ZIP stamper. G1: site location ONLY (never mailing/owner ZIP)."""
import json, math, pathlib
_ZIPS = json.loads(pathlib.Path("fixtures/swfl-zip-county.json").read_text())
_INSCOPE = {e["zip"] for e in _ZIPS["entries"]}
_MAILING_HINTS = ("owner", "mailing", "contractor", "applicant")  # G1 guard
_GEOJSON = None  # lazy-loaded fl_zips.geojson, bbox-indexed

def in_scope(zip_code: str) -> bool:
    return zip_code in _INSCOPE

def zip_from_latlon(lat: float, lon: float) -> str | None:
    """Point-in-polygon vs fl_zips.geojson (ZCTA5CE10). bbox prefilter then ray-cast rings."""
    ...  # load _GEOJSON once; for each feature whose bbox contains (lon,lat), ray-cast; return ZCTA5CE10

def census_batch_geocode(addresses: list[str]) -> dict[str, tuple[float, float] | None]:
    """Shared Census addressbatch POST/parse (dedupes lee/collier/mhs)."""
    ...

def stamp_zip(rows, *, mode, lat_col=None, lon_col=None, address_cols=None, source_tag="derived"):
    if address_cols and any(any(h in c.lower() for h in _MAILING_HINTS) for c in address_cols):
        raise ValueError("G1: refusing a mailing/owner column as a site ZIP source")
    out = []
    for r in rows:
        zc = None
        if mode == "pip" and r.get(lat_col) is not None:
            zc = zip_from_latlon(r[lat_col], r[lon_col])
        elif mode == "geocode":
            latlon = census_batch_geocode([_join(r, address_cols)]).get(_join(r, address_cols))
            zc = zip_from_latlon(*latlon) if latlon else None
        elif mode == "crosswalk":
            zc = _crosswalk(r, address_cols)
        if zc and in_scope(zc):                 # SCOPE GATE — drop out-of-scope, never invent
            out.append({**r, "zip_code": zc, "zip_source": _src(mode, source_tag)})
        else:
            out.append({**r, "zip_code": None, "zip_source": None})
    return out
```

`zip_from_latlon`: load `public/maps/fl_zips.geojson` once, build a bbox per feature, prefilter candidates whose bbox contains the point, then ray-cast the polygon rings; return `ZCTA5CE10`. Prefer `shapely` if it's already pinned in `ingest/requirements.txt`; otherwise vendor a small ray-cast (no new heavy dep). `_crosswalk` reads `fixtures/swfl-submarket-zip-crosswalk.json`.

- [ ] **Step 1.4: Run tests — expect pass.**

---

## Task 2 — Sourced submarket crosswalk

- [ ] **Step 2.1: Build `fixtures/swfl-submarket-zip-crosswalk.json`** — each CRE submarket (from the C&W/Colliers/MHS/Lee&Assoc reports) → its ZIP(s), **with a `source` per entry** (the report/map that defines the submarket boundary). Provenance is mandatory (data-protocol rule 3) — a submarket→ZIP mapping without a cited boundary source is invented precision. Mark any uncertain mapping `"confidence": "approx"` so file 09 can tag it.

```json
{
  "note": "CRE submarket -> SWFL ZIP(s). Source per submarket. approx = boundary inferred, not official.",
  "submarkets": {
    "South Fort Myers": { "zips": ["33908", "33912", "33913"], "county": "Lee", "source": "C&W MarketBeat SWFL submarket map", "confidence": "official" }
  }
}
```

- [ ] **Step 2.2: Commit** (`git add ingest/lib/zip_stamp.py ingest/lib/tests/ fixtures/swfl-submarket-zip-crosswalk.json`).

---

## Definition of Done

- `zip_stamp.py` exposes `stamp_zip(rows, mode=…)` for `geocode`/`pip`/`crosswalk`, scope-gated to the 6 counties, **refusing mailing/owner columns (G1)** and **dropping out-of-scope rows** (never inventing an in-scope ZIP).
- `zip_from_latlon` does real point-in-polygon against `fl_zips.geojson` (`ZCTA5CE10`); a known SWFL point resolves, a Tallahassee point does not.
- The shared `census_batch_geocode` dedupes the three permit geocoders' POST/parse loop; `ingest/utils/zip_approx.py` is folded in (its tests still pass).
- `fixtures/swfl-submarket-zip-crosswalk.json` carries a cited source per submarket.
- **Board row:** `08-zip-core` GREEN — stamper tests pass; file 09 can consume it.
