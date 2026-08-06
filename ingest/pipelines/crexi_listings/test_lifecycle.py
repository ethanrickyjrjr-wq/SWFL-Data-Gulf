"""Lifecycle guards for the commercial-listing reconcile (added 08/06/2026).

Each test is named after the failure mode it prevents, not the function it calls.
The defect these exist for: the old blind upsert had NO expiry, so 61 crexi rows sat
`status='available'` frozen at 07/05/2026 for 32 days, feeding a critical input.
Fixing that introduced a WORSE possible failure — a scrape that returns nothing
would close out the entire city — so that one is guarded first.
"""
from __future__ import annotations

import ingest.pipelines.crexi_listings.distill as distill


def test_empty_scrape_does_not_wipe_the_city(capsys, monkeypatch):
    """A failed scrape returns 0 listings. That is NOT an empty market.

    Cloudflare blocked us on 07/12/2026 and again on 08/06/2026 (run 31127088993),
    both times returning 0 rows for every city. If close_unseen trusted that, one
    blocked run would mark every live listing off-market and manufacture a fake
    market-wide exodus. It must refuse and touch nothing.
    """
    def _boom():
        raise AssertionError("close_unseen opened a DB connection on an empty scrape")

    monkeypatch.setattr(distill, "_get_conn", _boom)
    closed = distill.close_unseen(["Estero", "Fort Myers Beach"], [])
    assert closed == 0
    assert "refused" in capsys.readouterr().out


def test_no_covered_cities_closes_nothing(monkeypatch):
    """A run that looked at no city may not close anything, even with ids in hand."""
    monkeypatch.setattr(
        distill, "_get_conn",
        lambda: (_ for _ in ()).throw(AssertionError("connected with no covered cities")),
    )
    assert distill.close_unseen([], ["abc123"]) == 0


def test_dry_run_never_writes(monkeypatch):
    """--dry-run must stay read-only: it is how we inspect a run before trusting it."""
    monkeypatch.setattr(
        distill, "_get_conn",
        lambda: (_ for _ in ()).throw(AssertionError("dry-run opened a DB connection")),
    )
    assert distill.close_unseen(["Estero"], ["abc123"], dry_run=True) == 0


def test_observations_are_appended_once_per_run():
    """The price series is append-only and re-run safe.

    Without ON CONFLICT DO NOTHING, re-running the same batch would double-count and
    make a flat week look like two observations at the same price.
    """
    captured: dict[str, object] = {}

    class _Cur:
        def executemany(self, sql, params):
            captured["sql"] = sql
            captured["params"] = params

    rows = [
        {"id": "a", "source_name": "crexi", "city": "Estero", "status": "available",
         "sqft": 1000, "asking_price_psf": 24.5},
        {"id": "b", "source_name": "crexi", "city": "Estero", "status": "available",
         "sqft": 2000, "asking_price_psf": 30.0},
    ]
    n = distill._insert_observations(_Cur(), rows, "2026-08-06T00:00:00Z")

    assert n == 2
    assert "ON CONFLICT (listing_id, observed_at) DO NOTHING" in captured["sql"]
    assert [p["id"] for p in captured["params"]] == ["a", "b"]
    assert all(p["now"] == "2026-08-06T00:00:00Z" for p in captured["params"])


def test_empty_rows_write_no_observations():
    """No listings seen -> no observation rows, and no DB call to make them."""
    class _Cur:
        def executemany(self, sql, params):  # pragma: no cover - must not run
            raise AssertionError("executemany called with zero rows")

    assert distill._insert_observations(_Cur(), [], "2026-08-06T00:00:00Z") == 0
