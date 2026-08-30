"""Parcel→community spatial join — DuckDB `spatial`, inside the Python ingest island.

Reads two lake tables, writes one:
  data_lake.leepa_parcels (strap + latitude/longitude, Lee only)
    × data_lake.lee_planned_developments (WGS84 polygons)
    → data_lake.parcel_community_pd

Chosen over PostGIS (available 3.3.7 but NOT installed on the Brains database —
installing a production extension for a 564k × 490 problem is heavier than the
problem, RULE 11) and over hand-rolled TS ray-casting (lib/geo/ray-cast.ts exists
specifically so a third point-in-polygon implementation never gets written; DuckDB
means we write none at all).

The residential/Approved filter (assign.is_joinable) applies HERE at read — never at
ingest — and is recorded on every output row (assignment_criteria), so any number
this table produces is auditable back to its own criteria.

Scope: unincorporated Lee County only (see constants.py). Collier parcels hold no
coordinates in our lake and are reported as EXPLICITLY EXCLUDED, never silently
missing (failure mode 9).

Run:  python -m ingest.pipelines.lee_planned_developments.spatial_join [--dry-run]
"""

from __future__ import annotations

import argparse
import sys

from ingest.lib.guards import assert_min_rows

from .assign import is_joinable, resolve_matches
from .constants import TABLE_NAME


def open_spatial_connection():
    """In-memory DuckDB with the spatial extension loaded (duckdb 1.5.x)."""
    import duckdb

    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    return con


def joinable_polygons(polygons: list[dict]) -> list[dict]:
    """assign.is_joinable is the ONE filter authority — applied here, before load."""
    return [p for p in polygons if is_joinable(p)]


def load_polygons(con, polygons: list[dict]) -> None:
    con.execute(
        "CREATE TABLE pd_polys (objectid BIGINT, case_name VARCHAR, "
        "community_name_normalized VARCHAR, zoning_category VARCHAR, "
        "inputmethod VARCHAR, acres DOUBLE, geom GEOMETRY)"
    )
    if not polygons:
        return
    con.executemany(
        "INSERT INTO pd_polys VALUES (?, ?, ?, ?, ?, ?, ST_GeomFromGeoJSON(?))",
        [
            (
                p["objectid"],
                p["case_name"],
                p["community_name_normalized"],
                p["zoning_category"],
                p["inputmethod"],
                p["acres"],
                p["geometry"],
            )
            for p in polygons
        ],
    )


def load_parcels(con, parcels: list[tuple]) -> None:
    """`parcels` rows are (parcel_id, lon, lat) — GeoJSON axis order, [lon, lat],
    same discipline as lib/geo/ray-cast.ts. ST_Point(x, y) = ST_Point(lon, lat)."""
    con.execute("CREATE TABLE parcels (parcel_id VARCHAR, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO parcels VALUES (?, ?, ?)", parcels)
    con.execute(
        "CREATE TABLE parcel_pts AS "
        "SELECT parcel_id, ST_Point(lon, lat) AS geom FROM parcels"
    )


def containment_pairs(con) -> list[dict]:
    """Raw (parcel, polygon) containment matches. DuckDB's spatial-join optimizer
    builds the index; we write no point-in-polygon code."""
    cur = con.execute(
        "SELECT pt.parcel_id, p.objectid, p.community_name_normalized, p.case_name, "
        "p.zoning_category, p.inputmethod, p.acres "
        "FROM pd_polys p JOIN parcel_pts pt ON ST_Contains(p.geom, pt.geom)"
    )
    cols = ["parcel_id", "pd_object_id", "community_name_normalized", "case_name",
            "zoning_category", "inputmethod", "acres"]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


# ── Postgres I/O ───────────────────────────────────────────────────────────────


