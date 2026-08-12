"""Pipeline tests — the dlt resource merges normalized rows into an ephemeral
DuckDB. Uses a DuckDB destination so no live Postgres credentials are needed
(mirrors ingest/pipelines/lee_deed_official_records/test_pipeline.py). No live
crawl4ai in these tests — rows are injected directly.
"""
from __future__ import annotations

import tempfile
from datetime import date

import dlt

from .resources import collier_official_records_resource

TABLE = "collier_official_records"

_ROW_A = {
    "instrument_number": "6861746",
    "record_date": "2026-08-12",
    "doc_type": "NC",
    "book_type": "OR",
    "book": "6619",
    "page": "3939",
    "page_count": 2,
    "grantors": ["JEWETT ISABEL", "JEWETT ISABEL G"],
    "grantees": ["MASTERPIECE ROOFING"],
    "legal_description": "ISLES OF CAPRI UNIT 1 BLOCK B LOT 6",
    "parcel_ids": [],
}
_ROW_B = {
    "instrument_number": "6861743",
    "record_date": "2026-08-12",
    "doc_type": "NC",
    "book_type": "OR",
    "book": "6619",
    "page": "129",
    "page_count": 1,
    "grantors": ["TJSS LLC"],
    "grantees": ["CAMPINS RYAN"],
    "legal_description": "NAPLES PARK UNIT 2 BLOCK 12 LOT 9",
    "parcel_ids": [],
}


def _duck(td: str, name: str = "collier_official_records_test"):
    return dlt.pipeline(
        pipeline_name=name,
        destination=dlt.destinations.duckdb(f"{td}/test.duckdb"),
        dataset_name="data_lake",
    )


def _count(pipe) -> int:
    with pipe.sql_client() as client:
        return client.execute_sql(f"SELECT count(*) FROM data_lake.{TABLE}")[0][0]


def test_two_rows_load_with_spot_check() -> None:
    with tempfile.TemporaryDirectory() as td:
        pipe = _duck(td)
        load_info = pipe.run(
            collier_official_records_resource(
                date(2026, 8, 12), date(2026, 8, 12), rows=[_ROW_A, _ROW_B]
            ),
            table_name=TABLE,
        )
        assert load_info.has_failed_jobs is False
        assert _count(pipe) == 2
        with pipe.sql_client() as client:
            first = client.execute_sql(
                f"SELECT instrument_number, doc_type, book, page, source_tag "
                f"FROM data_lake.{TABLE} WHERE instrument_number = '6861746'"
            )
    assert len(first) == 1
    instrument, doc_type, book, page, source_tag = first[0]
    assert instrument == "6861746"
    assert doc_type == "NC"
    assert book == "6619"
    assert page == "3939"
    assert source_tag == "collier_clerk_cor_access_automated"


def test_merge_is_idempotent_across_reruns() -> None:
    """merge + primary_key dedups on instrument_number — a second identical run
    over an overlapping date range adds no net-new rows."""
    with tempfile.TemporaryDirectory() as td:
        pipe = _duck(td, "collier_official_records_dedup_test")
        pipe.run(
            collier_official_records_resource(
                date(2026, 8, 12), date(2026, 8, 12), rows=[_ROW_A, _ROW_B]
            ),
            table_name=TABLE,
        )
        count1 = _count(pipe)
        pipe.run(
            collier_official_records_resource(
                date(2026, 8, 12), date(2026, 8, 12), rows=[_ROW_A, _ROW_B]
            ),
            table_name=TABLE,
        )
        count2 = _count(pipe)
    assert count1 == 2
    assert count2 == 2


def test_empty_input_is_a_clean_no_op() -> None:
    """A date range with zero recorded documents loads cleanly (no raise)."""
    with tempfile.TemporaryDirectory() as td:
        pipe = _duck(td, "collier_official_records_empty_test")
        load_info = pipe.run(
            collier_official_records_resource(date(2026, 8, 12), date(2026, 8, 12), rows=[]),
            table_name=TABLE,
        )
        assert load_info.has_failed_jobs is False
