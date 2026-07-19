"""Home count / count-by-type / median just-value per (county, subdivision_name)
— aggregate-at-source in DuckDB (communities-swfl Phase 1 T4, name-join variant).

Reads a `parcel_subdivision` table already loaded into the connection (the
pipeline glue loads it from `data_lake.parcel_subdivision_v` via the Postgres
attach; kept out of this pure function so it's testable with an in-memory
DuckDB table, no network/DB). Grouped on (county, subdivision_name) — the
name-join has no spatial subdivision_id, so that pair is the aggregation key.
"""
from __future__ import annotations

from datetime import date

import duckdb


def aggregate_stats(
    con: duckdb.DuckDBPyConnection,
    alias_label_by_pattern: dict[str, str] | None = None,
) -> list[dict]:
    """Home count / count-by-type / median just-value per (county, subdivision_name)
    -- aggregate-at-source in DuckDB (communities-swfl Phase 1 T4, name-join variant).

    Reads a `parcel_subdivision` table already loaded into the connection (the
    pipeline glue loads it from `data_lake.parcel_subdivision_v` via the Postgres
    attach; kept out of this pure function so it's testable with an in-memory
    DuckDB table, no network/DB). Grouped on (county, subdivision_name) -- the
    name-join has no spatial subdivision_id, so that pair is the aggregation key.

    `alias_label_by_pattern` maps a stemmed raw subdivision_name -> its marketed
    community's canonical label (built from fixtures/community-aliases.json via
    ingest.lib.community_aliases.label_by_pattern() -- see pipeline.py). A raw
    name absent from the map keeps its own stemmed name, unchanged -- no guess,
    no invention, purely additive folding of names we hold real alias data for.

    THE FOLD RUNS IN SQL, BEFORE median() -- median_just_value is non-composable,
    so two raw names that alias to one community must be grouped together before
    the median is computed, never merged as a post-pass over two already-computed
    per-raw-name medians.
    """
    alias_label_by_pattern = alias_label_by_pattern or {}
    con.execute("DROP TABLE IF EXISTS _alias_map")
    con.execute("CREATE TEMP TABLE _alias_map(raw_name TEXT, canonical_label TEXT)")
    if alias_label_by_pattern:
        con.executemany(
            "INSERT INTO _alias_map VALUES (?, ?)",
            list(alias_label_by_pattern.items()),
        )
    con.execute("DROP TABLE IF EXISTS _resolved")
    con.execute("""
        CREATE TEMP TABLE _resolved AS
        SELECT p.*, COALESCE(a.canonical_label, p.subdivision_name) AS resolved_name
        FROM parcel_subdivision p
        LEFT JOIN _alias_map a ON a.raw_name = p.subdivision_name
    """)
    base = con.execute("""
        SELECT county, resolved_name, COUNT(*) AS home_count,
               median(just_value) AS median_just_value,
               median(NULLIF(actual_year_built, 0)) AS median_year_built
        FROM _resolved
        GROUP BY county, resolved_name
    """).fetchall()
    by_type = con.execute("""
        SELECT county, resolved_name, property_type, COUNT(*) AS n
        FROM _resolved
        GROUP BY county, resolved_name, property_type
    """).fetchall()
    con.execute("DROP TABLE _resolved")
    con.execute("DROP TABLE _alias_map")

    types: dict[tuple[str, str], dict[str, int]] = {}
    for county, name, ptype, n in by_type:
        types.setdefault((county, name), {})[ptype or "unknown"] = int(n)

    today = date.today().isoformat()
    out = []
    for county, name, home_count, median_just_value, median_year_built in base:
        out.append({
            "county": county,
            "subdivision_name": name,
            "home_count": int(home_count),
            "count_by_type": types.get((county, name), {}),
            "median_just_value": (float(median_just_value) if median_just_value is not None else None),
            # FDOR stamps 0/NULL on unbuilt parcels — NULLIF keeps them out of the
            # median; an all-vacant group therefore reads None, never a fake year.
            "median_year_built": (int(round(float(median_year_built))) if median_year_built is not None else None),
            "source_url": "https://www.swfldatagulf.com/r/source/neighborhood_stats",
            "as_of": today,
        })
    return out
