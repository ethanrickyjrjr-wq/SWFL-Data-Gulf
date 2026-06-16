"""crawl4ai-driven Lee County Accela permit scraper.

Public API:
  fetch_permit_pages(start_date, end_date) -> list[str]
      Fetches all paginated results via crawl4ai (UndetectedAdapter, one reused
      browser session). Returns one HTML string per page.

  parse_accela_result_page(html, issued_date_fallback) -> list[PermitRow]
      Pure parser — no network. Extracts permit rows including cap_detail_url.
      Filters out 26TMP-* temporary applications (no issued date, no detail link).

  parse_page_count(html) -> int
      Reads pagecount attribute from the Accela GridView table.

  parse_cap_detail_html(html) -> dict
      Pure parser for CapDetail.aspx. Extracts issued_date, declared_value_usd,
      permit_type_raw.

  enrich_rows_with_details(rows, max_workers) -> list[PermitRow]
      Parallel-fetches each row's CapDetail.aspx URL and fills issued_date,
      declared_value_usd, permit_type_raw in place.

v3 — 2026-06-16 (crawl4ai cutover)
----------------------------------
Replaced Firecrawl (gone) with crawl4ai + UndetectedAdapter. fetch_permit_pages
now drives one reused browser session (Crawl4aiSession): page 1 fills the date
range via build_date_search_js and clicks search; pages 2..N click the "Next >"
pager (build_next_page_js) and wait on a defined-marker first-row-id change
(page_changed_wait) — the partial ASP.NET UpdatePanel postback preserves the
window across the js_only click. pagecount is read from page 1's GridView. There
is no Firecrawl-style 60 s wait cap; per-page browser cost is amortized by the
single session. Requires a non-datacenter IP (local-first; GHA IP is deferred).

Per-permit detail: after pagination, each row's CapDetail.aspx URL is fetched in
a clean context (crawl4ai_client.fetch_many, independent + parallel) to extract
issued_date, declared_value_usd, permit_type_raw.

The parsers below (parse_accela_result_page, parse_page_count, parse_cap_detail_html)
are pure and unchanged by the cutover. firecrawl_client is intentionally left
imported as the rollback path until the cutover is proven in production.
"""
from __future__ import annotations

import asyncio
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from bs4 import BeautifulSoup

from ingest.lib.crawl4ai_client import Crawl4aiError, Crawl4aiSession
from ingest.lib.firecrawl_client import FirecrawlError, scrape_with_actions

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# crawl4ai interaction builders (lee Accela form)
# ---------------------------------------------------------------------------
# Pure string functions → fully unit-testable without a browser. These encode the
# fix3-proven date entry (masked fields mangle bulk sets) + the defined-marker
# pagination guard from docs/superpowers/specs/2026-06-16-crawl4ai-accela-port-design.md.

_START_SEL = "input[id$='txtGSStartDate']"
_END_SEL = "input[id$='txtGSEndDate']"
_SEARCH_BTN = "#ctl00_PlaceHolderMain_btnNewSearch"
_FIRST_ROW_JS = (
    "(g => g ? g.querySelector(\"a[href*='CapDetail.aspx']\") : null)"
    "(document.querySelector(\"table[id*='gdvPermitList']\"))"
)


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


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class PermitRow:
    permit_id: str
    issued_date: str           # ISO YYYY-MM-DD; fallback = search end_date until enriched
    permit_type_raw: str       # empty until enriched from detail page
    permit_description_raw: str
    address: str
    zip_code: Optional[str]
    lat: Optional[float]
    lon: Optional[float]
    declared_value_usd: Optional[float]
    status: Optional[str]
    cap_detail_url: Optional[str] = field(default=None)  # CapDetail.aspx href from list view


# ---------------------------------------------------------------------------
# Column indices (confirmed against live portal 2026-05-25)
# ---------------------------------------------------------------------------

_COL_PERMIT_ID  = 1
_COL_ADDRESS    = 2
_COL_DESCRIPTION = 3
_COL_STATUS     = 4

