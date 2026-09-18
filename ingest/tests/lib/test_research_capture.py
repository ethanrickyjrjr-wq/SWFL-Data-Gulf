from __future__ import annotations

import json

import pytest

from ingest.lib import research_capture


def test_capture_is_content_addressed_and_idempotent(tmp_path):
    first = research_capture.store_raw_bytes(
        tmp_path, source_id="rsw_airport", original_name="Total-Passengers-July-2026.pdf", content=b"%PDF-sample"
    )
    second = research_capture.store_raw_bytes(
        tmp_path, source_id="rsw_airport", original_name="Total-Passengers-July-2026.pdf", content=b"%PDF-sample"
    )

    assert first == second
    assert first.path.is_file()
    assert first.sha256 in first.path.name
    assert research_capture.first_seen_for_release(tmp_path, source_id="rsw_airport", sha256=first.sha256, observed_at="2026-01-01T00:00:00+00:00") == "2026-01-01T00:00:00+00:00"
    assert research_capture.first_seen_for_release(tmp_path, source_id="rsw_airport", sha256=first.sha256, observed_at="2026-02-01T00:00:00+00:00") == "2026-01-01T00:00:00+00:00"

    revised = research_capture.store_raw_bytes(
        tmp_path, source_id="rsw_airport", original_name="Total-Passengers-July-2026.pdf", content=b"%PDF-revised"
    )
    assert revised.path != first.path


def test_capture_rejects_a_root_outside_configured_root(tmp_path):
    configured = tmp_path / "configured"
    configured.mkdir()
    with pytest.raises(research_capture.ResearchCaptureError, match="outside"):
        research_capture.resolve_capture_root(configured, tmp_path / "other")


def test_capture_checks_disk_floor_before_writing(tmp_path, monkeypatch):
    monkeypatch.setattr(research_capture.shutil, "disk_usage", lambda _: (100, 95, 5))
    with pytest.raises(research_capture.ResearchCaptureError, match="free-space"):
        research_capture.ensure_storage_ready(tmp_path, min_free_bytes=10)


def test_jsonl_and_manifest_are_immutable_and_below_root(tmp_path):
    rows = [{"schema_version": 1, "metric_id": "passengers", "value": 0}]
    exported = research_capture.write_observations_and_manifest(
        tmp_path,
        source_id="rsw_airport",
        observations=rows,
        manifest={"schema_version": 1, "source_ids": ["rsw_airport"]},
    )

    assert exported.observation_path.is_relative_to(tmp_path.resolve())
    assert exported.manifest_path.is_relative_to(tmp_path.resolve())
    assert json.loads(exported.manifest_path.read_text())["observation_files"][0]["row_count"] == 1
    again = research_capture.write_observations_and_manifest(
        tmp_path, source_id="rsw_airport", observations=rows, manifest={"schema_version": 1, "source_ids": ["rsw_airport"]}
    )
    assert again.observation_path == exported.observation_path


def test_combined_manifest_is_root_relative_and_has_sol_coverage_contract(tmp_path):
    source_a = research_capture.write_observations_and_manifest(
        tmp_path, source_id="census_bps_county", observations=[{"period_start": "2026-07-01"}],
        manifest={"source_ids": ["census_bps_county"], "raw_files": [{"relative_path": "raw/census.txt", "sha256": "a" * 64, "byte_size": 1}], "requested_date_range": {"from": "2026-07", "through": "2026-07"}, "source_periods": {"census_bps_county": {"expected_period_count": 1, "present_period_count": 1, "missing": []}}, "coverage_by_geo": {"12021": {"expected_period_count": 1, "present_period_count": 0, "missing": [{"period": "2026-07", "reason": "county_absent_from_release"}]}}, "discovery_parse_failures": []},
    )
    (tmp_path / "raw").mkdir(exist_ok=True)
    (tmp_path / "raw" / "census.txt").write_text("x")
    source_b = research_capture.write_observations_and_manifest(
        tmp_path, source_id="rsw_lcpa_monthly", observations=[{"period_start": "2026-07-01"}],
        manifest={"source_ids": ["rsw_lcpa_monthly"], "raw_files": [{"relative_path": "raw/rsw.pdf", "sha256": "b" * 64, "byte_size": 1}], "source_periods": {"rsw_lcpa_monthly": {"total_passengers": {"observed_start": "2026-07-01", "observed_end": "2026-07-01"}}}, "discovery_parse_failures": []},
    )
    combined = research_capture.write_combined_history_manifest(tmp_path, requested_period={"from": "2026-07", "through": "2026-07"}, source_manifests=[source_a.manifest_path, source_b.manifest_path])
    payload = json.loads(combined.read_text())
    assert combined.parent == tmp_path
    assert payload["source_ids"] == ["census_bps_county", "rsw_lcpa_monthly"]
    assert {entry["source_id"] for entry in payload["raw_files"]} == set(payload["source_ids"])
    assert all(not item["relative_path"].startswith("../") for item in payload["observation_files"])
    assert all(item["present_count"] + item["missing_count"] == item["expected_count"] for item in payload["source_coverage"])
    assert payload["geo_coverage"] == [{"source_id": "census_bps_county", "geo_type": "county_fips", "geo_id": "12021", "expected_period": {"from": "2026-07", "through": "2026-07"}, "observed_period": {"from": "2026-07", "through": "2026-07"}, "expected_count": 1, "present_count": 0, "missing_count": 1, "missing_ranges": [{"from": "2026-07", "through": "2026-07"}]}]


def test_combined_manifest_preserves_bps_period_failure_mapping(tmp_path):
    source = research_capture.write_observations_and_manifest(
        tmp_path, source_id="census_bps_county", observations=[{"period_start": "2026-07-01"}],
        manifest={"source_ids": ["census_bps_county"], "raw_files": [{"relative_path": "raw/census.txt", "sha256": "a" * 64, "byte_size": 1}], "requested_date_range": {"from": "2026-07", "through": "2026-07"}, "source_periods": {"census_bps_county": {"expected_period_count": 1, "present_period_count": 0, "missing": [{"period": "2026-07", "reason": "download failed"}]}}, "discovery_parse_failures": {"2026-07": "download failed"}},
    )
    combined = research_capture.write_combined_history_manifest(tmp_path, requested_period={"from": "2026-07", "through": "2026-07"}, source_manifests=[source.manifest_path])
    assert json.loads(combined.read_text())["source_coverage"][0]["parse_failures"] == ["2026-07: download failed"]
