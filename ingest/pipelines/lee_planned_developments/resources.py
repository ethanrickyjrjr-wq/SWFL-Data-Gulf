"""Fetch + land Lee Planned Development boundaries → data_lake.lee_planned_developments.

ALL features land (1,629 measured 08/28/2026) — full-scope-first: a Pending polygon
becomes Approved next quarter, and filtering at ingest would silently rewrite
history. The residential/Approved filter applies at READ, in spatial_join.py, where
it is auditable.

Geometry arrives WGS84 because paginate_arcgis_keyset requests outSR=4326 — the
SERVER reprojects from State Plane feet (wkid 2237); no client-side pyproj. A bounds
assertion in normalize.py still verifies every vertex (failure mode 3: fail loud,
never write).

Write disposition: MERGE on objectid — the snapshot is small (~1.6k rows) and merge
keeps re-runs idempotent with no destructive replace window (Gate 4). Features
deleted upstream would linger; the layer has only ever grown (1,627 → 1,629 between
08/12 and 08/28/2026) and a quarterly re-run re-stamps everything else.
"""

from __future__ import annotations

from datetime import date

import dlt

from ingest.lib.arcgis_paginator import arcgis_count, paginate_arcgis_keyset
from ingest.lib.guards import VolumeGuardError, assert_vs_canonical
from ingest.lib.storage_uploader import upload_geojson_gz
from ingest.lib.tier1_inventory import upsert_inventory_row

from .constants import LEE_PD_FEATURESERVER_URL, TABLE_NAME, TABULAR_BUCKET
from .normalize import normalize_feature

_PD_COLUMNS: dict = {
    "objectid":                  {"data_type": "bigint", "nullable": False, "primary_key": True},
    "case_name":                 {"data_type": "text", "nullable": False},
    "community_name_normalized": {"data_type": "text", "nullable": False},
    "zoning_category":           {"data_type": "text", "nullable": True},
    "ims_status":                {"data_type": "text", "nullable": True},
    "inputmethod":               {"data_type": "text", "nullable": True},
    "acres":                     {"data_type": "double", "nullable": True},
    "initialapproval":           {"data_type": "date", "nullable": True},
    "master_no":                 {"data_type": "text", "nullable": True},
    "pc_id":                     {"data_type": "text", "nullable": True},
    "last_edited_date":          {"data_type": "date", "nullable": True},
    "geometry":                  {"data_type": "text", "nullable": False},  # GeoJSON, WGS84
}

_OUT_FIELDS = (
    "OBJECTID,CASE_NAME,ZONING_CATEGORY,IMS_STATUS,INPUTMETHOD,ACRES,"
    "INITIALAPPROVAL,MASTER_NO,PC_ID,last_edited_date"
)


def fetch_and_normalize() -> tuple[list[dict], list[dict], int]:
    """(rows, raw_features, dropped_count). Raises on truncation or bad geometry."""
    features = list(
        paginate_arcgis_keyset(
            LEE_PD_FEATURESERVER_URL,
            out_fields=_OUT_FIELDS,
            page_size=2000,  # the layer's maxRecordCount
            geometry=True,
        )
    )
    canonical = arcgis_count(LEE_PD_FEATURESERVER_URL)
    assert_vs_canonical(len(features), canonical, label="lee_planned_developments")

    rows: list[dict] = []
    dropped = 0
    for ft in features:
        row = normalize_feature(ft)  # BoundsViolation propagates — loud, no write
        if row is None:
            dropped += 1  # failure mode 8: empty name / missing geometry — counted
            continue
        rows.append(row)

    # 2 empty CASE_NAMEs measured of 1,629 (08/28/2026). A drop share past 2% means
    # the feed changed shape, not a couple of blank rows.
    if features and dropped > max(2, int(0.02 * len(features))):
        raise VolumeGuardError(
            f"lee_planned_developments: {dropped} of {len(features)} features dropped "
            "at normalize — over the 2% floor; refusing to write a hollowed snapshot."
        )
    return rows, features, dropped


def archive_tier1(features: list[dict]) -> None:
    today = date.today().isoformat()
    object_path = f"lee_planned_developments/{today}.geojson.gz"
    upload_geojson_gz(TABULAR_BUCKET, object_path, features)
    upsert_inventory_row(
        bucket=TABULAR_BUCKET, path=object_path, vintage=today,
        byte_size=None, pack_id="communities-swfl", source_url=LEE_PD_FEATURESERVER_URL,
    )


def promote_to_tier2(rows: list[dict]) -> None:
    @dlt.resource(
        table_name=TABLE_NAME,
        write_disposition="merge",
        primary_key="objectid",
        columns=_PD_COLUMNS,
    )
    def pd_rows():
        yield from rows

    pipeline = dlt.pipeline(
        pipeline_name="lee_planned_developments",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(pd_rows())
    load_info.raise_on_failed_jobs()


def grant_and_reload() -> None:
    """Ingest convention: after table creation, refresh grants + PostgREST cache."""
    from ingest.lib.tier1_inventory import _get_connection

    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role")
            cur.execute("NOTIFY pgrst, 'reload schema'")
        conn.commit()
    finally:
        conn.close()
