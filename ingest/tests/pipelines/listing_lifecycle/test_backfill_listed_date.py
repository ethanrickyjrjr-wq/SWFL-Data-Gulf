"""Backfill de-flooring — pure fold-step tests. The I/O (probe + UPDATE) reuses already-tested
distill.update_listed_date + extract_api.fetch_sold_event; the only NEW logic is fold_updates, whose
job is to take listed_date and NOTHING else from each probe result."""
from ingest.pipelines.listing_lifecycle.backfill_listed_date import fold_updates


def _tgt(pid: str, ak: str = None, sor: str = "sale"):
    return {"address_key": ak or f"{pid}ADDR:33901", "sale_or_rent": sor, "property_id": pid,
            "zip_code": "33901", "county": "Lee", "first_seen": "2026-06-01"}


def test_writes_only_listed_date_ignoring_sold_classification():
    # Even when the probe classifies the listing as sold with a price, we take ONLY listed_date —
    # this job never writes a state or a sold_price (that would be a phantom desk change).
    targets = [_tgt("P1"), _tgt("P2")]
    resolutions = [
        {"outcome": "sold", "sold_price": 500000, "sold_date": "2026-07-10", "listed_date": "2026-02-01"},
        {"outcome": "holding", "reason": "pending", "listed_date": "2026-03-15"},
    ]
    updates, stats = fold_updates(targets, resolutions)
    assert updates == [
        {"key": ("P1ADDR:33901", "sale"), "listed_date": "2026-02-01"},
        {"key": ("P2ADDR:33901", "sale"), "listed_date": "2026-03-15"},
    ]
    # No sold_price / outcome / state leaks into the update payload — listed_date is the only key.
    assert all(set(u.keys()) == {"key", "listed_date"} for u in updates)
    assert stats == {"probed": 2, "wrote": 2, "no_list_date": 0, "gap": 0}


def test_skips_no_list_date_and_gap_leaving_them_floored():
    targets = [_tgt("P1"), _tgt("P2"), _tgt("P3")]
    resolutions = [
        {"outcome": "holding", "listed_date": "2026-04-01"},  # written
        {"outcome": "holding", "reason": "unknown"},           # no list date -> skipped, stays floored
        {"outcome": "gap", "reason": "network"},               # API failure -> skipped, retried later
    ]
    updates, stats = fold_updates(targets, resolutions)
    assert updates == [{"key": ("P1ADDR:33901", "sale"), "listed_date": "2026-04-01"}]
    assert stats == {"probed": 3, "wrote": 1, "no_list_date": 2, "gap": 1}


def test_none_resolution_is_a_safe_skip():
    targets = [_tgt("P1")]
    updates, stats = fold_updates(targets, [None])
    assert updates == []
    assert stats == {"probed": 1, "wrote": 0, "no_list_date": 1, "gap": 0}


def test_empty_is_empty():
    updates, stats = fold_updates([], [])
    assert updates == []
    assert stats == {"probed": 0, "wrote": 0, "no_list_date": 0, "gap": 0}
