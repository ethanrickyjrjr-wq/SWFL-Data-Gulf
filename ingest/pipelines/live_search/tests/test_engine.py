"""Unit tests for the live_search engine — pure logic + cascade/anomaly orchestration (mocked IO)."""

from ingest.pipelines.live_search import engine


def _cfg(**kw):
    base = dict(
        metric_key="median_sale_price",
        areas=["cape_coral"],
        unit="usd",
        expected_range=(200000, 900000),
        tolerance_pct=10,
        anomaly_threshold_pct=8,
        denylist_domains=[],
        fetch_mode="search",
        questions=["median home sale price {area_label}, Florida"],
    )
    base.update(kw)
    return base


def _cand(value, source_url="https://x.com/u", eng="gemini", domain="x.com"):
    return engine.Candidate(value, domain, source_url, eng, grounded=True)


# --- pure helpers ---
def test_extract_numbers_normalizes_money():
    nums = engine.extract_numbers("Median sale price was $360K (up from $359,950).")
    assert any(abs(n - 360000) <= 1000 for n in nums)
    assert any(abs(n - 359950) <= 1 for n in nums)


def test_verify_on_page_numeric_tolerance(monkeypatch):
    monkeypatch.setattr(engine, "_scrape_text", lambda url: "Cape Coral median sale price: $362,000")
    assert engine.verify_on_page(360000, "https://anylocalrealtor.com/x", denylist_domains=[], tolerance_pct=10)
    assert not engine.verify_on_page(360000, "https://anylocalrealtor.com/x", denylist_domains=[], tolerance_pct=0.1)


def test_accepts_real_nonbrand_grounded_source(monkeypatch):
    # OPEN APERTURE: a real LOCAL realtor's site is a valid source (not only Redfin/Zillow).
    monkeypatch.setattr(engine, "_scrape_text", lambda url: "Our latest Cape Coral median: $361,500")
    assert engine.verify_on_page(360000, "https://gulfcoastrealtygroup.com/market", denylist_domains=[], tolerance_pct=10)


def test_verify_rejects_denylisted_source(monkeypatch):
    monkeypatch.setattr(engine, "_scrape_text", lambda url: "median $360,000")
    assert engine.is_denylisted("https://littlebird-realty.com/x", [])
    assert not engine.verify_on_page(360000, "https://littlebird-realty.com/x", denylist_domains=[], tolerance_pct=10)


def test_resolve_vertex_redirect(monkeypatch):
    monkeypatch.setattr(engine, "_follow_redirect", lambda u: "https://www.redfin.com/news/data-center/")
    out = engine.resolve_source_url("https://vertexaisearch.cloud.google.com/grounding-api-redirect/AB12")
    assert "redfin.com" in out


def test_bootstrap_cross_check_agreement():
    cands = [
        engine.Candidate(360000, "redfin.com", "https://r/x", "gemini", grounded=True),
        engine.Candidate(362000, "gulfcoastrealty.com", "https://g/x", "firecrawl", grounded=True),
    ]
    n, winner = engine.cross_check(cands, tolerance_pct=8)
    assert n == 2 and abs(winner.value - 361000) < 3000


# --- cascade + anomaly orchestration ---
def test_memory_number_skipped_no_source_url():
    row = engine.finalize_with_anomaly(None, cfg=_cfg(), area="cape_coral")
    assert row.value is None and "no source" in (row.status_reason or "").lower()


def test_cascade_falls_through_when_gemini_empty(monkeypatch):
    monkeypatch.setattr(engine, "gemini_grounded", lambda q: None)  # Gemini down / no grounded result
    monkeypatch.setattr(engine, "firecrawl_search", lambda q, dl: _cand(361000, "https://realtor.com/x", "firecrawl", "realtor.com"))
    monkeypatch.setattr(engine, "_prior_value", lambda mk, a: 360000)
    row = engine.resolve_metric_search(_cfg(anomaly_threshold_pct=8), area="cape_coral")
    assert row.value == 361000 and row.engine == "firecrawl" and row.anomaly_flag is False


def test_within_band_loads_one_search(monkeypatch):
    monkeypatch.setattr(engine, "_prior_value", lambda mk, a: 360000)
    row = engine.finalize_with_anomaly(_cand(366000), cfg=_cfg(anomaly_threshold_pct=8), area="cape_coral")
    assert row.value == 366000 and row.anomaly_flag is False and row.agreement_n == 1


def test_anomaly_confirmed_by_second_source_loads(monkeypatch):
    monkeypatch.setattr(engine, "_prior_value", lambda mk, a: 360000)
    monkeypatch.setattr(engine, "_second_source_value", lambda cfg, a: 498000)
    row = engine.finalize_with_anomaly(_cand(500000), cfg=_cfg(anomaly_threshold_pct=8), area="cape_coral")
    assert row.value == 500000 and row.anomaly_flag is False and row.agreement_n == 2


def test_anomaly_holds_when_second_source_disagrees(monkeypatch):
    monkeypatch.setattr(engine, "_prior_value", lambda mk, a: 360000)
    monkeypatch.setattr(engine, "_second_source_value", lambda cfg, a: None)
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
