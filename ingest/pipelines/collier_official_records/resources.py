"""dlt resource for collier_official_records — live FETCH + normalize, unlike
lee_deed_official_records (LOAD-only, local-file merge). Collier's Document
Search has no bot wall, so the fetch happens inside the resource itself, same
shape as lee_permits.

  • write_disposition="merge" + primary_key="instrument_number" is the
    idempotency — re-running over an overlapping date range never duplicates.
  • Empty-tolerant: a date range with zero recorded documents yields zero rows
    and the merge is a clean no-op.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Iterable, Iterator, Optional

import dlt
from bs4 import BeautifulSoup

from .constants import PRIMARY_KEY, SOURCE_TAG, SOURCE_URL, TABLE_NAME
from .normalize import normalize_row
from .scraper import fetch_date_range_sync


def normalize_page(html: str) -> list[dict[str, Any]]:
    """One results page's raw HTML -> every normalized row on it. Pure function,
    no network — the results table is always the second <table> on the page
    (the first is the search-criteria summary)."""
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if len(tables) < 2:
        return []
    rows = tables[1].find_all("tr")
    return [normalize_row(tr) for tr in rows]


def _fetch_and_normalize(start: date, end: date) -> list[dict[str, Any]]:
    pages = fetch_date_range_sync(start, end)
    out: list[dict[str, Any]] = []
    for page_html in pages:
        out.extend(normalize_page(page_html))
    return out


@dlt.resource(
    name=TABLE_NAME,
    primary_key=PRIMARY_KEY,
    write_disposition="merge",
    columns={
        "record_date": {"data_type": "date"},
        "page_count": {"data_type": "bigint"},
        # json data_type keeps grantor/grantee/parcel-id lists as single JSONB
        # columns instead of spawning dlt child tables.
        "grantors": {"data_type": "json"},
        "grantees": {"data_type": "json"},
        "parcel_ids": {"data_type": "json"},
    },
)
def collier_official_records_resource(
    start: date,
    end: date,
    *,
    rows: Optional[Iterable[dict]] = None,
) -> Iterator[dict]:
    """Emit normalized rows for [start, end], source-tagged, for the merge.

    Live (rows is None): drive the real crawl4ai search + pagination.
    Tests inject `rows=` (already-normalized dicts) to exercise the merge
    without a live browser.
    """
    if rows is None:
        rows = _fetch_and_normalize(start, end)
    for row in rows:
        yield {
            **row,
            "source_tag": SOURCE_TAG,
            "source_url": SOURCE_URL,
        }
