"""End-to-end test for the zhvi_swfl Tier 2 loader.

Uses an ephemeral DuckDB destination (no live Postgres) so the merge
roundtrip can be verified without credentials. Mirrors the zori_swfl
test_pipeline.py pattern.
"""
from __future__ import annotations

from datetime import date, timedelta
import tempfile
from unittest.mock import patch

import dlt
import pytest


FAKE_ROWS = [
    {
        "zip_code": "34135",
        "period_end": date(2026, 3, 31),
        "home_value": 610000.0,
        "metro": "Cape Coral-Fort Myers, FL",
        "county_name": "Lee County",
        "city": "Bonita Springs",
        "ingested_at": "2026-05-23T15:00:00+00:00",
    },
    {
        "zip_code": "34135",
        "period_end": date(2026, 4, 30),
        "home_value": 612000.0,
        "metro": "Cape Coral-Fort Myers, FL",
        "county_name": "Lee County",
        "city": "Bonita Springs",
        "ingested_at": "2026-05-23T15:00:00+00:00",
    },
    {
        "zip_code": "34102",
        "period_end": date(2026, 4, 30),
        "home_value": 1850000.0,
        "metro": "Naples-Marco Island, FL",
        "county_name": "Collier County",
        "city": "Naples",
        "ingested_at": "2026-05-23T15:00:00+00:00",
    },
]


def test_resource_roundtrips_through_dlt_to_ephemeral_duckdb() -> None:
    from ingest.pipelines.zhvi_swfl.resources import zhvi_swfl_resource

    with tempfile.TemporaryDirectory() as td:
        pipeline = dlt.pipeline(
            pipeline_name="zhvi_swfl_test",
            destination=dlt.destinations.duckdb(f"{td}/test.duckdb"),
            dataset_name="data_lake",
        )
        load_info = pipeline.run(zhvi_swfl_resource(rows=FAKE_ROWS))
        assert load_info.has_failed_jobs is False

        with pipeline.sql_client() as client:
            result = client.execute_sql(
                "SELECT zip_code, period_end, home_value "
                "FROM data_lake.zhvi_swfl ORDER BY zip_code, period_end"
            )

    assert len(result) == 3
    # (zip_code, period_end, home_value)
    assert result[0][0] == "34102"
    assert result[1][0] == "34135"
    assert result[2][0] == "34135"
    assert result[1][2] == 610000.0
    assert result[2][2] == 612000.0


def test_merge_on_composite_pk_is_idempotent() -> None:
    """Two consecutive runs with the same rows must not duplicate."""
    from ingest.pipelines.zhvi_swfl.resources import zhvi_swfl_resource

    with tempfile.TemporaryDirectory() as td:
        pipeline = dlt.pipeline(
            pipeline_name="zhvi_swfl_test_idempotent",
            destination=dlt.destinations.duckdb(f"{td}/test.duckdb"),
            dataset_name="data_lake",
        )
        pipeline.run(zhvi_swfl_resource(rows=FAKE_ROWS))
        pipeline.run(zhvi_swfl_resource(rows=FAKE_ROWS))

        with pipeline.sql_client() as client:
            result = client.execute_sql(
                "SELECT COUNT(*) FROM data_lake.zhvi_swfl"
            )

    assert result[0][0] == 3


def test_merge_overwrites_changed_home_value_for_same_pk() -> None:
    """If a later run carries a different home_value for the same
    (zip_code, period_end), the merge should overwrite."""
    from ingest.pipelines.zhvi_swfl.resources import zhvi_swfl_resource

    later_rows = [
        {
            "zip_code": "34135",
            "period_end": date(2026, 4, 30),
            "home_value": 999999.0,   # revised value
            "metro": "Cape Coral-Fort Myers, FL",
            "county_name": "Lee County",
            "city": "Bonita Springs",
            "ingested_at": "2026-06-01T10:00:00+00:00",
        }
    ]

    with tempfile.TemporaryDirectory() as td:
        pipeline = dlt.pipeline(
            pipeline_name="zhvi_swfl_test_overwrite",
            destination=dlt.destinations.duckdb(f"{td}/test.duckdb"),
            dataset_name="data_lake",
        )
        pipeline.run(zhvi_swfl_resource(rows=FAKE_ROWS))
        pipeline.run(zhvi_swfl_resource(rows=later_rows))

        with pipeline.sql_client() as client:
            result = client.execute_sql(
                "SELECT home_value FROM data_lake.zhvi_swfl "
                "WHERE zip_code = '34135' AND period_end = '2026-04-30'"
            )

    assert len(result) == 1
    assert result[0][0] == 999999.0


def _one_row(period_end: date) -> list[dict]:
    return [
        {
            "zip_code": "34135",
            "period_end": period_end,
            "home_value": 610000.0,
            "metro": "Cape Coral-Fort Myers, FL",
            "county_name": "Lee County",
            "city": "Bonita Springs",
            "ingested_at": "2026-05-23T15:00:00+00:00",
        }
    ]


def test_run_pipeline_content_guard_trips_on_stale_parquet() -> None:
    """DONE-WHEN proof (task 18), locally runnable: run_pipeline against a stale Tier-1 Parquet
    (newest period_end past the 55d gate) raises ContentStaleError BEFORE the merge, instead of
    re-merging old months green. Exercises the real materialize-max path (read_tier1_parquet ->
    max(period_end) -> assert_content_fresh). Generalizes to the zori/tier_divergence twins."""
    from ingest.pipelines.zhvi_swfl import pipeline as zhvi_pipeline
    from ingest.pipelines.zhvi_swfl import resources as zhvi_resources
    from ingest.lib.guards import ContentStaleError

    stale_rows = _one_row(date.today() - timedelta(days=90))  # 90d > 55d gate

    class _FakePipeline:
        def run(self, *a, **k):
            raise AssertionError("merge must not run when content is stale")

    with (
        patch.object(zhvi_resources, "read_tier1_parquet", return_value=stale_rows),
        patch("dlt.pipeline", return_value=_FakePipeline()),
    ):
        with pytest.raises(ContentStaleError):
            zhvi_pipeline.run_pipeline(parquet_path="unused")


def test_run_pipeline_passes_on_fresh_parquet() -> None:
    """Complement: a fresh Parquet (recent period_end) clears the guard and reaches the merge."""
    from ingest.pipelines.zhvi_swfl import pipeline as zhvi_pipeline
    from ingest.pipelines.zhvi_swfl import resources as zhvi_resources

    fresh_rows = _one_row(date.today() - timedelta(days=10))  # within 55d gate
    captured: dict = {}

    class _FakePipeline:
        def run(self, *a, **k):
            captured["ran"] = True
            return "load_info"

    with (
        patch.object(zhvi_resources, "read_tier1_parquet", return_value=fresh_rows),
        patch("dlt.pipeline", return_value=_FakePipeline()),
    ):
        zhvi_pipeline.run_pipeline(parquet_path="unused")

    assert captured.get("ran") is True
