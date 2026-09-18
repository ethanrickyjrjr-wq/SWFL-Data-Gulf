from __future__ import annotations

from datetime import date

import pytest

from ingest.pipelines.rsw_airport_monthly import pipeline


def test_discovery_accepts_current_and_legacy_publisher_urls_and_chooses_latest():
    markdown = """
    https://s3.wasabisys.com/cdn.flylcpa.com/app/uploads/2024/11/Total-Passengers-April-2026.pdf
    https://www.flylcpa.com/app/uploads/2026/08/Total-Passengers-July-2026.pdf
    """
    selection = pipeline.discover_pdf_url("total_passengers", markdown)

    assert selection.url.endswith("Total-Passengers-July-2026.pdf")
    assert selection.discovery_mode == "publisher_page"


def test_discovery_is_deterministic_and_rejects_unrelated_hosts():
    markdown = """
    https://evil.example/Total-Passengers-December-2099.pdf
    https://www.flylcpa.com/app/uploads/2026/08/Total-Passengers-July-2026.pdf
    https://www.flylcpa.com/app/uploads/2026/08/Total-Passengers-June-2026.pdf
    """
    selection = pipeline.discover_pdf_url("total_passengers", markdown)
    assert selection.url.endswith("Total-Passengers-July-2026.pdf")


def test_discovery_does_not_cross_match_metric_identity():
    markdown = "https://www.flylcpa.com/app/uploads/2026/08/Passenger-Deplanements-July-2026.pdf"
    with pytest.raises(pipeline.DiscoveryError):
        pipeline.discover_pdf_url("enplanements", markdown, allow_fallback=False)


def test_validate_pdf_rejects_html_and_truncated_bytes():
    with pytest.raises(pipeline.DownloadValidationError, match="PDF"):
        pipeline.validate_pdf_bytes(b"<html>blocked</html>")
    with pytest.raises(pipeline.DownloadValidationError, match="truncated"):
        pipeline.validate_pdf_bytes(b"%PDF-")


def test_blank_is_not_coerced_to_zero():
    assert pipeline._parse_int("") is None
    assert pipeline._parse_int("-") is None
    assert pipeline._parse_int("0") == 0


def test_yoy_requires_the_exact_prior_calendar_year():
    rows = [
        {"airport_code": "RSW", "metric": "total_passengers", "report_month": "2022-07-01", "value": 100, "yoy_pct_change": None},
        {"airport_code": "RSW", "metric": "total_passengers", "report_month": "2024-07-01", "value": 150, "yoy_pct_change": None},
    ]

    pipeline._compute_yoy(rows)
    assert rows[1]["yoy_pct_change"] is None


def test_observation_export_keeps_zero_and_real_source_vintage():
    observation = pipeline.make_observation(
        {"report_month": "2026-07-01", "metric": "total_passengers", "value": 0},
        source_url="https://www.flylcpa.com/app/uploads/2026/08/Total-Passengers-July-2026.pdf",
        source_sha256="a" * 64,
        retrieved_at="2026-09-18T12:00:00+00:00",
        discovery_mode="publisher_page",
    )
    assert observation["value"] == 0
    assert observation["period_end"] == "2026-07-31"
    assert observation["source_sha256"] == "a" * 64
    assert observation["available_at"] is None


def test_capture_local_never_calls_database_upsert(monkeypatch, tmp_path):
    markdown = "\n".join([
        "https://www.flylcpa.com/app/uploads/2026/08/Enplanements-July-2026.pdf",
        "https://www.flylcpa.com/app/uploads/2026/08/Deplanements-July-2026.pdf",
        "https://www.flylcpa.com/app/uploads/2026/08/Total-Passengers-July-2026.pdf",
        "https://www.flylcpa.com/app/uploads/2026/08/Operations-July-2026.pdf",
        "https://www.flylcpa.com/app/uploads/2026/08/Freight-July-2026.pdf",
    ])
    monkeypatch.setenv("SWFL_RESEARCH_ROOT", str(tmp_path))
    monkeypatch.setattr(pipeline, "_scrape_reports_page", lambda: markdown)
    monkeypatch.setattr(pipeline, "_download_pdf", lambda _: b"%PDF-" + b"x" * 2048 + b"%%EOF")
    monkeypatch.setattr(pipeline, "parse_pdf", lambda _, source_url, metric: [{"report_month": "2026-07-01", "metric": metric, "value": 1, "airport_code": "RSW", "period_label": "July 2026", "yoy_pct_change": None}])
    monkeypatch.setattr(pipeline, "upsert_rows", lambda *_: pytest.fail("database upsert must not run"))

    pipeline.run(dry_run=False, conn_str="postgres://should-not-be-used", capture_local=True)
    assert (tmp_path / "manifests").exists()
