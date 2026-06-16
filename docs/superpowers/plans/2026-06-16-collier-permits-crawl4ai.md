# Collier Permits — crawl4ai Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Firecrawl stealth + Spider residential in the Collier permits pipeline with crawl4ai UndetectedAdapter, using native browser file download to bypass the Akamai WAF on both the listing page and the XLSX binary.

**Architecture:** `Crawl4aiSession` gains `accept_downloads` + `download_step()`. `fetcher.py` is rewritten with two async-with sessions (distinct IDs: `collier_listing` / `collier_download`); public interface preserved so `pipeline.py` needs only a `scraped_via` metadata update. Two Spider-referencing tests in `test_pipeline.py` are updated to mock the new async layer. GHA workflow gains a dry-run probe (workflow_dispatch, cron held) with Chromium install and dead env refs removed.

**Tech Stack:** Python 3.12, crawl4ai 0.8.x (`AsyncWebCrawler`, `CrawlerRunConfig`, `UndetectedAdapter`), patchright/playwright, pytest, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-06-16-collier-permits-crawl4ai-design.md`

---

### Task 1: Add `accept_downloads` and `download_step()` to `Crawl4aiSession`

**Files:**
- Modify: `ingest/lib/crawl4ai_client.py`
- Create: `ingest/lib/test_crawl4ai_client.py`

- [ ] **Step 1.1: Create the test file with two failing tests for `download_step()`**

Create `ingest/lib/test_crawl4ai_client.py`:

```python
"""Unit tests for crawl4ai_client.py — download_step() guard behavior."""
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from ingest.lib.crawl4ai_client import Crawl4aiError, Crawl4aiSession


def _make_session_with_mock_crawler(downloaded_files: list[str]) -> Crawl4aiSession:
    """Build a Crawl4aiSession with a mocked crawler that returns the given downloaded_files."""
    mock_result = MagicMock()
    mock_result.downloaded_files = downloaded_files
    mock_result.success = True
    mock_result.html = ""

    session = Crawl4aiSession(session_id="test_dl", accept_downloads=True)
    session._crawler = MagicMock()
    session._crawler.arun = AsyncMock(return_value=mock_result)
    return session


def test_download_step_returns_file_bytes_when_files_present(tmp_path: Path) -> None:
    xlsx = tmp_path / "test.xlsx"
    xlsx.write_bytes(b"PK\x03\x04" + b"\x00" * 10)

    session = _make_session_with_mock_crawler([str(xlsx)])
    result = asyncio.run(session.download_step(click_js="(() => {})()", wait_seconds=1.0))

    assert result[:4] == b"PK\x03\x04"


def test_download_step_raises_crawl4ai_error_when_no_files() -> None:
    session = _make_session_with_mock_crawler([])
    with pytest.raises(Crawl4aiError, match="no file in downloaded_files"):
        asyncio.run(session.download_step(click_js="(() => {})()", wait_seconds=1.0))


def test_download_step_raises_when_downloaded_files_is_none() -> None:
    session = _make_session_with_mock_crawler(None)  # type: ignore[arg-type]
    with pytest.raises(Crawl4aiError, match="no file in downloaded_files"):
        asyncio.run(session.download_step(click_js="(() => {})()", wait_seconds=1.0))
