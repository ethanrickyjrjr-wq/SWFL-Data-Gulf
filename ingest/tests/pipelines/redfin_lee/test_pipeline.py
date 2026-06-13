"""Tests for the Redfin Lee County market-tracker ingest.

No network: requests.get is monkeypatched to return a tiny in-memory gzipped TSV
so we exercise the real streaming/decompress/filter/coerce path offline.
"""
from __future__ import annotations

import gzip

from ingest.pipelines.redfin_lee import pipeline, resources
from ingest.pipelines.redfin_lee.constants import LEE_REGION

# Header uses the verbatim Redfin column names; iter_lee_rows indexes by name
# so column ORDER is irrelevant — we include only the columns the loader keeps.
_HEADER_COLS = [
    "PERIOD_BEGIN",
    "PERIOD_END",
    "REGION",
    "PROPERTY_TYPE",
    "MEDIAN_SALE_PRICE",
    "MEDIAN_SALE_PRICE_YOY",
    "HOMES_SOLD",
    "INVENTORY",
    "MONTHS_OF_SUPPLY",
    "MEDIAN_DOM",
    "LAST_UPDATED",
]


def _line(begin, end, region, ptype, msp, yoy, sold, inv, mos, dom, updated):
    # Text fields quoted, numerics bare — mirrors the real Redfin TSV.
    return "\t".join(
        [
            f'"{begin}"',
            f'"{end}"',
            f'"{region}"',
            f'"{ptype}"',
            str(msp),
            str(yoy),
            str(sold),
            str(inv),
            str(mos),
            str(dom),
            f'"{updated}"',
        ]
    )


def _gzipped_fixture() -> bytes:
    header = "\t".join(f'"{c}"' for c in _HEADER_COLS)
    rows = [
        _line("2024-12-01", "2024-12-31", LEE_REGION, "All Residential", 410000, 0.020, 7000, 4000, 3.8, 60, "2026-06-13 10:00:00.000 Z"),
        _line("2024-12-01", "2024-12-31", LEE_REGION, "Condo/Co-op", 280000, -0.015, 2500, 2800, 5.9, 72, "2026-06-13 10:00:00.000 Z"),
        # Non-Lee row — must be filtered out.
        _line("2024-12-01", "2024-12-31", "Collier County, FL", "All Residential", 600000, 0.043, 9000, 5100, 4.1, 55, "2026-06-13 10:00:00.000 Z"),
        # Lee row with empty numerics — coercion must yield None, not crash.
        _line("2024-11-01", "2024-11-30", LEE_REGION, "All Residential", "", "", "", "", "", "", "2026-06-13 10:00:00.000 Z"),
    ]
    tsv = "\n".join([header, *rows]) + "\n"
    return gzip.compress(tsv.encode("utf-8"))


class _FakeResp:
    def __init__(self, data: bytes):
        self._data = data

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size):
        for i in range(0, len(self._data), chunk_size):
            yield self._data[i : i + chunk_size]

    def close(self):
        return None


def _patch_get(monkeypatch):
    gz = _gzipped_fixture()
    monkeypatch.setattr(resources.requests, "get", lambda *a, **k: _FakeResp(gz))


def test_iter_lee_rows_filters_to_lee(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_lee_rows("http://example/redfin.gz"))
    # Collier row excluded; 3 Lee rows kept.
    assert {r["region"] for r in rows} == {LEE_REGION}
    assert len(rows) == 3
    assert {r["property_type"] for r in rows} == {"All Residential", "Condo/Co-op"}


def test_iter_lee_rows_coerces_types(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_lee_rows("http://example/redfin.gz"))
    dec = next(
        r
        for r in rows
        if r["property_type"] == "All Residential" and r["period_end"] == "2024-12-31"
    )
    assert dec["homes_sold"] == 7000 and isinstance(dec["homes_sold"], int)
    assert abs(dec["median_sale_price_yoy"] - 0.020) < 1e-9
    assert dec["months_of_supply"] == 3.8
    # Empty numerics -> None
    empty = next(r for r in rows if r["period_end"] == "2024-11-30")
    assert empty["homes_sold"] is None
    assert empty["median_sale_price_yoy"] is None


def test_dry_run_writes_nothing(monkeypatch, capsys):
    _patch_get(monkeypatch)
    # If the dry-run path touched dlt it would import/connect; it must not.
    rc = pipeline.main(["--dry-run"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "dry-run" in out
    assert "3 Lee County, FL rows" in out
