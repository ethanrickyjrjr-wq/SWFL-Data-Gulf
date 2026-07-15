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


def test_alias_fold_collapses_two_raw_names_into_one_canonical_row():
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE parcel_subdivision(parcel_id TEXT, county TEXT, property_type TEXT, "
        "just_value DOUBLE, subdivision_name TEXT)"
    )
    con.execute("""INSERT INTO parcel_subdivision VALUES
        ('1','collier','condominium',300000,'HERITAGE BAY GOLF ESTATES'),
        ('2','collier','single-family',900000,'HERITAGE BAY GOLF ESTATES'),
        ('3','collier','single-family',500000,'HERITAGE BAY COUNTRY CLUB')""")
    alias_map = {
        "HERITAGE BAY GOLF ESTATES": "Heritage Bay",
        "HERITAGE BAY COUNTRY CLUB": "Heritage Bay",
    }
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con, alias_map)}
    assert ("collier", "HERITAGE BAY GOLF ESTATES") not in rows
    assert ("collier", "HERITAGE BAY COUNTRY CLUB") not in rows
    hb = rows[("collier", "Heritage Bay")]
    assert hb["home_count"] == 3
    # median of [300000, 900000, 500000] = 500000 -- computed over the FOLDED group,
    # never merged from two separate per-raw-name medians (which would be undefined).
    assert hb["median_just_value"] == 500000
    assert hb["count_by_type"]["single-family"] == 2
    assert hb["count_by_type"]["condominium"] == 1


def test_alias_fold_leaves_unresolved_names_grouped_by_their_raw_name():
    con = duckdb.connect()
    _seed(con)
    alias_map = {"HERITAGE BAY": "Heritage Bay"}  # LELY RESORT is not in the map
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con, alias_map)}
    assert ("collier", "Heritage Bay") in rows
    assert ("collier", "LELY RESORT") in rows  # unresolved name: falls back unchanged, no guess


def test_alias_fold_with_no_map_matches_pre_fix_behavior():
    con = duckdb.connect()
    _seed(con)
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con)}
    assert ("collier", "HERITAGE BAY") in rows  # default: no map -> raw name, unchanged


def test_alias_fold_against_the_real_shared_fixture():
    # Cross-subsystem check (advisor-caught): reads the SAME fixtures/community-aliases.json
    # lib/listings/community-lookup.ts's resolver reads, proving the Python ingest side and
    # the TS resolver side land on the identical canonical label for a known raw name --
    # the lockstep resolveCommunityStats() depends on to find what this pipeline lands.
    from ingest.lib.community_aliases import label_by_pattern

    con = duckdb.connect()
    _seed(con)
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con, label_by_pattern())}
    assert ("collier", "Heritage Bay") in rows
    assert rows[("collier", "Heritage Bay")]["home_count"] == 3
