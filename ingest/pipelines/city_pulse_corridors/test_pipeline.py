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


# ── build_record shape (distill-ready) ───────────────────────────────────────

def test_build_record_has_distill_required_keys():
    dump = {
        "content": [{"citations": [
            {"url": "https://gulfshorebusiness.com/a", "title": "A", "cited_text": "c"},
        ]}],
        "usage": {"input_tokens": 5, "output_tokens": 10},
        "stop_reason": "end_turn",
    }
    rec = pipeline.build_record("Immokalee Rd North Naples", "q", dump, "2026-06-01T00:00:00Z")
    # distill_capture / rows_from_extraction read exactly these:
    for key in ("corridor", "run_at", "citations"):
        assert key in rec
    assert rec["corridor"] == "Immokalee Rd North Naples"
    assert rec["citations"][0]["url"] == "https://gulfshorebusiness.com/a"
    assert rec["cited_text_count"] == 1


# ── capture dispatch (auto-fallback) ─────────────────────────────────────────

def _firecrawl_rec(corridor, n):
    return {"corridor": corridor, "run_at": "t", "citations": [{}] * n,
            "cited_text_count": n, "tool_version": "firecrawl-search"}


def test_capture_auto_uses_firecrawl_when_it_returns_citations(monkeypatch):
    monkeypatch.setattr(pipeline, "capture_firecrawl",
                        lambda c, r: _firecrawl_rec(c, 3))
    monkeypatch.setattr(pipeline, "run_corridor_search",
                        lambda c, r: pytest.fail("anthropic should not be called"))
    rec = pipeline.capture("Immokalee Rd North Naples", "t", "auto")
    assert rec["tool_version"] == "firecrawl-search"
    assert rec["cited_text_count"] == 3


def test_capture_auto_falls_back_to_anthropic_on_zero_citations(monkeypatch):
    monkeypatch.setattr(pipeline, "capture_firecrawl",
                        lambda c, r: _firecrawl_rec(c, 0))
    sentinel = {"corridor": "x", "tool_version": "web_search_20250305", "cited_text_count": 1}
    monkeypatch.setattr(pipeline, "run_corridor_search", lambda c, r: sentinel)
    assert pipeline.capture("Immokalee Rd North Naples", "t", "auto") is sentinel


def test_capture_auto_falls_back_to_anthropic_on_firecrawl_error(monkeypatch):
    def boom(c, r):
        raise RuntimeError("firecrawl down")
    monkeypatch.setattr(pipeline, "capture_firecrawl", boom)
    sentinel = {"corridor": "x", "tool_version": "web_search_20250305", "cited_text_count": 1}
    monkeypatch.setattr(pipeline, "run_corridor_search", lambda c, r: sentinel)
    assert pipeline.capture("Immokalee Rd North Naples", "t", "auto") is sentinel
