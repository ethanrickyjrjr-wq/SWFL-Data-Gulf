"""
Read-only crawl of the live SWFL Data Gulf site to map the actual public link graph
and flow. Does NOT modify anything. Uses crawl4ai (operator-mandated crawler).

For each seed/discovered public URL: load it, record HTTP status, page title,
internal links found (deduped), and any obvious CTA/button text. Output a JSON map
to runs/crawl-site-flow.json for analysis.
"""

import asyncio
import json
import re
from urllib.parse import urljoin, urlparse

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

BASE = "https://www.swfldatagulf.com"

# Curated public seed routes (auth-gated app pages won't render past login; that's
# itself a finding). Mix of marketing, discovery, and tool surfaces.
SEEDS = [
    "/", "/welcome", "/demo", "/ask", "/charts", "/map", "/data-intel",
    "/showcase", "/r", "/r/search", "/claim", "/login", "/privacy", "/terms",
    "/support", "/contacts", "/project", "/billing", "/alerts",
]

INTERNAL = re.compile(r"^https?://(www\.)?swfldatagulf\.com", re.I)


def norm(href: str) -> str | None:
    if not href:
        return None
    u = urljoin(BASE, href)
    p = urlparse(u)
    if "swfldatagulf.com" not in (p.netloc or ""):
        return None
    path = p.path.rstrip("/") or "/"
    # keep hash anchors visible but separate
    return path + (("#" + p.fragment) if p.fragment else "")


async def main():
    browser = BrowserConfig(headless=True, verbose=False)
    run = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        page_timeout=30000,
        wait_until="domcontentloaded",
        scan_full_page=True,
    )
    results = {}
    async with AsyncWebCrawler(config=browser) as crawler:
        for path in SEEDS:
            url = BASE + path
            try:
                res = await crawler.arun(url=url, config=run)
                links_internal = set()
                for l in (res.links or {}).get("internal", []):
                    n = norm(l.get("href", ""))
                    if n:
                        links_internal.add(n)
                # also scrape anchors from raw html as a fallback
                for m in re.findall(r'href=["\\\']([^"\\\']+)["\\\']', res.html or ""):
                    n = norm(m)
                    if n:
                        links_internal.add(n)
                title = ""
                if res.metadata:
                    title = res.metadata.get("title", "") or ""
                results[path] = {
                    "status": res.status_code,
                    "ok": bool(res.success),
                    "title": title,
                    "final_url": res.url,
                    "internal_links": sorted(links_internal),
                    "n_links": len(links_internal),
                    "md_len": len(res.markdown.raw_markdown) if res.markdown else 0,
                }
                print(f"[{res.status_code}] {path:18s} title={title[:50]!r} links={len(links_internal)}")
            except Exception as e:
                results[path] = {"status": None, "ok": False, "error": str(e)[:300]}
                print(f"[ERR] {path:18s} {e}")

    with open("runs/crawl-site-flow.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("\nWROTE runs/crawl-site-flow.json")


if __name__ == "__main__":
    asyncio.run(main())
