"""Catch-up bridge tests — pure summary/guard logic (no DB) + the is_seed baseline plumbing.

The catch-up flips the Source-B seed (source_name='lifecycle_seed') into the API feed's source_name
('api_feed') so the live brain un-orphans it, then the first sweep runs with is_seed=True. These tests
lock: (1) the summary scopes to Lee+Collier and reports the COVE/POINT unmatched floor honestly,
(2) the guard aborts into a populated api_feed (collision safety), (3) --catchup forces seed=True even
when prior is non-empty (the advisor's hard fix against fabricated catch-up-day churn)."""
from __future__ import annotations

import ingest.pipelines.listing_lifecycle.pipeline as P
from ingest.pipelines.listing_lifecycle.catchup import decide, summarize_seed
from ingest.pipelines.listing_lifecycle.constants_api import API_SOURCE_NAME


def _seed_row(**kw):
    base = dict(address_key="2906NW22NDAVE:33993", sale_or_rent="sale", county="Lee",
                lat=None, property_id=None)
    base.update(kw)
    return base


# ── summarize_seed (pure) ────────────────────────────────────────────────────────────────────

def test_summary_scopes_to_lee_and_collier_leaving_other_counties_out():
    rows = [_seed_row(county="Lee"), _seed_row(county="Collier"), _seed_row(county="Hendry")]
    s = summarize_seed(rows)
    assert s["total_seed"] == 3
    assert s["in_scope"] == 2
    assert s["out_of_scope"] == 1            # Hendry has no live feed yet — stays under lifecycle_seed
    assert s["by_county"] == {"Lee": 1, "Collier": 1}


def test_summary_flags_cove_point_rows_as_the_unmatched_floor():
    # COVE/POINT keys won't equal the sweep's abbreviated CV/PT — the one bucket that inserts fresh.
    rows = [
        _seed_row(address_key="100PELICANCOVE:34104"),
        _seed_row(address_key="200SUNSETPOINT:33957"),
        _seed_row(address_key="2906NW22NDAVE:33993"),   # short-form, will match — not a risk
    ]
    assert summarize_seed(rows)["suffix_mismatch_risk"] == 2


def test_summary_counts_missing_latlon_and_pid():
    rows = [_seed_row(lat=None, property_id=None), _seed_row(lat=26.6, property_id="p1")]
    s = summarize_seed(rows)
    assert s["missing_latlon"] == 1
    assert s["missing_pid"] == 1


# ── decide (pure guard) ──────────────────────────────────────────────────────────────────────

def _summary(in_scope):
    return {"in_scope": in_scope}


def test_decide_aborts_when_api_feed_already_populated():
    # Flipping into a non-empty api_feed risks (source_name, address_key, sale_or_rent) collisions.
    plan = decide(_summary(10000), existing_api_count=42, dry_run=False)
    assert plan["action"] == "abort"


def test_decide_aborts_when_nothing_in_scope():
    assert decide(_summary(0), existing_api_count=0, dry_run=False)["action"] == "abort"


def test_decide_dryruns_then_flips():
    assert decide(_summary(10000), existing_api_count=0, dry_run=True)["action"] == "dryrun"
    assert decide(_summary(10000), existing_api_count=0, dry_run=False)["action"] == "flip"


# ── is_seed plumbing (the advisor's hard correctness fix) ─────────────────────────────────────

def _sweep_row(price):
    return {"street_address": "311 Ne 15th St", "zip_code": "33909", "county": "Lee",
            "sale_or_rent": "sale", "list_price": price}


def _prior_active(price):
    # Same address as the sweep (address_key recomputed by _keyed_scan to 311NE15THST:33909), active.
    return {("311NE15THST:33909", "sale"): {
        "address_key": "311NE15THST:33909", "sale_or_rent": "sale", "state": "active",
        "list_price": price, "county": "Lee", "days_in_state": 3}}


def _run_capture(monkeypatch, *, catchup):
    cap: dict = {}
    monkeypatch.setattr(P, "scan_county_api", lambda c, k=None, **kw: {
        "rows": [_sweep_row(320000)], "exhausted": True, "count": 1,
        "last_status": 200, "county_total": 1, "search_calls": 1, "enrich_calls": 0})
    monkeypatch.setattr(P.distill, "load_current_state", lambda *a, **k: _prior_active(300000))
    monkeypatch.setattr(P.distill, "upsert_state", lambda ups, **k: len(ups))
    monkeypatch.setattr(P.distill, "append_transitions",
                        lambda tr, **k: (cap.update(tr=tr), len(tr))[1])
    P.run(dry_run=True, only_county="Lee", today="2026-07-01", source="api", catchup=catchup)
    return cap["tr"]


def test_catchup_forces_seed_true_even_with_nonempty_prior(monkeypatch):
    # A price move against the migrated seed would otherwise emit an undate-able real transition.
    trans = _run_capture(monkeypatch, catchup=True)
    assert trans, "expected a price-delta transition"
    assert all(t["seed"] is True for t in trans)


def test_without_catchup_nonempty_prior_is_not_seed(monkeypatch):
    trans = _run_capture(monkeypatch, catchup=False)
    assert trans and all(t["seed"] is False for t in trans)
