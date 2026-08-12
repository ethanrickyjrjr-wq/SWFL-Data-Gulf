"""TDD for the pure-function pieces of scraper.py (page-count parsing). The live
crawl4ai automation itself is not unit-tested here (no network in tests) — see
the pipeline's dry-run mode for a live smoke check.
"""
from __future__ import annotations

from .scraper import parse_total_pages

_NAV_HTML = """
<div aria-label="Page navigation, page 1 of 194" class="telerik-blazor k-pager k-pager-sm k-grid-pager">
  <button title="Go to the first page" class="k-pager-nav k-pager-first k-disabled"></button>
  <button title="Go to the previous page" class="k-pager-nav k-disabled"></button>
</div>
"""


def test_parse_total_pages_reads_the_aria_label():
    assert parse_total_pages(_NAV_HTML) == 194


def test_parse_total_pages_defaults_to_one_when_no_pager_present():
    """A single-page (or zero-result) response renders no pager at all."""
    assert parse_total_pages("<div>no pager here</div>") == 1


def test_parse_total_pages_handles_single_digit():
    html = '<div aria-label="Page navigation, page 1 of 3"></div>'
    assert parse_total_pages(html) == 3
