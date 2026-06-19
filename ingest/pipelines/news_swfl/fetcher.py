import asyncio
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
    """Synchronously run all source scrapers and return merged article list."""
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
