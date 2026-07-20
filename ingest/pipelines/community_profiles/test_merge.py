from ingest.pipelines.community_profiles.merge import merge_community_row


def test_merge_prefers_naplesgolfguy_for_golf_prefers_55places_for_amenities():
    row = merge_community_row(
        "fiddlers-creek",
        "Fiddler's Creek",
        "Collier",
        naplesgolfguy={
            "golf_structure": "equity",
            "golf_holes": 18,
            "golf_courses": 1,
            "pool": True,
            "tennis": True,
            "pickleball": True,
            "fitness": True,
            "clubhouse": True,
            "on_site_dining": False,
            "boating_marina": False,
        },
        fiftyfive_places=None,
        hoa_comparison=None,
    )
    assert row["community_slug"] == "fiddlers-creek"
    assert row["golf_structure"] == "equity"
    assert row["golf_holes"] == 18
    assert row["pool"] is True
    assert row["golf_source_url"] == "https://naplesgolfguy.com/golf-communities/fiddlers-creek/"
    assert row["amenities_source_url"] == "https://naplesgolfguy.com/golf-communities/fiddlers-creek/"
    # No 55places / hoa data supplied -> those fields and their groups' urls are None
    assert row["home_count"] is None
    assert row["hoa_fee_range"] is None
    assert row["fees_source_url"] is None


def test_merge_55places_supplies_home_count_and_gated_amenities_override_naplesgolfguy():
    row = merge_community_row(
        "heritage-bay",
        "Heritage Bay",
        "Collier",
        naplesgolfguy={
            "golf_structure": "bundled",
            "golf_holes": 27,
            "golf_courses": 1,
            "pool": True,
            "tennis": False,
            "pickleball": False,
            "fitness": True,
            "clubhouse": True,
            "on_site_dining": True,
            "boating_marina": False,
        },
        fiftyfive_places={
            "home_count": 1400,
            "gated": True,
            "pool": True,
            "tennis": False,
            "pickleball": False,
            "fitness": True,
            "clubhouse": True,
            "on_site_dining": True,
            "boating_marina": False,
        },
        hoa_comparison={
            "hoa_fee_range": "$350–$550/mo",
            "cdd_flag": True,
            "golf_structure": "bundled",
            "is_estimate": False,
        },
    )
    assert row["home_count"] == 1400
    assert row["gated"] is True
    assert row["hoa_fee_range"] == "$350–$550/mo"
    assert row["cdd_flag"] is True
    assert row["fees_source_url"] == "https://realtyofnaplesfl.com/hoa-fee-comparison-by-community/"
    # amenities group comes from 55places when present (more complete field set)
    assert row["amenities_source_url"] == "https://www.55places.com/florida/communities/heritage-bay"


def test_merge_with_nothing_supplied_returns_all_none_but_identity_fields():
    row = merge_community_row("some-slug", "Some Community", "Lee", naplesgolfguy=None, fiftyfive_places=None, hoa_comparison=None)
    assert row["community_slug"] == "some-slug"
    assert row["label"] == "Some Community"
    assert row["county"] == "Lee"
    assert row["golf_structure"] is None
    assert row["home_count"] is None


def test_merge_golf_falls_back_to_hoa_comparison_when_no_naplesgolfguy():
    row = merge_community_row(
        "golf-only-hoa",
        "Golf Only HOA",
        "Collier",
        naplesgolfguy=None,
        fiftyfive_places=None,
        hoa_comparison={"golf_structure": "bundled"},
    )
    assert row["golf_structure"] == "bundled"
    assert row["golf_source_url"] == "https://realtyofnaplesfl.com/hoa-fee-comparison-by-community/"


def test_merge_gated_alone_still_sets_home_count_source_provenance():
    row = merge_community_row(
        "gated-only",
        "Gated Only",
        "Lee",
        naplesgolfguy=None,
        fiftyfive_places={"gated": True},
        hoa_comparison=None,
    )
    assert row["gated"] is True
    assert row["home_count"] is None
    assert row["home_count_source_url"] is not None


def test_merge_fees_group_appends_est_marker_when_is_estimate_true():
    row = merge_community_row(
        "est-range",
        "Estimate Range",
        "Collier",
        naplesgolfguy=None,
        fiftyfive_places=None,
        hoa_comparison={
            "hoa_fee_range": "$2,500–$3,500+/mo",
            "is_estimate": True,
            "cdd_flag": None,
            "golf_structure": None,
        },
    )
    assert row["hoa_fee_range"] == "$2,500–$3,500+/mo (est.)"


def test_merge_fees_group_leaves_range_unmodified_when_not_estimate():
    row = merge_community_row(
        "precise-range",
        "Precise Range",
        "Collier",
        naplesgolfguy=None,
        fiftyfive_places=None,
        hoa_comparison={
            "hoa_fee_range": "$400–$600/mo",
            "is_estimate": False,
            "cdd_flag": None,
            "golf_structure": None,
        },
    )
    assert row["hoa_fee_range"] == "$400–$600/mo"
