# crawl4ai → Accela Port (lee_permits) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 7 tasks, keywords: architecture, redesign

**Goal:** Replace Firecrawl with crawl4ai (UndetectedAdapter) for the Lee County Accela permit scrape, so `lee_permits` runs end-to-end locally again and lands correct rows in `data_lake.lee_building_permits`.

**Architecture:** A reusable `Crawl4aiSession` (one persistent `AsyncWebCrawler` + `UndetectedAdapter`, pages chained by `session_id`) + a `fetch_many` (arun_many) primitive in `ingest/lib/crawl4ai_client.py`. `lee_permits/scraper.py`'s two network functions are rewritten to drive Accela via these primitives + lee-specific JS builders; parsers and `pipeline.py` orchestration are untouched. Spec: `docs/superpowers/specs/2026-06-16-crawl4ai-accela-port-design.md`.

**Tech Stack:** Python 3.12, crawl4ai 0.8.9 (Playwright/patchright + UndetectedAdapter), dlt, BeautifulSoup, pytest.

---

## File structure

- Create: `ingest/lib/crawl4ai_client.py` — `Crawl4aiError`, `Crawl4aiSession` (async ctx mgr), `fetch_many`. Generic; no Accela knowledge.
- Create: `ingest/tests/lib/test_crawl4ai_client.py` — unit tests for the lee JS builders + a fixture-HTML session smoke test.
- Modify: `ingest/pipelines/lee_permits/scraper.py` — rewrite `fetch_permit_pages` + `enrich_rows_with_details`; add lee JS builders. Parsers unchanged.
- Modify: `ingest/pipelines/lee_permits/pipeline.py:54` — `scraped_via` metadata `"firecrawl"` → `"crawl4ai"`.
- Modify: `ingest/requirements.txt` — add `crawl4ai`.
- Scratch (NOT committed, under `C:\Users\ethan\Downloads\crawl4ai-test\`): `spike_port.py` — the decision-gate spike.

---

## Task 1: Pre-implementation spike (DECISION GATE — run & report before any repo code)

This resolves the last unknowns. **Do not write repo code until this passes.** It runs in the existing scratch venv, not the repo.

**Files:**
- Create (scratch): `C:\Users\ethan\Downloads\crawl4ai-test\spike_port.py`

- [ ] **Step 1: Write the spike script**

```python
# C:\Users\ethan\Downloads\crawl4ai-test\spike_port.py
import asyncio
from crawl4ai import (AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode, UndetectedAdapter)
from crawl4ai.async_crawler_strategy import AsyncPlaywrightCrawlerStrategy

URL = "https://aca-prod.accela.com/LEECO/Cap/CapHome.aspx?module=Permitting&TabName=Permitting"
START, END = "05/01/2026", "06/16/2026"

DATE_FILL_AND_SEARCH = f"""(() => {{
  const setDate = (sel, val) => {{
    const el = document.querySelector(sel);
    if (!el) return 'missing:' + sel;
    for (let i = 0; i < 3; i++) {{
      el.value = val;
      for (const ev of ['input','change','keyup','blur'])
        el.dispatchEvent(new Event(ev, {{bubbles:true}}));
      if (el.value === val) return 'ok';
    }}
    return 'mismatch:' + el.value;
  }};
  window.__d1 = setDate("input[id$='txtGSStartDate']", "{START}");
  window.__d2 = setDate("input[id$='txtGSEndDate']", "{END}");
  document.querySelector('#ctl00_PlaceHolderMain_btnNewSearch').click();
}})();"""

GRID_OR_TERMINAL = ("js:() => !!document.querySelector(\"table[id*='gdvPermitList']\") "
                    "|| /no records|unable to proceed|valid DateTime/i.test(document.body.innerText)")

# Marker probes: page-marker (advisory) + first-row id (primary). Confirm BOTH resolve.
PROBE_MARKERS = """(() => {
  const grid = document.querySelector("table[id*='gdvPermitList']");
  const firstLink = grid ? grid.querySelector("a[href*='CapDetail.aspx']") : null;
  const pager = document.querySelector("td.aca_pagination_PrevNext");
  const activePage = document.querySelector("span.SelectedPageButton, td.aca_pagination span");
  return JSON.stringify({
    firstRow: firstLink ? firstLink.getAttribute('href') : null,
    activePageText: activePage ? activePage.innerText.trim() : null,
    pagerPresent: !!pager,
  });
})();"""

STASH_AND_NEXT = """(() => {
  const grid = document.querySelector("table[id*='gdvPermitList']");
  const firstLink = grid ? grid.querySelector("a[href*='CapDetail.aspx']") : null;
  window.__prevFirstRow = firstLink ? firstLink.getAttribute('href') : undefined;
  window.__prevProbe = 'set';
  const next = document.querySelector("td.aca_pagination_PrevNext:last-child > a");
  if (next) next.click();
})();"""

WINDOW_SURVIVES = "js:() => window.__prevProbe === 'set'"

async def main():
    adapter = UndetectedAdapter()
    bc = BrowserConfig(headless=True, enable_stealth=True)
    strat = AsyncPlaywrightCrawlerStrategy(browser_adapter=adapter, browser_config=bc)
    crawler = AsyncWebCrawler(crawler_strategy=strat, config=bc)
    await crawler.start()
    sid = "spike"
    try:
        # (a) js_code mechanism reproduces fix3: fill+verify+click in js_code_before_wait, wait_for grid
        r1 = await crawler.arun(url=URL, config=CrawlerRunConfig(
            session_id=sid, cache_mode=CacheMode.BYPASS,
            js_code_before_wait=DATE_FILL_AND_SEARCH, wait_for=GRID_OR_TERMINAL,
            delay_before_return_html=1.0, page_timeout=90000))
        html1 = r1.html or ""
        print("A: grid?", "gdvPermitList" in html1, "| dt_error?", "valid DateTime" in html1)
        # confirm dates committed exactly
        d = await crawler.arun(url=URL, config=CrawlerRunConfig(
            session_id=sid, js_only=True, js_code="(() => JSON.stringify([window.__d1, window.__d2]))()",
            delay_before_return_html=0.2))
        # (c) probe both marker selectors resolve
        rp = await crawler.arun(url=URL, config=CrawlerRunConfig(
            session_id=sid, js_only=True, js_code=PROBE_MARKERS, delay_before_return_html=0.2))
        print("C markers:", getattr(rp, "js_execution_result", None) or "(see html)")
        # (b) window survives a js_only Next click
        r2 = await crawler.arun(url=URL, config=CrawlerRunConfig(
            session_id=sid, js_only=True, js_code_before_wait=STASH_AND_NEXT,
            wait_for=WINDOW_SURVIVES, delay_before_return_html=1.0, page_timeout=30000))
        print("B: window survived js_only?", "(wait resolved => yes; timeout => NO)")
        print("B: grid still present after next?", "gdvPermitList" in (r2.html or ""))
    finally:
        await crawler.crawler_strategy.kill_session(sid)
        await crawler.close()

    # (d) CapDetail loads in a CLEAN context (no prior search session)
    adapter2 = UndetectedAdapter()
    strat2 = AsyncPlaywrightCrawlerStrategy(browser_adapter=adapter2, browser_config=bc)
    async with AsyncWebCrawler(crawler_strategy=strat2, config=bc) as c2:
        # paste one real CapDetail href observed in html1 here:
        cap_url = "PASTE_A_REAL_CapDetail_URL_FROM_html1"
        if cap_url.startswith("http"):
            rd = await c2.arun(url=cap_url, config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS, delay_before_return_html=2.0, page_timeout=60000))
            hd = rd.html or ""
            print("D: CapDetail clean-context load OK?",
                  ("Permit" in hd or "Record" in hd) and "valid DateTime" not in hd,
                  "| len", len(hd))
        else:
            print("D: SKIPPED — paste a real CapDetail URL and re-run")

