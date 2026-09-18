"""Tests for the Redfin Collier market-tracker ingest (retargeted feed).

No network: requests.get is monkeypatched to return a tiny in-memory CSV in the
redfin_data_center/housing_market/monthly/all_counties.csv shape (verified
against the live bytes 09/17/2026), so we exercise the real
streaming/parse/filter/coerce path offline. The load-bearing cases: (1) Collier
rows kept, other counties/states excluded; (2) non-County REGION TYPEs
dropped; (3) literal "NA" coerces to None; (4) YoY percent converts to the
table's fraction contract; (5) property_type is stamped (rollup feed has no
per-type split).
"""
from __future__ import annotations

from ingest.pipelines.redfin_collier import pipeline, resources
from ingest.pipelines.redfin_collier.constants import COLLIER_REGION

# Header verbatim from the live feed 09/17/2026 (subset order irrelevant — the
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
          updated="2026-09-03"):
    return ",".join(
        [
            f'"{updated}"',
            '"Monthly"',
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
        _line("2026-07-01", "2026-07-31", 447, "County", COLLIER_REGION, 825, 600000, 0.4, 101, 5173, 5.4),
        _line("2026-08-01", "2026-08-31", 447, "County", COLLIER_REGION, 724, 617932, 0.4, 104, 5027, 6.0),
        # Non-Collier county — must be filtered out.
        _line("2026-08-01", "2026-08-31", 471, "County", "Lee County, FL", 1678, 358799, 0.5, 79, 8893, 5.5),
        # Non-County REGION TYPE for the same name — must be dropped even though the name matches.
        _line("2026-08-01", "2026-08-31", 999, "Zip", COLLIER_REGION, 1, 111111, 9.9, 1, 1, 1.0),
        # Collier row with literal "NA" numerics — coercion must yield None, not crash.
        _line("2026-05-01", "2026-05-31", 447, "County", COLLIER_REGION, "NA", "NA", "NA", "NA", "NA", "NA"),
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


def test_iter_collier_rows_filters_to_collier_county_type_only(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_collier_rows("http://example/all_counties.csv"))
    # Lee excluded, the Zip-type Collier lookalike excluded; 3 real Collier rows kept.
    assert {r["region"] for r in rows} == {COLLIER_REGION}
    assert len(rows) == 3
    assert all(r["median_sale_price"] != 111111 for r in rows)


def test_property_type_is_stamped(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_collier_rows("http://example/all_counties.csv"))
    assert {r["property_type"] for r in rows} == {"All Residential"}


def test_coerces_types_na_to_none_and_percent_to_fraction(monkeypatch):
    _patch_get(monkeypatch)
    rows = list(resources.iter_collier_rows("http://example/all_counties.csv"))
    aug = next(r for r in rows if r["period_end"] == "2026-08-31")
    assert aug["homes_sold"] == 724 and isinstance(aug["homes_sold"], int)
    # Feed says 0.4 (PERCENT); the table's contract is a FRACTION.
    assert abs(aug["median_sale_price_yoy"] - 0.004) < 1e-9
    assert aug["months_of_supply"] == 6.0
    na = next(r for r in rows if r["period_end"] == "2026-05-31")
    assert na["homes_sold"] is None
    assert na["median_sale_price_yoy"] is None


def test_thin_pull_raises_below_min_rows(monkeypatch):
    """A merge write never shrinks the cumulative count_table, so a quiet source
    (renamed region, moved URL) must be caught on THIS run's row count, not left
    for the count_table floor to (never) notice."""
    import pytest

    from ingest.lib.guards import VolumeGuardError

    _patch_get(monkeypatch, _fixture_rows()[:1])  # 1 row, far below MIN_ROWS=150
    with pytest.raises(VolumeGuardError, match="below MIN_ROWS"):
        resources.ingest_redfin_collier("http://example/all_counties.csv")


def test_dry_run_writes_nothing(monkeypatch, capsys):
    _patch_get(monkeypatch)
    # If the dry-run path touched dlt it would import/connect; it must not.
    rc = pipeline.main(["--dry-run"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "dry-run" in out
    assert "3 Collier County, FL rows" in out