```

- [ ] **Step 1.2: Run the tests to confirm they fail (module missing the new API)**

```
cd C:\Users\ethan\dev\brain-platform
python -m pytest ingest/lib/test_crawl4ai_client.py -v 2>&1 | head -30
```

Expected: `AttributeError` or `TypeError` — `accept_downloads` and `download_step` don't exist yet.

- [ ] **Step 1.3: Implement the changes in `crawl4ai_client.py`**

Replace the entire file with:

```python
"""Generic crawl4ai primitives (UndetectedAdapter) — the Firecrawl replacement for
interactive/stealth scraping. No site-specific knowledge lives here.

Two surfaces:
  Crawl4aiSession — one persistent browser; chain steps by session_id (SEQUENTIAL only).
  fetch_many      — arun_many for INDEPENDENT parallel page fetches (e.g. detail pages).
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Iterable, Optional

from crawl4ai import (
    AsyncWebCrawler,
    BrowserConfig,
    CacheMode,
    CrawlerRunConfig,
    UndetectedAdapter,
)
from crawl4ai.async_crawler_strategy import AsyncPlaywrightCrawlerStrategy


class Crawl4aiError(RuntimeError):
    """A crawl4ai step failed (navigation error, timeout, or unsuccessful result)."""


class Crawl4aiSession:
    """One persistent AsyncWebCrawler + UndetectedAdapter. Steps share session_id so the
    same page persists across calls (js_only=True applies JS without re-navigating).
    SEQUENTIAL only — never issue concurrent steps on one session.

    When accept_downloads=True, a temp directory is created at __init__ time and
    registered as BrowserConfig.downloads_path. It is deleted on __aexit__. The
    downloads_path is a BrowserConfig constructor param — it cannot change per-call,
    so mkdtemp() MUST run here, not inside download_step().

    REQUIRED: always use `async with Crawl4aiSession(...) as s:` — bare constructor
    calls skip __aexit__ and leak the temp directory.
    """

    def __init__(
        self,
        *,
        session_id: str = "accela",
        headless: bool = True,
        accept_downloads: bool = False,
    ) -> None:
        self.session_id = session_id
        self.headless = headless
        self.accept_downloads = accept_downloads
        self._downloads_dir: Optional[str] = (
            tempfile.mkdtemp(prefix="crawl4ai_dl_") if accept_downloads else None
        )
        self._crawler: Optional[AsyncWebCrawler] = None

    async def __aenter__(self) -> "Crawl4aiSession":
        adapter = UndetectedAdapter()
        bc = BrowserConfig(
            headless=self.headless,
            enable_stealth=True,
            accept_downloads=self.accept_downloads,
            downloads_path=self._downloads_dir,
        )
        strategy = AsyncPlaywrightCrawlerStrategy(browser_adapter=adapter, browser_config=bc)
        self._crawler = AsyncWebCrawler(crawler_strategy=strategy, config=bc)
        await self._crawler.start()
        return self

    async def step(
        self,
        url: str,
        *,
        js_before: Optional[str] = None,
        wait_for: Optional[str] = None,
        js_only: bool = False,
        timeout: int = 90_000,
        delay_after: float = 1.0,
    ) -> str:
        """Run one arun(): navigate (unless js_only) -> js_before -> wait_for ->
        delay_after -> capture. Returns result.html. Raises Crawl4aiError on failure."""
        assert self._crawler is not None, "use within 'async with'"
        cfg = CrawlerRunConfig(
            session_id=self.session_id,
            cache_mode=CacheMode.BYPASS,
            js_code_before_wait=js_before,
            wait_for=wait_for,
            js_only=js_only,
            page_timeout=timeout,
            delay_before_return_html=delay_after,
        )
        r = await self._crawler.arun(url=url, config=cfg)
        if not getattr(r, "success", False):
            raise Crawl4aiError(f"step failed for {url}: {getattr(r, 'error_message', '?')}")
        return r.html or ""

    async def download_step(
        self,
        *,
        click_js: str,
        wait_seconds: float = 10.0,
    ) -> bytes:
        """Click a download anchor in the current session page and return file bytes.

        Must be called after a step() that navigated to the page containing the anchor.
        Uses js_only=True — the page is NOT re-navigated. The browser clicks the anchor
        and the file lands in self._downloads_dir (set at __init__ time).

        Guard: raises Crawl4aiError if downloaded_files is empty after wait_seconds.
        The caller must have opened this session with accept_downloads=True.
        """
        assert self._crawler is not None, "use within 'async with'"
        cfg = CrawlerRunConfig(
            session_id=self.session_id,
            cache_mode=CacheMode.BYPASS,
            js_code_before_wait=click_js,
            js_only=True,
            page_timeout=int(wait_seconds * 1_000) + 10_000,
            delay_before_return_html=wait_seconds,
        )
        r = await self._crawler.arun(url="", config=cfg)
        files = getattr(r, "downloaded_files", None) or []
        if not files:
            raise Crawl4aiError(
                f"download_step: no file in downloaded_files after {wait_seconds:.0f}s — "
                "anchor may not have been found or clicked"
            )
        return Path(files[0]).read_bytes()

    async def __aexit__(self, *exc) -> None:
        if self._crawler is not None:
            try:
                await self._crawler.crawler_strategy.kill_session(self.session_id)
            finally:
                await self._crawler.close()
        if self._downloads_dir:
            shutil.rmtree(self._downloads_dir, ignore_errors=True)


async def fetch_many(
    urls: Iterable[str],
    *,
    wait_for: Optional[str] = None,
    concurrency: int = 5,
    timeout: int = 60_000,
    headless: bool = True,
) -> dict[str, str]:
    """Fetch INDEPENDENT urls concurrently via arun_many (separate contexts, no shared
    session). Concurrency capped to limit burst-block risk. Returns {url: html}; failed
    urls map to ''."""
    url_list = list(urls)
    if not url_list:
        return {}
    adapter = UndetectedAdapter()
    bc = BrowserConfig(headless=headless, enable_stealth=True)
    strategy = AsyncPlaywrightCrawlerStrategy(browser_adapter=adapter, browser_config=bc)
    cfg = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        wait_for=wait_for,
        page_timeout=timeout,
        delay_before_return_html=1.0,
        semaphore_count=concurrency,
    )
    out: dict[str, str] = {}
    async with AsyncWebCrawler(crawler_strategy=strategy, config=bc) as crawler:
        results = await crawler.arun_many(urls=url_list, config=cfg)
        for r in results:
            out[getattr(r, "url", "")] = (r.html or "") if getattr(r, "success", False) else ""
    return out
```

- [ ] **Step 1.4: Run the tests — expect PASS**

```
python -m pytest ingest/lib/test_crawl4ai_client.py -v
```

Expected output (3 tests):
```
PASSED ingest/lib/test_crawl4ai_client.py::test_download_step_returns_file_bytes_when_files_present
PASSED ingest/lib/test_crawl4ai_client.py::test_download_step_raises_crawl4ai_error_when_no_files
PASSED ingest/lib/test_crawl4ai_client.py::test_download_step_raises_when_downloaded_files_is_none
```

- [ ] **Step 1.5: Verify Lee permits tests still pass (crawl4ai_client is shared)**

```
python -m pytest ingest/pipelines/lee_permits/ -v 2>&1 | tail -20
```

Expected: all existing Lee tests PASS (no changes to `step()` signature).

- [ ] **Step 1.6: Commit**

```bash
git add ingest/lib/crawl4ai_client.py ingest/lib/test_crawl4ai_client.py
git commit -m "feat(crawl4ai): add accept_downloads + download_step() to Crawl4aiSession"
```

---

### Task 2: Extract pure functions and write new tests for `fetcher.py`

**Files:**
- Create: `ingest/pipelines/collier_permits/test_fetcher.py`

This task writes and tests the pure functions before any network code changes, so failures are unambiguous.

- [ ] **Step 2.1: Create `test_fetcher.py` with failing tests for the new pure functions**

Create `ingest/pipelines/collier_permits/test_fetcher.py`:

```python
"""Tests for collier_permits fetcher pure functions.

