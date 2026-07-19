"""Pure replay engine tests — no DB. Fixture history: one listing appears, gets a
price cut, departs to holding, relists, then sells. Weeks are Monday-start UTC."""
from datetime import date

from ingest.pipelines.listing_week.builder import (
    build_week_rows,
    label_updates,
    week_start_of,
)

STATE_ROW = {
    "address_key": "123 MAIN ST:33904", "sale_or_rent": "sale", "state": "sold",
    "list_price": 400_000, "listed_date": date(2026, 6, 30), "zip_code": "33904",
    "county": "Lee", "property_type": "single_family", "beds": 3, "baths": 2.0,
    "sqft": 1500, "lot_acres": 0.25, "flag_foreclosure": False,
    "flag_new_construction": False, "listing_id": "L1",
}

def _t(at, from_state, to_state, price, delta=None, seed=False):
    return {"address_key": "123 MAIN ST:33904", "sale_or_rent": "sale",
            "from_state": from_state, "to_state": to_state, "at": at,
            "listing_id": "L1", "price": price, "price_delta": delta,
            "days_in_prev_state": None, "seed": seed, "days_off_market": None}

# Tue 06/30 appear @420k · Wed 07/08 cut to 400k · Tue 07/14 -> holding ·
# Thu 07/16 relist (active) · Fri 07/17 sold.
HISTORY = [
    _t("2026-06-30", None, "active", 420_000),
    _t("2026-07-08", "active", "active", 400_000, delta=-20_000),
    _t("2026-07-14", "active", "holding", 400_000),
    _t("2026-07-16", "holding", "active", 400_000),
    _t("2026-07-17", "active", "sold", 400_000),
]

def test_week_start_of_is_monday():
    assert week_start_of(date(2026, 7, 19)) == date(2026, 7, 13)  # Sun -> prior Mon
    assert week_start_of(date(2026, 7, 13)) == date(2026, 7, 13)  # Mon -> itself

def test_week1_row_frozen_features():
    # Week 06/29–07/05: listing appeared 06/30 at 420k, no cut yet.
    rows = build_week_rows([STATE_ROW], HISTORY, date(2026, 6, 29))
    assert len(rows) == 1
    r = rows[0]
    assert r["week_start"] == date(2026, 6, 29)
    assert r["list_price"] == 420_000          # price BEFORE the 07/08 cut
    assert r["cuts_to_date"] == 0
    assert r["state_at_week_end"] == "active"
    assert r["dom_days"] == 5                  # 07/05 - 06/30
    assert r["sold_next_week"] is None         # labels never set at build time
    assert r["beds"] == 3 and r["zip_code"] == "33904"

def test_week2_row_sees_cut():
    # Week 07/06–07/12: cut on 07/08 has landed.
    r = build_week_rows([STATE_ROW], HISTORY, date(2026, 7, 6))[0]
    assert r["list_price"] == 400_000
    assert r["cuts_to_date"] == 1
    assert r["cut_depth_pct_to_date"] == round(20_000 / 420_000 * 100, 2)

def test_week3_holding_then_relist_then_sold():
    # Week 07/13–07/19: holding 07/14, relist 07/16, sold 07/17 -> week-end state sold.
    r = build_week_rows([STATE_ROW], HISTORY, date(2026, 7, 13))[0]
    assert r["state_at_week_end"] == "sold"
    assert r["relists_to_date"] == 1

def test_not_yet_appeared_gets_no_row():
    rows = build_week_rows([STATE_ROW], HISTORY, date(2026, 6, 22))
    assert rows == []

def test_seed_transitions_are_baseline_not_events():
    seeded = [_t("2026-06-30", None, "active", 420_000, seed=True),
              _t("2026-07-08", "active", "active", 400_000, delta=-20_000, seed=True)]
    r = build_week_rows([STATE_ROW], seeded, date(2026, 7, 6))[0]
    assert r["state_at_week_end"] == "active"  # seed DOES establish state/price
    assert r["list_price"] == 400_000
    assert r["cuts_to_date"] == 0              # seed does NOT count as a cut event

def test_rental_rows_excluded():
    rent_state = dict(STATE_ROW, sale_or_rent="rent")
    rent_hist = [dict(h, sale_or_rent="rent") for h in HISTORY]
    assert build_week_rows([rent_state], rent_hist, date(2026, 6, 29)) == []

def test_label_updates_for_prior_week():
    # Labels for week 07/06 come from events in week 07/13–07/19 (sold on 07/17).
    ups = label_updates(HISTORY, date(2026, 7, 6))
    assert ups == [{
        "address_key": "123 MAIN ST:33904", "sale_or_rent": "sale",
        "week_start": date(2026, 7, 6),
        "sold_next_week": True, "holding_next_week": True,  # 07/14 holding also in window
        "price_cut_next_week": False,
    }]

def test_label_updates_ignore_seed():
    seeded = [_t("2026-07-17", "active", "sold", 400_000, seed=True)]
    assert label_updates(seeded, date(2026, 7, 6)) == []

def test_idempotent_same_input_same_rows():
    a = build_week_rows([STATE_ROW], HISTORY, date(2026, 7, 6))
    b = build_week_rows([STATE_ROW], HISTORY, date(2026, 7, 6))
    assert a == b
