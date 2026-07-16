"""Orchestration wiring test for the API feed (source='api') — no network, no DB.

Verifies the API source routes to scan_county_api, threads the neutral source_name through every
distill call, and — the headline — keeps RentCast's REAL days_on_market while leaving an unsourced
(SteadyAPI-only) DOM NULL instead of faking it to the seed-day 0 tick (advisor's DOM fix)."""
from __future__ import annotations

import ingest.pipelines.listing_lifecycle.pipeline as P
from ingest.pipelines.listing_lifecycle.constants_api import API_SOURCE_NAME


def _api_row(**kw):
    base = dict(
        street_address="311 Ne 15th St", zip_code="33909", county="Lee", state="FL",
        city="Cape Coral", sale_or_rent="sale", list_price=359999, beds=3, baths=2.0,
        sqft=1672, lot_acres=0.2, property_type="single_family", listing_id="rc-1",
        photo_url="https://ap.rdcpix.com/x.webp", lat=26.68, lon=-81.96, county_fips="12071",
        mls_number="2026027839", mls_name="FLGulfCoastMLS", listing_type="New Construction",
        listed_date="2026-06-26", days_on_market=5,
    )
    base.update(kw)
    return base


def _scan(rows):
    return {"rows": rows, "exhausted": True, "count": len(rows),
            "last_status": 200, "county_total": len(rows)}


def test_run_api_routes_to_scan_county_api_and_threads_source_name(monkeypatch):
    cap: dict = {}
    monkeypatch.setattr(P, "scan_county_api", lambda c, k=None, **kw: _scan([_api_row()]))

    def fake_load(*a, source_name=None, **k):
        cap["load_src"] = source_name
        return {}

    monkeypatch.setattr(P.distill, "load_current_state", fake_load)
    monkeypatch.setattr(P.distill, "upsert_state",
                        lambda ups, *, source_name=None, dry_run=False: (cap.update(ups=ups, up_src=source_name, up_dry=dry_run), len(ups))[1])
    monkeypatch.setattr(P.distill, "append_transitions",
                        lambda tr, *, source_name=None, dry_run=False: (cap.update(tr_src=source_name), len(tr))[1])

    res = P.run(dry_run=True, only_county="Lee", today="2026-07-01", source="api")

    assert cap["load_src"] == API_SOURCE_NAME
    assert cap["up_src"] == API_SOURCE_NAME
    assert cap["tr_src"] == API_SOURCE_NAME
    assert cap["up_dry"] is True
    assert res["upserts"] == 1
    u = cap["ups"][0]
    assert u["listing_id"] == "rc-1"          # API row's own id (NOT the scrape region:mls composite)
    assert u["photo_url"].endswith(".webp")   # the new wide column rides through to the upsert
    assert u["county_fips"] == "12071"


def test_run_api_preserves_real_dom_and_keeps_unsourced_dom_null(monkeypatch):
    rc = _api_row(listing_id="rc-1", days_on_market=5)                                  # RentCast: real DOM
    sa_only = _api_row(street_address="999 Photo Ln", listing_id="sa-1",
                       days_on_market=None, mls_number=None, mls_name="mls")            # SteadyAPI-only: no DOM
    cap: dict = {}
    monkeypatch.setattr(P, "scan_county_api", lambda c, k=None, **kw: _scan([rc, sa_only]))
    monkeypatch.setattr(P.distill, "load_current_state", lambda *a, **k: {})
    monkeypatch.setattr(P.distill, "upsert_state", lambda ups, **k: (cap.update(ups=ups), len(ups))[1])
    monkeypatch.setattr(P.distill, "append_transitions", lambda tr, **k: len(tr))

    P.run(dry_run=True, only_county="Lee", today="2026-07-01", source="api")

    by_id = {u["listing_id"]: u for u in cap["ups"]}
    assert by_id["rc-1"]["days_on_market"] == 5     # real RentCast DOM preserved, NOT overwritten by the tick
    assert by_id["sa-1"]["days_on_market"] is None   # unsourced DOM stays NULL — never faked to 0 (drags avg)


def test_keyed_scan_mints_identity_keys_for_streetless_rows():
    """Street-less collision fix (07/16/2026, check listing_state_streetless_address_key_collision):
    two street-less listings in the same city+ZIP must NOT collapse onto one merge key — before
    this, the second silently overwrote the first (216+ active rows lost that way). The display
    street keeps the parsed text; the key rides the vendor property_id."""
    a = _api_row(street_address="Buckingham Rd", listing_id="sa-a", **{})
    a["property_id"] = "111"
    b = _api_row(street_address="Buckingham Rd", listing_id="sa-b")
    b["property_id"] = "222"
    keyed = P._keyed_scan([a, b])
    assert set(keyed) == {("L111:33909", "sale"), ("L222:33909", "sale")}
    assert keyed[("L111:33909", "sale")]["street_address"] == "Buckingham Rd"
    # an addressed row keeps the normal address key
    c = _api_row(street_address="311 Ne 15th St")
    c["property_id"] = "333"
    assert ("311NE15THST:33909", "sale") in P._keyed_scan([c])


