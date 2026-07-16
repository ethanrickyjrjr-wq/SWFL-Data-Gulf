"""Tests for the API-fed listing extractor — SteadyAPI sole spine.

Pure parser + batched-enrichment tests are network-free; fixtures mirror the live-probed record
shapes (RULE 0.4, 2026-06-30): SteadyAPI location.county_fips 5-digit "12071";
/nearby-home-values body.properties[].description.baths is a STRING ("2.5"), not an int.
The fetch/scan tests (mocked HTTP, no network) live alongside in the second block."""
from __future__ import annotations

from ingest.pipelines.listing_lifecycle.extract_api import (
    _cluster_by_latlon,
    enrich_baths_batched,
    is_builder_plan,
    map_property_type,
    parse_steadyapi,
)

# Real-shaped SteadyAPI search record (fields verified against the live API 2026-06-30).
_STEADYAPI_ROW = {
    "property_id": "5493101642",
    "permalink": "https://www.realtor.com/realestateandhomes-detail/1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642",
    "price": {"amount": 374900, "reduced_amount": None},
    "status": "for_sale",
    "source_type": "mls",
    "photo_url": "https://ap.rdcpix.com/abc/x.webp",
    "location": {"lat": 26.6712, "lon": -81.961, "county_fips": "12071"},
    "description": {"beds": 4, "sqft": 1800, "lot_sqft": 10000},
    "flags": {
        "is_pending": False, "is_contingent": False, "is_coming_soon": False,
        "is_foreclosure": False, "is_new_construction": False,
        "is_price_reduced": True, "is_new_listing": True,
    },
}

# Real-shaped /nearby-home-values record (verified against live docs.steadyapi.com, 2026-06-30).
_NEARBY_ROW = {
    "property_id": "5493101642",
    "listing_id": "2996679504",
    "status": "for_sale",
    "list_price": 374900,
    "description": {"beds": 4, "baths": "2.5", "sqft": 1800, "lot_sqft": 10000},
}


def test_parse_steadyapi_parses_permalink_and_photo():
    r = parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL")
    assert r is not None
    assert r["street_address"] == "1403 NE 19th Ter"
    assert r["zip_code"] == "33909"
    assert r["county_fips"] == "12071"
    assert r["county"] == "Lee"
    assert r["photo_url"].endswith(".webp")
    assert r["list_price"] == 374900
    assert r["beds"] == 4
    # No type_hint -> honest "other" (4114768b: /search rows carry NO type field;
    # the type comes from the build_type_lookup sweep, never invented from beds).
    assert r["property_type"] == "other"
    hinted = parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL", type_hint="single_family")
    assert hinted["property_type"] == "single_family"
    assert r["days_on_market"] is None            # SteadyAPI gives no list date / DOM


def test_parse_steadyapi_persists_property_id_status_flags():
    r = parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL")
    assert r["property_id"] == "5493101642"        # real column now — known_ids depends on this
    assert r["status"] == "for_sale"
    assert r["reduced_amount"] is None
    assert r["flag_price_reduced"] is True
    assert r["flag_new_listing"] is True
    assert r["flag_pending"] is False


def test_parse_steadyapi_land_when_no_beds_but_lot():
    row = {**_STEADYAPI_ROW, "description": {"beds": None, "lot_sqft": 10890}}
    r = parse_steadyapi(row, city="Cape Coral", state="FL")
    assert r is not None and r["property_type"] == "land" and r["beds"] is None


def test_parse_steadyapi_out_of_scope_returns_none():
    row = {**_STEADYAPI_ROW, "location": {"lat": 1, "lon": 1, "county_fips": "12086"}}
    assert parse_steadyapi(row, city="Miami", state="FL") is None


def test_map_property_type_fallback():
    assert map_property_type("Single Family") == "single_family"
    assert map_property_type("Quadruplex") == "other"
    assert map_property_type(None) == "other"


