from ingest.pipelines.community_profiles.finalize import (
    alias_match_report,
    build_final_rows,
    completeness_report,
)


def test_build_final_rows_merges_by_community_slug_not_per_source_slug():
    # ngg_partials/fp_partials are keyed by community_slug (master_list's own
    # "slug" -- matching run_full_discovery's write convention), never by the
    # per-source slug actually fetched.
    master_list = [
        {
            "slug": "fiddlers-creek",
            "label": "Fiddler's Creek",
            "county": "Collier",
            "naplesgolfguy_slug": "fiddlers-creek",
            "fiftyfive_places_slug": None,
        },
    ]
    ngg_partials = {
        "fiddlers-creek": {"golf_structure": "equity", "golf_holes": 18, "club_type": "Private"}
    }
    fp_partials = {"fiddlers-creek": {"home_count": None, "gated": None}}
    rows = build_final_rows(master_list, ngg_partials=ngg_partials, fp_partials=fp_partials, hoa_table=[])
    assert len(rows) == 1
    row = rows[0]
    assert row["community_slug"] == "fiddlers-creek"
    assert row["golf_structure"] == "equity"
    assert row["golf_source_url"] == "https://naplesgolfguy.com/golf-communities/fiddlers-creek/"


def test_build_final_rows_missing_partial_key_treated_as_absent_not_a_crash():
    master_list = [
        {
            "slug": "no-data-here",
            "label": "No Data Here",
            "county": None,
            "naplesgolfguy_slug": "no-data-here",
            "fiftyfive_places_slug": None,
        },
    ]
    rows = build_final_rows(master_list, ngg_partials={}, fp_partials={}, hoa_table=[])
    assert rows[0]["golf_structure"] is None
    assert rows[0]["home_count"] is None
    assert rows[0]["county"] is None


def test_build_final_rows_uses_discovered_per_source_slug_for_provenance():
    # community_slug (identity key) can differ from what was actually fetched
    # on each source -- the recorded source_url must reflect the real fetch.
    master_list = [
        {
            "slug": "lely-country-club",
            "label": "Lely Country Club",
            "county": "Collier",
            "naplesgolfguy_slug": "lely-resort",
            "fiftyfive_places_slug": "lely-resort",
        },
    ]
    ngg_partials = {"lely-country-club": {"golf_structure": "optional"}}
    fp_partials = {"lely-country-club": {"home_count": 4506, "gated": True}}
    rows = build_final_rows(master_list, ngg_partials=ngg_partials, fp_partials=fp_partials, hoa_table=[])
    row = rows[0]
    assert row["golf_source_url"] == "https://naplesgolfguy.com/golf-communities/lely-resort/"
    assert row["home_count_source_url"] == "https://www.55places.com/florida/communities/lely-resort"


def test_build_final_rows_matches_hoa_table_by_normalized_label():
    master_list = [
        {
            "slug": "heritage-bay",
            "label": "Heritage Bay Golf & Country Club",
            "county": "Collier",
            "naplesgolfguy_slug": "heritage-bay",
            "fiftyfive_places_slug": None,
        },
    ]
    hoa_table = [
        {
            "name": "Heritage Bay",
            "hoa_fee_range": "$350-$550/mo",
            "cdd_flag": True,
            "golf_structure": "bundled",
            "is_estimate": False,
        }
    ]
    rows = build_final_rows(master_list, ngg_partials={}, fp_partials={}, hoa_table=hoa_table)
    assert rows[0]["hoa_fee_range"] == "$350-$550/mo"


def test_alias_match_report_classifies_known_vs_newly_minted():
    master_list = [
        {"slug": "heritage-bay", "label": "Heritage Bay"},
        {"slug": "fiddlers-creek", "label": "Fiddler's Creek"},
    ]
    aliases = {"heritage-bay": {"label": "Heritage Bay", "patterns": ["HERITAGE BAY"]}}
    report = alias_match_report(master_list, aliases)
    assert report["known_count"] == 1
    assert report["known"] == ["heritage-bay"]
    assert report["newly_minted_count"] == 1
    assert report["newly_minted"] == [{"slug": "fiddlers-creek", "label": "Fiddler's Creek"}]
    # caller's original dict must never be mutated -- writing the real fixture
    # is a separate, operator-approved step, not a side effect of reporting.
    assert aliases == {"heritage-bay": {"label": "Heritage Bay", "patterns": ["HERITAGE BAY"]}}