asyncio.run(main())
```

- [ ] **Step 2: Run the spike**

Run: `& "C:\Users\ethan\Downloads\crawl4ai-test\.venv\Scripts\python.exe" "C:\Users\ethan\Downloads\crawl4ai-test\spike_port.py"`

Then grab one real `CapDetail.aspx` URL from the page-1 HTML, paste it into `cap_url`, and re-run for probe (d).

- [ ] **Step 3: Record the decisions (gate)**

Expected/likely (strong priors from fix3 + existing Firecrawl enrich):
- **(a)** `A: grid? True` + exact dates → js_code mechanism works. If FALSE → fall back to the proven hooks mechanism (`after_goto` hook + `page.fill`/`press_sequentially`/`page.click`); the rest of the plan is unchanged except the step internals.
- **(b)** `B: window survived js_only? yes` → change-detection scheme is sound. **If NO (timeout)** → STOP; redesign pagination (e.g., detect page change via grid-content diff captured server-side per call, or full re-submit per page). Do not proceed to Task 4 pagination as written.
- **(c)** `firstRow` non-null → first-row-id gating works (primary). `activePageText` non-null → page-marker usable (advisory). If `activePageText` is null/unstable, gate on `firstRow` alone (already the primary).
- **(d)** `D: ... OK? True` → CapDetail independently addressable → `fetch_many` (Task 5a). **If FALSE** → enrichment is sequential on the kept-alive search session (Task 5b).

Write the four outcomes into `SESSION_LOG.md` before continuing. No commit (scratch only).

---

## Task 2: Generic crawl4ai primitives — `crawl4ai_client.py`

**Files:**
- Create: `ingest/lib/crawl4ai_client.py`
- 🔴 Test: `ingest/tests/lib/test_crawl4ai_client.py`

- [ ] **Step 1: Write the failing test (fixture-HTML session smoke test)**

```python
# ingest/tests/lib/test_crawl4ai_client.py
import asyncio
import pytest
from ingest.lib.crawl4ai_client import Crawl4aiSession, Crawl4aiError

