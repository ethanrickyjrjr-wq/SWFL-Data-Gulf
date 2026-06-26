"""Unit tests for ingest/lib/extract_client.py (canonical location — C2 consolidation).

Two public functions, both crawl4ai-primary (operator decree 2026-06-16):
  extract()              — crawl4ai stealth fetch → strip → Anthropic Haiku JSON → {rows}
                           (rewired off firecrawl 2026-06-20; check crawl4ai_native_extract_rewire)
  scrape_with_fallback() — crawl4ai markdown → spider → firecrawl (key-gated dormant fallbacks)

All vendor/LLM/browser boundaries are monkeypatched at the extract_client module surface, so
these run offline and deterministically — no network, no browser, no API keys consumed.
"""
from __future__ import annotations

import json

import pytest

from ingest.lib import extract_client
from ingest.lib.crawl_client import Crawl4aiError
from ingest.lib.firecrawl_client import FirecrawlError
from ingest.lib.spider_client import SpiderError


# ─── extract() — crawl4ai-native structured rows ─────────────────────────────


def _fake_fetch_many(mapping: dict[str, str]):
    """Build an async fetch_many stand-in returning a fixed {url: html} mapping."""

    async def _fm(urls, **kwargs):
        return dict(mapping)

    return _fm


def test_extract_empty_urls_returns_empty():
    result = extract_client.extract("prompt", urls=[])
    assert result == {"status": "completed", "data": {"rows": []}, "_provenance": []}


