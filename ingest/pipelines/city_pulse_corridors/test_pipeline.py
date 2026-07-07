"""Unit tests for the corridor-pulse pipeline orchestration (Build #2).

No network: capture providers are monkeypatched; corridor resolution is exercised
against the fixture + a forced DB error. Mirrors city_pulse/test_pipeline.py.
"""
import pytest

from ingest.pipelines.city_pulse_corridors import pipeline


# ── slug + tier1 path ────────────────────────────────────────────────────────

def test_slug_is_filesystem_safe():
    assert pipeline.slug("Immokalee Rd North Naples") == "immokalee-rd-north-naples"
    assert pipeline.slug("US-41 / Cleveland Ave") == "us-41-cleveland-ave"


def test_tier1_path_uses_corridor_prefix():
    p = pipeline.tier1_path("Immokalee Rd North Naples", "20260601T100000Z", "2026", "06")
    assert p.startswith("city_pulse_corridors/immokalee-rd-north-naples/")
    assert p.endswith("run-20260601T100000Z.ndjson")


# ── corridor resolution ──────────────────────────────────────────────────────

def test_fixture_corridors_reads_centroids():
    corridors = pipeline._fixture_corridors()
    assert len(corridors) >= 20  # 25 corridors today
    assert all(isinstance(c, str) and c for c in corridors)
    assert "Ben Hill Griffin Pkwy" in corridors


def test_resolve_single_corridor_arg_short_circuits():
    assert pipeline.resolve_corridors("Immokalee Rd North Naples", dry_run=True) == [
        "Immokalee Rd North Naples"
    ]


def test_resolve_dry_run_falls_back_to_fixture_on_db_error(monkeypatch):
    def boom():
        raise RuntimeError("no DB in CI")
    monkeypatch.setattr(pipeline, "get_corridors", boom)
    corridors = pipeline.resolve_corridors(None, dry_run=True)
    assert len(corridors) >= 20  # fixture labels, dry-run only


def test_resolve_live_raises_on_db_error(monkeypatch):
    def boom():
        raise RuntimeError("no DB")
    monkeypatch.setattr(pipeline, "get_corridors", boom)
    with pytest.raises(RuntimeError):
        pipeline.resolve_corridors(None, dry_run=False)


# ── corridor capture from the free news lake ─────────────────────────────────

from ingest.pipelines.city_pulse_corridors.pipeline import build_corridor_capture


def test_build_corridor_capture_matches_road_name():
    articles = [
        {"article_url": "https://c/1", "headline": "Cleveland Avenue redevelopment",
         "body_text": "A 40,000 sqft lease signed on Cleveland Ave.",
         "source_name": "businessobserver", "published_date": "2026-07-06"},
        {"article_url": "https://c/2", "headline": "Daniels Parkway news",
         "body_text": "Different corridor entirely.", "source_name": "s", "published_date": "2026-07-06"},
    ]
    cap = build_corridor_capture("Cleveland Ave Fort Myers", "2026-07-07T00:00:00Z", articles)
    assert cap["corridor"] == "Cleveland Ave Fort Myers"
    assert [c["url"] for c in cap["citations"]] == ["https://c/1"]
