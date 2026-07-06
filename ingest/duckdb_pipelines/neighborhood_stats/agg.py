"""Home count / count-by-type / median just-value per (county, subdivision_name)
— aggregate-at-source in DuckDB (communities-swfl Phase 1 T4, name-join variant).

Reads a `parcel_subdivision` table already loaded into the connection (the
pipeline glue loads it from `data_lake.parcel_subdivision` via the Postgres
attach; kept out of this pure function so it's testable with an in-memory
DuckDB table, no network/DB). Grouped on (county, subdivision_name) — the
name-join has no spatial subdivision_id, so that pair is the aggregation key.
"""
from __future__ import annotations

from datetime import date

import duckdb


def aggregate_stats(con: duckdb.DuckDBPyConnection) -> list[dict]:
    base = con.execute("""
        SELECT county, subdivision_name, COUNT(*) AS home_count,
               median(just_value) AS median_just_value
        FROM parcel_subdivision
        GROUP BY county, subdivision_name
    """).fetchall()
    by_type = con.execute("""
        SELECT county, subdivision_name, property_type, COUNT(*) AS n
        FROM parcel_subdivision
        GROUP BY county, subdivision_name, property_type
    """).fetchall()

    types: dict[tuple[str, str], dict[str, int]] = {}
    for county, name, ptype, n in by_type:
        types.setdefault((county, name), {})[ptype or "unknown"] = int(n)

    today = date.today().isoformat()
    out = []
    for county, name, home_count, median_just_value in base:
        out.append({
            "county": county,
            "subdivision_name": name,
            "home_count": int(home_count),
            "count_by_type": types.get((county, name), {}),
            "median_just_value": (float(median_just_value) if median_just_value is not None else None),
            "source_url": "https://www.swfldatagulf.com/r/source/neighborhood_stats",
            "as_of": today,
        })
    return out
