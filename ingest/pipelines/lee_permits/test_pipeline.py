"""Pipeline tests — dlt resource emits correctly bucketed rows + incremental behavior.

Uses an ephemeral DuckDB destination so no live Postgres credentials are needed.
"""
import json
from pathlib import Path
import tempfile
from datetime import date, timedelta
from unittest.mock import patch

import dlt
import pytest

pytest.importorskip("crawl4ai")  # .pipeline -> .scraper needs the pinned crawl4ai venv

from . import pipeline as pipeline_mod
from .pipeline import permits_resource

FIXTURES = Path(__file__).parent / "fixtures"


def _load_fixture_rows() -> list[dict]:
    return json.loads((FIXTURES / "sample_rows.json").read_text())


def _duck(td: str, name: str = "lee_test"):
    return dlt.pipeline(
        pipeline_name=name,
        destination=dlt.destinations.duckdb(f"{td}/test.duckdb"),
        dataset_name="data_lake",
    )


def _count(pipe) -> int:
    with pipe.sql_client() as client:
        return client.execute_sql("SELECT count(*) FROM data_lake.lee_building_permits")[0][0]


def test_permits_resource_emits_typed_rows_with_bucket() -> None:
    fixture_rows = _load_fixture_rows()
    with tempfile.TemporaryDirectory() as td:
        pipeline = _duck(td)
        load_info = pipeline.run(
            permits_resource(rows=fixture_rows),
            table_name="lee_building_permits",
        )
        assert load_info.has_failed_jobs is False
        with pipeline.sql_client() as client:
            result = client.execute_sql(
                "SELECT permit_id, bucket FROM data_lake.lee_building_permits ORDER BY permit_id"
            )
    assert result == [
        ("BLDR23-12345", "commercial_alteration"),
        ("BLDR24-00001", "commercial_new"),
    ]


def test_permits_resource_handles_empty_input() -> None:
    with tempfile.TemporaryDirectory() as td:
        pipeline = _duck(td, "lee_empty_test")
        load_info = pipeline.run(permits_resource(rows=[]), table_name="lee_building_permits")
        assert load_info.has_failed_jobs is False


def test_cursor_excludes_rows_without_issued_date() -> None:
    """on_cursor_value_missing='exclude' drops rows with null/missing issued_date.

    Never invent a date, never advance the cursor on one, never overwrite a good row with null.
    """
    good = {
        "permit_id": "BLDR25-00009",
        "issued_date": "2026-05-01",
        "permit_type_raw": "BLDG-COMMERCIAL",
        "permit_description_raw": "x",
    }
    no_date = {**good, "permit_id": "BLDR25-00010", "issued_date": ""}
    missing = {k: v for k, v in good.items() if k != "issued_date"}
    missing["permit_id"] = "BLDR25-00011"
    with tempfile.TemporaryDirectory() as td:
        pipeline = _duck(td, "lee_exclude_test")
        pipeline.run(
            permits_resource(rows=[good, no_date, missing]),
            table_name="lee_building_permits",
        )
        with pipeline.sql_client() as client:
            ids = [
                r[0]
                for r in client.execute_sql(
                    "SELECT permit_id FROM data_lake.lee_building_permits ORDER BY permit_id"
                )
            ]
    assert ids == ["BLDR25-00009"]  # only the dated row landed


def test_incremental_dedup_across_runs() -> None:
    """Canonical proof: run twice over the same rows in ONE pipeline (shared dlt state) —
    the second run adds no net-new rows (incremental + merge dedup held across runs)."""
    fixture_rows = _load_fixture_rows()
    with tempfile.TemporaryDirectory() as td:
        pipeline = _duck(td, "lee_dedup_test")
        pipeline.run(permits_resource(rows=fixture_rows), table_name="lee_building_permits")
        count1 = _count(pipeline)
        pipeline.run(permits_resource(rows=fixture_rows), table_name="lee_building_permits")
        count2 = _count(pipeline)
    assert count1 == 2
    assert count2 == 2  # nothing new on the second identical run


