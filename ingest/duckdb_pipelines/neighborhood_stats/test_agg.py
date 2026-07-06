"""No-network known-answer test for the neighborhood_stats aggregation
(communities-swfl Phase 1 T4 — name-join variant; grouped on (county,
subdivision_name), not a spatial subdivision_id)."""
import duckdb

from ingest.duckdb_pipelines.neighborhood_stats.agg import aggregate_stats


def _seed(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(
        "CREATE TABLE parcel_subdivision(parcel_id TEXT, county TEXT, property_type TEXT, "
        "just_value DOUBLE, subdivision_name TEXT)"
    )
    con.execute("""INSERT INTO parcel_subdivision VALUES
        ('1','collier','condominium',300000,'HERITAGE BAY'),
        ('2','collier','condominium',500000,'HERITAGE BAY'),
        ('3','collier','single-family',900000,'HERITAGE BAY'),
        ('4','collier','single-family',400000,'LELY RESORT')""")


def test_home_count_and_median_by_neighborhood():
    con = duckdb.connect()
    _seed(con)
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con)}
    hb = rows[("collier", "HERITAGE BAY")]
    assert hb["home_count"] == 3
    assert hb["median_just_value"] == 500000
    assert hb["count_by_type"]["condominium"] == 2
    assert hb["count_by_type"]["single-family"] == 1
    lely = rows[("collier", "LELY RESORT")]
    assert lely["home_count"] == 1
    assert lely["median_just_value"] == 400000


def test_every_row_carries_source_and_as_of():
    con = duckdb.connect()
    _seed(con)
    rows = aggregate_stats(con)
    for r in rows:
        assert r["source_url"] == "https://www.swfldatagulf.com/r/source/neighborhood_stats"
        assert r["as_of"]  # non-empty ISO date string


def test_blank_subdivision_name_still_aggregates():
    # A parcel whose S_LEGAL stemmed to "" (e.g. missing/garbage legal desc) must
    # still land in a bucket, not silently vanish from the count.
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE parcel_subdivision(parcel_id TEXT, county TEXT, property_type TEXT, "
        "just_value DOUBLE, subdivision_name TEXT)"
    )
    con.execute("INSERT INTO parcel_subdivision VALUES ('9','collier','single-family',100000,'')")
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con)}
    assert rows[("collier", "")]["home_count"] == 1
