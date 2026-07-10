"""Offline tests for the Phase C geocode ladder — every vendor call mocked.
Live vendor behavior was probed separately (SESSION_LOG 07/09/2026)."""
import ingest.lib.geo_ladder as gl


def test_is_address():
    assert gl.is_address("4125 Cleveland Ave")
    assert gl.is_address("12345 S Tamiami Trl Unit 4")
    assert not gl.is_address("Coconut Point")
    assert not gl.is_address("Pelican Bay")


def test_normalize_anchor():
    assert gl.normalize_anchor("  Coconut   Point ") == "coconut point"


def test_parse_census_oneline():
    payload = {"result": {"addressMatches": [{
        "coordinates": {"x": -81.872073, "y": 26.641435},
        "geographies": {"2020 Census ZIP Code Tabulation Areas": [{"ZCTA5": "33901"}]}}]}}
    assert gl._parse_census_oneline(payload) == {
        "lat": 26.641435, "lon": -81.872073, "zip_code": "33901"}
    assert gl._parse_census_oneline({"result": {"addressMatches": []}}) is None
    # coords without a ZCTA layer -> None (no ZIP without the polygon lookup)
    no_zcta = {"result": {"addressMatches": [{
        "coordinates": {"x": -81.8, "y": 26.6}, "geographies": {}}]}}
    assert gl._parse_census_oneline(no_zcta) is None


def test_parse_census_coords():
    payload = {"result": {"geographies": {
        "2020 Census ZIP Code Tabulation Areas": [{"ZCTA5": "34135"}]}}}
    assert gl._parse_census_coords(payload) == "34135"
    assert gl._parse_census_coords({"result": {"geographies": {}}}) is None


def test_parse_nominatim_grain():
    hit = [{"lat": "26.40", "lon": "-81.80", "class": "shop", "type": "mall"}]
    assert gl._parse_nominatim(hit) == (26.40, -81.80, "point")
    nb = [{"lat": "26.2", "lon": "-81.8", "class": "place", "type": "suburb"}]
    assert gl._parse_nominatim(nb) == (26.2, -81.8, "neighborhood")
    assert gl._parse_nominatim([]) is None
    assert gl._parse_nominatim([{"class": "shop", "type": "mall"}]) is None


def test_resolve_anchor_ladder_order(monkeypatch):
    monkeypatch.setattr(gl, "_cache_get", lambda a, c: None)
    monkeypatch.setattr(gl, "_cache_put", lambda *a, **kw: None)
    monkeypatch.setattr(gl, "census_onelineaddress",
                        lambda a, c: {"lat": 1.0, "lon": 2.0, "zip_code": "33901"})
    called = []
    monkeypatch.setattr(gl, "nominatim_search",
                        lambda a, c: called.append(a) or None)
    out = gl.resolve_anchor("4125 Cleveland Ave", "Fort Myers, FL")
    assert out == {"lat": 1.0, "lon": 2.0, "zip_code": "33901", "geo_grain": "point"}
    assert called == []  # address rung never falls through to Nominatim on a hit


def test_resolve_anchor_landmark(monkeypatch):
    monkeypatch.setattr(gl, "_cache_get", lambda a, c: None)
    monkeypatch.setattr(gl, "_cache_put", lambda *a, **kw: None)
    monkeypatch.setattr(gl, "nominatim_search", lambda a, c: (26.4, -81.8, "point"))
    monkeypatch.setattr(gl, "census_coords_to_zcta", lambda lat, lon: "34135")
    out = gl.resolve_anchor("Coconut Point", "Estero, FL")
    assert out == {"lat": 26.4, "lon": -81.8, "zip_code": "34135", "geo_grain": "point"}


def test_resolve_anchor_total_miss(monkeypatch):
    monkeypatch.setattr(gl, "_cache_get", lambda a, c: None)
    puts = []
    monkeypatch.setattr(gl, "_cache_put",
                        lambda *a, **kw: puts.append((a, kw)))
    monkeypatch.setattr(gl, "nominatim_search", lambda a, c: None)
    assert gl.resolve_anchor("Somewhere Vague", "Naples, FL") == {}
    # the miss is negative-cached so weekly runs never re-query dead anchors
    assert puts and puts[-1][0][2] == "miss"


def test_resolve_anchor_cache_hit_skips_vendors(monkeypatch):
    monkeypatch.setattr(
        gl, "_cache_get",
        lambda a, c: {"lat": 3.0, "lon": 4.0, "zip_code": "34102", "geo_grain": "point"})

    def boom(*a, **kw):
        raise AssertionError("vendor called on a cache hit")
    monkeypatch.setattr(gl, "census_onelineaddress", boom)
    monkeypatch.setattr(gl, "nominatim_search", boom)
    out = gl.resolve_anchor("5th Ave S", "Naples, FL")
    assert out["zip_code"] == "34102"


def test_annotate_geo_fallbacks(monkeypatch):
    monkeypatch.setattr(gl, "resolve_anchor", lambda a, c: {})
    rows = [{"city": "Naples", "location_anchor": "X"},
            {"city": "Naples", "location_anchor": None}]
    out = gl.annotate_geo(rows, context="Naples, FL", fallback_grain="city")
    for r in out:
        assert r["lat"] is None and r["lon"] is None and r["zip_code"] is None
        assert r["geo_grain"] == "city"
    out2 = gl.annotate_geo([{"corridor": "US 41", "location_anchor": None}],
                           context="FL", fallback_grain=None)
    assert out2[0]["geo_grain"] is None


def test_annotate_geo_resolved(monkeypatch):
    monkeypatch.setattr(
        gl, "resolve_anchor",
        lambda a, c: {"lat": 26.4, "lon": -81.8, "zip_code": "34135",
                      "geo_grain": "neighborhood"})
    out = gl.annotate_geo([{"city": "Estero", "location_anchor": "Pelican Sound"}],
                          context="Estero, FL", fallback_grain="city")
    r = out[0]
    assert (r["lat"], r["lon"], r["zip_code"], r["geo_grain"]) == (
        26.4, -81.8, "34135", "neighborhood")


def test_annotate_geo_dry_run_never_resolves(monkeypatch):
    def boom(a, c):
        raise AssertionError("network in dry-run")
    monkeypatch.setattr(gl, "resolve_anchor", boom)
    out = gl.annotate_geo([{"city": "Naples", "location_anchor": "Coconut Point"}],
                          context="Naples, FL", fallback_grain="city", dry_run=True)
    assert out[0]["zip_code"] is None and out[0]["geo_grain"] == "city"
