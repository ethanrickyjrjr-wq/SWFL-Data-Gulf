"""Tests for the Redfin SWFL city market-tracker ingest.

No network: requests.get is monkeypatched to return a tiny in-memory gzipped TSV
so we exercise the real streaming/decompress/filter/coerce path offline. The
load-bearing case is EXACT region matching — sibling places that share a substring
with a target city ('North Fort Myers, FL', 'Fort Myers Beach, FL', 'Naples Park,
FL') must be excluded even though they pass the cheap substring pre-filter.
"""
from __future__ import annotations

import gzip

from ingest.pipelines.redfin_city_swfl import pipeline, resources

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
        _line("2026-05-01", "2026-05-31", "Cape Coral, FL", "All Residential", 385000, 0.021, 700, 4000, 3.8, 60, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Fort Myers, FL", "All Residential", 360000, -0.015, 500, 2800, 5.9, 72, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Naples, FL", "All Residential", 610000, 0.043, 400, 5100, 4.1, 55, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Naples, FL", "Condo/Co-op", 480000, 0.010, 180, 900, 4.5, 66, "2026-06-13 10:00:00.000 Z"),
        # Sibling places that SHARE a substring with a target city — must be excluded.
        _line("2026-05-01", "2026-05-31", "North Fort Myers, FL", "All Residential", 290000, 0.030, 120, 700, 4.0, 61, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Fort Myers Beach, FL", "All Residential", 900000, 0.050, 30, 300, 8.0, 90, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Naples Park, FL", "All Residential", 700000, 0.020, 20, 120, 3.0, 40, "2026-06-13 10:00:00.000 Z"),
        # Out-of-scope city — excluded.
        _line("2026-05-01", "2026-05-31", "Miami, FL", "All Residential", 550000, 0.011, 5000, 9000, 4.4, 50, "2026-06-13 10:00:00.000 Z"),
        # Target city with empty numerics — coercion must yield None, not crash.
        _line("2026-04-01", "2026-04-30", "Cape Coral, FL", "All Residential", "", "", "", "", "", "", "2026-06-13 10:00:00.000 Z"),
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


def test_filters_to_three_cities_exact(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/redfin_city.gz"))
    # Only the three exact cities survive; siblings + Miami excluded.
    assert {r["region"] for r in rows} == {"Cape Coral, FL", "Fort Myers, FL", "Naples, FL"}
    # 3 May All-Residential + 1 May Naples condo + 1 April Cape Coral = 5.
    assert len(rows) == 5


def test_area_slug_mapping(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/redfin_city.gz"))
    areas = {r["region"]: r["area"] for r in rows}
    assert areas == {
        "Cape Coral, FL": "cape_coral",
        "Fort Myers, FL": "fort_myers",
        "Naples, FL": "naples",
    }


def test_coerces_types_and_empty_to_none(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/redfin_city.gz"))
    cape = next(
        r for r in rows
        if r["area"] == "cape_coral" and r["period_end"] == "2026-05-31"
    )
    assert cape["median_sale_price"] == 385000.0
    assert cape["homes_sold"] == 700 and isinstance(cape["homes_sold"], int)
    assert abs(cape["median_sale_price_yoy"] - 0.021) < 1e-9
    empty = next(r for r in rows if r["period_end"] == "2026-04-30")
    assert empty["median_sale_price"] is None
    assert empty["homes_sold"] is None


def test_dry_run_writes_nothing(monkeypatch, capsys):
    _patch_get(monkeypatch)
    rc = pipeline.main(["--dry-run"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "dry-run" in out
    assert "5 SWFL city rows" in out
