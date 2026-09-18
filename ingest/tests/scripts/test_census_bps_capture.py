from __future__ import annotations

import pytest

from ingest.scripts import census_bps_capture as bps


HEADER_1 = "Survey,FIPS,FIPS,Region,Division,County,,1-unit,,,2-units,,,3-4 units,,,5+ units,,,1-unit rep,,,2-units rep,,,3-4 units,,, 5+units rep"
HEADER_2 = "Date,State,County,Code,Code,Name,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value"
LEE = "202607,12,071,3,5,Lee County,3,4,500,0,0,0,0,0,0,0,0,0,2,2,300,0,0,0,0,0,0,0,0,0"
COLLIER = "202607,12,021,3,5,Collier County,2,2,250,0,0,0,0,0,0,0,0,0,2,2,250,0,0,0,0,0,0,0,0,0"
OTHER_LEE = "202607,21,111,3,5,Lee County,9,9,900,0,0,0,0,0,0,0,0,0,9,9,900,0,0,0,0,0,0,0,0,0"


def test_parse_filters_exact_florida_fips_and_preserves_blank_as_missing():
    parsed = bps.parse_county_file((HEADER_1 + "\n" + HEADER_2 + "\n" + LEE + "\n" + COLLIER + "\n" + OTHER_LEE + "\n").encode(), "2026-07")
    assert [row["geo_id"] for row in parsed] == ["12021", "12071"]
    assert parsed[0]["metrics"]["residential_one_unit_buildings"]["value"] == 2


def test_parse_rejects_truncated_or_unknown_layout():
    with pytest.raises(bps.BpsParseError, match="header"):
        bps.parse_county_file(b"not a county release", "2026-07")
    with pytest.raises(bps.BpsParseError, match="disagrees"):
        bps.parse_county_file((HEADER_1 + "\n" + HEADER_2 + "\n" + LEE.replace("202607", "202606")).encode(), "2026-07")


def test_parse_keeps_available_county_when_other_county_is_absent():
    parsed = bps.parse_county_file((HEADER_1 + "\n" + HEADER_2 + "\n" + LEE + "\n").encode(), "2026-07")
    assert [row["geo_id"] for row in parsed] == ["12071"]


def test_latest_is_discovered_from_official_directory(monkeypatch):
    class Response:
        text = '<a href="co2607c.txt">co2607c.txt</a>'
        def raise_for_status(self):
            return None
    monkeypatch.setattr(bps.requests, "get", lambda *args, **kwargs: Response())
    assert bps.discover_latest_period() == "2026-07"


def test_expected_periods_marks_missing_months_without_inventing_zero():
    coverage = bps.coverage_matrix("2026-01", "2026-03", {"2026-01", "2026-03"})
    assert coverage["missing"] == [{"period": "2026-02", "reason": "not_retrieved"}]


def test_capture_mode_never_calls_database_or_cloud(monkeypatch, tmp_path):
    monkeypatch.setattr(bps, "fetch_release", lambda *args, **kwargs: (HEADER_1 + "\n" + HEADER_2 + "\n" + LEE).encode())
    result = bps.run_capture("2026-07", "2026-07", capture_root=tmp_path, dry_run=False)
    assert result["mode"] == "capture_local"
    assert (tmp_path / "manifests").exists()


def test_capture_resumes_from_retained_bytes_without_a_second_request(monkeypatch, tmp_path):
    content = (HEADER_1 + "\n" + HEADER_2 + "\n" + LEE).encode()
    monkeypatch.setattr(bps, "fetch_release", lambda *args, **kwargs: content)
    bps.run_capture("2026-07", "2026-07", capture_root=tmp_path, dry_run=False)
    monkeypatch.setattr(bps, "fetch_release", lambda *args, **kwargs: pytest.fail("network should not be called"))
    rerun = bps.run_capture("2026-07", "2026-07", capture_root=tmp_path, dry_run=False)
    assert rerun["observation_count"] == 48


def test_capture_records_county_specific_gap_in_coverage_matrix(monkeypatch, tmp_path):
    content = (HEADER_1 + "\n" + HEADER_2 + "\n" + LEE).encode()
    monkeypatch.setattr(bps, "fetch_release", lambda *args, **kwargs: content)
    result = bps.run_capture("2026-07", "2026-07", capture_root=tmp_path, dry_run=False)
    assert result["coverage_by_geo"]["12021"]["missing"] == [{"period": "2026-07", "reason": "county_absent_from_release"}]


def test_reported_valuation_keeps_dollar_units():
    observation = bps._observation(
        "2026-07", "12021", "residential_one_unit_valuation_usd_reported",
        {"value": 500, "value_basis": "reported"}, source_url="https://example.test/release.txt",
        sha256="a" * 64, retrieved_at="2026-09-18T20:00:00+00:00",
    )
    assert observation["unit"] == "dollars"
