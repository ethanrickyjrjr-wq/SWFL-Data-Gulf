"""Listing-page parser and XLSX downloader for Collier County building permits.

The download URL for each month is unpredictable (filename suffixes vary, base
path changed Oct 2025), so every run must parse the listing page to discover links.
A session visiting the listing page first is required to obtain cookies that allow
the file server to accept the subsequent XLSX download.
"""
from __future__ import annotations

import re
from typing import NamedTuple

import requests
from bs4 import BeautifulSoup

from .constants import BASE_URL, LISTING_PAGE_URL, SERIES

_MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


class MonthlyReport(NamedTuple):
    year: int
    month: int
    label: str
    url: str


def _make_session() -> requests.Session:
    """Return a session with listing-page cookies loaded."""
    s = requests.Session()
    s.headers.update({"User-Agent": _UA})
    s.get(LISTING_PAGE_URL, timeout=30)
    return s


def discover_issued_reports(session: requests.Session | None = None) -> list[MonthlyReport]:
    """Parse the listing page and return all issued-series XLSX entries, newest first."""
    if session is None:
        session = _make_session()

    r = session.get(LISTING_PAGE_URL, headers={"Referer": BASE_URL}, timeout=30)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    reports: list[MonthlyReport] = []

    for a in soup.find_all("a", href=True):
        href: str = a["href"]
        if not href.endswith(".xlsx"):
            continue
        href_lower = href.lower()
        # Must contain the series keyword; must NOT be the applied series.
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


def download_month(
    year: int,
    month: int,
    session: requests.Session | None = None,
) -> tuple[bytes, str]:
    """Download the issued XLSX for (year, month). Returns (xlsx_bytes, filename)."""
    if session is None:
        session = _make_session()

    reports = discover_issued_reports(session)
    hit = next((rep for rep in reports if rep.year == year and rep.month == month), None)
    if hit is None:
        available = [(rep.year, rep.month) for rep in reports[:6]]
        raise ValueError(
            f"No issued XLSX found for {year}-{month:02d}. "
            f"Most recent 6 available: {available}"
        )

    filename = hit.url.rsplit("/", 1)[-1]
    r = session.get(hit.url, headers={"Referer": LISTING_PAGE_URL}, timeout=120)
    r.raise_for_status()
    return r.content, filename


def download_latest_issued(session: requests.Session | None = None) -> tuple[bytes, str]:
    """Download the most recent issued XLSX from the listing page."""
    if session is None:
        session = _make_session()
    reports = discover_issued_reports(session)
    if not reports:
        raise ValueError("No issued XLSX reports found on listing page.")
    latest = reports[0]
    return download_month(latest.year, latest.month, session)
