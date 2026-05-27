"""Unit tests for `extract_client.scrape_with_fallback`.

Covers the fallback policy locked in `docs/standards/pipeline-freshness.md` §6:
firecrawl primary → spider fallback, with the silent-empty-rows trap closed
(empty firecrawl markdown should trip the fallback, not be returned as-is).

We monkeypatch `firecrawl_scrape` and `spider_scrape` at the extract_client
module surface — the same place the real wrapper imports them — so the tests
exercise the orchestration without hitting either vendor's network.
"""
from __future__ import annotations

import pytest

from ingest.lib import extract_client
from ingest.lib.firecrawl_client import FirecrawlError
from ingest.lib.spider_client import SpiderError


def _fc_response(markdown: str, metadata: dict | None = None) -> dict:
    """Build a /v2/scrape-shaped firecrawl response."""
    return {"data": {"markdown": markdown, "metadata": metadata or {}}}


def _sp_response(markdown: str) -> dict:
    """Build a normalized spider response (matches `spider_client.scrape`)."""
    return {"data": {"markdown": markdown, "metadata": {}}}


def test_firecrawl_success_skips_spider(monkeypatch):
    """When firecrawl returns markdown, spider must not be called."""
    spider_calls: list[str] = []

    def fc(url, **kwargs):
        return _fc_response("# hello world", metadata={"title": "Hello"})

    def sp(url, **kwargs):
        spider_calls.append(url)
        return _sp_response("should not be used")

    monkeypatch.setattr(extract_client, "firecrawl_scrape", fc)
    monkeypatch.setattr(extract_client, "spider_scrape", sp)
    monkeypatch.setenv("SPIDER_API_KEY", "sk-test")

    result = extract_client.scrape_with_fallback("https://example.com")

    assert result["data"]["markdown"] == "# hello world"
    assert result["data"]["metadata"]["title"] == "Hello"
    assert spider_calls == []
    assert [p["vendor"] for p in result["_provenance"]] == ["firecrawl"]
    assert result["_provenance"][0]["ok"] is True


def test_firecrawl_error_falls_back_to_spider(monkeypatch):
    """FirecrawlError must trip spider fallback when SPIDER_API_KEY is set."""

    def fc(url, **kwargs):
        raise FirecrawlError("simulated firecrawl 5xx")

    def sp(url, **kwargs):
        return _sp_response("# from spider")

    monkeypatch.setattr(extract_client, "firecrawl_scrape", fc)
    monkeypatch.setattr(extract_client, "spider_scrape", sp)
    monkeypatch.setenv("SPIDER_API_KEY", "sk-test")

    result = extract_client.scrape_with_fallback("https://blocked.example.com")

    assert result["data"]["markdown"] == "# from spider"
    provenance_vendors = [p["vendor"] for p in result["_provenance"]]
    assert provenance_vendors == ["firecrawl", "spider"]
    assert result["_provenance"][0]["ok"] is False
    assert "simulated firecrawl 5xx" in result["_provenance"][0]["error"]
    assert result["_provenance"][1]["ok"] is True


def test_firecrawl_empty_markdown_falls_back_to_spider(monkeypatch):
    """Silent-empty-rows trap: empty firecrawl markdown must trigger spider."""

    def fc(url, **kwargs):
        return _fc_response("", metadata={})

    def sp(url, **kwargs):
        return _sp_response("# recovered by spider")

    monkeypatch.setattr(extract_client, "firecrawl_scrape", fc)
    monkeypatch.setattr(extract_client, "spider_scrape", sp)
    monkeypatch.setenv("SPIDER_API_KEY", "sk-test")

    result = extract_client.scrape_with_fallback("https://dead.example.com")

    assert result["data"]["markdown"] == "# recovered by spider"
    # firecrawl provenance entry should record ok=True bytes=0 (it didn't ERROR,
    # it just returned nothing — the distinction matters for debugging).
    assert result["_provenance"][0] == {
        "vendor": "firecrawl",
        "url": "https://dead.example.com",
        "ok": True,
        "bytes": 0,
    }
    assert result["_provenance"][1]["vendor"] == "spider"


def test_no_spider_key_reraises_firecrawl_error(monkeypatch):
    """Without SPIDER_API_KEY, firecrawl errors must propagate (pre-spider behavior)."""

    def fc(url, **kwargs):
        raise FirecrawlError("simulated firecrawl 5xx")

    def sp(url, **kwargs):  # pragma: no cover — must not be called
        raise AssertionError("spider must not be called when SPIDER_API_KEY is unset")

    monkeypatch.setattr(extract_client, "firecrawl_scrape", fc)
    monkeypatch.setattr(extract_client, "spider_scrape", sp)
    monkeypatch.delenv("SPIDER_API_KEY", raising=False)

    with pytest.raises(FirecrawlError, match="simulated firecrawl 5xx"):
        extract_client.scrape_with_fallback("https://example.com")


def test_no_spider_key_with_empty_firecrawl_returns_empty(monkeypatch):
    """Without SPIDER_API_KEY, empty firecrawl markdown returns empty (no raise)."""

    def fc(url, **kwargs):
        return _fc_response("", metadata={})

    def sp(url, **kwargs):  # pragma: no cover
        raise AssertionError("spider must not be called when SPIDER_API_KEY is unset")

    monkeypatch.setattr(extract_client, "firecrawl_scrape", fc)
    monkeypatch.setattr(extract_client, "spider_scrape", sp)
    monkeypatch.delenv("SPIDER_API_KEY", raising=False)

    result = extract_client.scrape_with_fallback("https://example.com")

    assert result["data"]["markdown"] == ""
    spider_entry = next(p for p in result["_provenance"] if p["vendor"] == "spider")
    assert spider_entry["skipped"] is True


def test_both_vendors_fail_raises_extract_error(monkeypatch):
    """Firecrawl error + spider error must raise ExtractError naming both."""

    def fc(url, **kwargs):
        raise FirecrawlError("fc 5xx")

    def sp(url, **kwargs):
        raise SpiderError("sp 404")

    monkeypatch.setattr(extract_client, "firecrawl_scrape", fc)
    monkeypatch.setattr(extract_client, "spider_scrape", sp)
    monkeypatch.setenv("SPIDER_API_KEY", "sk-test")

    with pytest.raises(extract_client.ExtractError) as exc_info:
        extract_client.scrape_with_fallback("https://dead.example.com")

    msg = str(exc_info.value)
    assert "fc 5xx" in msg
    assert "sp 404" in msg


def test_both_vendors_empty_returns_empty_no_raise(monkeypatch):
    """Firecrawl returns empty + spider returns empty (no error) → empty result, no raise.

    This is the "URL is alive but has no extractable content" case. Callers
    decide whether to skip the URL — the wrapper doesn't raise.
    """

    def fc(url, **kwargs):
        return _fc_response("", metadata={})

    def sp(url, **kwargs):
        return _sp_response("")

    monkeypatch.setattr(extract_client, "firecrawl_scrape", fc)
    monkeypatch.setattr(extract_client, "spider_scrape", sp)
    monkeypatch.setenv("SPIDER_API_KEY", "sk-test")

    result = extract_client.scrape_with_fallback("https://alive-but-empty.example.com")

    assert result["data"]["markdown"] == ""
    vendors = [p["vendor"] for p in result["_provenance"]]
    assert vendors == ["firecrawl", "spider"]
    assert all(p["ok"] for p in result["_provenance"])