def test_old_streetless_prior_keys_never_become_fabricated_departures(monkeypatch):
    """Old street-less keys (FORTMYERS:33912…) can never match a scan again once identity keys
    land — held out of the diff (builder-plan choreography) until the re-key migration runs."""
    live = _api_row(listing_id="sa-live")
    live["property_id"] = "444"
    prior = {
        ("311NE15THST:33909", "sale"): {
            **_api_row(listing_id="sa-live"), "state": "active", "status": "for_sale",
            "address_key": "311NE15THST:33909", "days_in_state": 3, "property_id": "444",
        },
        ("FORTMYERS:33912", "sale"): {
            **_api_row(street_address="Fortmyers", zip_code="33912", listing_id="sa-old"),
            "state": "active", "status": "for_sale", "address_key": "FORTMYERS:33912",
            "days_in_state": 30, "property_id": "5339569047",
        },
    }
    cap: dict = {}
    monkeypatch.setattr(P, "scan_county_api", lambda c, k=None, **kw: _scan([live]))
    monkeypatch.setattr(P.distill, "load_current_state", lambda *a, **k: dict(prior))
    monkeypatch.setattr(P.distill, "transition_count", lambda *a, **k: 42)
    monkeypatch.setattr(P.distill, "upsert_state", lambda ups, **k: (cap.update(ups=ups), len(ups))[1])
    monkeypatch.setattr(P.distill, "append_transitions", lambda tr, **k: (cap.update(tr=tr), len(tr))[1])

    P.run(dry_run=True, only_county="Lee", today="2026-07-16", source="api")

    assert all(t["address_key"] != "FORTMYERS:33912" for t in cap["tr"])
    assert all(u["address_key"] != "FORTMYERS:33912" for u in cap["ups"])
    assert [t for t in cap["tr"] if t["to_state"] == "holding"] == []


def test_source_totals_logged_on_county_scoped_runs(monkeypatch):
    """The 0-rows root cause (check source_totals_migration_apply): every scheduled run passes
    --county, and the old end-of-run write was gated on `not only_county` — unreachable in
    production. The ledger write now happens per county, inside the loop."""
    logged: list[tuple[int, str]] = []
    monkeypatch.setattr(P, "scan_county_api",
                        lambda c, k=None, **kw: {**_scan([_api_row()]), "source_total": 22158})
    monkeypatch.setattr(P.distill, "load_current_state", lambda *a, **k: {})
    monkeypatch.setattr(P.distill, "upsert_state", lambda ups, **k: len(ups))
    monkeypatch.setattr(P.distill, "append_transitions", lambda tr, **k: len(tr))
    monkeypatch.setattr(P.distill, "log_source_total",
                        lambda v, label, dry_run=False: logged.append((v, label)))
    # dry_run=False also arms the end-of-run price-recheck backfill — keep it hermetic.
    monkeypatch.setattr(P.distill, "load_price_pending_solds", lambda *a, **k: [])

    P.run(dry_run=False, only_county="Lee", today="2026-07-16", source="api")

    assert logged == [(22158, "SteadyAPI meta.total (Lee, county-level /search)")]


def test_incomplete_scan_lands_partial_progress_without_fabricated_departures(monkeypatch):
    """Partial-progress (07/16/2026, check steadyapi_429_no_retry): a throttled/truncated
    steady-state scan must LAND the rows it did fetch (we paid for those pages) while still
    never inferring a departure from absence — diff_states' scan_complete=False contract.
    Before this, one 429 discarded the county's entire scan (Lee + Collier, 07/07)."""
    present = _api_row(listing_id="sa-1")
    prior = {
        ("311NE15THST:33909", "sale"): {
            **_api_row(listing_id="sa-1"), "state": "active", "status": "for_sale",
            "address_key": "311NE15THST:33909", "days_in_state": 3,
        },
        # absent from today's truncated pull — a scrape gap, NOT a departure
        ("999PHOTOLN:33909", "sale"): {
            **_api_row(street_address="999 Photo Ln", listing_id="sa-2"),
            "state": "active", "status": "for_sale",
            "address_key": "999PHOTOLN:33909", "days_in_state": 8,
        },
    }
    cap: dict = {}
    incomplete = {"rows": [present], "exhausted": False, "count": 1,
                  "last_status": 429, "county_total": 1}
    monkeypatch.setattr(P, "scan_county_api", lambda c, k=None, **kw: incomplete)
    monkeypatch.setattr(P.distill, "load_current_state", lambda *a, **k: dict(prior))
    monkeypatch.setattr(P.distill, "transition_count", lambda *a, **k: 42)  # steady state
    monkeypatch.setattr(P.distill, "upsert_state", lambda ups, **k: (cap.update(ups=ups), len(ups))[1])
    monkeypatch.setattr(P.distill, "append_transitions", lambda tr, **k: (cap.update(tr=tr), len(tr))[1])

    P.run(dry_run=True, only_county="Lee", today="2026-07-16", source="api")

    # The rows we paid for LAND (last_seen/aging refresh for what we saw)...
    assert any(u["address_key"] == "311NE15THST:33909" for u in cap["ups"])
    # ...but the absent row is untouched — no holding flip, no fabricated departure.
    assert all(u["address_key"] != "999PHOTOLN:33909" for u in cap["ups"])
    assert all(t["to_state"] != "holding" for t in cap["tr"])


