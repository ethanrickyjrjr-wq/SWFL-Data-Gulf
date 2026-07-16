"""aggregate_stats — median_year_built rollup (piece (a) of check ingest_parcel_year_built_join).

In-memory DuckDB only (mirrors pipeline.py's _aggregate table shape) — no network, no lake.
"""
import duckdb

from ingest.duckdb_pipelines.neighborhood_stats.agg import aggregate_stats


def _con(rows):
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE parcel_subdivision(parcel_id TEXT, county TEXT, property_type TEXT, "
        "just_value DOUBLE, subdivision_name TEXT, actual_year_built BIGINT)"
    )
    con.executemany("INSERT INTO parcel_subdivision VALUES (?, ?, ?, ?, ?, ?)", rows)
    return con


def test_median_year_built_ignores_zero_and_null():
    """FDOR stamps 0/NULL on unbuilt parcels — neither may drag the median toward year 0."""
    con = _con([
        ("1", "lee", "single_family", 100000.0, "PALMONA PARK", 1987),
        ("2", "lee", "single_family", 120000.0, "PALMONA PARK", 1989),
        ("3", "lee", "vacant", 20000.0, "PALMONA PARK", 0),
        ("4", "lee", "single_family", 110000.0, "PALMONA PARK", None),
    ])
    (row,) = aggregate_stats(con)
    assert row["median_year_built"] == 1988
    assert row["home_count"] == 4  # the count still covers every parcel, built or not


def test_all_vacant_group_has_no_year():
    """An all-vacant/unknown group reads None — a gap, never a fabricated year."""
    con = _con([
        ("1", "lee", "vacant", 20000.0, "X", 0),
        ("2", "lee", "vacant", 21000.0, "X", None),
    ])
    (row,) = aggregate_stats(con)
    assert row["median_year_built"] is None
    assert row["median_just_value"] == 20500.0


def test_alias_fold_groups_before_year_median():
    """median_year_built folds under the canonical label the same way median_just_value does."""
    con = _con([
        ("1", "lee", "single_family", 100000.0, "RAW A", 1980),
        ("2", "lee", "single_family", 100000.0, "RAW B", 2000),
    ])
    (row,) = aggregate_stats(con, {"RAW A": "CANON", "RAW B": "CANON"})
    assert row["subdivision_name"] == "CANON"
    assert row["median_year_built"] == 1990