# Local raw-HTML page (no network). crawl4ai accepts raw:// HTML.
_FIXTURE = "raw://<html><body><div id='target'>hello</div></body></html>"

def test_session_step_returns_html_for_raw_page():
    async def run():
        async with Crawl4aiSession(headless=True) as s:
            html = await s.step(_FIXTURE, wait_for="css:#target")
            return html
    html = asyncio.run(run())
    assert "hello" in html
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest ingest/tests/lib/test_crawl4ai_client.py::test_session_step_returns_html_for_raw_page -v`
Expected: FAIL — `ModuleNotFoundError: ingest.lib.crawl4ai_client`.

- [ ] **Step 3: Implement `crawl4ai_client.py`**

```python
# ingest/lib/crawl4ai_client.py
"""Generic crawl4ai primitives (UndetectedAdapter) — the Firecrawl replacement for
interactive/stealth Accela scraping. No Accela-specific knowledge lives here.

Two surfaces:
  Crawl4aiSession — one persistent browser; chain steps by session_id (SEQUENTIAL only).
  fetch_many      — arun_many for INDEPENDENT parallel page fetches (e.g. detail pages).
"""
from __future__ import annotations
from typing import Iterable, Optional

from crawl4ai import (
    AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode, UndetectedAdapter,
)
from crawl4ai.async_crawler_strategy import AsyncPlaywrightCrawlerStrategy


class Crawl4aiError(RuntimeError):
    """A crawl4ai step failed (navigation error, timeout, or unsuccessful result)."""


class Crawl4aiSession:
    """One persistent AsyncWebCrawler + UndetectedAdapter. Steps share session_id so the
    same page persists across calls (js_only=True applies JS without re-navigating).
    SEQUENTIAL only — never issue concurrent steps on one session."""

    def __init__(self, *, session_id: str = "accela", headless: bool = True) -> None:
        self.session_id = session_id
        self.headless = headless
        self._crawler: Optional[AsyncWebCrawler] = None

    async def __aenter__(self) -> "Crawl4aiSession":
        adapter = UndetectedAdapter()
        bc = BrowserConfig(headless=self.headless, enable_stealth=True)
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

    async def __aexit__(self, *exc) -> None:
        if self._crawler is not None:
            try:
                await self._crawler.crawler_strategy.kill_session(self.session_id)
            finally:
                await self._crawler.close()


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
        cache_mode=CacheMode.BYPASS, wait_for=wait_for,
        page_timeout=timeout, delay_before_return_html=1.0,
        semaphore_count=concurrency,
    )
    out: dict[str, str] = {}
    async with AsyncWebCrawler(crawler_strategy=strategy, config=bc) as crawler:
        results = await crawler.arun_many(urls=url_list, config=cfg)
        for r in results:
            out[getattr(r, "url", "")] = (r.html or "") if getattr(r, "success", False) else ""
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m pytest ingest/tests/lib/test_crawl4ai_client.py::test_session_step_returns_html_for_raw_page -v`
Expected: PASS. (If `raw://` is rejected by this crawl4ai build, switch the fixture to a `file://` path of a tiny local `.html` written in a tmp_path fixture — same assertion.)

