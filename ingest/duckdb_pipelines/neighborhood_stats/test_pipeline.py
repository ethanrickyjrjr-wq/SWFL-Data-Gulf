"""No-network tests for the neighborhood_stats driver — the Postgres<->DuckDB
glue that agg.py's own tests (test_agg.py) deliberately leave untested (SESSION_LOG
2026-07-06: 'the Postgres->DuckDB read glue... no precedent in this repo')."""
from unittest.mock import MagicMock, call

from ingest.duckdb_pipelines.neighborhood_stats.pipeline import (
    _aggregate,
    _load_parcel_subdivision_rows,
    _replace_all,
)


def test_aggregate_feeds_rows_through_the_real_agg_function():
    """_aggregate must produce the SAME shape aggregate_stats does directly —
    proves the psycopg-row -> in-memory-DuckDB-table glue doesn't drop or
    mangle a column agg.py relies on. Also exercises the real alias fold wired
    in this task -- HERITAGE BAY resolves to its canonical label "Heritage Bay"
    via the real fixtures/community-aliases.json, proving the full glue+fold
    path works end to end, not just agg.py's own unit tests."""
    rows = [
        {"parcel_id": "1", "county": "collier", "property_type": "condominium",
         "just_value": 300000.0, "subdivision_name": "HERITAGE BAY"},
        {"parcel_id": "2", "county": "collier", "property_type": "single-family",
         "just_value": 900000.0, "subdivision_name": "HERITAGE BAY"},
        {"parcel_id": "3", "county": "lee", "property_type": "single-family",
         "just_value": 400000.0, "subdivision_name": "CAPE CORAL UNIT 82"},
    ]
    stats = {(s["county"], s["subdivision_name"]): s for s in _aggregate(rows)}
    hb = stats[("collier", "Heritage Bay")]  # alias-folded canonical label, not the raw "HERITAGE BAY"
    assert hb["home_count"] == 2
    assert hb["median_just_value"] == 600000.0
    cc = stats[("lee", "CAPE CORAL UNIT 82")]  # not in the alias fixture -- raw name unchanged
    assert cc["home_count"] == 1


def test_aggregate_handles_zero_rows():
    assert _aggregate([]) == []


def test_load_parcel_subdivision_rows_maps_cursor_to_dicts():
    conn = MagicMock()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.description = [("parcel_id",), ("county",), ("property_type",), ("just_value",), ("subdivision_name",)]
    cur.fetchall.return_value = [("1", "lee", "single-family", 400000.0, "CAPE CORAL UNIT 82")]

    rows = _load_parcel_subdivision_rows(conn)

    assert rows == [{
        "parcel_id": "1", "county": "lee", "property_type": "single-family",
        "just_value": 400000.0, "subdivision_name": "CAPE CORAL UNIT 82",
    }]


def test_replace_all_deletes_then_writes_one_row_per_stat_and_commits():
    conn = MagicMock()
    cur = conn.cursor.return_value.__enter__.return_value
    stats = [
        {"county": "lee", "subdivision_name": "CAPE CORAL UNIT 82", "home_count": 1,
         "count_by_type": {"single-family": 1}, "median_just_value": 400000.0,
         "source_url": "https://www.swfldatagulf.com/r/source/neighborhood_stats", "as_of": "2026-07-14"},
    ]

    _replace_all(conn, stats)

    assert cur.execute.call_count == 2  # DELETE FROM ... then one INSERT per stat row
    delete_args, _ = cur.execute.call_args_list[0]
    assert "DELETE FROM data_lake.neighborhood_stats" in delete_args[0]
    insert_args, _ = cur.execute.call_args_list[1]
    params = insert_args[1]
    assert params["county"] == "lee"
    assert params["home_count"] == 1
    assert params["count_by_type"] == '{"single-family": 1}'  # jsonb param must be a JSON string, not a dict
    conn.commit.assert_called_once()


def test_replace_all_aborts_before_delete_when_stats_is_empty():
    import pytest
    from ingest.lib.guards import VolumeGuardError

    conn = MagicMock()
    cur = conn.cursor.return_value.__enter__.return_value
    with pytest.raises(VolumeGuardError):
        _replace_all(conn, [])
    cur.execute.assert_not_called()  # aborted BEFORE touching the table
    conn.commit.assert_not_called()
