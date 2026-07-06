"""Pull Collier County parcel names from the FDOR centroid-version FeatureServer
and merge them into data_lake.parcel_subdivision (Tier 2).

Gives every Collier home its raw platted-subdivision name (`S_LEGAL`, stemmed) +
property_type + just_value, the backbone the alias reconciler
(refinery/lib/subdivision-aliases.mts) rolls up to marketed communities and
`ingest/duckdb_pipelines/neighborhood_stats` aggregates per subdivision.

Lee is NOT pulled here — FDOR's CO_NO=46 partition 400s on record queries on
this layer (see constants.py docstring). Lee lands via a separate pipeline
(follow-up F1).
"""
from __future__ import annotations

import re
import time

import requests

from ingest.lib.coercion import coerce_float as _coerce_float
from ingest.lib.guards import assert_vs_canonical

from .constants import (
    CENTROID_URL,
    CO_NO,
    DOR_HOME_TYPE,
    OUT_FIELDS,
    PAGE_SIZE,
    SUBDIVISION_QUALIFIER_PATTERN,
)

_QUALIFIER_RE = re.compile(SUBDIVISION_QUALIFIER_PATTERN)
_NON_ALNUM_RE = re.compile(r"[^A-Z0-9 ]")
_WHITESPACE_RE = re.compile(r"\s+")

# Tier-2 column hints — parcel_id is the key (PK).
_TIER2_COLUMNS: dict = {
    "parcel_id":        {"data_type": "text", "nullable": False, "primary_key": True},
    "county":           {"data_type": "text", "nullable": False},
    "property_type":    {"data_type": "text", "nullable": True},
    "just_value":       {"data_type": "double", "nullable": True},
    "zip":              {"data_type": "text", "nullable": True},
    "subdivision_name": {"data_type": "text", "nullable": True},
    "phy_addr1":        {"data_type": "text", "nullable": True},
}


def _stem(raw: str | None) -> str:
    """Port of `normalizeSubdivisionName` (refinery/lib/subdivision-aliases.mts) —
    keep both in lockstep or the alias reconciler's slugs drift apart across
    the TS (Phase 4/5 readers) and Python (this ingest) sides."""
    s = (raw or "").upper()
    s = _QUALIFIER_RE.sub("", s)
    s = _NON_ALNUM_RE.sub(" ", s)
    return _WHITESPACE_RE.sub(" ", s).strip()


def _normalize(feats: list[dict], county: str) -> list[dict]:
    """Map ArcGIS attribute rows -> parcel_subdivision rows. Drops non-home DOR
    use codes (commercial, vacant, etc.) — only the design spec's home types land."""
    out: list[dict] = []
    for ft in feats:
        a = ft.get("attributes", ft)  # tolerate bare-attribute dicts (tests)
        dor = str(a.get("DOR_UC") or "").zfill(3)
        property_type = DOR_HOME_TYPE.get(dor)
        if property_type is None:
            continue
        pid = a.get("PARCEL_ID")
        if not pid:
            continue
        zipcd = a.get("PHY_ZIPCD")
        out.append({
            "parcel_id": str(pid),
            "county": county,
            "property_type": property_type,
            "just_value": _coerce_float(a.get("JV")),
            "zip": (str(zipcd) if zipcd not in (None, "") else None),
            "subdivision_name": _stem(a.get("S_LEGAL")),
            "phy_addr1": (str(a["PHY_ADDR1"]).strip() or None) if a.get("PHY_ADDR1") else None,
        })
    return out


def _make_resource(chunk: list[dict]):
    """Zero-arg dlt resource factory — same closure pattern as collier_parcels
    (dodges dlt's mutable-default-arg spec error)."""
    import dlt

    @dlt.resource(
        table_name="parcel_subdivision",
        write_disposition="merge",
        primary_key="parcel_id",
        columns=_TIER2_COLUMNS,
    )
    def parcel_subdivision_rows():
        yield from chunk

    return parcel_subdivision_rows


def _promote_to_tier2(rows: list[dict], chunk_size: int = 5_000) -> None:
    """Chunked merge into data_lake.parcel_subdivision (mirrors collier_parcels'
    chunking — stays under the Supabase pooler connection timeout)."""
    import dlt

    pipeline = dlt.pipeline(
        pipeline_name="parcel_subdivision",
        destination="postgres",
        dataset_name="data_lake",
    )
    total = len(rows)
    n_chunks = (total + chunk_size - 1) // chunk_size
    for i in range(0, total, chunk_size):
        chunk = rows[i : i + chunk_size]
        load_info = pipeline.run(_make_resource(chunk)())
        load_info.raise_on_failed_jobs()
        print(f"  parcel_subdivision chunk {i // chunk_size + 1}/{n_chunks} ({len(chunk)} rows)")


_MAX_ATTEMPTS_PER_SIZE = 3
_MIN_PAGE_SIZE = 100


