"""crawl4ai extraction of active for-sale listings from Source B (a hosted real-estate listings site).

INCOGNITO SOURCE: the host is NOT committed (public repo). Read from `LISTING_LIFECYCLE_BASE_URL`
(a GitHub Actions secret for the cron, a shell/.env var for a local run). Code is generic.

Contract (probed live 2026-06-27 — crawl4ai HTTP strategy, server-rendered, no JS):
  - County feed: `{base}/{county}-county/?pg=N`, 20 cards/page, 1-indexed pages, walked to natural
    exhaustion. SWFL counties present: Lee/Collier/Charlotte/Sarasota/Hendry (Glades 404s — absent).
  - Card = `div.si-listing`. Identity = (data-mlsregionid, data-mls) — data-mls alone is unique only
    WITHIN a region (116 = numeric-MLS region: Lee/Collier/Hendry; 240 = alphanumeric-MLS region:
    Charlotte/Sarasota, with a Tampa-bay bleed dropped by the SWFL-ZIP scope guard).
  - Price = the clean integer `data-price` attr (NOT the `.si-listing__photo-price` text, which jams
    price + photo-count: "$379,999 33").
  - ZIP from the detail URL `-fl-(\\d{5})/` (ZIP gate G1: site address only). beds/baths/sqft from
    `.si-listing__info-value`; an Acres-only card with no Beds is LAND. Unit (condos) is in the title
    (`#B`), never the URL slug. For-sale ONLY — no rentals exist on this source.
  - No days-on-market and no status badge on the page: DOM is LEFT OPEN (no real source on the card —
    a future detail-page list-date lane fills it), and state transitions come from diffing our stored
    set against the daily scan (transitions.py).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup

# crawl4ai + crawl_client are imported LAZILY inside the fetch functions so the pure parser
# (parse_cards) stays importable without the heavy crawl dep — it lives only in the crawl4ai venv,
# not the main test interpreter. Unit tests parse saved HTML and never touch the network.

# Source B carries these SWFL counties (Glades 404s — not on the site). Slug = "{lower}-county".
SWFL_COUNTIES: list[str] = ["Lee", "Collier", "Charlotte", "Sarasota", "Hendry"]

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_MAX_PAGES = 500  # backstop (~10k listings); real counties exhaust ~15-373 pages
_PAGE_DELAY = 1.8  # measured WAF-safe: 40 Lee pages, 0×403 at this delay
_FETCH_ATTEMPTS = 3
_ZIP_RE = re.compile(r"-fl-(\d{5})/", re.I)
_UNIT_RE = re.compile(r"#(\w+)")


def _source_base_url() -> str:
    url = os.environ.get("LISTING_LIFECYCLE_BASE_URL", "").strip()
    if not url:
        raise RuntimeError(
            "LISTING_LIFECYCLE_BASE_URL is not set — Source B's origin is configured via a "
            "secret/env var (kept out of the public repo). Set it before scanning."
        )
    return url.rstrip("/")


def _origin_of(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}"


def _ascii(s: str) -> str:
    return s.encode("ascii", "replace").decode("ascii")


def _swfl_zips() -> set[str]:
    fx = json.loads(Path("fixtures/swfl-zip-county.json").read_text())
    return {e["zip"] for e in fx.get("entries", [])}


def _text(node, sel: str) -> str | None:
    el = node.select_one(sel)
    return el.get_text(" ", strip=True) if el else None


def _num(raw: str | None) -> float | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^\d.]", "", raw)
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _parse_baths(raw: str | None) -> float | None:
    """Baths render either plain ("2", "2.5") or full/half ("4 F 2 1/2" = 4 full + 2 half = 5.0).
    The naive digit-strip turned "4 F 2 1/2" into 4212 — count full + half*0.5 instead."""
    if not raw:
        return None
    if "F" in raw or "1/2" in raw:
        full_m = re.search(r"(\d+)\s*F", raw)
        half_m = re.search(r"(\d+)\s*1/2", raw)
        full = int(full_m.group(1)) if full_m else 0
        half = int(half_m.group(1)) if half_m else (1 if "1/2" in raw else 0)
        return float(full + 0.5 * half)
    return _num(raw)


def parse_cards(html: str) -> list[dict[str, Any]]:
    """Parse one results page's `div.si-listing` cards into wide raw dicts. Pure (no network)."""
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict[str, Any]] = []
    for card in soup.select("div.si-listing"):
        like = card.select_one(".si-listing__like")
        data_url = card.get("data-url") or ""
        mls = (like.get("data-mls") if like else None) or ""
        region = (like.get("data-mlsregionid") if like else None) or ""
        if not mls or not data_url:
            continue  # skip the JS loading-skeleton template (no data attrs)
        zip_m = _ZIP_RE.search(data_url)
        title_main = _text(card, ".si-listing__title-main") or ""
        title_desc = _text(card, ".si-listing__title-description") or ""  # "City, FL 33974"
        unit_m = _UNIT_RE.search(title_main)
        labels = [e.get_text(" ", strip=True) for e in card.select(".si-listing__info-label")]
        values = [e.get_text(" ", strip=True) for e in card.select(".si-listing__info-value")]
        info = dict(zip(labels, values))
        beds = _num(info.get("Beds"))
        acres = _num(info.get("Acres"))
        price = like.get("data-price") if like else None
        rows.append(
            {
                "mls": mls,
                "mls_region": region,
                "list_price": int(price) if (price and price.isdigit()) else None,
                "street_address": title_main or None,
                "city": (title_desc.split(",")[0].strip() or None) if title_desc else None,
                "zip_code": zip_m.group(1) if zip_m else None,
                "state": "FL",
                "unit": unit_m.group(1) if unit_m else None,
                "beds": int(beds) if beds is not None else None,
                "baths": _parse_baths(info.get("Baths")),
                "sqft": int(_num(info.get("Sq.Ft."))) if _num(info.get("Sq.Ft.")) is not None else None,
                "lot_acres": acres,
                # Acres-only card with no beds = a vacant parcel (the one card-level type signal).
                "property_type": "land" if (acres is not None and beds is None) else "residential",
                "subdivision": _text(card, ".si-listing__neighborhood-place"),
                "brokerage": _text(card, ".si-listing__footer"),
                "listing_url": data_url,
                "sale_or_rent": "sale",  # Source B is for-sale only — no rent class exists
            }
        )
    return rows