- [ ] **Step 5: Commit**

```bash
git add ingest/lib/crawl4ai_client.py ingest/tests/lib/test_crawl4ai_client.py
git commit -m "feat(ingest): add crawl4ai_client (Crawl4aiSession + fetch_many)"
```

---

## Task 3: Lee Accela JS builders (pure, unit-tested) in `scraper.py`

These are lee-specific (its selectors). Pure string functions → fully unit-testable without a browser.

**Files:**
- 🔴 Modify: `ingest/pipelines/lee_permits/scraper.py` (add builders near the top, below imports)
- 🔴 Test: `ingest/tests/lib/test_crawl4ai_client.py` (add builder tests — co-located with the other crawl4ai tests)

- [ ] **Step 1: Write the failing tests**

```python
# add to ingest/tests/lib/test_crawl4ai_client.py
from ingest.pipelines.lee_permits.scraper import (
    build_date_search_js, build_next_page_js, GRID_OR_TERMINAL_WAIT, page_changed_wait,
)

def test_date_search_js_sets_both_fields_and_clicks():
    js = build_date_search_js("05/01/2026", "06/16/2026")
    assert "txtGSStartDate" in js and "txtGSEndDate" in js
    assert "05/01/2026" in js and "06/16/2026" in js
    # readback-verify: sets value then checks el.value === val, retries
    assert "el.value === val" in js
    assert "btnNewSearch" in js and ".click()" in js
    # full event set so masked inputs commit
    for ev in ("input", "change", "keyup", "blur"):
        assert ev in js

def test_next_page_js_stashes_markers_before_click():
    js = build_next_page_js()
    assert "window.__prevFirstRow" in js
    assert "CapDetail.aspx" in js  # first-row id derived from the first detail link
    assert "aca_pagination_PrevNext" in js
    # stash MUST precede click (else nothing to compare against)
    assert js.index("__prevFirstRow") < js.index("click()")

def test_page_changed_wait_requires_markers_defined():
    pred = page_changed_wait()
    # the silent-corruption guard: undefined markers must NOT resolve true
    assert "window.__prevFirstRow !== undefined" in pred
    assert "!== window.__prevFirstRow" in pred
    assert pred.startswith("js:")

def test_grid_or_terminal_wait_covers_terminal_states():
    assert GRID_OR_TERMINAL_WAIT.startswith("js:")
    assert "gdvPermitList" in GRID_OR_TERMINAL_WAIT
    for term in ("no records", "unable to proceed", "valid DateTime"):
        assert term in GRID_OR_TERMINAL_WAIT.lower()
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest ingest/tests/lib/test_crawl4ai_client.py -k "js or wait" -v`
Expected: FAIL — `ImportError: cannot import name 'build_date_search_js'`.

- [ ] **Step 3: Implement the builders in `scraper.py`**

Add below the imports (after line 54). These encode the fix3-proven date entry + the defined-marker pagination guard from the spec.