# ---------------------------------------------------------- builder plans are NOT listings
#
# VERBATIM live record (RULE 0.4, /search?location=Estero_FL, 2026-07-14). The city sweep returned
# 697 status='for_sale'/is_plan=False and 46 status='ready_to_build'/is_plan=True — the two vendor
# discriminators agreed on every one of the 743 records. Note the permalink: its leading token is the
# PLAN NAME ("Venice"), not a house number, which is precisely how these minted plan-name address_keys.
_PLAN_ROW = {
    "property_id": "P417000664438",
    "permalink": "https://www.realtor.com/realestateandhomes-detail/Venice_Verdana-Village-Executive-Homes_18389-Parksville-Dr_Estero_FL_33928_P417000664438",
    "price": {"amount": 494999, "reduced_amount": None, "display": "$494,999"},
    "status": "ready_to_build",
    "source_type": "mls",
    "location": {"lat": 26.4457, "lon": -81.6477, "county_fips": "12071"},
    "description": {"beds": 3, "sqft": 1849, "lot_sqft": None},
    "flags": {
        "is_pending": False, "is_contingent": False, "is_coming_soon": False,
        "is_foreclosure": False, "is_new_construction": True,
        "is_price_reduced": False, "is_new_listing": False, "is_plan": True,
    },
}


def test_is_builder_plan_detects_both_vendor_signals():
    assert is_builder_plan(_PLAN_ROW) is True
    # Either signal alone is sufficient — OR-ed so the vendor dropping one field can't re-open the leak.
    assert is_builder_plan({**_PLAN_ROW, "flags": {"is_plan": False}}) is True          # status alone
    assert is_builder_plan({**_PLAN_ROW, "status": "for_sale"}) is True                 # flag alone
    assert is_builder_plan({**_PLAN_ROW, "status": "READY_TO_BUILD"}) is True           # case-insensitive
    # A real listing is never a plan.
    assert is_builder_plan(_STEADYAPI_ROW) is False
    assert is_builder_plan({}) is False


def test_parse_steadyapi_rejects_builder_plan():
    """A floor plan has no property identity. It must be rejected at the parse boundary, BEFORE the
    street parse mints an address_key out of the plan name ('HIGHGATE:33928'), because that key is
    what carried 588 non-properties into the lifecycle state machine as active for-sale listings."""
    assert parse_steadyapi(_PLAN_ROW, city="Estero", state="FL") is None
    assert parse_steadyapi(_PLAN_ROW, city="Estero", state="FL", type_hint="single_family") is None
    # The plan-name key it WOULD have produced, proving the defect is the identity, not the price:
    # this row carries a perfectly valid $494,999 — a price floor could never have caught it.
    assert _PLAN_ROW["price"]["amount"] > 20000


def test_parse_steadyapi_still_accepts_the_real_for_sale_row():
    """Regression guard on the plan filter: the 697-of-743 for_sale majority must be untouched."""
    r = parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL")
    assert r is not None and r["status"] == "for_sale" and r["list_price"] == 374900


# ---------------------------------------------------------- clustering (pure, no network)

def test_cluster_by_latlon_groups_nearby_points_into_one_cell():
    rows = [
        {"lat": 26.6712, "lon": -81.9610},
        {"lat": 26.6713, "lon": -81.9611},  # same ~2km cell
    ]
    assert len(_cluster_by_latlon(rows)) == 1


def test_cluster_by_latlon_separates_distant_points():
    rows = [
        {"lat": 26.6712, "lon": -81.9610},
        {"lat": 26.1500, "lon": -81.7900},  # Naples — different cell
    ]
    assert len(_cluster_by_latlon(rows)) == 2


def test_cluster_by_latlon_skips_rows_without_coords():
    rows = [{"lat": None, "lon": None}, {"lat": 26.6712, "lon": -81.9610}]
    assert len(_cluster_by_latlon(rows)) == 1


# ---------------------------------------------------------- batched enrichment (mocked HTTP)
import itertools  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import pytest  # noqa: E402

