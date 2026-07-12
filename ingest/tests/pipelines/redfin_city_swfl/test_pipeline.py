"""Tests for the Redfin FL city market-tracker ingest.

No network: requests.get is monkeypatched to return a tiny in-memory gzipped TSV
so we exercise the real streaming/decompress/filter/coerce path offline. The
load-bearing cases: (1) FL-wide keep — every ', FL' region lands under its own
derived slug (separation happens in the lake, not at ingest); (2) out-of-state
lookalikes ('Naples, ME') are excluded on the parsed REGION cell; (3) the hero
trio's derived slugs are pinned to REGION_TO_AREA so the desk keys can't drift;
(4) the landing guard goes red when a hero city is missing from the pull.
"""
from __future__ import annotations

import gzip

import pytest

from ingest.pipelines.redfin_city_swfl import pipeline, resources
from ingest.pipelines.redfin_city_swfl.constants import REGION_TO_AREA

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


def _rows_to_gz(rows: list[str]) -> bytes:
    header = "\t".join(f'"{c}"' for c in _HEADER_COLS)
    tsv = "\n".join([header, *rows]) + "\n"
    return gzip.compress(tsv.encode("utf-8"))


def _fixture_rows() -> list[str]:
    return [
        _line("2026-05-01", "2026-05-31", "Cape Coral, FL", "All Residential", 385000, 0.021, 700, 4000, 3.8, 60, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Fort Myers, FL", "All Residential", 360000, -0.015, 500, 2800, 5.9, 72, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Naples, FL", "All Residential", 610000, 0.043, 400, 5100, 4.1, 55, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Naples, FL", "Condo/Co-op", 480000, 0.010, 180, 900, 4.5, 66, "2026-06-13 10:00:00.000 Z"),
        # FL siblings sharing a substring with a hero city — kept, under their OWN slugs.
        _line("2026-05-01", "2026-05-31", "North Fort Myers, FL", "All Residential", 290000, 0.030, 120, 700, 4.0, 61, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Fort Myers Beach, FL", "All Residential", 900000, 0.050, 30, 300, 8.0, 90, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Naples Park, FL", "All Residential", 700000, 0.020, 20, 120, 3.0, 40, "2026-06-13 10:00:00.000 Z"),
        # Any other FL city — kept (FL-wide ingest; separation in the lake).
        _line("2026-05-01", "2026-05-31", "Miami, FL", "All Residential", 550000, 0.011, 5000, 9000, 4.4, 50, "2026-06-13 10:00:00.000 Z"),
        # Punctuated FL name — slug derivation must normalize it.
        _line("2026-05-01", "2026-05-31", "Port St. Lucie, FL", "All Residential", 400000, 0.005, 800, 3000, 3.5, 45, "2026-06-13 10:00:00.000 Z"),
        # Out-of-state lookalikes — excluded on the parsed cell, not the raw line.
        _line("2026-05-01", "2026-05-31", "Naples, ME", "All Residential", 350000, 0.001, 5, 20, 4.0, 70, "2026-06-13 10:00:00.000 Z"),
        _line("2026-05-01", "2026-05-31", "Portland, OR", "All Residential", 520000, 0.012, 900, 3200, 2.9, 30, "2026-06-13 10:00:00.000 Z"),
        # Hero city with empty numerics — coercion must yield None, not crash.
        _line("2026-04-01", "2026-04-30", "Cape Coral, FL", "All Residential", "", "", "", "", "", "", "2026-06-13 10:00:00.000 Z"),
    ]


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


def _patch_get(monkeypatch, rows: list[str] | None = None):
    gz = _rows_to_gz(_fixture_rows() if rows is None else rows)
    monkeypatch.setattr(resources.requests, "get", lambda *a, **k: _FakeResp(gz))


def test_keeps_every_fl_city_excludes_other_states(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/redfin_city.gz"))
    regions = {r["region"] for r in rows}
    assert regions == {
        "Cape Coral, FL",
        "Fort Myers, FL",
        "Naples, FL",
        "North Fort Myers, FL",
        "Fort Myers Beach, FL",
        "Naples Park, FL",
        "Miami, FL",
        "Port St. Lucie, FL",
    }
    # 10 FL data rows (Naples ×2 property types, Cape Coral ×2 periods); ME/OR excluded.
    assert len(rows) == 10


def test_hero_trio_slugs_pinned_to_desk_keys(monkeypatch):
    """The desk hero keys on REGION_TO_AREA's slugs; derived slugs must match exactly."""
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/redfin_city.gz"))
    derived = {r["region"]: r["area"] for r in rows if r["region"] in REGION_TO_AREA}
    assert derived == REGION_TO_AREA


def test_slug_derivation_for_non_hero_cities(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/redfin_city.gz"))
    areas = {r["region"]: r["area"] for r in rows}
    assert areas["North Fort Myers, FL"] == "north_fort_myers"
    assert areas["Fort Myers Beach, FL"] == "fort_myers_beach"
    assert areas["Naples Park, FL"] == "naples_park"
    assert areas["Port St. Lucie, FL"] == "port_st_lucie"


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


def test_landing_guard_red_when_hero_city_missing(monkeypatch):
    """A pull that lost a desk-hero city (Redfin renamed the REGION) must raise, not merge."""
    from ingest.lib.guards import VolumeGuardError

    no_naples = [r for r in _fixture_rows() if '"Naples, FL"' not in r]
    _patch_get(monkeypatch, no_naples)
    with pytest.raises(VolumeGuardError, match="Naples, FL"):
        resources.ingest_redfin_city("http://example/redfin_city.gz")


def test_dry_run_writes_nothing(monkeypatch, capsys):
    _patch_get(monkeypatch)
    rc = pipeline.main(["--dry-run"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "dry-run" in out
    assert "10 FL city rows" in out
    assert "'cape_coral': 2" in out  # hero counts printed for eyeball verification