_parse_listing_html and _build_click_js are fully testable without network.
"""
from __future__ import annotations

from ingest.pipelines.collier_permits.fetcher import (
    MonthlyReport,
    _build_click_js,
    _parse_listing_html,
)

# ---------------------------------------------------------------------------
# Sample listing page HTML (mimics colliercountyfl.gov structure)
# ---------------------------------------------------------------------------

_LISTING_HTML = """
<html><body>
  <ul>
    <li><a href="/files/2026-april-issued-permits.xlsx">April 2026</a></li>
    <li><a href="/files/2026-march-issued-permits.xlsx">March 2026</a></li>
    <li><a href="/files/2026-april-applied-permits.xlsx">April 2026</a></li>
    <li><a href="/files/2026-february-issued-permits.xlsx">February 2026</a></li>
    <li><a href="/files/not-a-permit.pdf">Annual Report</a></li>
  </ul>
</body></html>
"""

_BASE_URL = "https://www.colliercountyfl.gov"


# ---------------------------------------------------------------------------
# _parse_listing_html
# ---------------------------------------------------------------------------

def test_parse_listing_html_returns_issued_only() -> None:
    reports = _parse_listing_html(_LISTING_HTML)
    for r in reports:
        assert "applied" not in r.url.lower()


def test_parse_listing_html_sorted_newest_first() -> None:
    reports = _parse_listing_html(_LISTING_HTML)
    assert len(reports) == 3
    assert reports[0].year == 2026 and reports[0].month == 4
    assert reports[1].year == 2026 and reports[1].month == 3
    assert reports[2].year == 2026 and reports[2].month == 2


def test_parse_listing_html_builds_absolute_url() -> None:
    reports = _parse_listing_html(_LISTING_HTML)
    assert all(r.url.startswith(_BASE_URL) for r in reports)


def test_parse_listing_html_ignores_non_xlsx() -> None:
    reports = _parse_listing_html(_LISTING_HTML)
    assert all(r.url.endswith(".xlsx") for r in reports)


def test_parse_listing_html_empty_html_returns_empty() -> None:
    assert _parse_listing_html("") == []


def test_parse_listing_html_no_issued_links_returns_empty() -> None:
    html = '<html><body><a href="/files/annual.pdf">Annual</a></body></html>'
    assert _parse_listing_html(html) == []


# ---------------------------------------------------------------------------
# _build_click_js
# ---------------------------------------------------------------------------

def test_build_click_js_contains_full_url() -> None:
    url = "https://www.colliercountyfl.gov/files/2026-april-issued-permits.xlsx"
    js = _build_click_js(url)
    assert url in js


def test_build_click_js_contains_relative_path() -> None:
    url = "https://www.colliercountyfl.gov/files/2026-april-issued-permits.xlsx"
    js = _build_click_js(url)
    assert "/files/2026-april-issued-permits.xlsx" in js


def test_build_click_js_is_iife() -> None:
    js = _build_click_js("https://www.colliercountyfl.gov/files/test.xlsx")
    assert js.strip().startswith("(()") or js.strip().startswith("(() =>")
    assert js.strip().endswith(")()")


def test_build_click_js_handles_url_without_base_url_prefix() -> None:
    url = "https://www.other-host.gov/file.xlsx"
    js = _build_click_js(url)
    # When URL doesn't start with BASE_URL, rel == url (no strip)
    assert url in js
```

- [ ] **Step 2.2: Run the tests — expect ImportError (functions not in fetcher.py yet)**

```
python -m pytest ingest/pipelines/collier_permits/test_fetcher.py -v 2>&1 | head -20
```

Expected: `ImportError: cannot import name '_parse_listing_html' from 'ingest.pipelines.collier_permits.fetcher'`

- [ ] **Step 2.3: Commit the test file (before implementation)**

```bash
git add ingest/pipelines/collier_permits/test_fetcher.py
git commit -m "test(collier_permits): pure-function tests for _parse_listing_html + _build_click_js (RED)"
```

---

### Task 3: Rewrite `fetcher.py`

**Files:**
- Modify: `ingest/pipelines/collier_permits/fetcher.py`

- [ ] **Step 3.1: Replace `fetcher.py` entirely**

```python
"""Listing-page parser and XLSX downloader for Collier County building permits.

