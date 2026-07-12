"""Unit tests for the live_search engine — pure logic + api/lake anomaly orchestration (mocked IO).

Web-search mode tests removed 07/12/2026 with the cascade itself (see engine docstring).
"""

from ingest.pipelines.live_search import engine


def _cfg(**kw):
    base = dict(
        metric_key="median_asking_price",
        areas=["cape_coral"],
        unit="usd",
        expected_range=(200000, 900000),
        tolerance_pct=10,
        anomaly_threshold_pct=8,
        denylist_domains=[],
        fetch_mode="lake",
        questions=["median asking price {area_label}, Florida"],
    )
    base.update(kw)
    return base


def _cand(value, source_url="https://x.com/u", eng="lake", domain="x.com"):
    return engine.Candidate(value, domain, source_url, eng, grounded=True)


# --- anomaly orchestration (shared by api + lake modes) ---
def test_memory_number_skipped_no_source_url():
    row = engine.finalize_with_anomaly(None, cfg=_cfg(), area="cape_coral")
    assert row.value is None and "no source" in (row.status_reason or "").lower()


def test_within_band_loads(monkeypatch):
    monkeypatch.setattr(engine, "_prior_value", lambda mk, a: 360000)
    row = engine.finalize_with_anomaly(_cand(366000), cfg=_cfg(anomaly_threshold_pct=8), area="cape_coral")
    assert row.value == 366000 and row.anomaly_flag is False and row.agreement_n == 1


def test_big_move_vs_own_prior_stored_flagged(monkeypatch):
    # No second engine exists — a move past the threshold is stored FLAGGED and
    # held for human review, never confirmed away and never narrated.
    monkeypatch.setattr(engine, "_prior_value", lambda mk, a: 360000)
    row = engine.finalize_with_anomaly(_cand(500000), cfg=_cfg(anomaly_threshold_pct=8), area="cape_coral")
    assert row.anomaly_flag is True and round(row.anomaly_delta_pct) == 39 and row.value == 500000


def test_out_of_range_flags_null():
    row = engine.finalize_with_anomaly(_cand(9_000_000), cfg=_cfg(expected_range=(200000, 900000)), area="cape_coral")
    assert row.value is None and "range" in (row.status_reason or "").lower()


def test_api_mode_fred_happy_path(monkeypatch):
    monkeypatch.setattr(engine, "_fred_latest", lambda series_id: (6.52, "2026-06-11"))
    cfg = _cfg(fetch_mode="api", api_config={"provider": "fred", "series_id": "MORTGAGE30US",
                                             "source_url": "https://fred.stlouisfed.org/series/MORTGAGE30US"},
               unit="pct", expected_range=(2.0, 12.0))
    row = engine.resolve_metric_api(cfg, area="swfl")
    assert row.value == 6.52 and row.engine == "fred" and row.verified_on_page is True


# --- lake mode (deterministic own-inventory median; no search, no LLM) ---
def test_lake_mode_sources_from_own_inventory(monkeypatch):
    monkeypatch.setattr(engine, "_lake_median_asking", lambda area: 400000.0)
    monkeypatch.setattr(engine, "_prior_value", lambda mk, a: 398000)
    cfg = _cfg(metric_key="median_asking_price", fetch_mode="lake")
    row = engine.resolve_metric_lake(cfg, "cape_coral")
    assert row.value == 400000.0 and row.engine == "lake"
    assert "swfldatagulf.com" in row.source_url
    assert row.anomaly_flag is False


def test_lake_mode_null_when_view_empty(monkeypatch):
    monkeypatch.setattr(engine, "_lake_median_asking", lambda area: None)
    row = engine.resolve_metric_lake(_cfg(fetch_mode="lake"), "cape_coral")
    assert row.value is None and "lake" in (row.status_reason or "")


def test_lake_mode_range_gate_catches_contamination(monkeypatch):
    # A land-blend regression would crater the city median (the 33972 class) —
    # the expected_range gate must NULL it with a reason, never narrate it.
    monkeypatch.setattr(engine, "_lake_median_asking", lambda area: 35000.0)
    row = engine.resolve_metric_lake(_cfg(fetch_mode="lake"), "cape_coral")
    assert row.value is None and "expected_range" in (row.status_reason or "")


def test_lake_mode_big_move_vs_own_prior_flagged(monkeypatch):
    monkeypatch.setattr(engine, "_lake_median_asking", lambda area: 500000.0)
    monkeypatch.setattr(engine, "_prior_value", lambda mk, a: 400000)  # +25% >> 8% threshold
    row = engine.resolve_metric_lake(_cfg(fetch_mode="lake"), "cape_coral")
    assert row.value == 500000.0 and row.anomaly_flag is True