def _read_inputs(conn) -> tuple[list[tuple], list[dict], int]:
    """(parcels, polygons, collier_excluded_count) from the lake."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT strap, longitude, latitude FROM data_lake.leepa_parcels "
            "WHERE strap IS NOT NULL AND longitude IS NOT NULL AND latitude IS NOT NULL"
        )
        parcels = [(r[0], float(r[1]), float(r[2])) for r in cur.fetchall()]

        cur.execute(
            "SELECT objectid, case_name, community_name_normalized, zoning_category, "
            "ims_status, inputmethod, acres, geometry "
            f"FROM data_lake.{TABLE_NAME}"
        )
        cols = ["objectid", "case_name", "community_name_normalized", "zoning_category",
                "ims_status", "inputmethod", "acres", "geometry"]
        polygons = [dict(zip(cols, row)) for row in cur.fetchall()]

        # failure mode 9: Collier is EXPLICITLY excluded (no coordinates; Lee-only
        # boundary source) — report the count, never let it read as missing.
        cur.execute(
            "SELECT count(*) FROM data_lake.parcel_subdivision_v WHERE county = 'collier'"
        )
        (collier_count,) = cur.fetchone()
    return parcels, polygons, int(collier_count)


_ASSIGNMENT_COLUMNS: dict = {
    "parcel_id":                 {"data_type": "text", "nullable": False, "primary_key": True},
    "pd_object_id":              {"data_type": "bigint", "nullable": True},
    "community_name_normalized": {"data_type": "text", "nullable": False},
    "case_name_raw":             {"data_type": "text", "nullable": True},
    "zoning_category":           {"data_type": "text", "nullable": True},
    "input_method":              {"data_type": "text", "nullable": True},
    "acres":                     {"data_type": "double", "nullable": True},
    "ambiguous":                 {"data_type": "bool", "nullable": True},
    "assignment_criteria":       {"data_type": "text", "nullable": True},
    # timestamptz, not text — the freshness probe reads MAX(assigned_at) and its
    # date parser rejects strings (migrations/20260828_parcel_community_pd_assigned_at_timestamptz.sql).
    "assigned_at":               {"data_type": "timestamp", "nullable": True},
}


def _write_assignments(rows: list[dict], run_stamp: str, chunk_size: int = 5_000) -> None:
    """Chunked merge on parcel_id (replace on one big run blows the pooler — the
    leepa/FAF5 lesson), then a stale-sweep DELETE of rows an earlier run wrote for
    parcels that no longer match. Merge+sweep ≡ snapshot without a destructive
    replace window."""
    import secrets as _secrets

    import dlt

    total = len(rows)
    n_chunks = (total + chunk_size - 1) // chunk_size
    for i in range(0, total, chunk_size):
        chunk = rows[i : i + chunk_size]

        def _make_resource(_chunk=None):
            # dlt spec_from_signature rejects mutable defaults — close over `chunk`.
            @dlt.resource(
                table_name="parcel_community_pd",
                write_disposition="merge",
                primary_key="parcel_id",
                columns=_ASSIGNMENT_COLUMNS,
            )
            def parcel_community_rows():
                yield from chunk

            return parcel_community_rows

        pipeline = dlt.pipeline(
            pipeline_name=f"parcel_community_pd_{_secrets.token_hex(4)}",
            destination="postgres",
            dataset_name="data_lake",
        )
        load_info = pipeline.run(_make_resource()())
        load_info.raise_on_failed_jobs()
        print(f"  parcel_community_pd chunk {i // chunk_size + 1}/{n_chunks} ({len(chunk)} rows)")


def _sweep_stale_and_grant(conn, run_stamp: str) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('data_lake.parcel_community_pd')")
        if cur.fetchone()[0] is None:
            return 0
        cur.execute(
            "DELETE FROM data_lake.parcel_community_pd WHERE assigned_at < %s", (run_stamp,)
        )
        stale = cur.rowcount
        cur.execute("GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role")
        cur.execute("NOTIFY pgrst, 'reload schema'")
    conn.commit()
    return stale


def run(dry_run: bool = False) -> int:
    from ingest.lib.tier1_inventory import _get_connection

    conn = _get_connection()
    try:
        parcels, polygons, collier_count = _read_inputs(conn)
        print(f"parcels with coordinates: {len(parcels):,}")
        print(f"boundary features held: {len(polygons):,}")
        joinable = joinable_polygons(polygons)
        print(f"joinable (Approved + residential allowlist): {len(joinable):,}")
        print(f"collier parcels EXPLICITLY EXCLUDED (no coordinates; Lee-only source): "
              f"{collier_count:,}")

        if not parcels or not joinable:
            print("ABORT: nothing to join — parcels or joinable polygons empty.")
            return 1

        con = open_spatial_connection()
        load_polygons(con, joinable)
        load_parcels(con, parcels)
        pairs = containment_pairs(con)
        print(f"raw containment pairs: {len(pairs):,}")

        rows, metrics = resolve_matches(pairs)
        print(f"assigned: {metrics['assigned']:,} parcels · "
              f"ambiguous (cross-community, smallest-acres won): {metrics['ambiguous']:,}")

        # Fail-loud floors before any write. Zero matches = the lon/lat-swap /
        # projection signature (failure modes 2, 3) — never write an empty truth.
        # 1,000 is a first-run floor, deliberately conservative; raise it to ~90%
        # of the first measured run once that number exists.
        assert_min_rows(len(rows), 1_000, label="parcel_community_pd assignments")

        if dry_run:
            print("dry-run: skipping write. Sample:", rows[0] if rows else None)
            return 0

        run_stamp = rows[0]["assigned_at"]
        _write_assignments(rows, run_stamp)
        stale = _sweep_stale_and_grant(conn, run_stamp)
        print(f"stale rows swept: {stale:,} · grants refreshed")

        with conn.cursor() as cur:
            cur.execute("SELECT count(*), count(DISTINCT community_name_normalized) "
                        "FROM data_lake.parcel_community_pd")
            total, communities = cur.fetchone()
        print(f"LIVE: parcel_community_pd holds {total:,} assignments "
              f"across {communities:,} communities")
        return 0
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Parcel→community PD spatial join.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Read + join + report only; skip the write.")
    args = parser.parse_args(argv)
    return run(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