```python
# --- crawl4ai interaction builders (lee Accela form) ---------------------------
_START_SEL = "input[id$='txtGSStartDate']"
_END_SEL   = "input[id$='txtGSEndDate']"
_SEARCH_BTN = "#ctl00_PlaceHolderMain_btnNewSearch"
_FIRST_ROW_JS = "(g => g ? g.querySelector(\"a[href*='CapDetail.aspx']\") : null)" \
                "(document.querySelector(\"table[id*='gdvPermitList']\"))"

def build_date_search_js(start_str: str, end_str: str) -> str:
    """JS for js_code_before_wait: set both date inputs with full event dispatch +
    bounded (<=3) readback-verify (masked fields mangle bulk sets — proven in fix3),
    then click search. Wrong value after 3 tries falls through; the server's
    'valid DateTime' banner is caught by the wait predicate + Python post-check."""
    return f"""(() => {{
  const setDate = (sel, val) => {{
    const el = document.querySelector(sel);
    if (!el) return;
    for (let i = 0; i < 3; i++) {{
      el.value = val;
      for (const ev of ['input','change','keyup','blur'])
        el.dispatchEvent(new Event(ev, {{bubbles:true}}));
      if (el.value === val) return;
    }}
  }};
  setDate("{_START_SEL}", "{start_str}");
  setDate("{_END_SEL}", "{end_str}");
  const b = document.querySelector("{_SEARCH_BTN}");
  if (b) b.click();
}})();"""

def build_next_page_js() -> str:
    """JS for js_code_before_wait on pages 2..N: stash the current first-row id
    (primary change signal) BEFORE clicking the pager Next. The stash must precede
    the click so page_changed_wait has a reference value."""
    return f"""(() => {{
  const firstLink = {_FIRST_ROW_JS};
  window.__prevFirstRow = firstLink ? firstLink.getAttribute('href') : undefined;
  const next = document.querySelector("td.aca_pagination_PrevNext:last-child > a");
  if (next) next.click();
}})();"""

# Page 1: resolve on grid OR a terminal state (so we never hang); Python classifies after.
GRID_OR_TERMINAL_WAIT = (
    "js:() => !!document.querySelector(\"table[id*='gdvPermitList']\") "
    "|| /no records|unable to proceed|valid datetime/i.test(document.body.innerText)"
)

def page_changed_wait() -> str:
    """Pages 2..N: resolve only when the marker is DEFINED and the live first-row id
    differs. Undefined marker (window wiped / stash didn't run) => NOT ready => keep
    polling => timeout => clear error. Never resolve on a stale grid."""
    return (
        "js:() => { "
        "const link = " + _FIRST_ROW_JS + "; "
        "const live = link ? link.getAttribute('href') : undefined; "
        "return window.__prevFirstRow !== undefined && live !== undefined "
        "&& live !== window.__prevFirstRow; }"
    )
```

- [ ] **Step 4: Run to verify they pass**

Run: `python -m pytest ingest/tests/lib/test_crawl4ai_client.py -k "js or wait" -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add ingest/pipelines/lee_permits/scraper.py ingest/tests/lib/test_crawl4ai_client.py
git commit -m "feat(lee_permits): crawl4ai JS builders (date search, pager, waits)"
```

---

## Task 4: Rewrite `fetch_permit_pages` to drive Accela via `Crawl4aiSession`

**Files:**
- 🔴 Modify: `ingest/pipelines/lee_permits/scraper.py` — replace `fetch_permit_pages` (and delete `_base_search_actions`, `_extract_html`, the Firecrawl import usage in this fn). Keep `parse_page_count`, `_ACCELA_SEARCH_URL`, `_PAGER_*`.

- [ ] **Step 1: Replace the function body**

```python
import asyncio
from ingest.lib.crawl4ai_client import Crawl4aiSession, Crawl4aiError

_TERMINAL_ERR = ("unable to proceed", "valid datetime")

def fetch_permit_pages(start_date: date, end_date: date) -> list[str]:
    """Live crawl4ai scrape — one HTML string per results page. Single browser session
    reused across pages (Next-click chaining). Requires a non-datacenter IP (local)."""
    start_str = start_date.strftime("%m/%d/%Y")
    end_str   = end_date.strftime("%m/%d/%Y")
    log.info("fetching Lee Accela permits %s -> %s (crawl4ai)", start_str, end_str)
    return asyncio.run(_fetch_async(start_str, end_str))

async def _fetch_async(start_str: str, end_str: str) -> list[str]:
    async with Crawl4aiSession(session_id="lee_permits") as s:
        # Page 1: fill dates + search.
        html1 = await s.step(
            _ACCELA_SEARCH_URL,
            js_before=build_date_search_js(start_str, end_str),
            wait_for=GRID_OR_TERMINAL_WAIT,
        )
        low = html1.lower()
        if any(t in low for t in _TERMINAL_ERR):
            raise Crawl4aiError(f"Accela rejected the search (date/validation). Preview: {html1[:300]!r}")
        if "gdvPermitList" not in html1:
            if "no records" in low:
                log.info("no permits in range"); return []
            raise Crawl4aiError(f"page 1 has no grid and no 'no records'. Preview: {html1[:300]!r}")
        page_count = parse_page_count(html1)
        log.info("pagecount=%d", page_count)
        pages = [html1]
        # Pages 2..N: click Next, wait for first-row id to change.
        for page_num in range(2, page_count + 1):
            html = await s.step(
                _ACCELA_SEARCH_URL, js_only=True,
                js_before=build_next_page_js(), wait_for=page_changed_wait(),
                timeout=45_000,
            )
            if "gdvPermitList" not in html:
                raise Crawl4aiError(f"page {page_num} (<= pagecount {page_count}) lost the grid — aborting")
            pages.append(html)
            log.info("page %d captured", page_num)
        return pages
```

