from datetime import date

import dlt

from ingest.lib.arcgis_paginator import (
    arcgis_count,
    paginate_arcgis,
    paginate_arcgis_keyset,
    paginate_arcgis_tabular,
)
from ingest.lib.coercion import coerce_date as _coerce_esri_date, coerce_float as _coerce_float
from ingest.lib.guards import FillRateCollapseError, assert_vs_canonical
from ingest.lib.storage_uploader import upload_csv_gz, upload_geojson_gz
from ingest.lib.tier1_inventory import upsert_inventory_row
from ingest.lib.zcta_assign import zip_by_folio as _zip_by_folio
from .constants import (
    LEEPA_FABRIC_PARCELS_URL,
    LEEPA_JUST_VALUE_URL,
    LEEPA_LAST_SALE_URL,
    LEEPA_PARCELS_URL,
    LEEPA_USE_CODES_URL,
    TABULAR_BUCKET,
)


def ingest_leepa_parcels(pipeline) -> None:
    today = date.today().isoformat()
    features = list(paginate_arcgis(LEEPA_PARCELS_URL))
    object_path = f"leepa/parcels/{today}.geojson.gz"
    upload_geojson_gz(TABULAR_BUCKET, object_path, features)
    upsert_inventory_row(
        bucket=TABULAR_BUCKET, path=object_path, vintage=today,
        byte_size=None, pack_id="properties-lee-value", source_url=LEEPA_PARCELS_URL,
    )


# Tier 2 column hints — pin the 19-column joined parcel row to explicit dlt types so the
# Postgres table schema is stable across re-ingests. FOLIOID is the parcel key (PK).
_TIER2_LEEPA_COLUMNS: dict = {
    "folioid":              {"data_type": "text",   "nullable": False, "primary_key": True},
    # Lee STRAP (= FDOR lee_parcels.parcel_id form) via the ParcelsWFS FabricParcels
    # Name<->FolioID crosswalk — the parcel-grain join key to the FDOR state roll.
    "strap":                {"data_type": "text",   "nullable": True},
    # The parcel's own point coordinates (FabricParcels Latitude/Longitude — situs
    # geometry, WGS84). Rides the same fabric pull as strap; the input the
    # parcel→community PD spatial join needs (community crosswalk Piece 1, spec
    # docs/superpowers/specs/2026-08-12-community-crosswalk-design.md). Snapshot
    # semantics unchanged: merge on folioid, same as every other fabric-attached
    # column. NOT the owner-mailing Address* fields — those stay banned (G1).
    "latitude":             {"data_type": "double", "nullable": True},
    "longitude":            {"data_type": "double", "nullable": True},
    # Site ZIP (G1: derived from the parcel's own centroid, never a mailing ZIP).
    # An attribute OF the parcel, so it lives on the parcel row — not in a
    # separate 1:1 crosswalk table. Comes free from the L12 pass we already make.
    "zip_code":             {"data_type": "text",   "nullable": True},
    "just_value":           {"data_type": "double", "nullable": True},
    "market_value":         {"data_type": "double", "nullable": True},
    "assessed_value":       {"data_type": "double", "nullable": True},
    "taxable_value":        {"data_type": "double", "nullable": True},
    "soh_cap":              {"data_type": "double", "nullable": True},
    "building_value":       {"data_type": "double", "nullable": True},
    "land_value":           {"data_type": "double", "nullable": True},
    "cap_difference":       {"data_type": "double", "nullable": True},
    "use_code":             {"data_type": "text",   "nullable": True},
    "use_description":      {"data_type": "text",   "nullable": True},
    "last_sale_amount":     {"data_type": "double", "nullable": True},
    "last_sale_date":       {"data_type": "date",   "nullable": True},
    "last_sale_instrument": {"data_type": "text",   "nullable": True},
    "last_sale_book_page":  {"data_type": "text",   "nullable": True},
}



