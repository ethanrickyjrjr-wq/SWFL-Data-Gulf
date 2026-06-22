"""Adaptive (BestFirst) news fetcher — SOLO-14, behind the default-off NEWS_ADAPTIVE flag.

A scored, depth-limited frontier replacement for the baseline's bare AsyncWebCrawler + fixed
~40-cap + regex LINK_RE sieve (see fetcher.py). For each source it runs ONE deep crawl:

    BestFirstCrawlingStrategy(max_depth=1, url_scorer=KeywordRelevanceScorer(SWFL terms),
        filter_chain=[DomainFilter(host), URLPatternFilter(article patterns)], max_pages=N)

BestFirst visits the highest-scoring (most SWFL-relevant-looking) URLs first; the scorer is pure
keyword math — ZERO API cost (no LLM, no embeddings). max_depth=1 means: crawl the listing page
(depth 0) plus the article pages it links to (depth 1). Each depth-1 result already carries its own
markdown + metadata in the SAME pass (no N+1 arun), runs through the existing normalize(), and is
kept only if swfl_relevance holds — so the ArticleRow shape, the dlt primary_key=article_url
contract, and the precision filter are all identical to the baseline. Stealth (UndetectedAdapter)
is folded in here, one crawler per source mirroring the baseline's isolation.
"""
from __future__ import annotations

import asyncio
from urllib.parse import urlparse

from crawl4ai import (
    AsyncWebCrawler,
    BrowserConfig,
    CacheMode,
    CrawlerRunConfig,
    DomainFilter,
    FilterChain,
    KeywordRelevanceScorer,
    UndetectedAdapter,
    URLPatternFilter,
)
from crawl4ai import BestFirstCrawlingStrategy
from crawl4ai.async_crawler_strategy import AsyncPlaywrightCrawlerStrategy

from .fetcher import SOURCES
from .normalizer import SWFL_TERMS, ArticleRow, normalize

# Scorer keywords = SWFL place terms (spaced + hyphenated, since story-URL slugs use hyphens)
# plus the regional umbrella terms. Used only to PRIORITIZE the frontier; final inclusion is the
# DomainFilter+URLPatternFilter (which pages are eligible) and normalize()'s swfl_relevance (which
# rows are kept). So scorer precision is a nice-to-have for ordering, never a correctness gate.
SCORER_KEYWORDS = sorted(
    {t for t in SWFL_TERMS}
    | {t.replace(" ", "-") for t in SWFL_TERMS}
    | {"swfl", "southwest florida", "southwest-florida"}
)

# Article-shaped URL patterns across all four sources: Gannett (/story/, /article/), county
# releases (/news/, /releases/). Glob syntax (URLPatternFilter use_glob defaults True).
ARTICLE_URL_PATTERNS = ["*/story/*", "*/article/*", "*/news/*", "*/releases/*"]

# Per-source page cap. The frontier visits highest-score-first, so the cap keeps the BEST N rather
# than the FIRST N (the baseline's flaw). Higher than the baseline's 10 since the deep crawl pays
# no per-article extra round trip.
MAX_PAGES_PER_SOURCE = 25


def _result_markdown(result) -> str:
    """Pull markdown text off a crawl4ai result, tolerant of str vs MarkdownGenerationResult."""
    md_obj = getattr(result, "markdown", None)
    if md_obj is None:
        return ""
    if isinstance(md_obj, str):
        return md_obj
    raw = getattr(md_obj, "raw_markdown", None)
    if raw is not None:
        return raw
    return str(md_obj)


def _headline(result) -> str:
    """Best-effort headline: page <title> metadata, else first markdown H1, else ''."""
    meta = getattr(result, "metadata", None) or {}
    title = (meta.get("title") or "").strip()
    if title:
        return title
    for line in _result_markdown(result).splitlines():
        s = line.strip()
        if s.startswith("# "):
            return s[2:].strip()
    return ""


def _build_run_config(source: dict) -> CrawlerRunConfig:
    host = urlparse(source["url"]).netloc
    scorer = KeywordRelevanceScorer(keywords=SCORER_KEYWORDS, weight=1.0)
    filter_chain = FilterChain(
        [
            DomainFilter(allowed_domains=[host]),
            URLPatternFilter(patterns=ARTICLE_URL_PATTERNS),
        ]
    )
    strategy = BestFirstCrawlingStrategy(
        max_depth=1,
        include_external=False,
        url_scorer=scorer,
        filter_chain=filter_chain,
        max_pages=MAX_PAGES_PER_SOURCE,
    )
    return CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        deep_crawl_strategy=strategy,
        delay_before_return_html=1.0,
        page_timeout=60_000,
        stream=False,
    )


def _rows_from_results(results, source: dict) -> list[ArticleRow]:
    """Turn deep-crawl results into kept ArticleRows: drop depth-0 (the listing) and failures,
    normalize each depth-1 article, keep only swfl_relevant rows (== baseline precision)."""
    rows: list[ArticleRow] = []
    for r in results or []:
        if not getattr(r, "success", False):
            continue
        meta = getattr(r, "metadata", None) or {}
        if meta.get("depth", 0) == 0:
            continue  # the section listing page itself, not an article
        url = getattr(r, "url", "") or ""
        if not url:
            continue
        row = normalize(
            article_url=url,
            headline=_headline(r),
            body_text=_result_markdown(r)[:3000],
            source_name=source["name"],
            published_date=None,
        )
        if row["swfl_relevance"]:
            rows.append(row)
    return rows


async def _crawl_source(source: dict) -> list[ArticleRow]:
    """One stealth crawler per source (mirrors baseline isolation). Returns kept ArticleRows."""
    adapter = UndetectedAdapter()
    bc = BrowserConfig(headless=True, enable_stealth=True)
    strategy = AsyncPlaywrightCrawlerStrategy(browser_adapter=adapter, browser_config=bc)
    async with AsyncWebCrawler(crawler_strategy=strategy, config=bc) as crawler:
        results = await crawler.arun(url=source["url"], config=_build_run_config(source))
    return _rows_from_results(results, source)


def fetch_all_sources_adaptive() -> list[ArticleRow]:
    """Synchronous entrypoint mirroring fetch_all_sources(): run every source's deep crawl
    concurrently, log per-source errors, return the merged ArticleRow list."""

    async def _run():
        results = await asyncio.gather(
            *[_crawl_source(s) for s in SOURCES],
            return_exceptions=True,
        )
        articles: list[ArticleRow] = []
        for r in results:
            if isinstance(r, Exception):
                print(f"[news_swfl] adaptive source error: {r}")
            else:
                articles.extend(r)
        return articles

    return asyncio.run(_run())
