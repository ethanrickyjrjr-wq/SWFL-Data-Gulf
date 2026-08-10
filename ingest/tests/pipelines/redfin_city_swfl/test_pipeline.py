"""Tests for the Redfin FL city market-tracker ingest (retargeted feed).

No network: requests.get is monkeypatched to return a tiny in-memory CSV in the
redfin_data_center/housing_market/monthly/all_cities.csv shape (verified against
the live bytes 08/10/2026), so we exercise the real streaming/parse/filter/
coerce path offline. The load-bearing cases: (1) FL-wide keep — every ', FL'
City region lands under its own derived slug; (2) out-of-state lookalikes
('Naples, ME') are excluded on the parsed cell; (3) the hero trio's derived
slugs are pinned to REGION_TO_AREA so the desk keys can't drift; (4) the
landing guard goes red when a hero city is missing; (5) literal "NA" coerces to
None; (6) YoY percent converts to the table's fraction contract; (7) duplicate
REGION NAMEs with distinct REGION IDs dedupe to the fattest twin; (8) non-City
REGION TYPEs are dropped.
"""
from __future__ import annotations

import pytest

from ingest.pipelines.redfin_city_swfl import pipeline, resources
from ingest.pipelines.redfin_city_swfl.constants import REGION_TO_AREA

# Header verbatim from the live feed 08/10/2026 (subset order irrelevant — the
# parser indexes by name; the full 50-col file just adds ignored columns).
_HEADER_COLS = [
    "LAST UPDATED",
    "FREQUENCY",
    "PERIOD BEGIN",
    "PERIOD END",
    "REGION ID",
    "REGION TYPE",
    "REGION NAME",
    "HOMES SOLD",
    "MEDIAN SALE PRICE NSA ($)",
    "MEDIAN SALE PRICE NSA YOY (%)",
    "MEDIAN DAYS ON MARKET (DAYS)",
    "INVENTORY",
    "MONTHS OF SUPPLY",
]


def _line(begin, end, region_id, rtype, region, sold, msp, yoy_pct, dom, inv, mos,
          updated="2026-07-03"):
    return ",".join(
        [
            f'"{updated}"',
            '"Rolling 3 Months"',
            f'"{begin}"',
            f'"{end}"',
            str(region_id),
            f'"{rtype}"',
            f'"{region}"',
            str(sold),
            str(msp),
            str(yoy_pct),
            str(dom),
            str(inv),
            str(mos),
        ]
    )


def _rows_to_csv(rows: list[str]) -> bytes:
    header = ",".join(f'"{c}"' for c in _HEADER_COLS)
    return ("\n".join([header, *rows]) + "\n").encode("utf-8")


