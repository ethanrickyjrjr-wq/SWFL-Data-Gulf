"""The Locus-A gate on market_aggregates.run_details — the sold/rent band, pre-merge."""
from pathlib import Path

import pytest

from ingest.lib.guards import ContentContractError
from ingest.quality.contracts import evaluate_batch

_T = "data_lake.market_details_swfl"
_PIPELINE = Path(__file__).parents[3] / "pipelines" / "market_aggregates" / "pipeline.py"


def _det(zip_code, sold, rent, ratio):
    return {"zip_code": zip_code, "county": "Lee", "median_sold_price": sold,
            "median_rent_price": rent, "sold_to_rent_ratio": ratio,
            "captured_date": "2026-07-11", "source_tag": "realtor.com"}


def _band(stats):
    return next(c for c in stats["contracts"] if c["name"] == "market_details_sold_rent_band")


def test_the_two_known_accepted_zips_do_not_fire_the_band():
    """GREEN ON COMMIT #1. 33972 (1.28) and 33920/Alva (1.90) are TRUE positives of upstream
    realtor.com land-drag we cannot fix. Without the ZIP exclusion this contract is RED forever
    and doctor learns to ignore it."""
    rows = [_det("33972", 30000, 1950, 1.28), _det("33920", 88750, 3900, 1.90)]
    clean, quarantined, stats = evaluate_batch(rows, _T)
    assert _band(stats)["violations"] == 0
    assert clean == rows and quarantined == []


def test_a_THIRD_contaminated_zip_fires():
    rows = [_det("33972", 30000, 1950, 1.28), _det("33905", 26500, 2100, 1.05)]
    _, _, stats = evaluate_batch(rows, _T)
    assert _band(stats)["violations"] == 1


def test_the_legit_high_multiple_zips_pass():
    """33914 Cape Coral is the live MAX at 21.14 annual (253.7x MONTHLY) and 34105 Naples is
    240x monthly — a naive 200x-monthly cap would false-fire BOTH. The band is annual and
    data-derived for exactly this reason."""
    rows = [_det("33903", 149575, 1750, 7.12),   # live min legit
            _det("34113", 580000, 6547, 7.38),
            _det("33914", 520000, 2050, 21.14)]  # live max legit
    _, _, stats = evaluate_batch(rows, _T)
    assert _band(stats)["violations"] == 0


def test_a_null_ratio_with_both_prices_present_is_a_VIOLATION():
    """`NULL NOT BETWEEN 4 AND 40` is NULL in SQL — it SILENTLY PASSES. That is the
    three-valued-logic hole."""
    _, _, stats = evaluate_batch([_det("33901", 400000, 2500, None)], _T)
    assert _band(stats)["violations"] == 1


def test_a_null_rent_row_is_out_of_scope_not_a_violation():
    """5 ZIPs already carry a NULL rent (1 Lee, 4 Collier). That is a COVERAGE gap, not
    contamination — the coverage-floor contract owns it, not the band."""
    _, _, stats = evaluate_batch([_det("34102", 900000, None, None)], _T)
    assert (_band(stats)["in_scope"], _band(stats)["violations"]) == (0, 0)


def test_a_vendor_units_flip_aborts_the_run():
    """If the vendor silently switches sold_to_rent_ratio from ANNUAL to MONTHLY, every ratio
    lands ~12x high and the whole fleet goes out of band at once. At fleet scale the
    share+count branch trips first (100% > 5% AND 48 >= 25) — `if_no_clean_rows` is the
    backstop for a 100%-flipped batch UNDER the count floor, proven separately below.
    Note 33920 sits in the 339xx fixture range and stays EXCLUDED even mid-flood: 48
    in-scope, not 49. Landing 48 uninterpretable ratios would be worse than landing none."""
    rows = [_det(f"339{i:02d}", 400000, 2500, 160.0) for i in range(49)]
    clean, _, stats = evaluate_batch(rows, _T)
    assert stats["abort"] is True
    assert "market_details_sold_rent_band" in stats["abort_reason"]
    assert clean == rows   # policy report -> nothing dropped; the RUN is what stops
    with pytest.raises(ContentContractError):
        raise ContentContractError(stats["abort_reason"])   # what the pipeline gate does


def test_a_small_fully_flipped_batch_aborts_via_no_clean_rows():
    """The inverse hole: a partial/recovery run of 10 ZIPs, all flipped — 100% contaminated
    but 10 < 25 so the count branch never trips. Without `if_no_clean_rows` this batch
    would land green."""
    rows = [_det(f"341{i:02d}", 400000, 2500, 160.0) for i in range(10)]
    _, _, stats = evaluate_batch(rows, _T)
    assert stats["abort"] is True and "no clean rows" in stats["abort_reason"]


def test_the_gate_is_wired_before_the_details_upsert_and_not_on_the_histogram():
    src = _PIPELINE.read_text(encoding="utf-8")
    gate = src.index("evaluate_batch(rows")
    det_merge = src.index("db.upsert(_DET_TABLE")
    hist_merge = src.index("db.upsert(_HIST_TABLE")
    assert hist_merge < gate < det_merge   # gate is inside run_details, ahead of its merge
    assert src.count("evaluate_batch(") == 1   # histogram carries no contract; do not gate it