def test_alias_match_report_does_not_double_count_a_duplicate_slug_as_known():
    # A duplicate slug in master_list must classify against the ORIGINAL
    # fixture snapshot, not an accumulating working copy -- otherwise the
    # second occurrence would look "known" just because the first got folded
    # into a working copy first.
    master_list = [
        {"slug": "fiddlers-creek", "label": "Fiddler's Creek"},
        {"slug": "fiddlers-creek", "label": "Fiddler's Creek (dup)"},
    ]
    report = alias_match_report(master_list, {})
    assert report["known_count"] == 0
    assert report["newly_minted_count"] == 1  # deduped
    assert report["duplicate_slugs"] == ["fiddlers-creek"]


def test_completeness_report_counts_each_group_independently():
    present_row = {
        "label": "A",
        "golf_structure": "equity", "golf_holes": 18, "golf_courses": 1,
        "club_type": "Private", "golf_initiation_fee": "$1", "golf_annual_dues": None,
        "social_initiation_fee": None, "social_annual_dues": None, "fnb_minimum_disclosed": True,
        "home_count": 100, "gated": True, "price_range": "Low $200ks", "home_types": None,
        "new_or_resale": None, "builder": None, "years_built": None, "age_restrictions": None,
        "activity_director": None,
        "pool": True, "tennis": False, "pickleball": False, "fitness": False, "clubhouse": False,
        "on_site_dining": False, "boating_marina": False,
        "hoa_fee_range": "$100/mo", "fees_included": "Landscape", "cdd_flag": None,
    }
    all_null_row = {
        "label": "All Null Community",
        "golf_structure": None, "golf_holes": None, "golf_courses": None,
        "club_type": None, "golf_initiation_fee": None, "golf_annual_dues": None,
        "social_initiation_fee": None, "social_annual_dues": None, "fnb_minimum_disclosed": None,
        "home_count": None, "gated": None, "price_range": None, "home_types": None,
        "new_or_resale": None, "builder": None, "years_built": None, "age_restrictions": None,
        "activity_director": None,
        "pool": None, "tennis": None, "pickleball": None, "fitness": None, "clubhouse": None,
        "on_site_dining": None, "boating_marina": None,
        "hoa_fee_range": None, "fees_included": None, "cdd_flag": None,
    }
    report = completeness_report([present_row, all_null_row])
    assert report["total"] == 2
    assert report["golf_structure_present"] == 1
    assert report["golf_holes_present"] == 1
    assert report["club_type_present"] == 1
    assert report["membership_fees_any_present"] == 1
    assert report["fnb_minimum_disclosed_true"] == 1
    assert report["home_count_present"] == 1
    assert report["gated_present"] == 1
    assert report["price_range_present"] == 1
    assert report["amenities_any_true"] == 1  # only the "pool: True" row counts -- all-False stays out
    assert report["hoa_fee_range_present"] == 1
    assert report["fees_included_present"] == 1
    assert report["all_null_count"] == 1
    assert report["all_null_names"] == ["All Null Community"]


def test_completeness_report_amenities_any_true_excludes_all_false_row():
    # A row whose 55places page had a real parseable Amenities section but
    # every checkbox false must NOT count as "amenities present" under the
    # literal "any true" definition -- that's real signal (no pool/tennis/
    # etc.), not a gap, but distinct from having at least one true amenity.
    all_false_amenities_row = {
        "label": "No Amenities Here",
        "golf_structure": None, "golf_holes": None, "golf_courses": None,
        "club_type": None, "golf_initiation_fee": None, "golf_annual_dues": None,
        "social_initiation_fee": None, "social_annual_dues": None, "fnb_minimum_disclosed": None,
        "home_count": None, "gated": None, "price_range": None, "home_types": None,
        "new_or_resale": None, "builder": None, "years_built": None, "age_restrictions": None,
        "activity_director": None,
        "pool": False, "tennis": False, "pickleball": False, "fitness": False, "clubhouse": False,
        "on_site_dining": False, "boating_marina": False,
        "hoa_fee_range": None, "fees_included": None, "cdd_flag": None,
    }
    report = completeness_report([all_false_amenities_row])
    assert report["amenities_any_true"] == 0
    # not all groups null (amenities booleans are False, not None) -> not in all_null
    assert report["all_null_count"] == 0
