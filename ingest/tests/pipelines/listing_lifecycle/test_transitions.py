"""Deterministic tests for the pure lifecycle diff engine (no network, no DB).

diff_states(prior, scanned, today, scan_complete, is_seed) -> (state_upserts, transitions).
Keys are (address_key, sale_or_rent) tuples — one address can be live for sale AND rent at once."""
from __future__ import annotations

from ingest.pipelines.listing_lifecycle.transitions import diff_states

TODAY = "2026-07-01"
SALE = ("11145NDAVE:33971", "sale")  # (address_key, sale_or_rent)


def _scan(state, price=None, **extra):
    return {"state": state, "list_price": price, **extra}


def _prior(state, price=None, days_in_state=3, **extra):
    return {"state": state, "list_price": price, "days_in_state": days_in_state, **extra}


def _by_key(rows):
    return {(r["address_key"], r["sale_or_rent"]): r for r in rows}


def test_appeared_emits_from_none_to_scanned_state():
    ups, trans = diff_states({}, {SALE: _scan("active", 400000)}, TODAY, scan_complete=True, is_seed=False)
    assert len(trans) == 1
    t = trans[0]
    assert t["from_state"] is None and t["to_state"] == "active"
    assert t["price"] == 400000 and t["seed"] is False
    assert (t["address_key"], t["sale_or_rent"]) == SALE
    assert _by_key(ups)[SALE]["state"] == "active"


def test_appeared_with_new_badge_keeps_new():
    _, trans = diff_states({}, {SALE: _scan("new", 400000)}, TODAY, scan_complete=True, is_seed=False)
    assert trans[0]["to_state"] == "new"


def test_active_to_pending_is_absorption():
    prior = {SALE: _prior("active", 400000)}
    _, trans = diff_states(prior, {SALE: _scan("pending", 400000)}, TODAY, scan_complete=True, is_seed=False)
    assert (trans[0]["from_state"], trans[0]["to_state"]) == ("active", "pending")


def test_pending_to_active_is_deal_collapse():
    prior = {SALE: _prior("pending", 400000)}
    _, trans = diff_states(prior, {SALE: _scan("active", 400000)}, TODAY, scan_complete=True, is_seed=False)
    assert (trans[0]["from_state"], trans[0]["to_state"]) == ("pending", "active")


def test_price_cut_within_active_records_delta():
    prior = {SALE: _prior("active", 400000)}
    _, trans = diff_states(prior, {SALE: _scan("active", 380000)}, TODAY, scan_complete=True, is_seed=False)
    assert len(trans) == 1
    assert trans[0]["from_state"] == "active" and trans[0]["to_state"] == "active"
    assert trans[0]["price_delta"] == -20000


def test_unchanged_same_price_emits_no_transition():
    prior = {SALE: _prior("active", 400000)}
    ups, trans = diff_states(prior, {SALE: _scan("active", 400000)}, TODAY, scan_complete=True, is_seed=False)
    assert trans == []
    assert _by_key(ups)[SALE]["state"] == "active"


def test_absent_with_scan_complete_goes_to_holding():
    # Left the active market on a COMPLETE pull -> holding (reason unknown; we don't claim sold/pending).
    prior = {SALE: _prior("active", 400000)}
    _, trans = diff_states(prior, {}, TODAY, scan_complete=True, is_seed=False)
    assert trans[0]["from_state"] == "active" and trans[0]["to_state"] == "holding"


def test_holding_listing_reappears_is_back_on_market():
    # A holding listing seen active again = pulled back out of holding (relist / back-on-market).
    prior = {SALE: _prior("holding", 400000)}
    _, trans = diff_states(prior, {SALE: _scan("active", 405000)}, TODAY, scan_complete=True, is_seed=False)
    assert (trans[0]["from_state"], trans[0]["to_state"]) == ("holding", "active")


def test_absent_on_incomplete_scan_emits_no_pulled():
    # the truncated-pull trap: absence on an incomplete scan is a scrape gap, not a withdrawal.
    prior = {SALE: _prior("active", 400000)}
    _, trans = diff_states(prior, {}, TODAY, scan_complete=False, is_seed=False)
    assert trans == []


def test_absent_pending_is_not_marked_pulled():
    # a disappearing pending listing is ambiguous (sold vs fell-through) — never invent a transition.
    prior = {SALE: _prior("pending", 400000)}
    _, trans = diff_states(prior, {}, TODAY, scan_complete=True, is_seed=False)
    assert trans == []


def test_seed_run_marks_transitions_seed():
    _, trans = diff_states({}, {SALE: _scan("active", 400000)}, TODAY, scan_complete=True, is_seed=True)
    assert trans[0]["seed"] is True


def test_sale_and_rent_same_address_are_distinct():
    rent = ("11145NDAVE:33971", "rent")
    prior = {SALE: _prior("active", 400000)}
    scanned = {SALE: _scan("active", 400000), rent: _scan("active", 5000)}
    ups, trans = diff_states(prior, scanned, TODAY, scan_complete=True, is_seed=False)
    # the rent listing appeared; the sale listing is unchanged.
    assert len(trans) == 1
    assert (trans[0]["address_key"], trans[0]["sale_or_rent"]) == rent
    assert len(ups) == 2