def _join_leepa(
    use_rows: list[dict],
    value_rows: list[dict],
    sale_rows: list[dict],
    zip_by_folio: dict[str, str | None] | None = None,
    fabric_by_folio: dict[str, dict] | None = None,
) -> list[dict]:
    """Left-join three layers on FOLIOID with the value layer as the spine (canonical parcel set).

    `zip_by_folio` (folioid -> site ZIP, derived from the L12 geometry in the same
    pass) is attached as a column. Absent/None => zip_code stays NULL; never invented.
    `fabric_by_folio` (folioid -> {strap, latitude, longitude} from the FabricParcels
    crosswalk) is attached the same way — absent/None => all three stay NULL, never
    invented. strap/lat/lon always come from ONE fabric row (the min-Name winner),
    never mixed across rows.
    """
    use_by_folio = {r.get("FOLIOID"): r for r in use_rows if r.get("FOLIOID")}
    sale_by_folio = {r.get("FOLIOID"): r for r in sale_rows if r.get("FOLIOID")}
    zips = zip_by_folio or {}
    fabric = fabric_by_folio or {}
    joined: list[dict] = []
    for v in value_rows:
        folio = v.get("FOLIOID")
        if not folio:
            continue
        u = use_by_folio.get(folio) or {}
        s = sale_by_folio.get(folio) or {}
        fb = fabric.get(str(folio)) or {}
        joined.append({
            "folioid":              folio,
            "strap":                fb.get("strap"),
            "latitude":             fb.get("latitude"),
            "longitude":            fb.get("longitude"),
            "zip_code":             zips.get(str(folio)),
            "just_value":           _coerce_float(v.get("Just")),
            "market_value":         _coerce_float(v.get("Market")),
            "assessed_value":       _coerce_float(v.get("Assessed")),
            "taxable_value":        _coerce_float(v.get("Taxable")),
            "soh_cap":              _coerce_float(v.get("SOHCap")),
            "building_value":       _coerce_float(v.get("Building")),
            "land_value":           _coerce_float(v.get("Land")),
            "cap_difference":       _coerce_float(v.get("CapDifference")),
            "use_code":             u.get("Code"),
            "use_description":      u.get("Description"),
            "last_sale_amount":     _coerce_float(s.get("Amount")),
            "last_sale_date":       _coerce_esri_date(s.get("DoS")),
            "last_sale_instrument": s.get("Instrument"),
            "last_sale_book_page":  s.get("ORBookPage"),
        })
    return joined


def _stored_strap_count() -> int:
    """Non-null strap count currently stored in data_lake.leepa_parcels — the value
    at risk if a fabric-failed run merges NULLs. Defensive: any error (table absent,
    no creds) returns 0, which keeps the bootstrap degrade path open."""
    try:
        from ingest.lib.tier1_inventory import _get_connection

        conn = _get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT count(strap) FROM data_lake.leepa_parcels")
                return int(cur.fetchone()[0])
        finally:
            conn.close()
    except Exception:  # noqa: BLE001 — absence of evidence keeps the degrade path
        return 0


def _coerce_coord(v) -> float | None:
    # 0.0 can never be a real Lee coordinate (lat ~26, lon ~-81); a (0,0) point is
    # the null-island artifact shape — store absent, never a fake location.
    f = _coerce_float(v)
    return f if f not in (None, 0.0) else None


def _fetch_fabric_by_folio() -> dict[str, dict]:
    """FabricParcels {strap, latitude, longitude} keyed by str(FolioID).

    Keyset-paginated — the offset walk silently truncates on this host (the L12
    40,000-row lesson). The fabric carries ~15.5k artifact rows beyond the parcel
    set, so dedupe to one row per folio (deterministic min(Name)); latitude/longitude
    come from that SAME winning row, never mixed across rows (a losing artifact row's
    point must not be attached to the winning strap). A short pull raises via
    assert_vs_canonical so the caller's degrade path (all three stay NULL) takes over
    instead of half-attaching a truncated map.

    Latitude/Longitude are the parcel's OWN point coordinates (situs geometry, WGS84)
    — community crosswalk Piece 1. The owner-mailing Address* fields stay banned (G1).
    """
    fabric: dict[str, dict] = {}
    fetched = 0
    for feature in paginate_arcgis_keyset(
        LEEPA_FABRIC_PARCELS_URL,
        out_fields="Name,FolioID,Latitude,Longitude",
        page_size=1000,
        geometry=False,
    ):
        fetched += 1
        attrs = feature.get("attributes") or {}
        folio, name = attrs.get("FolioID"), attrs.get("Name")
        if folio is None or not name:
            continue
        key = str(folio)
        if key not in fabric or name < fabric[key]["strap"]:
            fabric[key] = {
                "strap": name,
                "latitude": _coerce_coord(attrs.get("Latitude")),
                "longitude": _coerce_coord(attrs.get("Longitude")),
            }
    canonical = arcgis_count(LEEPA_FABRIC_PARCELS_URL)
    assert_vs_canonical(fetched, canonical, label="leepa fabric strap")
    return fabric