from ingest.pipelines.listing_lifecycle import extract_api  # noqa: E402


def _resp(status, body):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = body
    return m


def _new_row(pid="5493101642", baths=None):
    r = parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL")
    r["property_id"] = pid
    r["baths"] = baths
    return r


def test_enrich_baths_batched_fires_one_call_per_cluster_not_per_listing(monkeypatch):
    monkeypatch.setenv("PHOTOS_API", "p")
    rows = [_new_row(pid=str(i)) for i in range(30)]  # 30 NEW listings, same lat/lon cell
    for r in rows:
        r["lat"], r["lon"] = 26.6712, -81.9610
    body = {"body": {"properties": [{"property_id": str(i),
                                      "description": {"baths": "2.5"}} for i in range(30)]}}
    with patch.object(extract_api.requests, "get", return_value=_resp(200, body)) as mock_get:
        stats = enrich_baths_batched(rows, known_ids=set())
    assert mock_get.call_count == 1                # ONE call covers all 30 — the whole point of the fix
    assert stats["calls"] == 1
    assert stats["new_count"] == 30
    assert stats["baths_filled"] == 30
    assert all(r["baths"] == 2.5 for r in rows)


def test_enrich_baths_batched_skips_known_ids():
    rows = [_new_row(pid="5493101642")]
    with patch.object(extract_api.requests, "get") as mock_get:
        stats = enrich_baths_batched(rows, known_ids={"5493101642"})
    mock_get.assert_not_called()                    # already-held listing — zero calls, the budget fix
    assert stats["new_count"] == 0
    assert stats["calls"] == 0


def test_enrich_baths_batched_skips_land_rows():
    row = _new_row()
    row["property_type"] = "land"
    with patch.object(extract_api.requests, "get") as mock_get:
        stats = enrich_baths_batched([row], known_ids=set())
    mock_get.assert_not_called()                    # land has no baths — not worth a call
    assert stats["new_count"] == 0


def test_enrich_baths_batched_dry_run_makes_zero_network_calls(monkeypatch):
    monkeypatch.setenv("PHOTOS_API", "p")
    rows = [_new_row(pid=str(i)) for i in range(5)]
    for r in rows:
        r["lat"], r["lon"] = 26.6712, -81.9610
    with patch.object(extract_api.requests, "get") as mock_get:
        stats = enrich_baths_batched(rows, known_ids=set(), dry_run=True)
    mock_get.assert_not_called()                    # the dry-run-trap fix: no network in dry_run
    assert stats["new_count"] == 5
    assert stats["calls"] == 1                       # still reports the real call count it WOULD make


def test_enrich_baths_batched_no_key_is_a_gap(monkeypatch):
    monkeypatch.delenv("PHOTOS_API", raising=False)
    rows = [_new_row()]
    for r in rows:
        r["lat"], r["lon"] = 26.6712, -81.9610
    stats = enrich_baths_batched(rows, known_ids=set())
    assert stats["calls"] == 0 and stats["baths_filled"] == 0


# ---------------------------------------------------------- fetch + scan (mocked HTTP, no network)

def test_fetch_steadyapi_paginates_to_meta_total():
    body1 = {"meta": {"total": 250}, "body": [_STEADYAPI_ROW] * 200}
    body2 = {"meta": {"total": 250}, "body": [_STEADYAPI_ROW] * 50}
    with patch.object(extract_api.requests, "get", side_effect=[_resp(200, body1), _resp(200, body2)]):
        rows, ok, pages, total = extract_api.fetch_steadyapi_city("Cape Coral", key="p")
    assert len(rows) == 250 and ok is True and pages == 2 and total == 250