- [ ] **Step 2: Verify parser tests still pass (no parser change)**

Run: `python -m pytest ingest/pipelines/lee_permits/ -k "parse" -v`
Expected: PASS (existing parser tests unaffected).

- [ ] **Step 3: Live smoke (local, manual) — page 1 + pagination**

Run: `python -m ingest.pipelines.lee_permits.pipeline --start 2026-05-01 --end 2026-06-16 --dry-run`
Expected: `lee_permits dry-run: N rows` with N>0; logs show `pagecount=…` and `page K captured` lines with no `Crawl4aiError`.
If `page_changed_wait` times out on page 2 → re-check Task 1 spike (b)/(c) outcomes; if page-marker was the issue, first-row gating is already primary.

- [ ] **Step 4: Commit**

```bash
git add ingest/pipelines/lee_permits/scraper.py
git commit -m "feat(lee_permits): fetch_permit_pages via crawl4ai session (paginated)"
```

---

## Task 5: Rewrite `enrich_rows_with_details`

Pick **5a** (parallel) if Task 1 spike (d) PASSED; **5b** (sequential) if it FAILED. Default: 5a.

**Files:**
- 🔴 Modify: `ingest/pipelines/lee_permits/scraper.py` — replace `enrich_rows_with_details` body. `parse_cap_detail_html` unchanged.

- [ ] **Step 1 (5a — parallel, spike(d) passed): replace the body**

```python
def enrich_rows_with_details(rows: list[PermitRow], *, concurrency: int = 5) -> list[PermitRow]:
    """Fetch each row's CapDetail.aspx (independent URLs, parallel) and fill issued_date,
    declared_value_usd, permit_type_raw in place."""
    targets = {r.cap_detail_url: i for i, r in enumerate(rows) if r.cap_detail_url}
    if not targets:
        return rows
    log.info("enriching %d/%d rows from CapDetail (crawl4ai, concurrency=%d)",
             len(targets), len(rows), concurrency)
    htmls = asyncio.run(fetch_many(list(targets), concurrency=concurrency))
    for url, idx in targets.items():
        html = htmls.get(url, "")
        if not html:
            log.warning("detail fetch empty idx=%d url=%s", idx, url); continue
        detail = parse_cap_detail_html(html)
        if detail.get("issued_date"):        rows[idx].issued_date = detail["issued_date"]
        if detail.get("declared_value_usd") is not None: rows[idx].declared_value_usd = detail["declared_value_usd"]
        if detail.get("permit_type_raw"):    rows[idx].permit_type_raw = detail["permit_type_raw"]
    return rows
```

Add the import at top: `from ingest.lib.crawl4ai_client import Crawl4aiSession, Crawl4aiError, fetch_many`.

- [ ] **Step 1-alt (5b — sequential on the search session, spike(d) failed):**

Keep enrichment inside `_fetch_async`'s session (do NOT kill it before enrich). Loop `await s.step(cap_url, js_only=False)` per URL sequentially, parse each. (Slower; only if CapDetail is session-gated.)

- [ ] **Step 2: Live smoke — enrichment fills fields**