def _fetch_page(last_oid: int, page_size: int) -> dict:
    """One ArcGIS request, retried up to _MAX_ATTEMPTS_PER_SIZE times at THIS
    page_size. Returns the parsed JSON body (which may itself carry a
    {"error": ...} key — the caller decides whether that's grounds to shrink
    the page and retry). Raises only on a real transport/HTTP failure."""
    params = {
        "where": f"(CO_NO={CO_NO['collier']}) AND OBJECTID>{last_oid}",
        "outFields": OUT_FIELDS,
        "orderByFields": "OBJECTID ASC",
        "resultRecordCount": page_size,
        "returnGeometry": "false",
        "f": "json",
    }
    for attempt in range(_MAX_ATTEMPTS_PER_SIZE):
        last_attempt = attempt == _MAX_ATTEMPTS_PER_SIZE - 1
        try:
            resp = requests.get(CENTROID_URL, params=params, timeout=120)
            if resp.status_code >= 500 and not last_attempt:
                time.sleep(2 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception:
            if last_attempt:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")  # loop always returns or raises on last_attempt


def _fetch_page_with_shrink(last_oid: int, page_size: int) -> tuple[dict, int]:
    """Fetch one page, shrinking resultRecordCount on a repeated soft-400
    ({"error": {"code": 400, ...}} inside an HTTP 200 body) before giving up.

    Verified live 07/06/2026: a page can 400 at resultRecordCount=2000 while
    succeeding cleanly at 500 for the IDENTICAL cursor (OBJECTID>2274627) —
    this is page-size-dependent (a response-size/server limit at that specific
    cursor), NOT a transient blip and NOT a rejected query shape (unlike
    returnCountOnly/LIKE/returnCentroid on this same layer, which 400 every
    time regardless of size). Halving down to _MIN_PAGE_SIZE before raising
    absorbs it without needing a hand-picked page size.

    Returns (body, page_size_used) — the caller resumes subsequent pages at
    the ORIGINAL page_size; the shrink is local to the one problem cursor."""
    size = page_size
    while True:
        body = _fetch_page(last_oid, size)
        if "error" not in body:
            return body, size
        if size <= _MIN_PAGE_SIZE:
            raise RuntimeError(
                f"collier parcel_subdivision page failed @OBJECTID>{last_oid} "
                f"even at the minimum page size ({_MIN_PAGE_SIZE}): {body['error']}"
            )
        size = max(size // 2, _MIN_PAGE_SIZE)
        print(f"  parcel_subdivision (collier): OBJECTID>{last_oid} soft-400'd — retrying at page_size={size}")


def _iter_collier_attrs(page_size: int = PAGE_SIZE):
    """Keyset pagination by OBJECTID — the resultOffset paginator caps at 100k
    features on this hosted layer (verified on the sibling cadastral layer;
    same ArcGIS Online hosting tier), so cursor on OBJECTID instead."""
    last_oid = -1
    page_num = 0
    while True:
        data, used_size = _fetch_page_with_shrink(last_oid, page_size)

        features = data.get("features", [])
        if not features:
            break
        page_num += 1
        if page_num % 20 == 0:
            print(f"  parcel_subdivision (collier): page {page_num}, OBJECTID>{last_oid}")
        max_oid = last_oid
        for feat in features:
            oid = feat.get("attributes", {}).get("OBJECTID")
            if isinstance(oid, int) and oid > max_oid:
                max_oid = oid
            yield feat
        if len(features) < used_size or max_oid == last_oid:
            break
        last_oid = max_oid


def fetch_collier_parcel_subdivisions() -> list[dict]:
    """Fetch all Collier (CO_NO=21) parcel names via OBJECTID keyset paging, normalized."""
    return _normalize(list(_iter_collier_attrs()), "collier")


def arcgis_count(where: str) -> int:
    """Canonical row count via returnCountOnly — NOTE this layer 400s on some
    shapes (see constants.py); returnCountOnly is confirmed to work."""
    resp = requests.get(CENTROID_URL, params={"where": where, "returnCountOnly": "true", "f": "json"}, timeout=60)
    resp.raise_for_status()
    return int(resp.json().get("count", 0))


def ingest_collier_parcel_subdivisions() -> int:
    """Pull Collier parcel names from the FDOR centroid layer and promote to Tier 2."""
    where = f"CO_NO={CO_NO['collier']}"
    canonical = arcgis_count(where)
    rows = fetch_collier_parcel_subdivisions()
    if not rows:
        print("parcel_subdivision (collier): 0 rows — aborting Tier 2 promotion")
        return 0
    # canonical counts ALL Collier parcels (incl. non-home/vacant); rows is home-only
    # after the DOR filter, so compare against a floor, not a 1:1 assertion.
    assert_vs_canonical(len(rows), canonical, floor=0.5, label="collier parcel_subdivision (home subset)")
    _promote_to_tier2(rows)
    print(f"parcel_subdivision (collier): merged {len(rows)} homes into data_lake.parcel_subdivision")
    return len(rows)