The download URL for each month is unpredictable (filename suffixes vary, base path
changed Oct 2025), so every run must parse the listing page to discover links.

Uses crawl4ai UndetectedAdapter to bypass the Akamai bot-wall that blocks
colliercountyfl.gov and www.collier.gov by TLS/JA3 fingerprint from any IP
(datacenter and residential; confirmed 2026-06-14). Replaces Firecrawl stealth +
Spider residential, which were removed in this migration.

Two-session pattern (spec NIT-2):
  discover_issued_reports(): session_id="collier_listing"  — listing page only
  download_month():          session_id="collier_download" — listing nav + click download

Both sessions use `async with` (spec NIT-1). The download session is opened AFTER
the listing session is fully closed (sessions are sequential, never concurrent).
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import NamedTuple

from bs4 import BeautifulSoup

from ingest.lib.crawl4ai_client import Crawl4aiSession

from .constants import BASE_URL, LISTING_PAGE_URL, SERIES

_MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


class MonthlyReport(NamedTuple):
    year: int
    month: int
    label: str
    url: str


# ---------------------------------------------------------------------------
# Pure functions (no network — fully unit-testable)
# ---------------------------------------------------------------------------

def _parse_listing_html(html: str) -> list[MonthlyReport]:
    """Parse listing page HTML and return issued-series XLSX entries, newest first."""
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    reports: list[MonthlyReport] = []

    for a in soup.find_all("a", href=True):
        href: str = a["href"]
        if not href.endswith(".xlsx"):
            continue
        href_lower = href.lower()
        if f"-{SERIES}" not in href_lower and f"_{SERIES}" not in href_lower:
            continue
        if "applied" in href_lower:
            continue

        label = a.get_text(strip=True)
        match = re.match(r"([A-Za-z]+)\s+(\d{4})", label)
        if not match:
            continue
        month_num = _MONTH_NAMES.get(match.group(1).lower())
        if month_num is None:
            continue

        url = (BASE_URL + href) if href.startswith("/") else href
        reports.append(MonthlyReport(
            year=int(match.group(2)),
            month=month_num,
            label=label,
            url=url,
        ))

    reports.sort(key=lambda rep: (rep.year, rep.month), reverse=True)
    return reports


