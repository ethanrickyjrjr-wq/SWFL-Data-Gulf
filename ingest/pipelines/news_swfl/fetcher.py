import asyncio
import os
import re

from crawl4ai import AsyncWebCrawler

from .normalizer import ArticleRow, is_swfl_relevant, normalize

SOURCES = [
    {
        "name": "naples_daily_news",
        "url": "https://www.naplesnews.com/business/",
    },
    {
        "name": "fort_myers_news_press",
        "url": "https://www.news-press.com/business/",
    },
    {
        "name": "lee_county_govt",
        "url": "https://www.leegov.com/news/releases",
    },
    {
        "name": "collier_county_govt",
        "url": "https://www.colliercountyfl.gov/news",
    },
    {
        "name": "gulfshore_business",
        "url": "https://www.gulfshorebusiness.com/news/",
    },
    {
        # NOT /southwest-florida/ -- that path 404s and silently falls back to a
        # Florida-wide feed (Tampa Bay/Sarasota/Pasco, not Lee/Collier). This is the
        # actual SWFL-scoped section, verified live 07/14/2026.
        "name": "business_observer",
        "url": "https://www.businessobserverfl.com/news/charlotte-lee-collier/",
    },
]

LINK_RE = re.compile(r"\[([^\]]{10,120})\]\((https?://[^\)]+)\)")
MAX_ARTICLES_PER_SOURCE = 10


async def _scrape_listing(crawler: AsyncWebCrawler, source: dict) -> list[dict]:
    """Scrape a section listing page and return candidate article {headline, url} dicts."""
    result = await crawler.arun(url=source["url"])
    md = result.markdown or ""
    candidates = []
    for headline, url in LINK_RE.findall(md):
        if source["name"] in ("lee_county_govt", "collier_county_govt"):
            candidates.append({"headline": headline, "url": url})
        elif any(kw in url for kw in ["/story/", "/article/", "/news/"]):
            candidates.append({"headline": headline, "url": url})
    # SWFL-filter headlines at listing stage to avoid scraping out-of-area articles
    return [c for c in candidates if is_swfl_relevant(c["headline"])][:MAX_ARTICLES_PER_SOURCE * 2]


async def _scrape_article(crawler: AsyncWebCrawler, url: str) -> str:
    """Scrape article body text (first 3000 chars of markdown)."""
    try:
        result = await crawler.arun(url=url)
        return (result.markdown or "")[:3000]
    except Exception:
        return ""


async def _process_source(source: dict) -> list[ArticleRow]:
    async with AsyncWebCrawler() as crawler:
        candidates = await _scrape_listing(crawler, source)
        articles: list[ArticleRow] = []
        for candidate in candidates[:MAX_ARTICLES_PER_SOURCE]:
            body = await _scrape_article(crawler, candidate["url"])
            row = normalize(
                article_url=candidate["url"],
                headline=candidate["headline"],
                body_text=body,
                source_name=source["name"],
                published_date=None,
            )
            if row["swfl_relevance"]:
                articles.append(row)
        return articles


def fetch_all_sources() -> list[ArticleRow]:
    """Synchronously run all source scrapers and return merged article list.

    NEWS_ADAPTIVE (default off): when set, dispatch to the BestFirst scored frontier
    (adaptive_fetcher) instead of the bare-crawler + ~40-cap + regex baseline. The import is
    lazy so the baseline path — and its dependency surface — stays byte-identical when off."""
    if os.environ.get("NEWS_ADAPTIVE", "").strip():
        from .adaptive_fetcher import fetch_all_sources_adaptive

        return fetch_all_sources_adaptive()

    async def _run():
        results = await asyncio.gather(
            *[_process_source(s) for s in SOURCES],
            return_exceptions=True,
        )
        articles = []
        for r in results:
            if isinstance(r, Exception):
                print(f"[news_swfl] source error: {r}")
            else:
                articles.extend(r)
        return articles

    return asyncio.run(_run())