def test_run_pipeline_seeds_initial_value_from_max() -> None:
    """First-run floor comes from MAX(issued_date) — no 1970 backfill on a populated table."""
    # Use a RECENT max so the post-merge content-freshness guard (14d) passes — this test
    # exercises cursor seeding, not staleness (that's test_run_pipeline_content_guard_trips).
    recent = date.today() - timedelta(days=2)
    captured: dict = {}
    real_inc = dlt.sources.incremental

    def _spy_inc(*a, **k):
        captured["initial_value"] = k.get("initial_value")
        return real_inc(*a, **k)

    class _FakeLoadInfo:
        def raise_on_failed_jobs(self):
            captured["raised"] = True

    class _FakePipeline:
        def run(self, *a, **k):
            captured["ran"] = True
            return _FakeLoadInfo()

    with (
        patch.object(pipeline_mod, "_latest_issued_date", return_value=recent),
        patch.object(dlt.sources, "incremental", side_effect=_spy_inc),
        patch("dlt.pipeline", return_value=_FakePipeline()),
    ):
        pipeline_mod.run_pipeline()

    assert captured["initial_value"] == recent
    assert captured.get("ran") and captured.get("raised")


def test_run_pipeline_content_guard_trips_on_stale_max() -> None:
    """DONE-WHEN proof (task 18): a LOAD-fresh run whose MAX(issued_date) has stalled must
    raise ContentStaleError (cron red), not exit green. Mirrors the 18-days-stale-behind-3-
    green-runs bug — 18d > the 14d gate. raise_on_failed_jobs passes (the dlt job succeeded);
    the content guard is what catches the stall."""
    from ingest.lib.guards import ContentStaleError

    stale = date.today() - timedelta(days=18)

    class _FakeLoadInfo:
        def raise_on_failed_jobs(self):
            pass

    class _FakePipeline:
        def run(self, *a, **k):
            return _FakeLoadInfo()

    with (
        patch.object(pipeline_mod, "_latest_issued_date", return_value=stale),
        patch("dlt.pipeline", return_value=_FakePipeline()),
    ):
        with pytest.raises(ContentStaleError):
            pipeline_mod.run_pipeline()


def test_dry_run_with_no_start_uses_default_window() -> None:
    """--dry-run with no --start must still pick a concrete window (no DB read)."""
    with (
        patch(
            "ingest.pipelines.lee_permits.pipeline.fetch_permit_pages",
            return_value=["<html></html>"],
        ) as mock_fetch,
        patch(
            "ingest.pipelines.lee_permits.pipeline.parse_accela_result_page",
            return_value=[],
        ),
        patch("dlt.pipeline") as mock_dlt,
    ):
        from ingest.pipelines.lee_permits.pipeline import main

        result = main(["--dry-run"])
    assert result == 0
    mock_dlt.assert_not_called()
    mock_fetch.assert_called_once()  # a window was derived without hitting the DB


def test_dry_run_skips_enrichment_and_dlt() -> None:
    """--dry-run fetches + parses pages but skips enrichment and dlt write."""
    with (
        patch(
            "ingest.pipelines.lee_permits.pipeline.fetch_permit_pages",
            return_value=["<html></html>"],
        ),
        patch(
            "ingest.pipelines.lee_permits.pipeline.parse_accela_result_page",
            return_value=[],
        ),
        patch("ingest.pipelines.lee_permits.pipeline.enrich_rows_with_details") as mock_enrich,
        patch("dlt.pipeline") as mock_dlt,
    ):
        from ingest.pipelines.lee_permits.pipeline import main

        result = main(["--start", "2026-05-15", "--end", "2026-05-22", "--dry-run"])
    assert result == 0
    mock_enrich.assert_not_called()
    mock_dlt.assert_not_called()
