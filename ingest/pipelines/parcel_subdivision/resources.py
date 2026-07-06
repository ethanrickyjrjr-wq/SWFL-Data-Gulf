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


def _iter_collier_attrs(page_size: int = PAGE_SIZE):
    """Keyset pagination by OBJECTID — the resultOffset paginator caps at 100k
    features on this hosted layer (verified on the sibling cadastral layer;
    same ArcGIS Online hosting tier), so cursor on OBJECTID instead."""
    last_oid = -1
    while True:
        params = {
            "where": f"(CO_NO={CO_NO['collier']}) AND OBJECTID>{last_oid}",
            "outFields": OUT_FIELDS,
            "orderByFields": "OBJECTID ASC",
            "resultRecordCount": page_size,
            "returnGeometry": "false",
            "f": "json",
        }
        data = None
        for attempt in range(6):
            try:
                resp = requests.get(CENTROID_URL, params=params, timeout=120)
                if resp.status_code >= 500 and attempt < 5:
                    time.sleep(2 * (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                if "error" in data:
                    time.sleep(2 * (attempt + 1))
                    continue
                break
            except Exception:
                if attempt == 5:
                    raise
                time.sleep(2 * (attempt + 1))
        else:
            raise RuntimeError(f"collier parcel_subdivision page failed @OBJECTID>{last_oid}")

        features = data.get("features", []) if data else []
        if not features:
            break
        max_oid = last_oid
        for feat in features:
            oid = feat.get("attributes", {}).get("OBJECTID")
            if isinstance(oid, int) and oid > max_oid:
                max_oid = oid
            yield feat
        if len(features) < page_size or max_oid == last_oid:
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
