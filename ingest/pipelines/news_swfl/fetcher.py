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
        # /news/releases 404s since the county's ~06/2026 platform migration;
        # /news still resolves but renders a nav shell with ZERO release items
        # even fully JS-rendered, and the successor domain (leefl.gov, per
        # leegov.com's own sitemap) 503s at the Akamai edge — verified live
        # 07/26/2026. Pointed at the shell so the run stays green; check
        # news_govt_sources_dead_since_0622 tracks re-probing leefl.gov.
        "name": "lee_county_govt",
        "url": "https://www.leegov.com/news",
    },
    {
        # colliercountyfl.gov is dead — the county moved to collier.gov
        # (~06/2026) and news lives under /News-articles (sitemap-verified
        # live 07/26/2026). article_path scopes candidates to the article
        # namespace, replacing the SWFL-headline listing filter: a county
        # site is geographically scoped by construction, and headlines like
        # "Fee-Waived Dog Adoptions" carry no SWFL term. The body-stage
        # swfl_relevance check still gates the final row.
        "name": "collier_county_govt",
        "url": "https://www.collier.gov/News-articles",
        "article_path": "/News-articles/",
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
# Markdown image syntax nested inside a link — `[Head ![alt](img.png)](url)` —
# makes LINK_RE capture the IMAGE url as the article url (collier.gov's card
# markup does exactly this). Strip images before link extraction.
IMG_MD_RE = re.compile(r"!\[[^\]]*\]\([^\)]*\)")
MAX_ARTICLES_PER_SOURCE = 10


# collier.gov card links wrap the WHOLE card in one link — headline +
# "Published on <Month D, YYYY>" + full teaser — far past LINK_RE's 120-char
# text cap, so path-scoped sources get a wide-window regex instead.
LONG_LINK_RE = re.compile(r"\[([^\]]{10,600})\]\((https?://[^\)]+)\)")
PUBLISHED_ON_RE = re.compile(r"\bPublished on\s+([A-Z][a-z]+ \d{1,2}, \d{4})\b")


def _parse_published_on(text: str) -> str | None:
    m = PUBLISHED_ON_RE.search(text)
    if not m:
        return None
    from datetime import datetime

    try:
        return datetime.strptime(m.group(1), "%B %d, %Y").date().isoformat()
    except ValueError:
        return None


def _extract_candidates(md: str, source: dict) -> list[dict]:
    """Pure listing-markdown -> candidate {headline, url[, published_date]} extraction (testable)."""
    md = IMG_MD_RE.sub("", md)
    path = source.get("article_path")
    if path:
        # Path-scoped sources are already article-only; a county site is SWFL
        # by construction, so no headline-term filter (body check still gates).
        candidates = []
        for text, url in LONG_LINK_RE.findall(md):
            if path not in url:
                continue
            m = PUBLISHED_ON_RE.search(text)
            headline = (text[: m.start()] if m else text).strip()
            candidates.append(
                {
                    "headline": headline,
                    "url": url,
                    "published_date": _parse_published_on(text),
                }
            )
        return candidates[:MAX_ARTICLES_PER_SOURCE * 2]
    candidates = []
    for headline, url in LINK_RE.findall(md):
        if source["name"] in ("lee_county_govt", "collier_county_govt"):
            candidates.append({"headline": headline, "url": url})
        elif any(kw in url for kw in ["/story/", "/article/", "/news/"]):
            candidates.append({"headline": headline, "url": url})
    # SWFL-filter headlines at listing stage to avoid scraping out-of-area articles
    return [c for c in candidates if is_swfl_relevant(c["headline"])][:MAX_ARTICLES_PER_SOURCE * 2]


async def _scrape_listing(crawler: AsyncWebCrawler, source: dict) -> list[dict]:
    """Scrape a section listing page and return candidate article {headline, url} dicts."""
    result = await crawler.arun(url=source["url"])
    return _extract_candidates(result.markdown or "", source)


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
                # Real publish date when the listing carries one (collier.gov
                # cards do); None keeps the normalizer's today-coerce.
                published_date=candidate.get("published_date"),
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
