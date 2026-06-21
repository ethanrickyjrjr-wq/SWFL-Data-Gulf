"""Tests for ingest/lib/supercrawl4ai.py.

Pure-unit tests need no browser/network. Browser tests use raw:// HTML (no network) and need a
local headless Chromium — they mirror ingest/tests/lib/test_crawl4ai_client.py. The prove-it
battle-test lives in ingest/lib/supercrawl4ai_bench.py.
"""
from ingest.lib.supercrawl4ai import (
    SuperConfig,
    SuperResult,
    SuperTable,
    _browser_config,
    _run_config,
    fetch_many_super,
    fetch_super,
    fetch_tables,
)

# ── pure-unit: data types + config builders (no browser) ─────────────────────


def test_superconfig_defaults_are_all_off():
    c = SuperConfig()
    assert c.fit_markdown is False and c.tables is False and c.remove_overlays is False
    assert c.scan_full_page is False and c.virtual_scroll is None and c.proxy is None
    assert c.stealth is False and c.jitter == (0.0, 0.0) and c.table_score_threshold == 7


def test_supertable_to_dataframe():
    t = SuperTable(headers=["a", "b"], rows=[["1", "2"], ["3", "4"]], caption="cap")
    df = t.to_dataframe()
    assert list(df.columns) == ["a", "b"]
    assert df.shape == (2, 2)
    assert df.attrs["caption"] == "cap"


def test_default_run_config_is_neutral():
    cfg = _run_config(SuperConfig())
    assert cfg.scan_full_page is False
    assert cfg.remove_overlay_elements is False
    assert cfg.virtual_scroll_config is None
    # crawl4ai auto-assigns a DefaultMarkdownGenerator; the byte-identical invariant is that we add
    # NO content filter by default (== old client). fit_markdown is what attaches the filter.
    assert getattr(cfg.markdown_generator, "content_filter", None) is None
    assert cfg.proxy_config is None


def test_fit_markdown_attaches_pruning_filter():
    cfg = _run_config(SuperConfig(fit_markdown=True))
    assert cfg.markdown_generator is not None
    assert cfg.markdown_generator.content_filter is not None


def test_jitter_only_set_when_nonzero():
    from crawl4ai import CrawlerRunConfig

    # default: we don't touch mean_delay -> it stays at crawl4ai's own default (byte-identical)
    assert _run_config(SuperConfig()).mean_delay == CrawlerRunConfig().mean_delay
    j = _run_config(SuperConfig(jitter=(2.0, 1.0)))
    assert j.mean_delay == 2.0 and j.max_range == 1.0


def test_stealth_browser_flag():
    assert _browser_config(SuperConfig()).enable_stealth is False
    assert _browser_config(SuperConfig(stealth=True)).enable_stealth is True


# ── browser tests: raw:// pages (no network, needs local Chromium) ───────────

_PAGE = (
    "raw://<html><body><h1>Estero</h1><p>retail space</p>"
    "<a href='https://x.test/1'>more</a></body></html>"
)
_TABLE_PAGE = (
    "raw://<html><body><table>"
    "<tr><th>City</th><th>PSF</th></tr>"
    "<tr><td>Estero</td><td>28</td></tr>"
    "<tr><td>Fort Myers Beach</td><td>34</td></tr>"
    "</table></body></html>"
)


def test_fetch_super_returns_html_and_markdown():
    res = fetch_super(_PAGE)
    assert res.success is True
    assert "Estero" in res.html
    assert "Estero" in res.markdown
    assert res.fit_markdown == ""  # not requested


def test_fetch_super_tables_is_list_and_links_is_list():
    res = fetch_super(_PAGE, SuperConfig(tables=True))
    assert isinstance(res.links, list)
    assert res.tables == []  # no <table> on this page


def test_fetch_tables_parses_headers_and_rows():
    tables = fetch_tables(_TABLE_PAGE, score_threshold=1)
    assert len(tables) >= 1
    t = tables[0]
    assert t.headers == ["City", "PSF"]
    assert ["Estero", "28"] in t.rows


def test_fetch_many_super_returns_result_per_url():
    p1 = "raw://<html><body><h1>one</h1></body></html>"
    p2 = "raw://<html><body><h1>two</h1></body></html>"
    out = fetch_many_super([p1, p2])
    assert set(out.keys()) >= {p1, p2}
    assert all(isinstance(v, SuperResult) for v in out.values())
    assert any("one" in v.html for v in out.values())


def test_fetch_many_super_empty_input():
    assert fetch_many_super([]) == {}
