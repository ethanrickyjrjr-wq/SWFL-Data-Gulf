from ingest.pipelines.community_profiles.pipeline import build_rows, maybe_register_alias


def _fake_fetch(url: str) -> str:
    """Injected fetch stub — no network. Returns canned markdown per URL so
    build_rows' orchestration logic is tested without crawl4ai."""
    if "naplesgolfguy.com/golf-communities/fiddlers-creek" in url:
        return (
            "Membership Type:\n## Equity\n"
            "Number of Courses   | 1 (18 Holes)\n"
            "###  Amenities\n  * Clubhouse\n  * Resort-Style Pool\n"
        )
    if "55places.com/florida/communities/fiddlers-creek" in url:
        return ""  # simulate: not listed on 55places
    return ""


def test_build_rows_skips_a_source_with_no_page_without_raising():
    seed = [{"name": "Fiddler's Creek", "county": "Collier", "verified": True}]
    rows = build_rows(seed, hoa_table=[], fetch=_fake_fetch)
    assert len(rows) == 1
    row = rows[0]
    assert row["community_slug"] == "fiddlers-creek"
    assert row["golf_structure"] == "equity"
    assert row["clubhouse"] is True
    assert row["home_count"] is None  # 55places had nothing — never invented


def test_build_rows_applies_hoa_comparison_by_normalized_name():
    seed = [{"name": "Heritage Bay Golf & Country Club", "county": "Collier", "verified": False}]
    hoa_table = [
        {
            "name": "Heritage Bay",
            "hoa_fee_range": "$350–$550/mo",
            "cdd_flag": True,
            "golf_structure": "bundled",
            "is_estimate": False,
        }
    ]
    rows = build_rows(seed, hoa_table=hoa_table, fetch=lambda url: "")
    assert rows[0]["hoa_fee_range"] == "$350–$550/mo"


def test_build_rows_uses_discovered_slug_when_naive_guess_is_wrong():
    # naplesgolfguy's real URL for "Grey Oaks" is grey-oaks-country-club, not
    # the naive slugify("Grey Oaks") == "grey-oaks" — discover.py's map must
    # win, and the wrong naive guess must never even be fetched.
    seed = [{"name": "Grey Oaks", "county": "Collier", "verified": True}]
    ngg_map = {"GREY OAKS": "grey-oaks-country-club"}
    fetched_urls = []

    def fake_fetch(url: str) -> str:
        fetched_urls.append(url)
        if "grey-oaks-country-club" in url:
            return "Membership Type:\n## Optional\n"
        return ""

    rows = build_rows(seed, hoa_table=[], fetch=fake_fetch, ngg_map=ngg_map, fp_map={})
    row = rows[0]
    assert row["community_slug"] == "grey-oaks"  # our own identity key is unaffected
    assert row["golf_structure"] == "optional"
    assert row["golf_source_url"] == "https://naplesgolfguy.com/golf-communities/grey-oaks-country-club/"
    assert any("grey-oaks-country-club" in u for u in fetched_urls)
    assert not any(u.endswith("/golf-communities/grey-oaks/") for u in fetched_urls)


def test_build_rows_falls_back_to_naive_slug_when_not_in_discovery_map():
    seed = [{"name": "Some New Place", "county": "Lee", "verified": False}]
    rows = build_rows(seed, hoa_table=[], fetch=lambda url: "", ngg_map={}, fp_map={})
    assert rows[0]["community_slug"] == "some-new-place"


def test_maybe_register_alias_adds_new_entry():
    aliases = {"heritage-bay": {"label": "Heritage Bay", "patterns": ["HERITAGE BAY"]}}
    updated = maybe_register_alias("fiddlers-creek", "Fiddler's Creek", aliases)
    assert updated["fiddlers-creek"] == {"label": "Fiddler's Creek", "patterns": ["FIDDLERS CREEK"]}
    assert updated["heritage-bay"] == aliases["heritage-bay"]  # untouched


def test_maybe_register_alias_is_a_noop_for_existing_slug():
    aliases = {"heritage-bay": {"label": "Heritage Bay", "patterns": ["HERITAGE BAY"]}}
    updated = maybe_register_alias("heritage-bay", "Heritage Bay Golf & Country Club", aliases)
    assert updated["heritage-bay"]["label"] == "Heritage Bay"  # original label wins, not overwritten