def test_incomplete_seed_scan_still_lands_nothing(monkeypatch):
    """A truncated FIRST pull must never become the baseline — partial-progress is a
    steady-state-only concession. On a seed, incomplete still means skip."""
    calls = {"upserts": 0}
    incomplete = {"rows": [_api_row()], "exhausted": False, "count": 1,
                  "last_status": 429, "county_total": 1}
    monkeypatch.setattr(P, "scan_county_api", lambda c, k=None, **kw: incomplete)
    monkeypatch.setattr(P.distill, "load_current_state", lambda *a, **k: {})
    monkeypatch.setattr(P.distill, "transition_count", lambda *a, **k: 0)  # first-ever run

    def fake_upsert(ups, **k):
        calls["upserts"] += 1
        return len(ups)

    monkeypatch.setattr(P.distill, "upsert_state", fake_upsert)
    monkeypatch.setattr(P.distill, "append_transitions", lambda tr, **k: len(tr))

    P.run(dry_run=True, only_county="Lee", today="2026-07-16", source="api")

    assert calls["upserts"] == 0


def test_stale_builder_plan_rows_never_become_fabricated_departures(monkeypatch):
    """The coupling guard. extract_api now rejects `ready_to_build` records, so the 588 plan rows
    ALREADY in listing_state are absent from every future scan. Left in `prior`, diff_states would
    read each one as a departure and emit active->holding — 588 "listings left the market" on one
    day, straight into listing_transitions and the flow metrics brains read. That is a fabricated
    number, the exact class of lie the is_seed baseline guard exists to prevent. They must be held
    out of the diff entirely: not scanned, not diffed, not transitioned — inert until the purge."""
    live = _api_row(street_address="311 Ne 15th St", listing_id="sa-live")
    prior = {
        # a REAL active listing, still in the sweep -> ages normally
        ("311NE15THST:33909", "sale"): {
            **_api_row(listing_id="sa-live"), "state": "active", "status": "for_sale",
            "address_key": "311NE15THST:33909", "days_in_state": 3,
        },
        # a STALE builder plan (status persisted by _STATE_COLS) that no sweep will ever return again
        ("HIGHGATE:33928", "sale"): {
            **_api_row(street_address="Highgate", zip_code="33928", listing_id="plan-1"),
            "state": "active", "status": "ready_to_build", "address_key": "HIGHGATE:33928",
            "days_in_state": 12,
        },
    }
    cap: dict = {}
    monkeypatch.setattr(P, "scan_county_api", lambda c, k=None, **kw: _scan([live]))
    monkeypatch.setattr(P.distill, "load_current_state", lambda *a, **k: dict(prior))
    monkeypatch.setattr(P.distill, "transition_count", lambda *a, **k: 42)   # steady state, not a seed
    monkeypatch.setattr(P.distill, "upsert_state", lambda ups, **k: (cap.update(ups=ups), len(ups))[1])
    monkeypatch.setattr(P.distill, "append_transitions", lambda tr, **k: (cap.update(tr=tr), len(tr))[1])

    P.run(dry_run=True, only_county="Lee", today="2026-07-14", source="api")

    # THE ASSERTION: zero departures. The plan row is not holding, not transitioned, not touched.
    assert [t for t in cap["tr"] if t["to_state"] == "holding"] == []
    assert all(t["address_key"] != "HIGHGATE:33928" for t in cap["tr"])
    assert all(u["address_key"] != "HIGHGATE:33928" for u in cap["ups"])
    # ...and the real listing is unaffected by the hold-out (it still ages/upserts normally).
    assert any(u["address_key"] == "311NE15THST:33909" for u in cap["ups"])