def _build_click_js(xlsx_url: str) -> str:
    """Build JS that finds and clicks the XLSX download anchor on the current listing page.

    Tries both the full absolute URL and the root-relative href attribute value.
    Logs to console.error if anchor not found (guard is on result.downloaded_files,
    not on JS return value — crawl4ai js_code is execute-only).
    """
    rel = xlsx_url[len(BASE_URL):] if xlsx_url.startswith(BASE_URL) else xlsx_url
    return f"""(() => {{
  const a = Array.from(document.querySelectorAll('a[href]')).find(
    el => el.getAttribute('href') === {json.dumps(xlsx_url)} ||
          el.getAttribute('href') === {json.dumps(rel)}
  );
  if (a) {{ a.click(); }}
  else {{ console.error('collier_permits: XLSX anchor not found for href: ' + {json.dumps(xlsx_url)}); }}
}})();"""


# ---------------------------------------------------------------------------
# Async internals
# ---------------------------------------------------------------------------

async def _fetch_listing_html_async() -> str:
    """Navigate to the listing page. Returns raw HTML. Session closed on exit."""
    async with Crawl4aiSession(session_id="collier_listing") as s:
        return await s.step(LISTING_PAGE_URL)


async def _download_async(hit: MonthlyReport) -> bytes:
    """One browser session: navigate to listing page (authenticated context),
    click the XLSX anchor, return downloaded file bytes."""
    async with Crawl4aiSession(session_id="collier_download", accept_downloads=True) as s:
        await s.step(LISTING_PAGE_URL)
        click_js = _build_click_js(hit.url)
        return await s.download_step(click_js=click_js, wait_seconds=10.0)


# ---------------------------------------------------------------------------
# Public API — signatures unchanged; pipeline.py requires zero edits
# ---------------------------------------------------------------------------

def discover_issued_reports() -> list[MonthlyReport]:
    """Parse the listing page and return all issued-series XLSX entries, newest first."""
    html = asyncio.run(_fetch_listing_html_async())
    return _parse_listing_html(html)


def download_month(year: int, month: int) -> tuple[bytes, str]:
    """Download the issued XLSX for (year, month). Returns (xlsx_bytes, filename)."""
    reports = discover_issued_reports()
    hit = next((rep for rep in reports if rep.year == year and rep.month == month), None)
    if hit is None:
        available = [(rep.year, rep.month) for rep in reports[:6]]
        raise ValueError(
            f"No issued XLSX found for {year}-{month:02d}. "
            f"Most recent 6 available: {available}"
        )

    filename = hit.url.rsplit("/", 1)[-1]
    xlsx_bytes = asyncio.run(_download_async(hit))
    if xlsx_bytes[:4] != b"PK\x03\x04":
        raise ValueError(
            f"Collier XLSX download for {filename} did not return a ZIP/xlsx "
            f"(first bytes {xlsx_bytes[:8]!r}) — browser may have served an error page"
        )
    return xlsx_bytes, filename


def download_latest_issued() -> tuple[bytes, str]:
    """Download the most recent issued XLSX from the listing page."""
    reports = discover_issued_reports()
    if not reports:
        raise ValueError("No issued XLSX reports found on listing page.")
    latest = reports[0]
    return download_month(latest.year, latest.month)
```

- [ ] **Step 3.2: Run the pure-function tests — expect GREEN**

```
python -m pytest ingest/pipelines/collier_permits/test_fetcher.py -v
```

Expected: all 10 tests PASS.

- [ ] **Step 3.3: Run the existing pipeline tests — expect GREEN**

```
python -m pytest ingest/pipelines/collier_permits/test_pipeline.py -v
```

Expected: all tests PASS. These mock `download_month` / `discover_issued_reports` so they are unaffected by the fetcher rewrite.

- [ ] **Step 3.4: Update two broken Spider-referencing tests in `test_pipeline.py`**

`test_pipeline.py` lines ~474–511 have two tests that patch `fetcher.download_binary` (Spider). That symbol no longer exists. Replace both tests with equivalent tests that patch the new async layer.

Find and replace these two test functions:

```python
# REMOVE these two functions entirely:
# test_download_month_uses_spider_and_validates_magic  (line ~476)
# test_download_month_rejects_non_xlsx_from_proxy      (line ~498)
```

Replace them with:

```python
# ── download_month async layer (crawl4ai) ──────────────────────────────────────