def _make_leepa_resource(chunk: list[dict]):
    """Factory that wraps a chunk in a dlt resource with zero parameters.

    dlt's spec_from_signature converts function args into a dataclass — mutable
    list defaults (_c=chunk) trigger a ValueError. Closing over `chunk` from an
    outer function scope avoids the issue because the resource has no params at all.
    """
    @dlt.resource(
        table_name="leepa_parcels",
        write_disposition="merge",
        primary_key="folioid",
        columns=_TIER2_LEEPA_COLUMNS,
    )
    def leepa_rows():
        yield from chunk
    return leepa_rows


def _promote_leepa_to_tier2(rows: list[dict], chunk_size: int = 5_000) -> None:
    """Write joined LeePA parcel rows to data_lake.leepa_parcels in chunked merge batches.

    replace disposition on 200k rows blows the Supabase pooler (same issue as FAF5).
    merge + 5k chunks keeps each dlt run well under the connection timeout.
    """
    import secrets as _secrets

    total = len(rows)
    n_chunks = (total + chunk_size - 1) // chunk_size
    for i in range(0, total, chunk_size):
        chunk = rows[i : i + chunk_size]
        pipeline = dlt.pipeline(
            pipeline_name=f"leepa_t2_{_secrets.token_hex(4)}",
            destination="postgres",
            dataset_name="data_lake",
        )
        load_info = pipeline.run(_make_leepa_resource(chunk)())
        load_info.raise_on_failed_jobs()
        print(f"  leepa_parcels chunk {i // chunk_size + 1}/{n_chunks} ({len(chunk)} rows)")