# ---------------------------------------------------------------------------
# Regex helpers
# ---------------------------------------------------------------------------

_ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\b")

# Lee permit IDs: BLD2026-NNNNN, MEC2026-NNNNN-R01, 26TMP-NNNNNN, etc.
_PERMIT_ID_RE = re.compile(
    r"^[A-Z]{2,5}\d{4}-\d{3,6}(?:-R\d+)?$"
    r"|^\d{2}TMP-\d{4,6}$"
)
_TMP_PREFIX_RE = re.compile(r"^\d{2}TMP-", re.IGNORECASE)


def _extract_zip(address: str) -> Optional[str]:
    m = _ZIP_RE.search(address or "")
    return m.group(1) if m else None


def _parse_mm_dd_yyyy(value: str) -> Optional[str]:
    """Convert MM/DD/YYYY → YYYY-MM-DD; None on failure."""
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", (value or "").strip())
    if not m:
        return None
    return f"{m.group(3)}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}"


# ---------------------------------------------------------------------------
# List-page parsers
# ---------------------------------------------------------------------------

def parse_page_count(html: str) -> int:
    """Read pagecount="N" from the Accela GridView table. Returns 1 if absent."""
    m = re.search(r'pagecount="(\d+)"', html)
    return int(m.group(1)) if m else 1