def test_fetch_steadyapi_clean_empty_first_page_is_complete():
    with patch.object(extract_api.requests, "get", return_value=_resp(200, {"meta": {"total": 0}, "body": []})):
        rows, ok, pages, total = extract_api.fetch_steadyapi_city("Sanibel", key="p")
    # total stays None here: the empty-body short-circuit returns BEFORE the meta.total capture line
    # (existing extractor behavior, unchanged by Task 11 -- verified empirically, not assumed).
    assert rows == [] and ok is True and pages == 1 and total is None


def test_fetch_steadyapi_non_200_is_a_gap(monkeypatch):
    monkeypatch.setattr(extract_api, "_sleep", lambda s: None)  # 429 now retries before giving up
    with patch.object(extract_api.requests, "get", return_value=_resp(429, {})):
        rows, ok, pages, total = extract_api.fetch_steadyapi_city("Cape Coral", key="p")
    assert rows == [] and ok is False and total is None


def test_fetch_steadyapi_no_key_is_a_gap():
    rows, ok, pages, total = extract_api.fetch_steadyapi_city("Cape Coral", key=None)
    assert rows == [] and ok is False and pages == 0 and total is None


def test_scan_county_api_labels_counts_and_reports_call_budget(monkeypatch):
    monkeypatch.setenv("PHOTOS_API", "p")
    # Both seams mocked: 1 unfiltered page + 4 type-sweep pages for the ONE county-level
    # location (COUNTY_SEED, 07/16/2026 migration). The budget line must report REAL pages
    # spent — type sweeps included (4114768b), or the $1-cap accounting undercounts by 4x.
    with patch.object(extract_api, "fetch_steadyapi_city", return_value=([_STEADYAPI_ROW], True, 1, None)), \
         patch.object(extract_api, "build_type_lookup", return_value=({}, 4)):
        out = extract_api.scan_county_api("Lee", known_ids={"5493101642"})
    assert out["count"] >= 1
    assert out["exhausted"] is True
    assert out["last_status"] == 200
    assert all(r["county"] == "Lee" for r in out["rows"])
    assert out["search_calls"] == 1 + 4              # one county walk + its 4 type sweeps
    assert out["enrich_calls"] == 0                  # the one row is already in known_ids


def test_scan_county_api_sweeps_the_county_seed_not_cities(monkeypatch):
    """County-seed migration (07/16/2026): the unfiltered walk and the type sweeps both hit
    the county-level location exactly once — no per-city fan-out remains."""
    monkeypatch.setenv("PHOTOS_API", "p")
    seen: list[str] = []

    def fake_city(city, state="FL", key=None):
        seen.append(city)
        return [_STEADYAPI_ROW], True, 1, 22158

    with patch.object(extract_api, "fetch_steadyapi_city", side_effect=fake_city), \
         patch.object(extract_api, "build_type_lookup", return_value=({}, 4)) as mock_lookup:
        out = extract_api.scan_county_api("Lee")
    assert seen == ["Lee County"]                    # slugs to Lee-County_FL downstream
    mock_lookup.assert_called_once_with("Lee County")
    assert out["source_total"] == 22158              # the county's own meta.total, not a city sum


def test_parse_steadyapi_derives_city_from_permalink_slug():
    """County-level sweeps pass no per-row city, so the slug is the city authority:
    [street, city, state, zip, id]. Falls back to the caller's label when nonstandard."""
    lehigh = {**_STEADYAPI_ROW,
              "permalink": "https://www.realtor.com/realestateandhomes-detail/3810-18th-St-SW_Lehigh-Acres_FL_33976_M69363-83501"}
    r = parse_steadyapi(lehigh, city="Lee County", state="FL")
    assert r is not None and r["city"] == "Lehigh Acres" and r["zip_code"] == "33976"
    # nonstandard slug (no zip segment) → caller's label survives as the fallback
    odd = {**_STEADYAPI_ROW, "permalink": "https://www.realtor.com/realestateandhomes-detail/weird-slug"}
    r2 = parse_steadyapi(odd, city="Lee County", state="FL")
    assert r2 is not None and r2["city"] == "Lee County"


