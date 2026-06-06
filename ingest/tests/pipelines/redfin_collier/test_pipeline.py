"""Tests for the Redfin Collier market-tracker ingest.

No network: requests.get is monkeypatched to return a tiny in-memory gzipped TSV
so we exercise the real streaming/decompress/filter/coerce path offline.
"""
from __future__ import annotations

import gzip

from ingest.pipelines.redfin_collier import pipeline, resources
from ingest.pipelines.redfin_collier.constants import COLLIER_REGION

# Header uses the verbatim Redfin column names; iter_collier_rows indexes by name
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
        _line("2024-12-01", "2024-12-31", COLLIER_REGION, "All Residential", 600000, 0.043, 9000, 5100, 4.1, 55, "2026-06-02 14:33:24.470 Z"),
        _line("2024-12-01", "2024-12-31", COLLIER_REGION, "Condo/Co-op", 430000, -0.012, 3200, 3000, 6.8, 70, "2026-06-02 14:33:24.470 Z"),
        # Non-Collier row — must be filtered out.
        _line("2024-12-01", "2024-12-31", "Lee County, FL", "All Residential", 410000, 0.02, 7000, 4000, 3.0, 60, "2026-06-02 14:33:24.470 Z"),
        # Collier row with empty numerics — coercion must yield None, not crash.
        _line("2024-11-01", "2024-11-30", COLLIER_REGION, "All Residential", "", "", "", "", "", "", "2026-06-02 14:33:24.470 Z"),
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


def test_iter_collier_rows_filters_to_collier(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_collier_rows("http://example/redfin.gz"))
    # Lee row excluded; 3 Collier rows kept.
    assert {r["region"] for r in rows} == {COLLIER_REGION}
    assert len(rows) == 3
    assert {r["property_type"] for r in rows} == {"All Residential", "Condo/Co-op"}


def test_iter_collier_rows_coerces_types(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_collier_rows("http://example/redfin.gz"))
    dec = next(
        r
        for r in rows
        if r["property_type"] == "All Residential" and r["period_end"] == "2024-12-31"
    )
    assert dec["homes_sold"] == 9000 and isinstance(dec["homes_sold"], int)
    assert abs(dec["median_sale_price_yoy"] - 0.043) < 1e-9
    assert dec["months_of_supply"] == 4.1
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
    assert "3 Collier County, FL rows" in out