async def _fetch_html(url: str) -> tuple[str, int]:
    """Fetch one page via crawl4ai HTTP strategy, retry with backoff. Returns (html, status)."""
    from crawl4ai import AsyncWebCrawler, CacheMode, CrawlerRunConfig, HTTPCrawlerConfig
    from crawl4ai.async_crawler_strategy import AsyncHTTPCrawlerStrategy

    from ingest.lib.crawl_client import Crawl4aiError, _proxy_from_env

    cfg = HTTPCrawlerConfig(method="GET", headers={"User-Agent": _UA}, follow_redirects=True, verify_ssl=True)
    run_kwargs: dict = {"cache_mode": CacheMode.BYPASS}
    pc = _proxy_from_env()
    if pc is not None:
        run_kwargs["proxy_config"] = pc
    last = "?"
    for attempt in range(_FETCH_ATTEMPTS):
        try:
            strategy = AsyncHTTPCrawlerStrategy(browser_config=cfg)
            async with AsyncWebCrawler(crawler_strategy=strategy) as crawler:
                r = await crawler.arun(url=url, config=CrawlerRunConfig(**run_kwargs))
            if getattr(r, "success", False):
                return (r.html or ""), int(getattr(r, "status_code", 200) or 200)
            last = str(getattr(r, "error_message", "?"))
        except Exception as exc:  # noqa: BLE001
            last = str(exc)
        if attempt < _FETCH_ATTEMPTS - 1:
            await asyncio.sleep(10.0 * (attempt + 1))
    raise Crawl4aiError(f"Source B: fetch failed for {url} after {_FETCH_ATTEMPTS} attempts: {_ascii(last)}")


# The source caps deep pagination at ~3,000 results per query (pg 151+ return empty 200s), so a plain
# county walk silently TRUNCATES big counties (Lee 7,444 -> 3,000). We partition by PRICE BAND — each
# band is < cap so it pages fully — and union by (region, mls). Verified: Lee bands sum ~7,526 ≈ 7,444.
_CAP = 3000
_BAND_EDGES = [
    0, 100_000, 150_000, 200_000, 250_000, 300_000, 350_000, 400_000, 450_000, 500_000,
    600_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000, 99_000_000,
]


