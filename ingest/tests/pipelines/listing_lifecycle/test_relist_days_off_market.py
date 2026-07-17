from ingest.pipelines.listing_lifecycle.transitions import diff_states


def _relist(prior_last_seen: str):
    prior = {("123MAINST:33904", "sale"): {
        "state": "holding", "last_seen": prior_last_seen, "list_price": 300000, "days_in_state": 0}}
    scanned = {("123MAINST:33904", "sale"): {
        "state": "active", "list_price": 300000, "listing_id": "L1"}}
    _ups, trans = diff_states(prior, scanned, "2026-07-17", scan_complete=True, is_seed=False)
    return next(t for t in trans if t["from_state"] == "holding" and t["to_state"] == "active")


def test_real_relist_carries_true_off_market_duration():
    t = _relist("2026-07-07")  # 10 days off-market
    assert t["days_off_market"] == 10


def test_flicker_relist_reads_as_short():
    t = _relist("2026-07-16")  # 1 day — a scan-gap flicker, below the 7-day floor
    assert t["days_off_market"] == 1


def test_new_listing_has_no_off_market_duration():
    scanned = {("999OAKLN:34102", "sale"): {"state": "active", "list_price": 500000, "listing_id": "L2"}}
    _ups, trans = diff_states({}, scanned, "2026-07-17", scan_complete=True, is_seed=False)
    appeared = next(t for t in trans if t["from_state"] is None)
    assert appeared["days_off_market"] is None