def test_extract_no_anthropic_key_raises(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(extract_client.ExtractError, match="ANTHROPIC_API_KEY"):
        extract_client.extract("prompt", urls=["https://x.example"])


def test_extract_rows_from_crawl4ai(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(
        extract_client, "fetch_many",
        _fake_fetch_many({"https://a.example": "<html><body>listing A</body></html>"}),
    )
    monkeypatch.setattr(
        extract_client, "_llm_extract_rows",
        lambda prompt, text, *, schema, model: [{"addr": "1 Main"}, {"addr": "2 Oak"}],
    )

    result = extract_client.extract("get listings", urls=["https://a.example"], schema={"addr": "str"})

    assert result["status"] == "completed"
    assert result["data"]["rows"] == [{"addr": "1 Main"}, {"addr": "2 Oak"}]
    prov = result["_provenance"]
    assert len(prov) == 1
    assert prov[0]["vendor"] == "crawl4ai"
    assert prov[0]["ok"] is True
    assert prov[0]["rows"] == 2


def test_extract_all_empty_html_raises(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(extract_client, "fetch_many", _fake_fetch_many({"https://dead.example": ""}))

    with pytest.raises(extract_client.ExtractError, match="zero rows"):
        extract_client.extract("prompt", urls=["https://dead.example"])


def test_extract_reachable_but_no_rows_returns_empty(monkeypatch):
    """URL is alive but holds nothing matching → empty result, NOT an error."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(
        extract_client, "fetch_many",
        _fake_fetch_many({"https://alive.example": "<html><body>nothing here</body></html>"}),
    )
    monkeypatch.setattr(
        extract_client, "_llm_extract_rows",
        lambda prompt, text, *, schema, model: [],
    )

    result = extract_client.extract("prompt", urls=["https://alive.example"])

    assert result["data"]["rows"] == []
    assert result["_provenance"][0]["vendor"] == "crawl4ai"
    assert result["_provenance"][0]["ok"] is True
    assert result["_provenance"][0]["rows"] == 0


def test_extract_llm_failure_with_zero_rows_raises(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(
        extract_client, "fetch_many",
        _fake_fetch_many({"https://a.example": "<html>x</html>"}),
    )

    def _boom(prompt, text, *, schema, model):
        raise RuntimeError("haiku 529 overloaded")

    monkeypatch.setattr(extract_client, "_llm_extract_rows", _boom)

    with pytest.raises(extract_client.ExtractError) as exc:
        extract_client.extract("prompt", urls=["https://a.example"])
    assert "haiku 529 overloaded" in str(exc.value)


# ─── extract() deterministic helpers (no network/LLM) ────────────────────────


def test_chunk_text_no_split_when_short():
    assert extract_client._chunk_text("hello world") == ["hello world"]


def test_chunk_text_splits_long_on_paragraph_boundaries():
    big = "\n".join(f"para-{i} " + "x" * 100 for i in range(600))  # ~60k chars
    chunks = extract_client._chunk_text(big)
    assert len(chunks) > 1
    assert all(len(c) <= extract_client._CHUNK_CHARS for c in chunks)
    # every chunk is whole paragraphs — no record cut mid-row
    assert all(line.startswith("para-") for c in chunks for line in c.split("\n") if line)


def test_parse_rows_strips_fences_and_filters_non_dicts():
    assert extract_client._parse_rows('```json\n{"rows":[{"a":1}]}\n```') == [{"a": 1}]
    assert extract_client._parse_rows('{"rows":[{"a":1}, "nope", 5]}') == [{"a": 1}]


def test_parse_rows_raises_on_malformed():
    """Malformed JSON must RAISE (surfaces via provenance), NOT silently degrade to [] — the old
    swallow-to-[] masked broken extraction as an empty page."""
    with pytest.raises(json.JSONDecodeError):
        extract_client._parse_rows("not json at all")
    # a well-formed object that simply lacks a rows key is a valid empty, not malformed
    assert extract_client._parse_rows('{"no_rows_key": true}') == []


def test_llm_extract_rows_passes_strict_output_config(monkeypatch):
    """When a row schema is given, the call carries output_config.format with additionalProperties
    false + a required field list (the structured-outputs contract)."""
    captured: dict = {}

    class _Msg:
        stop_reason = "end_turn"
        content = [type("C", (), {"text": '{"rows":[{"addr":"1 Main"}]}'})()]

    class _Client:
        class messages:  # noqa: N801 - mimic the SDK's `client.messages.create`
            @staticmethod
            def create(**kwargs):
                captured.update(kwargs)
                return _Msg()

    monkeypatch.setattr("anthropic.Anthropic", lambda: _Client())

    rows = extract_client._llm_extract_rows(
        "get listings", "page text", schema={"addr": "str"}, model="claude-haiku-4-5-20251001"
    )

    assert rows == [{"addr": "1 Main"}]
    fmt = captured["output_config"]["format"]
    assert fmt["type"] == "json_schema"
    item = fmt["schema"]["properties"]["rows"]["items"]
    assert item["additionalProperties"] is False
    assert item["required"] == ["addr"]
    assert "addr" in item["properties"]


def test_llm_extract_rows_no_schema_omits_output_config(monkeypatch):
    """Schema-less path stays prompt-guided — no output_config (free-form rows can't be expressed
    under structured outputs' additionalProperties:false)."""
    captured: dict = {}

    class _Msg:
        stop_reason = "end_turn"
        content = [type("C", (), {"text": '{"rows":[]}'})()]

    class _Client:
        class messages:  # noqa: N801
            @staticmethod
            def create(**kwargs):
                captured.update(kwargs)
                return _Msg()

    monkeypatch.setattr("anthropic.Anthropic", lambda: _Client())

    extract_client._llm_extract_rows("p", "text", schema=None, model="m")
    assert "output_config" not in captured


def test_llm_extract_rows_raises_on_refusal(monkeypatch):
    """A refusal/max_tokens stop_reason can still return off-schema text — it must RAISE, not be
    parsed as an empty page."""

    class _Msg:
        stop_reason = "refusal"
        content = [type("C", (), {"text": "I can't help with that."})()]

    class _Client:
        class messages:  # noqa: N801
            @staticmethod
            def create(**kwargs):
                return _Msg()

    monkeypatch.setattr("anthropic.Anthropic", lambda: _Client())

    with pytest.raises(RuntimeError, match="refusal"):
        extract_client._llm_extract_rows("p", "text", schema=None, model="m")


def test_strip_html_drops_scripts_and_chrome():
    html = "<html><body><script>evil()</script><nav>menu</nav><div>Keep Me</div></body></html>"
    assert extract_client._strip_html(html) == "Keep Me"


# ─── scrape_with_fallback() — crawl4ai primary → spider → firecrawl ──────────


def _sp_response(markdown: str) -> dict:
    return {"data": {"markdown": markdown, "metadata": {}}}


def _fc_response(markdown: str) -> dict:
    return {"data": {"markdown": markdown, "metadata": {}}}


def test_scrape_crawl4ai_success_skips_fallbacks(monkeypatch):
    """crawl4ai returns markdown → returned directly, spider/firecrawl untouched."""
    spider_calls: list[str] = []
    monkeypatch.setattr(extract_client, "fetch_page_markdown", lambda url: "# crawl4ai md")
    monkeypatch.setattr(extract_client, "spider_scrape", lambda url, **k: spider_calls.append(url))
    monkeypatch.setenv("SPIDER_API_KEY", "sk-test")

    result = extract_client.scrape_with_fallback("https://example.com")

    assert result["data"]["markdown"] == "# crawl4ai md"
    assert spider_calls == []
    assert [p["vendor"] for p in result["_provenance"]] == ["crawl4ai"]
    assert result["_provenance"][0]["ok"] is True


def test_scrape_crawl4ai_empty_falls_back_to_spider(monkeypatch):
    """Empty crawl4ai markdown must trip the spider fallback (silent-empty trap closed)."""
    monkeypatch.setattr(extract_client, "fetch_page_markdown", lambda url: "")
    monkeypatch.setattr(extract_client, "spider_scrape", lambda url, **k: _sp_response("# from spider"))
    monkeypatch.setenv("SPIDER_API_KEY", "sk-test")

    result = extract_client.scrape_with_fallback("https://empty.example.com")

    assert result["data"]["markdown"] == "# from spider"
    vendors = [p["vendor"] for p in result["_provenance"]]
    assert vendors == ["crawl4ai", "spider"]
    assert result["_provenance"][0]["ok"] is False  # crawl4ai returned empty
    assert result["_provenance"][1]["ok"] is True


def test_scrape_crawl4ai_error_falls_back_to_spider(monkeypatch):
    def boom(url):
        raise Crawl4aiError("nav timeout")

    monkeypatch.setattr(extract_client, "fetch_page_markdown", boom)
    monkeypatch.setattr(extract_client, "spider_scrape", lambda url, **k: _sp_response("# rescued"))
    monkeypatch.setenv("SPIDER_API_KEY", "sk-test")

    result = extract_client.scrape_with_fallback("https://blocked.example.com")

    assert result["data"]["markdown"] == "# rescued"
    assert result["_provenance"][0]["vendor"] == "crawl4ai"
    assert result["_provenance"][0]["ok"] is False
    assert "nav timeout" in result["_provenance"][0]["error"]


def test_scrape_empty_no_fallback_keys_returns_empty(monkeypatch):
    """crawl4ai empty + no spider/firecrawl keys → empty result, no raise."""
    monkeypatch.setattr(extract_client, "fetch_page_markdown", lambda url: "")
    monkeypatch.delenv("SPIDER_API_KEY", raising=False)
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)

    result = extract_client.scrape_with_fallback("https://empty.example.com")

    assert result["data"]["markdown"] == ""
    assert [p["vendor"] for p in result["_provenance"]] == ["crawl4ai"]


def test_scrape_all_vendors_fail_raises_extract_error(monkeypatch):
    def c4(url):
        raise Crawl4aiError("c4 nav fail")

    def sp(url, **k):
        raise SpiderError("sp 404")

    def fc(url, **k):
        raise FirecrawlError("fc 5xx")

    monkeypatch.setattr(extract_client, "fetch_page_markdown", c4)
    monkeypatch.setattr(extract_client, "spider_scrape", sp)
    monkeypatch.setattr(extract_client, "firecrawl_scrape", fc)
    monkeypatch.setenv("SPIDER_API_KEY", "sk-test")
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test")

    with pytest.raises(extract_client.ExtractError) as exc:
        extract_client.scrape_with_fallback("https://dead.example.com")
    msg = str(exc.value)
    assert "c4 nav fail" in msg and "sp 404" in msg and "fc 5xx" in msg


# ─── _chunk_text overlap + _dedup_rows (no boundary drops) ───────────────────


def test_chunk_text_overlaps_boundary():
    text = "\n".join(f"row {i}" for i in range(4000))  # forces multiple chunks
    chunks = extract_client._chunk_text(text, size=2000)
    assert len(chunks) >= 2
    # the tail of chunk 0 reappears at the head of chunk 1 (overlap), so a row straddling the
    # boundary survives in at least one chunk
    tail = chunks[0].split("\n")[-1]
    assert tail in chunks[1].split("\n")


def test_chunk_text_short_text_unchanged():
    assert extract_client._chunk_text("a\nb\nc", size=2000) == ["a\nb\nc"]


def test_dedup_rows_drops_identical_records():
    rows = [{"a": 1}, {"a": 1}, {"a": 2}]
    assert extract_client._dedup_rows(rows) == [{"a": 1}, {"a": 2}]