Run: `python -m ingest.pipelines.lee_permits.pipeline --start 2026-06-09 --end 2026-06-16` (small range; full run, writes to lake)
Expected: completes; spot-check a few rows have non-empty `permit_type_raw` / `issued_date`.

- [ ] **Step 3: Commit**

```bash
git add ingest/pipelines/lee_permits/scraper.py
git commit -m "feat(lee_permits): CapDetail enrichment via crawl4ai fetch_many"
```

---

## Task 6: Metadata + dependency

**Files:**
- Modify: `ingest/pipelines/lee_permits/pipeline.py:54`
- Modify: `ingest/requirements.txt`

- [ ] **Step 1: Update provenance metadata**

In `pipeline.py`, change `"scraped_via": "firecrawl",` → `"scraped_via": "crawl4ai",`.

- [ ] **Step 2: Add the dependency**

Append to `ingest/requirements.txt`: `crawl4ai>=0.8.9` (pin the line; note in PR that GHA needs a `crawl4ai-setup` / Playwright-Chromium install step — deferred with the GHA-IP work).

- [ ] **Step 3: Commit**

```bash
git add ingest/pipelines/lee_permits/pipeline.py ingest/requirements.txt
git commit -m "chore(lee_permits): mark scraped_via=crawl4ai; add crawl4ai dep"
```

---

## Task 7: End-to-end verification + trackers

- [ ] **Step 1: Full local run on a real monthly range**

Run: `python -m ingest.pipelines.lee_permits.pipeline --start 2026-05-16 --end 2026-06-16`
Expected: no `Crawl4aiError`; dlt reports rows loaded.

- [ ] **Step 2: Verify rows landed in the lake**

```bash
python -c "import psycopg; from pathlib import Path; import tomllib; \
c=tomllib.loads(Path('.dlt/secrets.toml').read_text()); \
import re; print('check data_lake.lee_building_permits row count + max issued_date manually')"
```
(Connect via the `.dlt/secrets.toml` URI; confirm `SELECT count(*), min(issued_date), max(issued_date) FROM data_lake.lee_building_permits` reflects the run, and dates are within the searched range — the silent-wrong-date guard.)

- [ ] **Step 3: Observe the sustained-volume risk**

Note in `SESSION_LOG.md` whether the full multi-page + ~100-detail-page run hit any block/timeout (the bot-volume risk the spike couldn't settle). If blocked → that's the trigger to start the GHA-IP / proxy follow-on.

- [ ] **Step 4: Update trackers (same as the eventual push)**

- `SESSION_LOG.md`: top-of-file entry — what changed, spike outcomes, volume observation.
- `node scripts/check.mjs open swfl crawl4ai_accela_gha_ip "lee_permits crawl4ai runs locally; GHA datacenter-IP + Playwright-in-CI unresolved" --detail "verify proven script from a GHA runner before cron"` (the deferred follow-on).
- (collier_permits / dbpr_sirs cutover: leave as a known follow-on — one `.step()` each.)

- [ ] **Step 5: STOP for diff review before push** (ingest pipeline change — RULE 1 requires a diff review before pushing; do not push autonomously).

---

## Self-review notes (author)

- **Spec coverage:** wiring (T2), js_code_before_wait order (T2/T4), Crawl4aiSession+fetch_many (T2), date readback-verify (T3), defined-marker pagination guard (T3 `page_changed_wait` + test), terminal conditions (T3/T4), pages-2..N loud timeout (T4), arun_many concurrency=5 (T2/T5), spike incl. window-survival + CapDetail addressability (T1), GHA-IP deferred (T6/T7). All present.
- **Open dependency on spike:** Tasks 4/5 are written for the expected-pass path; T1 Step 3 documents the exact fallbacks if (a)/(b)/(d) fail. This is intentional, not a placeholder.
- **Type consistency:** `Crawl4aiSession`, `.step(js_before=, wait_for=, js_only=)`, `fetch_many(concurrency=)`, `build_date_search_js`, `build_next_page_js`, `GRID_OR_TERMINAL_WAIT`, `page_changed_wait` — names identical across tasks.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3, Task 4, Task 5 | `ingest/tests/lib/test_crawl4ai_client.py`, `ingest/pipelines/lee_permits/scraper.py` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