def _band_pairs(edges: list[int]) -> list[tuple[int, int]]:
    """Consecutive [lo, hi) price bands covering the whole range, no gaps/overlaps."""
    return list(zip(edges[:-1], edges[1:]))


async def _printed_total(url: str) -> tuple[int, int]:
    """(the page-printed 'N Properties' total, http status) for a results URL's first page."""
    html, status = await _fetch_html(url)
    m = re.search(r"([\d,]+)\s+Properties", html)
    return (int(m.group(1).replace(",", "")) if m else -1), status


async def _walk(url_base: str, seen: set, out: list, in_scope: set, origin: str, county: str) -> int:
    """Walk ?pg=N of one results URL to natural exhaustion; add new (region, mls) to seen/out.
    Returns the last HTTP status (200 = clean exhaustion; 403 = throttled)."""
    last_status = 200
    sep = "&" if "?" in url_base else "?"
    for page in range(1, _MAX_PAGES + 1):
        try:
            html, last_status = await _fetch_html(f"{url_base}{sep}pg={page}")
        except Exception as exc:  # noqa: BLE001 — a fetch/WAF failure ends this band
            print(f"[warn] {county}: fetch failed {url_base} pg{page}: {_ascii(str(exc))}", flush=True)
            return 403
        new = [c for c in parse_cards(html) if (c["mls_region"], c["mls"]) not in seen]
        if not new:
            return last_status  # empty/all-duplicate page = exhausted (band < cap, so this is real)
        for c in new:
            seen.add((c["mls_region"], c["mls"]))
            c["county"] = county
            c["listing_url"] = (origin + c["listing_url"]) if c["listing_url"].startswith("/") else c["listing_url"]
            if c["zip_code"] in in_scope:  # SWFL scope guard (drops region-240 Tampa bleed)
                out.append(c)
        await asyncio.sleep(_PAGE_DELAY)
    print(f"[warn] {county}: {url_base} hit _MAX_PAGES — may be truncated", flush=True)
    return last_status


async def _scan_band(base, slug, lo, hi, seen, out, in_scope, origin, county, depth=0) -> int:
    """Walk one price band; if it is itself at/over the cap, split at the midpoint and recurse so no
    band ever truncates (full-coverage guarantee, robust to denser counties)."""
    band_url = f"{base}/{slug}-by-price-{lo}-{hi}/"
    total, status = await _printed_total(band_url)
    if status != 200:
        return status
    if total >= _CAP and depth < 6 and (hi - lo) > 1000:
        mid = (lo + hi) // 2
        s1 = await _scan_band(base, slug, lo, mid, seen, out, in_scope, origin, county, depth + 1)
        s2 = await _scan_band(base, slug, mid, hi, seen, out, in_scope, origin, county, depth + 1)
        return 200 if (s1 == 200 and s2 == 200) else 403
    return await _walk(band_url, seen, out, in_scope, origin, county)


async def _scan_county(county: str, in_scope: set[str]) -> dict[str, Any]:
    """Scan one county fully via price-band partition. Returns the coverage-guard payload
    {rows, exhausted, count, last_status, county_total}; county_total is the page-printed total used
    as the cap-aware completeness baseline so a truncated pull can't pass as complete."""
    base, origin = _source_base_url(), _origin_of(_source_base_url())
    slug = f"{county.lower()}-county"
    county_total, _ = await _printed_total(f"{base}/{slug}/")
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    worst_status = 200
    for lo, hi in _band_pairs(_BAND_EDGES):
        st = await _scan_band(base, slug, lo, hi, seen, out, in_scope, origin, county)
        if st != 200:
            worst_status = st
        await asyncio.sleep(_PAGE_DELAY)
    return {"rows": out, "exhausted": worst_status == 200, "count": len(out),
            "last_status": worst_status, "county_total": county_total}


def scan_county(county: str) -> dict[str, Any]:
    """Scan one SWFL county for active for-sale listings (price-band partitioned for full coverage).
    Returns the coverage-guard payload; rows empty on failure (the pipeline guards total-empty)."""
    in_scope = _swfl_zips()
    try:
        return asyncio.run(_scan_county(county, in_scope))
    except Exception as exc:  # noqa: BLE001 — one county must not kill the others
        print(f"[warn] Source B scan error for {county}: {_ascii(str(exc))}", flush=True)
        return {"rows": [], "exhausted": False, "count": 0, "last_status": 0, "county_total": -1}
