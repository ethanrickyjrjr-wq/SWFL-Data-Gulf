"""Runs aggregate_stats over data_lake.parcel_subdivision_v and upserts the result
into data_lake.neighborhood_stats (communities-swfl Phase 1 T4).

parcel_subdivision_v is the two-county homes-only VIEW over lee_parcels +
collier_parcels (migrations/20260719_parcel_subdivision_v.sql) that replaced the
retired data_lake.parcel_subdivision table — same column names, so only this
read target changed (docs/handoff/2026-07-18-parcel-consolidation.md §4).

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

from ingest.lib.community_aliases import label_by_pattern
from ingest.lib.guards import assert_min_rows
from ingest.lib.tier1_inventory import _get_connection

from .agg import aggregate_stats

_SELECT = (
    "SELECT parcel_id, county, property_type, just_value, subdivision_name, actual_year_built "
    "FROM data_lake.parcel_subdivision_v"
)

_DELETE_ALL = "DELETE FROM data_lake.neighborhood_stats"

_INSERT = """
    INSERT INTO data_lake.neighborhood_stats
        (county, subdivision_name, home_count, count_by_type, median_just_value, median_year_built, source_url, as_of, updated_at)
    VALUES
        (%(county)s, %(subdivision_name)s, %(home_count)s, %(count_by_type)s, %(median_just_value)s, %(median_year_built)s, %(source_url)s, %(as_of)s, now())
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
        "just_value DOUBLE, subdivision_name TEXT, actual_year_built BIGINT)"
    )
    if rows:
        con.executemany(
            "INSERT INTO parcel_subdivision VALUES (?, ?, ?, ?, ?, ?)",
            [(r["parcel_id"], r["county"], r["property_type"], r["just_value"], r["subdivision_name"],
              r["actual_year_built"]) for r in rows],
        )
    return aggregate_stats(con, label_by_pattern())


def _replace_all(conn, stats: list[dict]) -> None:
    # FULL REPLACE, NOT UPSERT (07/15/2026) -- this pipeline recomputes the COMPLETE set
    # every run from a full data_lake.parcel_subdivision scan (no incremental read), so a
    # plain upsert on (county, subdivision_name) would ORPHAN any row whose key changed
    # since the last run -- e.g. an alias fold that newly collapses two raw names under one
    # canonical label leaves the OLD raw-keyed row sitting alongside the new one, double-
    # counting those homes. Guarded by assert_min_rows so a near-empty `stats` (a broken
    # run) aborts loud before wiping the table -- see ingest/lib/guards.py.
    assert_min_rows(len(stats), 1, "neighborhood_stats")
    with conn.cursor() as cur:
        cur.execute(_DELETE_ALL)
        for s in stats:
            cur.execute(_INSERT, {**s, "count_by_type": json.dumps(s["count_by_type"])})
    conn.commit()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Aggregate parcel_subdivision -> neighborhood_stats.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read + aggregate only; print counts + sample; skip the neighborhood_stats write.",
    )
    args = parser.parse_args(argv)

    # ONE CONNECTION PER PHASE, NOT ONE FOR THE WHOLE RUN (07/20/2026).
    # The read hauls ~604k rows, then _aggregate spends MINUTES in in-memory DuckDB while the
    # Postgres connection sits idle. Holding it across that gap is what killed run 29719097092:
    # the aggregation printed its result fine, then the very next statement -- the DELETE that
    # opens the write -- died with `SSL error: unexpected eof while reading`. The transaction
    # rolled back, so the table survived intact; the run was still a total loss.
    # So: release the read connection BEFORE the aggregation, and open a fresh one for the
    # write. _get_connection() already returns a new connection per call.
    conn = _get_connection()
    try:
        rows = _load_parcel_subdivision_rows(conn)
    finally:
        conn.close()

    stats = _aggregate(rows)
    print(f"neighborhood_stats: {len(rows)} parcel rows -> {len(stats)} (county, subdivision) groups")
    if stats:
        print("sample:", stats[0])
    if args.dry_run:
        return 0

    conn = _get_connection()
    try:
        _replace_all(conn, stats)
        print(f"neighborhood_stats: replaced with {len(stats)} rows")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
