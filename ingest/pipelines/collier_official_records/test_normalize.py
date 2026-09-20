"""TDD for collier_official_records normalize.py. Fixtures below are REAL markup
captured live 08/12/2026 from cor.collierclerk.com's Document Search results grid
(a Telerik/Kendo Blazor grid, class prefix k-table-*) — not hand-invented shape.
"""
from __future__ import annotations

from bs4 import BeautifulSoup

from .normalize import normalize_row, parse_book_page, parse_party_names, parse_record_date

# Real row: two grantor lines (a couple), one grantee — the exact shape that, when
# flattened with get_text(strip=True), concatenates into unparseable text
# ("F: PIANTO JERRYF: PIANTO JERRY JT: CLEAR CHOICE INSTALLATIONS") — this is the
# bug that forced reading the real <span> structure instead of guessing from text.
ROW_TWO_GRANTORS_HTML = """
<tr aria-rowindex="2" class="k-table-row k-master-row" data-index="0" role="row">
<td aria-colindex="1" class="k-table-td k-grid-content-sticky"><span><span class="k-checkbox-wrap">
<input type="checkbox"/></span></span></td>
<td aria-colindex="2" class="k-table-td"><span>F: JEWETT ISABEL</span>
<br/><span>F: JEWETT ISABEL G</span>
<br/><span>T: MASTERPIECE ROOFING</span>
<br/></td>
<td aria-colindex="3" class="k-table-td">08/12/2026</td>
<td aria-colindex="4" class="k-table-td"><div>NC</div></td>
<td aria-colindex="5" class="k-table-td"><div>6861746</div></td>
<td aria-colindex="6" class="k-table-td"><div><span>OR-</span>6619</div></td>
<td aria-colindex="7" class="k-table-td"><div>3939</div></td>
<td aria-colindex="8" class="k-table-td"><div>2</div></td>
<td aria-colindex="9" class="k-table-td"><div>ISLES OF CAPRI UNIT 1 BLOCK B LOT 6</div></td>
<td aria-colindex="10" class="k-table-td"><div></div></td>
</tr>
"""

# Real row: single grantor/grantee, no parcel id — the common case.
ROW_SIMPLE_HTML = """
<tr aria-rowindex="3" class="k-table-row k-master-row k-alt" data-index="1" role="row">
<td aria-colindex="1" class="k-table-td k-grid-content-sticky"><span><span class="k-checkbox-wrap">
<input type="checkbox"/></span></span></td>
<td aria-colindex="2" class="k-table-td"><span>F: TJSS LLC</span>
<br/><span>T: CAMPINS RYAN</span>
<br/></td>
<td aria-colindex="3" class="k-table-td">08/12/2026</td>
<td aria-colindex="4" class="k-table-td"><div>NC</div></td>
<td aria-colindex="5" class="k-table-td"><div>6861743</div></td>
<td aria-colindex="6" class="k-table-td"><div><span>OR-</span>6619</div></td>
<td aria-colindex="7" class="k-table-td"><div>129</div></td>
<td aria-colindex="8" class="k-table-td"><div>1</div></td>
<td aria-colindex="9" class="k-table-td"><div>NAPLES PARK UNIT 2 BLOCK 12 LOT 9</div></td>
<td aria-colindex="10" class="k-table-td"><div></div></td>
</tr>
"""


def _row(html: str):
    return BeautifulSoup(html, "html.parser").find("tr")


def test_parse_party_names_splits_multiple_grantors_correctly():
    """The bug this whole parser exists to avoid: flattened get_text() concatenates
    stacked <span> siblings with no separator. Reading real <span> children fixes it."""
    td = _row(ROW_TWO_GRANTORS_HTML).find_all("td")[1]
    grantors, grantees = parse_party_names(td)
    assert grantors == ["JEWETT ISABEL", "JEWETT ISABEL G"]
    assert grantees == ["MASTERPIECE ROOFING"]


def test_parse_party_names_single_pair():
    td = _row(ROW_SIMPLE_HTML).find_all("td")[1]
    grantors, grantees = parse_party_names(td)
    assert grantors == ["TJSS LLC"]
    assert grantees == ["CAMPINS RYAN"]


def test_parse_record_date():
    assert parse_record_date("08/12/2026") == "2026-08-12"
    assert parse_record_date("") is None
    assert parse_record_date(None) is None
    assert parse_record_date("not a date") is None


def test_parse_book_page_splits_book_type_prefix():
    """"OR-" + "6619" ships in one cell as two text nodes — split book_type from
    the numeric book, mirroring Lee's book_type/book column split."""
    td = _row(ROW_TWO_GRANTORS_HTML).find_all("td")[5]
    book_type, book = parse_book_page(td)
    assert book_type == "OR"
    assert book == "6619"


def test_normalize_row_full_shape():
    row = normalize_row(_row(ROW_TWO_GRANTORS_HTML))
    assert row["instrument_number"] == "6861746"
    assert row["record_date"] == "2026-08-12"
    assert row["doc_type"] == "NC"
    assert row["book_type"] == "OR"
    assert row["book"] == "6619"
    assert row["page"] == "3939"
    assert row["page_count"] == 2
    assert row["grantors"] == ["JEWETT ISABEL", "JEWETT ISABEL G"]
    assert row["grantees"] == ["MASTERPIECE ROOFING"]
    assert row["legal_description"] == "ISLES OF CAPRI UNIT 1 BLOCK B LOT 6"
    assert row["parcel_ids"] == []


def test_normalize_row_page_count_missing_or_unparseable_is_none():
    html = ROW_SIMPLE_HTML.replace("<div>1</div>", "<div></div>")
    row = normalize_row(_row(html))
    assert row["page_count"] is None


def test_a_day_with_no_recordings_is_zero_rows_not_a_crash():
    """The daily cron pulls "yesterday only". When yesterday was a weekend or a holiday the
    clerk's grid returns ONE placeholder row - verbatim from cor.collierclerk.com 09/20/2026
    for Saturday 09/19 - and normalize_row died on it ("expected 10 <td> cells, got 1").
    Every scheduled failure 09/06-09/14 was a Sun, a Mon, or the day after Labor Day."""
    from ingest.pipelines.collier_official_records.resources import normalize_page

    html = (
        "<table><tr><td>criteria</td></tr></table>"
        '<table><tr class="k-grid-norecords k-table-row">'
        '<td class="k-table-td" colspan="11" data-col-index="0" tabindex="0">No records found.</td>'
        "</tr></table>"
    )
    assert normalize_page(html) == []


def test_a_malformed_row_that_is_not_the_placeholder_still_raises():
    """Only the grid's own no-records marker is skipped - a real shape change stays loud."""
    import pytest
    from ingest.pipelines.collier_official_records.resources import normalize_page

    html = "<table><tr><td>c</td></tr></table><table><tr><td>only one cell</td></tr></table>"
    with pytest.raises(ValueError, match="expected 10"):
        normalize_page(html)