def test_download_month_validates_xlsx_magic_bytes():
    """download_month returns bytes and validates the ZIP magic number."""
    from . import fetcher
    from .fetcher import MonthlyReport, download_month

    report = MonthlyReport(
        year=2026, month=4, label="April 2026",
        url="https://www.colliercountyfl.gov/files/2026-4-issued-permits.xlsx",
    )
    real_xlsx = _build_minimal_xlsx()

    with (
        patch.object(fetcher, "discover_issued_reports", return_value=[report]),
        patch("ingest.pipelines.collier_permits.fetcher.asyncio") as mock_asyncio,
    ):
        mock_asyncio.run.return_value = real_xlsx
        data, filename = download_month(2026, 4)

    assert data[:4] == b"PK\x03\x04"
    assert filename == "2026-4-issued-permits.xlsx"


def test_download_month_raises_on_non_xlsx_bytes():
    """If the browser download returns an HTML error page, raise ValueError."""
    from . import fetcher
    from .fetcher import MonthlyReport, download_month

    report = MonthlyReport(
        year=2026, month=4, label="April 2026",
        url="https://www.colliercountyfl.gov/files/2026-4-issued-permits.xlsx",
    )

    with (
        patch.object(fetcher, "discover_issued_reports", return_value=[report]),
        patch("ingest.pipelines.collier_permits.fetcher.asyncio") as mock_asyncio,
    ):
        mock_asyncio.run.return_value = b"<html>Access Denied</html>"
        with pytest.raises(ValueError, match="did not return a ZIP/xlsx"):
            download_month(2026, 4)
```

- [ ] **Step 3.5: Run the full pipeline test suite — expect GREEN**

```
python -m pytest ingest/pipelines/collier_permits/test_pipeline.py -v 2>&1 | tail -20
```

Expected: all tests PASS (the two renamed tests now use the new async-layer mock).

- [ ] **Step 3.7: NIT-3 — grep for dead env/import refs in fetcher.py**

```bash
grep -n "FIRECRAWL_API_KEY\|SPIDER_API_KEY\|firecrawl_client\|spider_client\|download_binary\|scrape_with_actions" \
  ingest/pipelines/collier_permits/fetcher.py \
  ingest/pipelines/collier_permits/test_pipeline.py
```

Expected: **zero output**. If any line prints, remove the reference before continuing.

- [ ] **Step 3.8: Commit**

```bash
git add ingest/pipelines/collier_permits/fetcher.py ingest/pipelines/collier_permits/test_pipeline.py
git commit -m "feat(collier_permits): rewrite fetcher.py — crawl4ai replaces Firecrawl+Spider; update Spider tests"
```

---

### Task 4: Update `pipeline.py` — `scraped_via` metadata + XLSX size print

**Files:**
- Modify: `ingest/pipelines/collier_permits/pipeline.py`

- [ ] **Step 4.1: Add `scraped_via` to `_ingest_metadata` in `run_pipeline()`**

In `pipeline.py` find the `_ingest_metadata` dict (around line 115):

```python
        r["_ingest_metadata"] = {
            "source": "collier_county_official",
            "format": "xlsx",
            "series": "issued",
        }
```

Change to:

```python
        r["_ingest_metadata"] = {
            "source": "collier_county_official",
            "format": "xlsx",
            "series": "issued",
            "scraped_via": "crawl4ai",
        }
```

- [ ] **Step 4.3: Add size print in the dry-run block**

In `pipeline.py`, find the `if args.dry_run:` block (currently around line 151):

```python
    if args.dry_run:
        try:
            xlsx_bytes, filename = download_month(year, month)
        except ValueError:
            result = _fallback_latest(year, month)
            if result is None:
                raise
            xlsx_bytes, filename = result
        df = pd.read_excel(io.BytesIO(xlsx_bytes), engine="openpyxl", header=1)
        rows = normalize_df(df, source_file=filename)
        print(f"collier_permits dry-run: {len(rows)} rows from {filename} (geocode + dlt skipped)")
        return 0