def parse_accela_result_page(html: str, issued_date_fallback: str = "") -> list[PermitRow]:
    """Pure parser. No network. Safe to call with captured fixture HTML.

    Extracts permit_id, address, description, status, and cap_detail_url.
    Rows matching 26TMP-* are excluded (temporary applications, not issued permits).
    issued_date_fallback is stamped on every row; real dates are filled later by
    enrich_rows_with_details().
    """
    if not html or not html.strip():
        return []
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", id=re.compile(r"gdvPermitList"))
    if table is None:
        table = soup.find("table", class_=re.compile(r"GridView|ResultGrid"))
    if table is None:
        return []

    rows: list[PermitRow] = []
    for tr in table.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) <= _COL_STATUS:
            continue

        permit_cell = cells[_COL_PERMIT_ID]
        permit_id = permit_cell.get_text(" ", strip=True)
        if not _PERMIT_ID_RE.match(permit_id):
            continue  # header / pager row

        # 26TMP-* rows are temporary applications — no detail URL, no issued date
        if _TMP_PREFIX_RE.match(permit_id):
            continue

        # Harvest CapDetail.aspx URL from the <a href="..."> around the permit number
        a_tag = permit_cell.find("a", href=lambda h: h and "CapDetail.aspx" in h)
        cap_detail_url = a_tag["href"] if a_tag else None

        address = cells[_COL_ADDRESS].get_text(" ", strip=True)
        description = cells[_COL_DESCRIPTION].get_text(" ", strip=True)
        status = cells[_COL_STATUS].get_text(" ", strip=True)

        rows.append(
            PermitRow(
                permit_id=permit_id,
                issued_date=issued_date_fallback,
                permit_type_raw="",
                permit_description_raw=description,
                address=address,
                zip_code=_extract_zip(address),
                lat=None,
                lon=None,
                declared_value_usd=None,
                status=status or None,
                cap_detail_url=cap_detail_url,
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Detail-page parser
# ---------------------------------------------------------------------------

def parse_cap_detail_html(html: str) -> dict[str, Any]:
    """Pure parser for a CapDetail.aspx page.

    Returns {"issued_date": str|None, "declared_value_usd": float|None,
             "permit_type_raw": str|None}.

    Two strategies per field:
      1. ID-based: look for a <span id="...lblIssuedDate"> etc.
      2. Label-based: find a <td> whose text is "Issue Date" and read the next <td>.
    Falls back to None when field is absent.
    """
    if not html:
        return {"issued_date": None, "declared_value_usd": None, "permit_type_raw": None}

    soup = BeautifulSoup(html, "html.parser")

    def _span_text(id_pattern: str) -> Optional[str]:
        tag = soup.find(id=re.compile(id_pattern, re.IGNORECASE))
        return (tag.get_text(strip=True) or None) if tag else None

    def _label_neighbor(label_re: str) -> Optional[str]:
        """Find a label text node and return the value from its sibling container.

        Handles two DOM patterns on Accela LEECO CapDetail.aspx:
        1. Table pattern: <td>Label</td><td>Value</td>
        2. MoreDetail pattern (Application Information section):
               <div class="MoreDetail_ItemCol1"><span>Label</span></div>
               <div class="MoreDetail_ItemCol2"><span>Value</span></div>
        The valuation field (Est Const. Value / Construction Value) only appears
        in the MoreDetail pattern — the td pattern returns None for it.
        """
        cell = soup.find(string=re.compile(label_re, re.IGNORECASE))
        if not cell:
            return None
        # Pattern 1: td sibling
        parent_td = cell.find_parent("td")
        if parent_td:
            sibling = parent_td.find_next_sibling("td")
            if sibling:
                return sibling.get_text(strip=True) or None
        # Pattern 2: MoreDetail_ItemColN div sibling
        parent_div = cell.find_parent(
            class_=re.compile(r"MoreDetail_ItemCol", re.IGNORECASE)
        )
        if parent_div:
            sibling = parent_div.find_next_sibling()
            if sibling:
                return sibling.get_text(strip=True) or None
        return None

    # --- issued_date ---
    issued_date: Optional[str] = None
    for pat in ["lblIssuedDate", "lblIssueDate", "lblIssDate"]:
        raw = _span_text(pat)
        if raw:
            issued_date = _parse_mm_dd_yyyy(raw)
            if issued_date:
                break
    if not issued_date:
        for label in [r"Issue\s+Date", r"Issued\s+Date", r"Date\s+Issued"]:
            raw = _label_neighbor(label)
            if raw:
                issued_date = _parse_mm_dd_yyyy(raw)
                if issued_date:
                    break

    # --- declared_value_usd ---
    declared_value_usd: Optional[float] = None
    for pat in ["lblDeclaredValuation", "lblJobValue", "lblProjectValue", "lblValuation"]:
        raw = _span_text(pat)
        if raw:
            cleaned = re.sub(r"[,$\s]", "", raw)
            try:
                declared_value_usd = float(cleaned)
                break
            except ValueError:
                pass
    if declared_value_usd is None:
        for label in [
            # LEECO live patterns (confirmed 2026-06-08 against COM2026-00865 / FNC2026-02222)
            r"Est\s+Const\.\s+Value",      # commercial alterations, new construction
            r"Construction\s+Value",        # residential fence, misc residential
            # Generic fallbacks for other Accela agency patterns
            r"Declared\s+Valuation",
            r"Job\s+Value",
            r"Project\s+Value",
            r"Valuation",
        ]:
            raw = _label_neighbor(label)
            if raw:
                cleaned = re.sub(r"[,$\s]", "", raw)
                try:
                    declared_value_usd = float(cleaned)
                    break
                except ValueError:
                    pass

    # --- permit_type_raw ---
    permit_type_raw: Optional[str] = (
        _span_text("lblPermitType")
        or _span_text("lblRecordType")
        or _span_text("lblType")
    )

    return {
        "issued_date": issued_date,
        "declared_value_usd": declared_value_usd,
        "permit_type_raw": permit_type_raw or "",
    }


# ---------------------------------------------------------------------------
# Live fetching — requires FIRECRAWL_API_KEY
# ---------------------------------------------------------------------------

_ACCELA_SEARCH_URL = (
    "https://aca-prod.accela.com/LEECO/Cap/CapHome.aspx"
    "?module=Permitting&TabName=Permitting"
)

# "Next >" pager link. Pager row structure (confirmed live 2026-06-06):
#   [ACA_Hide] [td.aca_pagination_PrevNext: < Prev] [td: 1][td: 2]...[td: ...]
#   [td.aca_pagination_PrevNext: Next >]
# "Next >" is always the last td in the row AND the last td.aca_pagination_PrevNext.
# href is always empty so text is not selectable via attribute; positional works.
# This is the canonical pager selector; build_next_page_js() inlines the same string.
_PAGER_NEXT_SELECTOR = "td.aca_pagination_PrevNext:last-child > a"


def _extract_html(resp: dict) -> str:
    """Pull HTML from a /v2/scrape REST response (still used by enrich until cutover)."""
    return (resp.get("data") or {}).get("html") or ""


# Server-side validation banners that mean the search itself was rejected (bad
# date / form state) — distinct from a legitimate empty "no records" result.
_TERMINAL_ERR = ("unable to proceed", "valid datetime")


def fetch_permit_pages(start_date: date, end_date: date) -> list[str]:
    """Live crawl4ai scrape — one HTML string per results page. A single browser
    session (UndetectedAdapter) is reused across pages via Next-click chaining
    (partial ASP.NET UpdatePanel postback). Requires a non-datacenter IP (local)."""
    if not log.handlers:
        logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
    start_str = start_date.strftime("%m/%d/%Y")
    end_str = end_date.strftime("%m/%d/%Y")
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
            raise Crawl4aiError(
                f"Accela rejected the search (date/validation). Preview: {html1[:300]!r}"
            )
        if "gdvPermitList" not in html1:
            if "no records" in low:
                log.info("no permits in range")
                return []
            raise Crawl4aiError(
                f"page 1 has no grid and no 'no records'. Preview: {html1[:300]!r}"
            )
        page_count = parse_page_count(html1)
        log.info("pagecount=%d", page_count)
        pages = [html1]
        # Pages 2..N: click Next, wait for the first-row id to change.
        for page_num in range(2, page_count + 1):
            html = await s.step(
                _ACCELA_SEARCH_URL,
                js_only=True,
                js_before=build_next_page_js(),
                wait_for=page_changed_wait(),
                timeout=45_000,
            )
            if "gdvPermitList" not in html:
                raise Crawl4aiError(
                    f"page {page_num} (<= pagecount {page_count}) lost the grid — aborting"
                )
            pages.append(html)
            log.info("page %d captured", page_num)
        return pages


def enrich_rows_with_details(
    rows: list[PermitRow],
    *,
    max_workers: int = 10,
) -> list[PermitRow]:
    """Parallel-fetch each row's CapDetail.aspx URL and fill issued_date,
    declared_value_usd, permit_type_raw in place.

    Rows without cap_detail_url are skipped (already filtered TMP rows won't
    appear here). On fetch failure the row keeps its fallback values.
    """
    detail_targets = [(i, r.cap_detail_url) for i, r in enumerate(rows) if r.cap_detail_url]
    if not detail_targets:
        return rows

    log.info(
        "enriching %d/%d rows from CapDetail pages (workers=%d)",
        len(detail_targets),
        len(rows),
        max_workers,
    )

    def _fetch_one(idx: int, url: str) -> tuple[int, dict]:
        try:
            resp = scrape_with_actions(url, [], proxy="stealth", wait_for_ms=3000, timeout=60_000)
            html = _extract_html(resp)
            return idx, parse_cap_detail_html(html)
        except Exception as exc:
            log.warning("detail fetch failed idx=%d url=%s: %s", idx, url, exc)
            return idx, {}

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_one, i, url): i for i, url in detail_targets}
        for fut in as_completed(futures):
            idx, detail = fut.result()
            if detail.get("issued_date"):
                rows[idx].issued_date = detail["issued_date"]
            if detail.get("declared_value_usd") is not None:
                rows[idx].declared_value_usd = detail["declared_value_usd"]
            if detail.get("permit_type_raw"):
                rows[idx].permit_type_raw = detail["permit_type_raw"]

    return rows
