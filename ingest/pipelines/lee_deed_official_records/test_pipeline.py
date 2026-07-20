"""Pipeline tests — the dlt resource merges the real fixture into an ephemeral DuckDB.

Uses a DuckDB destination so no live Postgres credentials are needed (mirrors
ingest/pipelines/lee_permits/test_pipeline.py).
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import dlt

from . import resources as resources_mod
from .resources import _read_raw_files, lee_deed_official_records_resource

RAW_FIXTURE = Path(__file__).parent / "raw" / "2026-07-16.json"
TABLE = "lee_deed_official_records"


def _duck(td: str, name: str = "lee_deed_test"):
    return dlt.pipeline(
        pipeline_name=name,
        destination=dlt.destinations.duckdb(f"{td}/test.duckdb"),
        dataset_name="data_lake",
    )


def _count(pipe) -> int:
    with pipe.sql_client() as client:
        return client.execute_sql(f"SELECT count(*) FROM data_lake.{TABLE}")[0][0]


def test_real_fixture_loads_191_rows_with_spot_checks() -> None:
    """DONE-WHEN: the real raw/2026-07-16.json lands 191 rows; first row's
    internal_doc_id is 19764956; consideration + parcel + truncation survive."""
    rows = _read_raw_files(RAW_FIXTURE.parent)
    with tempfile.TemporaryDirectory() as td:
        pipe = _duck(td)
        load_info = pipe.run(
            lee_deed_official_records_resource(rows=rows),
            table_name=TABLE,
        )
        assert load_info.has_failed_jobs is False
        assert _count(pipe) == 191
        with pipe.sql_client() as client:
            first = client.execute_sql(
                f"SELECT internal_doc_id, clerk_file_number, consideration_usd, "
                f"parcel_strap, source_tag FROM data_lake.{TABLE} "
                f"WHERE internal_doc_id = '19764956'"
            )
    assert len(first) == 1
    doc_id, clerk, consideration, parcel, source_tag = first[0]
    assert doc_id == "19764956"
    assert clerk == "2026000187515"
    assert float(consideration) == 10.0
    assert parcel == "22-46-25-E4-10000.1700"
    assert source_tag == "lee_clerk_landmarkweb_manual"


def test_fixture_first_raw_record_is_expected() -> None:
    """Guards the spot-check anchor against a fixture reshuffle."""
    records = json.loads(RAW_FIXTURE.read_text(encoding="utf-8"))
    assert len(records) == 191
    assert records[0]["internalDocId"] == "19764956"


def test_merge_is_idempotent_across_reruns() -> None:
    """merge + primary_key dedups — a second identical load adds no net-new rows.

    This is the whole reason the load is safe to run on a schedule with no cursor:
    re-merging the same committed raw files never duplicates."""
    rows = _read_raw_files(RAW_FIXTURE.parent)
    with tempfile.TemporaryDirectory() as td:
        pipe = _duck(td, "lee_deed_dedup_test")
        pipe.run(lee_deed_official_records_resource(rows=rows), table_name=TABLE)
        count1 = _count(pipe)
        pipe.run(lee_deed_official_records_resource(rows=rows), table_name=TABLE)
        count2 = _count(pipe)
    assert count1 == 191
    assert count2 == 191  # nothing new on the second identical run


def test_empty_input_is_a_clean_no_op() -> None:
    """ODD empty-tolerance: zero rows loads cleanly (no raise), so a scheduled run
    with no new drop is a harmless no-op."""
    with tempfile.TemporaryDirectory() as td:
        pipe = _duck(td, "lee_deed_empty_test")
        load_info = pipe.run(
            lee_deed_official_records_resource(rows=[]),
            table_name=TABLE,
        )
        assert load_info.has_failed_jobs is False


def test_read_raw_files_dedups_newest_file_wins() -> None:
    """Same internal_doc_id in two dated files -> the later file's row survives."""
    with tempfile.TemporaryDirectory() as td:
        raw_dir = Path(td)
        (raw_dir / "2026-07-16.json").write_text(
            json.dumps([{"internalDocId": "1", "considerationRaw": "$10.00", "recordDate": "07/16/2026"}]),
            encoding="utf-8",
        )
        (raw_dir / "2026-07-17.json").write_text(
            json.dumps([{"internalDocId": "1", "considerationRaw": "$500,000.00", "recordDate": "07/17/2026"}]),
            encoding="utf-8",
        )
        rows = _read_raw_files(raw_dir)
    assert len(rows) == 1
    assert rows[0]["consideration_usd"] == 500000.0  # newest file won
    assert rows[0]["record_source_file"] == "2026-07-17.json"
