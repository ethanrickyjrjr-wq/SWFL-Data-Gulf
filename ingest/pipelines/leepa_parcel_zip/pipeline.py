"""Lee parcel -> ZIP crosswalk ingest (data_lake.leepa_parcel_zip).

Run with: python -m ingest.pipelines.leepa_parcel_zip.pipeline [--dry-run]

Derives each Lee parcel's site ZIP (G1: centroid, never a mailing ZIP): pull
parcel polygon geometry from LeePA ParcelInfo layer 12, take the outer-ring
centroid, and point-in-polygon it against the vendored TIGER ZCTA polygons. The
crosswalk (folioid -> zip_code) is what lets the sold-median view group LeePA's
already-live sale prices by ZIP.

Pagination note: LeePA L12 is ~548k parcels. Hosted ArcGIS resultOffset caps at
100k, so this keysets on OBJECTID (like collier_parcels) to fetch the full set —
a resultOffset paginator would silently truncate to the first 100k.
"""
from __future__ import annotations

import argparse
import json
import sys
import time

import requests

from ingest.lib.arcgis_paginator import arcgis_count
from ingest.lib.guards import assert_vs_canonical

from .constants import LEEPA_PARCEL_LAYER_URL, PAGE_SIZE, TIER2_COLUMNS, ZCTA_ASSET_PATH
from .spatial import assign_zip, ring_centroid


def _iter_l12_features(page_size: int = PAGE_SIZE):
    """Keyset pagination by OBJECTID over LeePA L12, geometry included.

    where=OBJECTID>last ordered ascending sidesteps the 100k resultOffset ceiling.
    Yields GeoJSON feature dicts ({properties, geometry})."""
    last_oid = -1
    while True:
        params = {
            "where": f"OBJECTID>{last_oid}",
            "outFields": "FOLIOID,OBJECTID",
            "orderByFields": "OBJECTID ASC",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
            "resultRecordCount": page_size,
        }
        data = None
        for attempt in range(3):
            try:
                resp = requests.get(LEEPA_PARCEL_LAYER_URL, params=params, timeout=120)
                if resp.status_code >= 500 and attempt < 2:
                    time.sleep(2**attempt)
                    continue
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2**attempt)

        features = data.get("features", []) if data else []
        if not features:
            break
        max_oid = last_oid
        for ft in features:
            oid = (ft.get("properties") or {}).get("OBJECTID")
            if isinstance(oid, int) and oid > max_oid:
                max_oid = oid
            yield ft
        # No forward progress or short page → done (guards an infinite loop).
        if len(features) < page_size or max_oid == last_oid:
            break
        last_oid = max_oid


def fetch_centroids(page_size: int = PAGE_SIZE) -> tuple[list[dict], int]:
    """Return ([{folioid, lon, lat}], n_features_seen). n_features_seen feeds the
    canonical volume guard (detects a truncated fetch); rows drop only parcels
    with no usable geometry/FOLIOID."""
    out: list[dict] = []
    seen = 0
    for ft in _iter_l12_features(page_size):
        seen += 1
        fid = (ft.get("properties") or {}).get("FOLIOID")
        c = ring_centroid(ft.get("geometry"))
        if fid and c:
            out.append({"folioid": str(fid), "lon": c[0], "lat": c[1]})
    return out, seen


def _make_resource(chunk: list[dict]):
    """Zero-arg dlt resource factory (closes over `chunk` to dodge dlt's
    mutable-default-arg spec error — same pattern as the collier loader)."""
    import dlt

    @dlt.resource(
        table_name="leepa_parcel_zip",
        write_disposition="merge",
        primary_key="folioid",
        columns=TIER2_COLUMNS,
    )
    def leepa_parcel_zip_rows():
        yield from chunk

    return leepa_parcel_zip_rows


def _promote_to_tier2(rows: list[dict], chunk_size: int = 5_000) -> None:
    """Chunked merge into data_lake.leepa_parcel_zip. Stable pipeline name so the
    freshness probe's schema_name resolves (per the collier loader's note)."""
    import dlt

    pipeline = dlt.pipeline(
        pipeline_name="leepa_parcel_zip",
        destination="postgres",
        dataset_name="data_lake",
    )
    total = len(rows)
    n_chunks = (total + chunk_size - 1) // chunk_size
    for i in range(0, total, chunk_size):
        chunk = rows[i : i + chunk_size]
        load_info = pipeline.run(_make_resource(chunk)())
        load_info.raise_on_failed_jobs()
        print(f"  leepa_parcel_zip chunk {i // chunk_size + 1}/{n_chunks} ({len(chunk)} rows)")


def _load_zcta() -> dict:
    with open(ZCTA_ASSET_PATH) as f:
        return json.load(f)


def ingest_leepa_parcel_zip() -> int:
    """Fetch L12 geometry, assign ZIPs, and merge the crosswalk into Tier 2."""
    canonical = arcgis_count(LEEPA_PARCEL_LAYER_URL)
    centroids, seen = fetch_centroids()
    if not centroids:
        print("leepa_parcel_zip: 0 centroids — aborting Tier 2 promotion")
        return 0
    assert_vs_canonical(seen, canonical, label="leepa L12 parcels")
    rows = assign_zip(centroids, _load_zcta())
    _promote_to_tier2(rows)
    matched = sum(1 for r in rows if r["zip_code"])
    print(
        f"leepa_parcel_zip: merged {len(rows)} rows "
        f"({matched}/{len(rows)} = {matched / len(rows):.1%} matched a ZCTA)"
    )
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Lee parcel -> ZIP crosswalk ingest.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch + assign only; print match rate; skip the dlt merge.",
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        canonical = arcgis_count(LEEPA_PARCEL_LAYER_URL)
        centroids, seen = fetch_centroids()
        print(f"leepa_parcel_zip dry-run: {seen} L12 features (server count {canonical})")
        if not centroids:
            print("  0 centroids computed — nothing to assign")
            return 0
        rows = assign_zip(centroids, _load_zcta())
        matched = sum(1 for r in rows if r["zip_code"])
        print(f"  {len(rows)} centroids; {matched}/{len(rows)} = {matched / len(rows):.1%} matched a ZCTA")
        print("  sample:", rows[0])
        return 0

    ingest_leepa_parcel_zip()
    return 0


if __name__ == "__main__":
    sys.exit(main())
