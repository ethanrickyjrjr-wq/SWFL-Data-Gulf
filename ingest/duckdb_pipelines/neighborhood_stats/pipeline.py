"""Runs aggregate_stats over data_lake.parcel_subdivision and upserts the result
into data_lake.neighborhood_stats (communities-swfl Phase 1 T4).

No DuckDB<->Postgres round-trip precedent in this repo (per SESSION_LOG
2026-07-06's T4 note) — reads and writes go straight through psycopg (the same
connection helper pulse_lake.py/tier1_inventory.py already use); the aggregation
itself runs in an in-memory DuckDB table fed from that read, so agg.py's tested
GROUP BY logic is reused unmodified.

Run with: python -m ingest.duckdb_pipelines.neighborhood_stats.pipeline [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import sys

import duckdb

from ingest.lib.tier1_inventory import _get_connection

from .agg import aggregate_stats

_SELECT = (
    "SELECT parcel_id, county, property_type, just_value, subdivision_name "
    "FROM data_lake.parcel_subdivision"
)

_UPSERT = """
    INSERT INTO data_lake.neighborhood_stats
        (county, subdivision_name, home_count, count_by_type, median_just_value, source_url, as_of, updated_at)
    VALUES
        (%(county)s, %(subdivision_name)s, %(home_count)s, %(count_by_type)s, %(median_just_value)s, %(source_url)s, %(as_of)s, now())
    ON CONFLICT (county, subdivision_name) DO UPDATE SET
        home_count = EXCLUDED.home_count,
        count_by_type = EXCLUDED.count_by_type,
        median_just_value = EXCLUDED.median_just_value,
        source_url = EXCLUDED.source_url,
        as_of = EXCLUDED.as_of,
        updated_at = now()
"""


def _load_parcel_subdivision_rows(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(_SELECT)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def _aggregate(rows: list[dict]) -> list[dict]:
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE parcel_subdivision(parcel_id TEXT, county TEXT, property_type TEXT, "
        "just_value DOUBLE, subdivision_name TEXT)"
    )
    if rows:
        con.executemany(
            "INSERT INTO parcel_subdivision VALUES (?, ?, ?, ?, ?)",
            [(r["parcel_id"], r["county"], r["property_type"], r["just_value"], r["subdivision_name"]) for r in rows],
        )
    return aggregate_stats(con)


def _upsert(conn, stats: list[dict]) -> None:
    with conn.cursor() as cur:
        for s in stats:
            cur.execute(_UPSERT, {**s, "count_by_type": json.dumps(s["count_by_type"])})
    conn.commit()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Aggregate parcel_subdivision -> neighborhood_stats.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read + aggregate only; print counts + sample; skip the neighborhood_stats write.",
    )
    args = parser.parse_args(argv)

    conn = _get_connection()
    try:
        rows = _load_parcel_subdivision_rows(conn)
        stats = _aggregate(rows)
        print(f"neighborhood_stats: {len(rows)} parcel rows -> {len(stats)} (county, subdivision) groups")
        if stats:
            print("sample:", stats[0])
        if args.dry_run:
            return 0
        _upsert(conn, stats)
        print(f"neighborhood_stats: upserted {len(stats)} rows")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