def test_scan_county_api_clean_empty_city_stays_complete(monkeypatch):
    # A cleanly-empty city must NOT poison the whole county's completeness (robustness fix).
    monkeypatch.setenv("PHOTOS_API", "p")
    with patch.object(extract_api, "fetch_steadyapi_city", return_value=([], True, 1, None)):
        out = extract_api.scan_county_api("Lee")
    assert out["exhausted"] is True and out["count"] == 0


def test_scan_county_api_truncated_city_marks_incomplete(monkeypatch):
    monkeypatch.setenv("PHOTOS_API", "p")
    # build_type_lookup patched too — hermetic; otherwise its unfiltered requests.get would
    # hit the retry path (with real backoff sleeps) on every one of Lee's 8 seed cities.
    with patch.object(extract_api, "fetch_steadyapi_city", return_value=([_STEADYAPI_ROW], False, 1, None)), \
         patch.object(extract_api, "build_type_lookup", return_value=({}, 0)):
        out = extract_api.scan_county_api("Lee")
    assert out["exhausted"] is False and out["last_status"] != 200


def test_scan_county_api_dry_run_never_calls_nearby_home_values(monkeypatch):
    # The regression this whole fix targets: a --dry-run invocation must not detonate the budget.
    # dry_run DELIBERATELY still fires the cheap search + type sweeps (scan_county_api docstring —
    # the gate needs the real page count); the invariant is the EXPENSIVE seam: /nearby-home-values
    # enrich must never fire.
    monkeypatch.setenv("PHOTOS_API", "p")
    with patch.object(extract_api, "fetch_steadyapi_city", return_value=([_STEADYAPI_ROW], True, 1, None)), \
         patch.object(extract_api.requests, "get") as mock_get:
        extract_api.scan_county_api("Lee", known_ids=set(), dry_run=True)
    enrich_urls = [c.args[0] for c in mock_get.call_args_list if "nearby-home-values" in str(c.args[0])]
    assert enrich_urls == []


# ----------------------------------------- bounded retry + ~1 req/s pacing (07/16/2026)
# The vendor's effective rate limit is UNVERIFIED (evidence spans 1–15 req/s — see the
# extract_api.py comment block); sustained un-paced walks 429'd on 07/07/2026, zeroing
# whole county scans, so the pacer holds request starts >=1.05s apart — safe under every
# hypothesis. ingest/conftest.py autouse-no-ops the pacer for every test — the pacing
# tests below re-patch the seams to observe it.