```

Change to:

```python
    if args.dry_run:
        try:
            xlsx_bytes, filename = download_month(year, month)
        except ValueError:
            result = _fallback_latest(year, month)
            if result is None:
                raise
            xlsx_bytes, filename = result
        print(f"XLSX size: {len(xlsx_bytes):,} bytes")
        df = pd.read_excel(io.BytesIO(xlsx_bytes), engine="openpyxl", header=1)
        rows = normalize_df(df, source_file=filename)
        print(f"collier_permits dry-run: {len(rows)} rows from {filename} (geocode + dlt skipped)")
        return 0
```

- [ ] **Step 4.4: Run the dry-run test to confirm it still passes**

```
python -m pytest ingest/pipelines/collier_permits/test_pipeline.py::test_dry_run_skips_dlt -v
```

Expected: PASS. (The test mocks `download_month` and asserts `dry-run` + `rows` in output — the new `XLSX size:` line is additional output and doesn't break the assertion.)

- [ ] **Step 4.5: Commit**

```bash
git add ingest/pipelines/collier_permits/pipeline.py
git commit -m "feat(collier_permits): scraped_via=crawl4ai in _ingest_metadata; print XLSX size in dry-run"
```

---

### Task 5: Update GHA workflow — hold cron, dry-run probe, Chromium, drop dead env refs

**Files:**
- Modify: `.github/workflows/collier-permits-monthly.yml`

- [ ] **Step 5.1: Replace the workflow file**

```yaml
name: Collier County permits monthly

on:
  # SCHEDULE HELD (2026-06-16): crawl4ai migration landed. Re-enable after:
  # (1) GHA dry-run probe passes green (confirms UndetectedAdapter clears Akamai
  #     from datacenter IP, XLSX download succeeds, size logged).
  # (2) collier_first_lake_ingestion gate clears (first live run confirmed clean).
  #   schedule:
  #     - cron: "0 12 15 * *"
  workflow_dispatch:
    inputs:
      month:
        description: "YYYY-MM to ingest (default: previous calendar month)"
        required: false
        default: ""
      dry_run:
        description: "Dry run — download and parse only; skip geocode + dlt write"
        required: false
        default: "true"

permissions:
  contents: read

jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-python@v6
        with:
          python-version: "3.12"

      - name: Install ingest dependencies
        run: pip install -r ingest/requirements.txt

      - name: Install Chromium for crawl4ai
        run: |
          python -m playwright install --with-deps chromium
          python -m patchright install chromium

      - name: Run Collier permits pipeline
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          DESTINATION__POSTGRES__CREDENTIALS: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
        run: |
          ARGS=""
          if [ -n "${{ github.event.inputs.month }}" ]; then
            ARGS="--month ${{ github.event.inputs.month }}"
          fi
          if [ "${{ github.event.inputs.dry_run }}" = "true" ]; then
            ARGS="$ARGS --dry-run"
          fi
          python -m ingest.pipelines.collier_permits.pipeline $ARGS
```

- [ ] **Step 5.2: NIT-3 — grep for dead env refs in the new workflow file**

```bash
grep -n "FIRECRAWL_API_KEY\|SPIDER_API_KEY" .github/workflows/collier-permits-monthly.yml
```

Expected: **zero output**.

- [ ] **Step 5.3: Commit**

```bash
git add .github/workflows/collier-permits-monthly.yml
git commit -m "ci(collier_permits): crawl4ai migration — hold cron, add dry-run probe, drop Firecrawl/Spider env"
```

---

### Task 6: Final verification sweep + SESSION_LOG + push

**Files:**
- Modify: `SESSION_LOG.md`

- [ ] **Step 6.1: Run the full collier permits test suite**

```
python -m pytest ingest/pipelines/collier_permits/ ingest/lib/test_crawl4ai_client.py -v
```

Expected: all tests PASS. Note the count.

- [ ] **Step 6.2: Full NIT-3 sweep across all touched files**

```bash
grep -rni "FIRECRAWL_API_KEY\|SPIDER_API_KEY\|firecrawl_client\|spider_client\|download_binary\|scrape_with_actions" \
  ingest/pipelines/collier_permits/ \
  ingest/lib/crawl4ai_client.py \
  ingest/lib/test_crawl4ai_client.py \
  .github/workflows/collier-permits-monthly.yml