def ingest_leepa_parcels_value(tier1_pipeline) -> None:
    """Pull layers 9/10/12 (use codes, last qualified sale, just value) plus the
    ParcelsWFS FabricParcels strap crosswalk, archive each as Tier 1 CSV.gz with
    pointer rows, then join on FOLIOID and promote to data_lake.leepa_parcels.
    Layers 13/14/15 are intentionally skipped — their fields are identical to
    layer 12, only their choropleth styling differs.

    Layer 12 (the parcel spine) is pulled WITH geometry: one geojson request returns
    the value attributes AND the polygon, so the site ZIP is derived from the parcel's
    own centroid in the pass we already make — no second pagination over the same
    548k parcels, and no 1:1 crosswalk table (zip_code is an attribute of the parcel).
    """
    today = date.today().isoformat()

    # Spine: L12 with geometry -> attributes (properties) + polygon in one pass.
    # KEYSET on OBJECTID, not resultOffset: the offset walk silently truncated this
    # layer at 40,000 of ~548k (the server stops reporting exceededTransferLimit).
    features = list(paginate_arcgis_keyset(LEEPA_JUST_VALUE_URL))
    if not features:
        print("leepa just_value: 0 features — aborting Tier 2 promotion")
        return
    value_rows = [ft.get("properties") or {} for ft in features]

    # Site ZIP from each parcel's own centroid (G1). Failure here must not sink the
    # parcel ingest — zip_code simply stays NULL and the sold-median view reports less.
    try:
        zip_map = _zip_by_folio(features)
        matched = sum(1 for z in zip_map.values() if z)
        print(f"leepa zip_code: {matched}/{len(zip_map)} parcels matched a ZCTA")
    except Exception as exc:  # noqa: BLE001 — degrade, never abort the parcel ingest
        print(f"leepa zip_code: spatial assign failed ({exc}) — zip_code will be NULL this run")
        zip_map = {}

    pulled: dict[str, list[dict]] = {"just_value": value_rows}
    for name, url in (("use_codes", LEEPA_USE_CODES_URL), ("last_sale", LEEPA_LAST_SALE_URL)):
        rows = list(paginate_arcgis_tabular(url))
        if not rows:
            print(f"leepa {name}: 0 rows — aborting Tier 2 promotion")
            return
        pulled[name] = rows

    for name in ("just_value", "use_codes", "last_sale"):
        rows = pulled[name]
        url = {
            "just_value": LEEPA_JUST_VALUE_URL,
            "use_codes": LEEPA_USE_CODES_URL,
            "last_sale": LEEPA_LAST_SALE_URL,
        }[name]
        object_path = f"leepa/{name}/{today}.csv.gz"
        upload_csv_gz(TABULAR_BUCKET, object_path, rows, list(rows[0].keys()))
        upsert_inventory_row(
            bucket=TABULAR_BUCKET, path=object_path, vintage=today,
            byte_size=None, pack_id="properties-lee-value", source_url=url,
        )

    canonical = arcgis_count(LEEPA_JUST_VALUE_URL)
    assert_vs_canonical(len(pulled["just_value"]), canonical, label="leepa just_value")

    # STRAP + parcel-point crosswalk (ParcelsWFS FabricParcels Name<->FolioID +
    # Latitude/Longitude) — the parcel-grain key into the FDOR state roll
    # (data_lake.lee_parcels.parcel_id) and the coordinate input the community
    # spatial join reads. A FETCH failure must not sink the parcel ingest at
    # BOOTSTRAP (no stored fabric values yet: NULLs lose nothing) — but once the
    # table holds fabric values, the dlt merge below is delete+insert on folioid,
    # so promoting NULL strap/lat/lon would ERASE ~547k stored values with every
    # volume guard green (the listing_lifecycle 34,139-row clobber shape). In that
    # state the run fails LOUD instead; scripts/backfill_leepa_strap.py /
    # backfill_leepa_parcel_coords.py re-attach out-of-band.
    try:
        strap_map = _fetch_fabric_by_folio()
        print(f"leepa strap: {len(strap_map)} folio->fabric rows fetched")
    except Exception as exc:  # noqa: BLE001 — degrade decided against STORED state below
        stored = _stored_strap_count()
        if stored > 0:
            raise FillRateCollapseError(
                f"leepa fabric crosswalk failed ({exc}) while data_lake.leepa_parcels "
                f"already holds {stored:,} strap values — the merge would overwrite "
                "them all with NULL. Aborting pre-merge; re-run or backfill out-of-band."
            ) from exc
        print(f"leepa strap: fabric crosswalk failed ({exc}) — strap will be NULL this run "
              "(bootstrap: no stored values at risk)")
        strap_map = {}
    if strap_map:
        try:
            strap_rows = [
                {"folioid": k, "strap": v["strap"],
                 "latitude": v["latitude"], "longitude": v["longitude"]}
                for k, v in sorted(strap_map.items())
            ]
            object_path = f"leepa/fabric_strap/{today}.csv.gz"
            upload_csv_gz(TABULAR_BUCKET, object_path, strap_rows,
                          ["folioid", "strap", "latitude", "longitude"])
            upsert_inventory_row(
                bucket=TABULAR_BUCKET, path=object_path, vintage=today,
                byte_size=None, pack_id="properties-lee-value",
                source_url=LEEPA_FABRIC_PARCELS_URL,
            )
        except Exception as exc:  # noqa: BLE001 — archive is best-effort; attach proceeds
            print(f"leepa strap: Tier-1 archive failed ({exc}) — continuing with attach")

    joined = _join_leepa(
        pulled["use_codes"], pulled["just_value"], pulled["last_sale"], zip_map, strap_map
    )
    if not joined:
        return
    _promote_leepa_to_tier2(joined)
