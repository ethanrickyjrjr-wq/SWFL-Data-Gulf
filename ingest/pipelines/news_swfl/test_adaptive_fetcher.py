"""Offline tests for the adaptive (BestFirst) news fetcher — SOLO-14.

Mocks the crawler so no network is touched. Locks the contract: depth-0 listing dropped,
depth-1 articles normalized into ArticleRows with article_url preserved, out-of-area pages
filtered out, failed results skipped.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytest.importorskip("crawl4ai")  # adaptive_fetcher needs the pinned crawl4ai venv, not system Python

from . import adaptive_fetcher as af


def _result(url, *, depth, title="", markdown="", success=True):
    return SimpleNamespace(
        url=url,
        success=success,
        metadata={"depth": depth, "title": title},
        markdown=markdown,
    )


def test_rows_from_results_drops_depth0_and_keeps_swfl_articles():
    source = {"name": "naples_daily_news", "url": "https://www.naplesnews.com/business/"}
    results = [
        # depth-0 listing page — must be dropped even though it mentions Naples
        _result("https://www.naplesnews.com/business/", depth=0, title="Naples Business"),
        # depth-1 SWFL article — kept
        _result(
            "https://www.naplesnews.com/story/abc",
            depth=1,
            title="Cape Coral approves new marina",
            markdown="# Cape Coral approves new marina\n\nbody",
        ),
        # depth-1 out-of-area article — filtered by swfl_relevance
        _result(
            "https://www.naplesnews.com/story/xyz",
            depth=1,
            title="Miami council votes on budget",
            markdown="# Miami council votes\n\nbody",
        ),
        # depth-1 but failed crawl — skipped
        _result("https://www.naplesnews.com/story/dead", depth=1, success=False),
    ]
    rows = af._rows_from_results(results, source)
    assert len(rows) == 1, "only the SWFL depth-1 article should survive"
    row = rows[0]
    assert row["article_url"] == "https://www.naplesnews.com/story/abc"
    assert row["headline"] == "Cape Coral approves new marina"
    assert row["source_name"] == "naples_daily_news"
    assert row["swfl_relevance"] is True
    # published_date defaults to an ISO date string (TEXT column contract, build-01)
    assert isinstance(row["published_date"], str) and len(row["published_date"]) == 10


def test_headline_falls_back_to_h1_then_empty():
    no_title = _result("u", depth=1, title="", markdown="# Estero rezoning\n\ntext")
    assert af._headline(no_title) == "Estero rezoning"
    nothing = _result("u", depth=1, title="", markdown="no heading here")
    assert af._headline(nothing) == ""


def test_fetch_all_sources_adaptive_merges_sources_and_swallows_errors():
    """One source returns an article, another raises — the run merges good rows and logs the
    error rather than aborting (return_exceptions contract)."""
    good = _result(
        "https://www.leegov.com/news/releases/2026/storm",
        depth=1,
        title="Lee County storm update for Fort Myers",
        markdown="# Lee County storm update\n\nFort Myers body",
    )

    async def fake_crawl_source(source):
        if source["name"] == "naples_daily_news":
            raise RuntimeError("blocked")
        return af._rows_from_results([good], source)

    with patch.object(af, "_crawl_source", side_effect=fake_crawl_source):
        rows = af.fetch_all_sources_adaptive()
    # 6 sources (07/14/2026: gulfshore_business + business_observer added), naples raises,
    # the other 5 each return the one good row
    assert len(rows) == 5
    assert all(r["article_url"] == good.url for r in rows)


def test_crawl_source_uses_deep_crawl_config_and_normalizes():
    """End-to-end of one source with the crawler mocked: deep_crawl_strategy is attached and a
    depth-1 SWFL result becomes a row."""
    source = {"name": "collier_county_govt", "url": "https://www.colliercountyfl.gov/news"}
    art = _result(
        "https://www.colliercountyfl.gov/news/immokalee-grant",
        depth=1,
        title="Immokalee grant awarded",
        markdown="# Immokalee grant\n\nbody",
    )

    fake_crawler = MagicMock()
    fake_crawler.__aenter__ = AsyncMock(return_value=fake_crawler)
    fake_crawler.__aexit__ = AsyncMock(return_value=False)
    captured = {}

    async def fake_arun(url, config):
        captured["url"] = url
        captured["config"] = config
        return [art]

    fake_crawler.arun = AsyncMock(side_effect=fake_arun)

    with patch.object(af, "AsyncWebCrawler", return_value=fake_crawler):
        rows = af.asyncio.run(af._crawl_source(source))

    assert captured["url"] == source["url"]
    assert captured["config"].deep_crawl_strategy is not None
    assert len(rows) == 1
    assert rows[0]["article_url"] == art.url