```

Expected: **zero output** (ignoring `__pycache__` binary files). Any source-file hit is a blocker — remove before pushing.

- [ ] **Step 6.3: Update cadence registry with migration note**

In `ingest/cadence_registry.yaml`, find the `collier_permits` entry and add a comment:

```yaml
  - name: collier_permits
    lane: tier-2
    cadence_days: 30
    tolerance_multiplier: 2.0
    dlt_schema_name: collier_permits
    expected_rows_min: 4477 # 90% of 4,975 confirmed 2026-05-31
    count_table: data_lake.collier_building_permits # dlt schema_name != table name
    # Verified: April 2026 XLSX loaded 2026-05-27 (operator-confirmed, pre-WAF window).
    # 2026-06-16: fetcher rewritten — crawl4ai UndetectedAdapter replaces Firecrawl stealth
    # + Spider residential. GHA dry-run probe required before re-enabling cron.
```

- [ ] **Step 6.4: Write SESSION_LOG entry (required before push)**

Add at the top of `SESSION_LOG.md`:

```markdown
## 2026-06-16 (main) — feat(collier_permits): crawl4ai migration + GHA dry-run probe setup

- Replaced Firecrawl stealth (listing HTML) + Spider residential (XLSX binary) with crawl4ai
  UndetectedAdapter. `Crawl4aiSession` gains `accept_downloads` + `download_step()` (native
  browser file download via `result.downloaded_files`). Two distinct session IDs
  (`collier_listing` / `collier_download`); both `async with` to ensure temp-dir cleanup.
- `fetcher.py` fully rewritten; public interface preserved (`pipeline.py` zero edits).
  Pure functions `_parse_listing_html` + `_build_click_js` extracted and unit-tested.
- `collier-permits-monthly.yml`: cron held, `workflow_dispatch` dry-run default ON,
  Chromium install added, `FIRECRAWL_API_KEY` + `SPIDER_API_KEY` env refs removed.
- Next: run GHA dry-run probe (workflow_dispatch) → confirm green → open check
  `collier_first_lake_ingestion` → first live run → re-enable cron.
```

- [ ] **Step 6.5: Commit SESSION_LOG + cadence_registry**

```bash
git add SESSION_LOG.md ingest/cadence_registry.yaml
git commit -m "log: collier_permits crawl4ai migration — dry-run probe ready"
```

- [ ] **Step 6.6: Push**

```bash
node scripts/safe-push.mjs
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| `accept_downloads` + `mkdtemp` in `__init__` | Task 1 |
| `shutil.rmtree` in `__aexit__` | Task 1 |
| `download_step()` with `js_only=True` click, guard on empty `downloaded_files` | Task 1 |
| `async with` mandatory at both call sites (NIT-1) | Task 3 |
| Distinct session IDs `collier_listing` / `collier_download` (NIT-2) | Task 3 |
| `_parse_listing_html()` extracted as pure function | Tasks 2+3 |
| `_build_click_js()` extracted as pure function | Tasks 2+3 |
| Public interface of `fetcher.py` unchanged | Task 3 |
| Two Spider-referencing tests in `test_pipeline.py` rewritten to mock async layer | Task 3 (step 3.4) |
| `pipeline.py` `_ingest_metadata` gains `"scraped_via": "crawl4ai"` | Task 4 (step 4.1) |
| XLSX size printed in dry-run | Task 4 (step 4.3) |
| GHA cron held with comment | Task 5 |
| `workflow_dispatch` dry-run default ON | Task 5 |
| Chromium install step added | Task 5 |
| `FIRECRAWL_API_KEY` + `SPIDER_API_KEY` removed (NIT-3) | Tasks 3+5 |
| Zero dead env refs (NIT-3 grep) | Tasks 3.4, 5.2, 6.2 |
| Collier gate independent from Lee gate | SESSION_LOG (Task 6) |

**Placeholder scan:** No TBDs, no "similar to above", no "add error handling" — all steps have real code.

**Type consistency:**
- `Crawl4aiSession.download_step()` → `bytes` (Task 1, Task 3)
- `_parse_listing_html(html: str)` → `list[MonthlyReport]` (Task 2, Task 3)
- `_build_click_js(xlsx_url: str)` → `str` (Task 2, Task 3)
- `MonthlyReport` NamedTuple: `(year, month, label, url)` — identical in test fixtures and production code
- `download_month()` return type: `tuple[bytes, str]` — matches `pipeline.py` usage

All consistent. ✓
