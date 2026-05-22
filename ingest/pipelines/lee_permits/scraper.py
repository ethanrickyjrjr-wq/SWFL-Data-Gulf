"""Firecrawl-driven Lee County Accela permit scraper.

Two entry points:
  - fetch_permit_pages(start_date, end_date) -> list[str]  : pulls raw HTML/markdown via Firecrawl
  - parse_accela_result_page(html: str) -> list[PermitRow]  : pure parser, no I/O

The Firecrawl session pattern handles Accela's ASP.NET viewstate + cookie session
(the search form is a POST, not a GET, so /scrape alone is insufficient — use
/interact for the form submission, then /scrape on the result page).

See: firecrawl-build-interact skill for the interact pattern.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Optional
import os
import re
from bs4 import BeautifulSoup


@dataclass
class PermitRow:
    permit_id: str
    issued_date: str  # ISO YYYY-MM-DD
    permit_type_raw: str
    permit_description_raw: str
    address: str
    zip_code: Optional[str]
    lat: Optional[float]
    lon: Optional[float]
    declared_value_usd: Optional[float]
    status: Optional[str]


def parse_accela_result_page(html: str) -> list[PermitRow]:
    """Pure parser. No network. Test against captured fixtures."""
    if not html or not html.strip():
        return []
    soup = BeautifulSoup(html, "html.parser")
    # Accela result list lives in a <table> with class "ACA_GridView" (or similar).
    # The exact selector is captured at fixture-time — adjust if Accela changes shape.
    table = soup.find("table", class_=re.compile(r"GridView|ResultGrid"))
    if table is None:
        return []
    rows: list[PermitRow] = []
    for tr in table.find_all("tr")[1:]:  # skip header row
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(cells) < 5:
            continue
        # Column order is captured at fixture-time. Confirm against the fixture HTML
        # before relying on this in live mode. Typical Accela layout:
        #   [select, permit_id, permit_type, status, address, issued_date]
        try:
            permit_id = cells[1]
            permit_type_raw = cells[2]
            status = cells[3]
            address = cells[4]
            issued_date_raw = cells[5] if len(cells) > 5 else ""
        except IndexError:
            continue
        if not permit_id:
            continue
        issued_date = _to_iso_date(issued_date_raw)
        rows.append(
            PermitRow(
                permit_id=permit_id,
                issued_date=issued_date,
                permit_type_raw=permit_type_raw,
                permit_description_raw="",  # list page rarely carries description; populated by detail fetch
                address=address,
                zip_code=_extract_zip(address),
                lat=None,
                lon=None,
                declared_value_usd=None,
                status=status,
            )
        )
    return rows


_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")
_ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\b")


def _to_iso_date(raw: str) -> str:
    """MM/DD/YYYY -> YYYY-MM-DD. Returns empty string on parse failure."""
    m = _DATE_RE.search(raw or "")
    if not m:
        return ""
    mm, dd, yyyy = m.groups()
    return f"{yyyy}-{int(mm):02d}-{int(dd):02d}"


def _extract_zip(address: str) -> Optional[str]:
    m = _ZIP_RE.search(address or "")
    return m.group(1) if m else None


_ACCELA_SEARCH_URL = (
    "https://accela.leegov.com/CitizenAccess/Cap/CapHome.aspx?module=Building"
)

# Playwright selectors confirmed against live portal 2026-05-22.
_FILL_AND_SUBMIT = """\
const p = global.page;
await p.fill('input[id*="txtFromDate"]', '{start}');
await p.fill('input[id*="txtToDate"]', '{end}');
await p.click('input[id*="btnSearch"], input[value="Search"]');
await p.waitForSelector('table.ACA_GridView', {{ timeout: 30000 }});
"""

_GET_HTML = "return await global.page.content();"

# Accela pager: last <a> in the pagination row — ">" or "Next" means another page exists.
_NEXT_PAGE = """\
const p = global.page;
const pager = await p.$('.ACA_Pager_Style td:last-child a, .ACA_SmLabel a:last-child');
if (!pager) return 'done';
const txt = await pager.innerText();
if (!txt.includes('>') && !txt.toLowerCase().includes('next')) return 'done';
await pager.click();
await p.waitForSelector('table.ACA_GridView', { timeout: 15000 });
return 'more';
"""


def fetch_permit_pages(start_date: date, end_date: date) -> list[str]:
    """Live Firecrawl /interact call. Returns full-page HTML for each paginated
    result page in the date range.

    Session lifecycle:
      1. scrape_url → browser session starts, scrape_id becomes the job_id.
      2. interact(fill+submit) → ASP.NET viewstate handled by the browser.
      3. interact(get_html) + interact(next_page) loop until pager exhausted.
      4. stop_interaction → session closed regardless of outcome.
    """
    from firecrawl import FirecrawlApp  # lazy import keeps test suite SDK-free

    api_key = os.environ.get("FIRECRAWL_API_KEY")
    if not api_key:
        raise RuntimeError("FIRECRAWL_API_KEY missing — invoke firecrawl-build-onboarding first")
    app = FirecrawlApp(api_key=api_key)

    start_str = start_date.strftime("%m/%d/%Y")
    end_str = end_date.strftime("%m/%d/%Y")

    doc = app.scrape_url(_ACCELA_SEARCH_URL, params={"formats": ["html"]})
    job_id = doc.metadata.scrape_id

    pages: list[str] = []
    try:
        app.interact(
            job_id,
            code=_FILL_AND_SUBMIT.format(start=start_str, end=end_str),
            language="node",
        )
        while True:
            html_res = app.interact(job_id, code=_GET_HTML, language="node")
            if html_res.result:
                pages.append(str(html_res.result))
            next_res = app.interact(job_id, code=_NEXT_PAGE, language="node")
            if not next_res.result or next_res.result.strip() == "done":
                break
    finally:
        app.stop_interaction(job_id)

    return pages
