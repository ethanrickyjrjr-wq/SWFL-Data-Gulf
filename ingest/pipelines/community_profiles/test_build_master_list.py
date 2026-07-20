from ingest.pipelines.community_profiles.build_master_list import (
    build_master_list,
    build_subdivision_index,
    derive_label,
    match_counties,
    resolve_county,
)


def test_derive_label_title_cases_hyphenated_slug_words():
    assert derive_label("grey-oaks-country-club") == "Grey Oaks Country Club"
    assert derive_label("bay-colony-golf-club") == "Bay Colony Golf Club"
    assert derive_label("heritage-bay") == "Heritage Bay"


def test_build_subdivision_index_normalizes_and_titlecases_county():
    rows = [
        {"county": "collier", "subdivision_name": "GREY OAKS", "home_count": 313},
        {"county": "collier", "subdivision_name": "CAPISTRANO AT GREY OAKS", "home_count": 21},
        {"county": "lee", "subdivision_name": "", "home_count": 602},  # blank -> skipped
    ]
    index = build_subdivision_index(rows)
    assert index["GREY OAKS"] == {"Collier"}
    assert index["CAPISTRANO AT GREY OAKS"] == {"Collier"}
    assert "" not in index


def test_match_counties_exact_match():
    index = {"HERITAGE BAY": {"Collier"}}
    assert match_counties("HERITAGE BAY", index) == {"Collier"}


def test_match_counties_forward_substring_real_grey_oaks_case():
    # A master community fans out into many sub-plats in the parcel data —
    # "GREY OAKS" must match all of them and still resolve to one county.
    index = {
        "GREY OAKS": {"Collier"},
        "CAPISTRANO AT GREY OAKS": {"Collier"},
        "ESTUARY AT GREY OAKS": {"Collier"},
        "ISLA VISTA AT GREY OAKS": {"Collier"},
    }
    assert match_counties("GREY OAKS", index) == {"Collier"}


def test_match_counties_reverse_direction_is_rejected_by_design():
    # A short subdivision fragment inside a longer community label is NOT
    # accepted — reverse-direction matching was tried and rejected live
    # 07/20/2026 (see match_counties' docstring): it produced real false
    # positives (a generic Collier plat literally named "LAKEWOOD" matched
    # the unrelated Sarasota community "Lakewood Ranch"). "VINEYARDS" must
    # NOT match "THE VINEYARDS" via reverse containment.
    index = {"VINEYARDS": {"Collier"}}
    assert match_counties("THE VINEYARDS", index) == set()


def test_match_counties_generic_plat_word_does_not_leak_into_unrelated_label():
    # The exact false positive found live: a generic single-word Collier plat
    # ("LAKEWOOD", "NATIONAL") must not resolve county for an unrelated,
    # out-of-scope community whose marketed name happens to contain that word.
    index = {"LAKEWOOD": {"Collier"}, "NATIONAL": {"Collier"}}
    assert match_counties("LAKEWOOD RANCH", index) == set()
    assert match_counties("SARASOTA NATIONAL", index) == set()
    assert match_counties("BABCOCK NATIONAL", index) == set()


def test_match_counties_word_boundary_not_raw_substring():
    # "OAKS" must not match inside "OAKLAND" — whole-word bounded only.
    index = {"OAKLAND PARK": {"Lee"}}
    assert match_counties("OAKS", index) == set()


def test_match_counties_cross_county_conflict():
    index = {"WOODLAND ESTATES": {"Lee", "Collier"}}
    assert match_counties("WOODLAND ESTATES", index) == {"Lee", "Collier"}


def test_match_counties_no_match_returns_empty_set():
    index = {"HERITAGE BAY": {"Collier"}}
    assert match_counties("SOME UNKNOWN PLACE", index) == set()


def test_resolve_county_single_match():
    assert resolve_county({"Collier"}) == "Collier"


def test_resolve_county_ambiguous_returns_none():
    assert resolve_county({"Lee", "Collier"}) is None


def test_resolve_county_no_match_returns_none():
    assert resolve_county(set()) is None


def test_build_master_list_end_to_end():
    ngg_map = {
        "GREY OAKS": "grey-oaks-country-club",
        "HERITAGE BAY": "heritage-bay",
        "SOME NEW PLACE": "some-new-place-golf-club",
    }
    fp_map = {"HERITAGE BAY": "heritage-bay"}  # Grey Oaks + Some New Place not on 55places
    neighborhood_rows = [
        {"county": "collier", "subdivision_name": "GREY OAKS", "home_count": 313},
        {"county": "collier", "subdivision_name": "CAPISTRANO AT GREY OAKS", "home_count": 21},
        {"county": "collier", "subdivision_name": "Heritage Bay", "home_count": 161},
        # no rows anywhere resembling "SOME NEW PLACE" -> stays null.
    ]

    entries = build_master_list(ngg_map, fp_map, neighborhood_rows)
    by_slug = {e["slug"]: e for e in entries}

    assert len(entries) == 3

    grey_oaks = by_slug["grey-oaks-country-club"]
    assert grey_oaks["label"] == "Grey Oaks Country Club"
    assert grey_oaks["naplesgolfguy_slug"] == "grey-oaks-country-club"
    assert grey_oaks["fiftyfive_places_slug"] is None
    assert grey_oaks["county"] == "Collier"

    heritage_bay = by_slug["heritage-bay"]
    assert heritage_bay["fiftyfive_places_slug"] == "heritage-bay"
    assert heritage_bay["county"] == "Collier"

    some_new_place = by_slug["some-new-place-golf-club"]
    assert some_new_place["fiftyfive_places_slug"] is None
    assert some_new_place["county"] is None  # honest gap, not guessed


def test_build_master_list_cross_county_conflict_stays_null():
    ngg_map = {"AMBIGUOUS PLACE": "ambiguous-place"}
    fp_map: dict[str, str] = {}
    neighborhood_rows = [
        {"county": "lee", "subdivision_name": "Ambiguous Place", "home_count": 40},
        {"county": "collier", "subdivision_name": "Ambiguous Place", "home_count": 12},
    ]
    entries = build_master_list(ngg_map, fp_map, neighborhood_rows)
    assert entries[0]["county"] is None