def _fixture_rows() -> list[str]:
    return [
        _line("2026-04-01", "2026-06-30", 101, "City", "Cape Coral, FL", 700, 385000, 2.1, 60, 4000, 3.8),
        _line("2026-04-01", "2026-06-30", 102, "City", "Fort Myers, FL", 500, 360000, -1.5, 72, 2800, 5.9),
        _line("2026-04-01", "2026-06-30", 103, "City", "Naples, FL", 400, 610000, 4.3, 55, 5100, 4.1),
        # FL siblings sharing a substring with a hero city — kept, under their OWN slugs.
        _line("2026-04-01", "2026-06-30", 104, "City", "North Fort Myers, FL", 120, 290000, 3.0, 61, 700, 4.0),
        _line("2026-04-01", "2026-06-30", 105, "City", "Fort Myers Beach, FL", 30, 900000, 5.0, 90, 300, 8.0),
        _line("2026-04-01", "2026-06-30", 106, "City", "Naples Park, FL", 20, 700000, 2.0, 40, 120, 3.0),
        # Any other FL city — kept (FL-wide ingest; separation in the lake).
        _line("2026-04-01", "2026-06-30", 107, "City", "Miami, FL", 5000, 550000, 1.1, 50, 9000, 4.4),
        # Punctuated FL name — slug derivation must normalize it.
        _line("2026-04-01", "2026-06-30", 108, "City", "Port St. Lucie, FL", 800, 400000, 0.5, 45, 3000, 3.5),
        # Duplicate REGION NAME, distinct REGION IDs (live 08/10/2026: Aaronsburg, PA ×2).
        # The 12-sale twin must win over the 2-sale twin, whatever the file order.
        _line("2026-04-01", "2026-06-30", 109, "City", "Acacia Villas, FL", 12, 310000, 1.0, 33, 40, 2.0),
        _line("2026-04-01", "2026-06-30", 110, "City", "Acacia Villas, FL", 2, 999000, 9.0, 99, 5, 9.0),
        # Out-of-state lookalikes — excluded on the parsed cell, not the raw line.
        _line("2026-04-01", "2026-06-30", 111, "City", "Naples, ME", 5, 350000, 0.1, 70, 20, 4.0),
        _line("2026-04-01", "2026-06-30", 112, "City", "Portland, OR", 900, 520000, 1.2, 30, 3200, 2.9),
        # Non-City region type — dropped even with an ', FL' name.
        _line("2026-04-01", "2026-06-30", 113, "Zip", "Cape Coral, FL", 999, 111111, 1.0, 10, 10, 1.0),
        # Hero city prior period with literal NA numerics — coercion must yield None, not crash.
        _line("2026-03-01", "2026-05-31", 101, "City", "Cape Coral, FL", "NA", "NA", "NA", "NA", "NA", "NA"),
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
    data = _rows_to_csv(_fixture_rows() if rows is None else rows)
    monkeypatch.setattr(resources.requests, "get", lambda *a, **k: _FakeResp(data))


def test_keeps_every_fl_city_excludes_other_states_and_non_city_types(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/all_cities.csv"))
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
        "Acacia Villas, FL",
    }
    # 11 FL City data rows (Acacia Villas ×2 twins, Cape Coral ×2 periods);
    # ME/OR and the Zip-type Cape Coral row excluded.
    assert len(rows) == 11
    # The Zip-type row must not have leaked its sentinel price anywhere.
    assert all(r["median_sale_price"] != 111111 for r in rows)


def test_hero_trio_slugs_pinned_to_desk_keys(monkeypatch):
    """The desk hero keys on REGION_TO_AREA's slugs; derived slugs must match exactly."""
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/all_cities.csv"))
    derived = {r["region"]: r["area"] for r in rows if r["region"] in REGION_TO_AREA}
    assert derived == REGION_TO_AREA


def test_slug_derivation_for_non_hero_cities(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/all_cities.csv"))
    areas = {r["region"]: r["area"] for r in rows}
    assert areas["North Fort Myers, FL"] == "north_fort_myers"
    assert areas["Fort Myers Beach, FL"] == "fort_myers_beach"
    assert areas["Naples Park, FL"] == "naples_park"
    assert areas["Port St. Lucie, FL"] == "port_st_lucie"


def test_coerces_types_na_to_none_and_percent_to_fraction(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_city_rows("http://example/all_cities.csv"))
    cape = next(
        r for r in rows
        if r["area"] == "cape_coral" and r["period_end"] == "2026-06-30"
    )
    assert cape["median_sale_price"] == 385000.0
    assert cape["homes_sold"] == 700 and isinstance(cape["homes_sold"], int)
    assert cape["region_id"] == 101
    # Feed says 2.1 (PERCENT); the table's contract is a FRACTION.
    assert abs(cape["median_sale_price_yoy"] - 0.021) < 1e-9
    # Rollup feed has no property-type column — the headline constant is stamped.
    assert cape["property_type"] == "All Residential"
    na = next(r for r in rows if r["period_end"] == "2026-05-31")
    assert na["median_sale_price"] is None
    assert na["homes_sold"] is None


def test_dedupes_duplicate_region_names_keeps_fattest_twin(monkeypatch):
    """Two same-named FL regions with distinct REGION IDs share a merge PK —
    dedupe must keep the higher-homes_sold twin deterministically."""
    _patch_get(monkeypatch)
    rows = resources.dedupe_city_rows(
        list(resources.iter_city_rows("http://example/all_cities.csv"))
    )
    twins = [r for r in rows if r["region"] == "Acacia Villas, FL"]
    assert len(twins) == 1
    assert twins[0]["region_id"] == 109
    assert twins[0]["median_sale_price"] == 310000.0


def test_landing_guard_red_when_hero_city_missing(monkeypatch):
    """A pull that lost a desk-hero city (Redfin renamed the REGION) must raise, not merge."""
    from ingest.lib.guards import VolumeGuardError

    no_naples = [r for r in _fixture_rows() if '"Naples, FL"' not in r]
    _patch_get(monkeypatch, no_naples)
    with pytest.raises(VolumeGuardError, match="Naples, FL"):
        resources.ingest_redfin_city("http://example/all_cities.csv")


def test_dry_run_writes_nothing(monkeypatch, capsys):
    _patch_get(monkeypatch)
    rc = pipeline.main(["--dry-run"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "dry-run" in out
    assert "10 FL city rows" in out  # 11 parsed − 1 duplicate twin removed
    assert "'cape_coral': 2" in out  # hero counts printed for eyeball verification