def test_fetch_steadyapi_retries_429_then_succeeds(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr(extract_api, "_sleep", sleeps.append)
    body = {"meta": {"total": 1}, "body": [_STEADYAPI_ROW]}
    with patch.object(extract_api.requests, "get",
                      side_effect=[_resp(429, {}), _resp(200, body)]) as mock_get:
        rows, ok, calls, total = extract_api.fetch_steadyapi_city("Cape Coral", key="p")
    assert ok is True and len(rows) == 1 and total == 1
    assert mock_get.call_count == 2
    assert calls == 2                      # honest budget: the burned retry attempt counts
    assert len(sleeps) == 1 and sleeps[0] > 0


def test_fetch_steadyapi_gives_up_after_bounded_attempts(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr(extract_api, "_sleep", sleeps.append)
    with patch.object(extract_api.requests, "get", return_value=_resp(429, {})) as mock_get:
        rows, ok, calls, total = extract_api.fetch_steadyapi_city("Cape Coral", key="p")
    assert rows == [] and ok is False
    assert mock_get.call_count == extract_api._MAX_ATTEMPTS   # bounded — never a hot loop
    assert calls == extract_api._MAX_ATTEMPTS
    assert len(sleeps) == extract_api._MAX_ATTEMPTS - 1


def test_fetch_steadyapi_deterministic_4xx_is_not_retried(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr(extract_api, "_sleep", sleeps.append)
    with patch.object(extract_api.requests, "get", return_value=_resp(403, {})) as mock_get:
        rows, ok, calls, total = extract_api.fetch_steadyapi_city("Cape Coral", key="p")
    # A 403 is a key/UA problem — retrying it burns quota on the same answer.
    assert rows == [] and ok is False
    assert mock_get.call_count == 1 and sleeps == []


def test_fetch_steadyapi_network_error_is_retried(monkeypatch):
    monkeypatch.setattr(extract_api, "_sleep", lambda s: None)
    body = {"meta": {"total": 1}, "body": [_STEADYAPI_ROW]}
    with patch.object(extract_api.requests, "get",
                      side_effect=[ConnectionError("reset"), _resp(200, body)]) as mock_get:
        rows, ok, calls, total = extract_api.fetch_steadyapi_city("Cape Coral", key="p")
    assert ok is True and len(rows) == 1
    assert mock_get.call_count == 2


def test_fetch_steadyapi_paces_consecutive_requests_to_one_per_second(monkeypatch):
    waits: list[float] = []
    monkeypatch.setattr(extract_api, "_pace_sleep", waits.append)
    monkeypatch.setattr(extract_api, "_now", lambda: 100.0)  # frozen clock: zero elapsed
    body = {"meta": {"total": 1}, "body": [_STEADYAPI_ROW]}
    with patch.object(extract_api.requests, "get", return_value=_resp(200, body)):
        extract_api.fetch_steadyapi_city("Cape Coral", key="p")
        extract_api.fetch_steadyapi_city("Cape Coral", key="p")
    # First request of the process is unpaced; the second waits the full 1 req/s window.
    assert waits == [pytest.approx(extract_api._MIN_INTERVAL_S)]


def test_fetch_steadyapi_pacing_adds_no_wait_when_window_already_elapsed(monkeypatch):
    waits: list[float] = []
    monkeypatch.setattr(extract_api, "_pace_sleep", waits.append)
    clock = itertools.count(100.0, 2.0)  # every clock read is 2s later — always past 1.05s
    monkeypatch.setattr(extract_api, "_now", lambda: next(clock))
    body = {"meta": {"total": 1}, "body": [_STEADYAPI_ROW]}
    with patch.object(extract_api.requests, "get", return_value=_resp(200, body)):
        extract_api.fetch_steadyapi_city("Cape Coral", key="p")
        extract_api.fetch_steadyapi_city("Cape Coral", key="p")
    assert waits == []  # slow responses already satisfy the window — no added latency


def test_scan_county_api_skips_type_sweeps_when_city_pull_is_empty(monkeypatch):
    """Call economy: an empty unfiltered pull (cleanly-empty city OR dead pull) has no rows
    to type-stamp — burning 4 type-sweep calls on it is pure waste. On a cap-exhausted day
    this is the difference between ~15 and ~75 wasted calls across the seed list."""
    monkeypatch.setenv("PHOTOS_API", "p")
    with patch.object(extract_api, "fetch_steadyapi_city", return_value=([], True, 1, None)), \
         patch.object(extract_api, "build_type_lookup") as mock_lookup:
        out = extract_api.scan_county_api("Lee")
    mock_lookup.assert_not_called()
    assert out["exhausted"] is True and out["count"] == 0


def test_fetch_steadyapi_city_returns_four_tuple_with_total(monkeypatch):
    """meta.total must be returned, not discarded -- Task 11 wires it into the
    census reconciliation ledger."""
    class FakeResp:
        status_code = 200

        def json(self):
            return {"body": [{"property_id": "1"}], "meta": {"total": 1}}

    monkeypatch.setattr(
        "ingest.pipelines.listing_lifecycle.extract_api.requests.get",
        lambda *a, **k: FakeResp(),
    )
    rows, ok, pages, total = extract_api.fetch_steadyapi_city("Naples", key="fake-key")
    assert len(rows) == 1
    assert ok is True
    assert pages == 1
    assert total == 1
