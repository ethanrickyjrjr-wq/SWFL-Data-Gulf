"""crawl4ai FETCH for collier_official_records — cor.collierclerk.com Document
Search, ALL 37 doc types (no doc-type filter applied), paginated via the grid's
own Kendo pager.

Unlike lee_permits (Akamai-free but needs date-mismatch guards) and unlike
lee_deed_official_records (Akamai-blocked, manual capture only), Collier's
Document Search is a Kendo UI for Blazor grid with NO CAPTCHA/bot wall observed
on any tested step — verified live 08/12/2026 across 7 back-to-back automated
searches with zero blocks (see
_RESEARCH/data-and-ingest/2026-08-12-collier-clerk-liveness-probe.md). This
module drives the real search + pagination end to end; normalize.py does the
pure-function row parsing.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import date

from bs4 import BeautifulSoup

from ingest.lib.crawl_client import Crawl4aiError, Crawl4aiSession

log = logging.getLogger(__name__)

_HOME_URL = "https://cor.collierclerk.com/"

_CLICK_DOCUMENT_SEARCH_JS = """
const links = Array.from(document.querySelectorAll('a'));
const target = links.find(a => a.textContent.trim().toLowerCase().includes('document search'));
if (target) { target.click(); }
await new Promise(r => setTimeout(r, 1500));
"""

# Native <input type="date"> requires ISO yyyy-mm-dd. A MM/DD/YYYY value is
# silently rejected by the browser (the field keeps its default) — this produced
# a real, confirmed bug the first time this search was driven live: three
# different requested ranges all returned the same result count until the format
# was fixed. Do not "simplify" this back to a US-format string.
_SUBMIT_SEARCH_JS_TEMPLATE = """
await new Promise(r => setTimeout(r, 1200));
const start = document.querySelector('input[name*="StartDate"]');
const end = document.querySelector('input[name*="EndDate"]');
if (start) {{ start.value = '{start_iso}'; start.dispatchEvent(new Event('input', {{bubbles:true}})); start.dispatchEvent(new Event('change', {{bubbles:true}})); }}
if (end) {{ end.value = '{end_iso}'; end.dispatchEvent(new Event('input', {{bubbles:true}})); end.dispatchEvent(new Event('change', {{bubbles:true}})); }}
await new Promise(r => setTimeout(r, 500));
const buttons = Array.from(document.querySelectorAll('button'));
const searchBtn = buttons.find(b => b.textContent.trim().toLowerCase() === 'search');
if (searchBtn) {{ searchBtn.click(); }}
"""

# Standard Kendo UI Grid Pager button, confirmed live 08/12/2026 (title text is a
# Kendo framework default, not a Collier-specific guess): the sibling
# "Go to the first page" / "Go to the previous page" buttons were captured in the
# same probe, same naming convention.
_NEXT_PAGE_JS = """
const btn = document.querySelector('button[title="Go to the next page"]');
if (btn && !btn.disabled && !btn.className.includes('k-disabled')) { btn.click(); }
await new Promise(r => setTimeout(r, 1500));
"""

_PAGE_NAV_RE = re.compile(r"of (\d+)")


def parse_total_pages(html: str) -> int:
    """"Page navigation, page 1 of 194" -> 194. No pager (zero/one-page result) -> 1."""
    soup = BeautifulSoup(html, "html.parser")
    nav = soup.find(attrs={"aria-label": lambda v: isinstance(v, str) and v.startswith("Page navigation")})
    if not nav:
        return 1
    m = _PAGE_NAV_RE.search(nav.get("aria-label", ""))
    return int(m.group(1)) if m else 1


def _first_instrument(html: str) -> str | None:
    """First result row's Instrument number — the pagination-advanced safety check."""
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if len(tables) < 2:
        return None
    rows = tables[1].find_all("tr")
    if not rows:
        return None
    tds = rows[0].find_all("td")
    if len(tds) < 5:
        return None
    return tds[4].get_text(strip=True) or None


async def fetch_date_range(start: date, end: date, *, max_pages: int = 500) -> list[str]:
    """Fetch every result page for [start, end] (inclusive), paginating via the
    grid's own "Go to the next page" control. Returns the raw HTML of each page.

    Safety: aborts loud if a page's first-row Instrument does not change after
    clicking next (same discipline as lee_permits/scraper.py — never silently
    loop on a stuck page). max_pages is a hard ceiling, not a target; hitting it
    means the date range is too wide for one run and should be narrowed by the
    caller, not silently truncated.
    """
    start_iso, end_iso = start.isoformat(), end.isoformat()
    async with Crawl4aiSession(session_id="collier_official_records") as sess:
        await sess.step(_HOME_URL, wait_for="css:body", delay_after=2.5, timeout=45_000)
        await sess.step(
            _HOME_URL,
            js_before=_CLICK_DOCUMENT_SEARCH_JS,
            js_only=True,
            delay_after=1.0,
            timeout=45_000,
        )
        html = await sess.step(
            _HOME_URL,
            js_before=_SUBMIT_SEARCH_JS_TEMPLATE.format(start_iso=start_iso, end_iso=end_iso),
            js_only=True,
            delay_after=4.5,
            timeout=60_000,
        )
        pages = [html]
        total_pages = parse_total_pages(html)
        log.info(
            "collier_official_records: %s..%s -> %d page(s)", start_iso, end_iso, total_pages
        )
        if total_pages > max_pages:
            raise Crawl4aiError(
                f"collier_official_records: {start_iso}..{end_iso} needs {total_pages} "
                f"pages, over the {max_pages} safety ceiling — narrow the date range"
            )
        last_first = _first_instrument(html)
        for page_num in range(2, total_pages + 1):
            html = await sess.step(
                _HOME_URL,
                js_before=_NEXT_PAGE_JS,
                js_only=True,
                delay_after=2.0,
                timeout=45_000,
            )
            this_first = _first_instrument(html)
            if this_first is not None and this_first == last_first:
                raise Crawl4aiError(
                    f"collier_official_records: page {page_num} of {total_pages} did not "
                    f"advance (first row Instrument stayed {this_first!r}) — aborting"
                )
            last_first = this_first
            pages.append(html)
        return pages


def fetch_date_range_sync(start: date, end: date, *, max_pages: int = 500) -> list[str]:
    return asyncio.run(fetch_date_range(start, end, max_pages=max_pages))
