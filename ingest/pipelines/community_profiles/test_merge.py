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


def test_merge_uses_discovered_per_source_slug_for_provenance_url_not_identity_slug():
    # community_slug (our own identity/output key) can legitimately differ from
    # the slug actually fetched on each source (discover.py resolves the real
    # per-source URL) — the recorded source_url must reflect what was really
    # fetched, never be silently re-derived from the identity slug.
    row = merge_community_row(
        "lely-country-club",
        "Lely Country Club",
        "Collier",
        naplesgolfguy={"golf_structure": "optional"},
        fiftyfive_places={"home_count": 4506, "gated": True},
        hoa_comparison=None,
        naplesgolfguy_slug="lely-resort",
        fiftyfive_places_slug="lely-resort",
    )
    assert row["community_slug"] == "lely-country-club"
    assert row["golf_source_url"] == "https://naplesgolfguy.com/golf-communities/lely-resort/"
    assert row["home_count_source_url"] == "https://www.55places.com/florida/communities/lely-resort"


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


def test_merge_carries_club_type_and_fee_fields_from_naplesgolfguy():
    row = merge_community_row(
        "fiddlers-creek",
        "Fiddler's Creek",
        "Collier",
        naplesgolfguy={
            "golf_structure": "equity",
            "golf_holes": 18,
            "golf_courses": 1,
            "club_type": "Private Country Club",
            "golf_initiation_fee": "$450,000 (equity)",
            "golf_annual_dues": "$24,923",
            "social_initiation_fee": "$18,000",
            "social_annual_dues": "$3,884",
            "fnb_minimum_disclosed": True,
        },
        fiftyfive_places=None,
        hoa_comparison=None,
    )
    assert row["club_type"] == "Private Country Club"
    assert row["golf_initiation_fee"] == "$450,000 (equity)"
    assert row["golf_annual_dues"] == "$24,923"
    assert row["social_initiation_fee"] == "$18,000"
    assert row["social_annual_dues"] == "$3,884"
    assert row["fnb_minimum_disclosed"] is True


def test_merge_talis_park_real_scenario_naplesgolfguy_detail_plus_hoa_structure_fallback():
    # The actual Talis Park case, confirmed live 2026-07-20: naplesgolfguy's
    # own page has real holes/club_type/fee data but its membership-type text
    # ("One Time Initiation Fee") doesn't map to a known golf_structure enum
    # (distill_naplesgolfguy.py's _STRUCTURE_MAP miss -- a real, undressed
    # gap). realtyofnaplesfl's curated table independently lists Talis Park's
    # golf as "Optional". The merged row must keep BOTH: naplesgolfguy's
    # detail fields (never silently dropped just because golf_structure
    # itself came back None) AND the HOA table's golf_structure filling the
    # enum gap -- neither source gets to erase the other's real data.
    row = merge_community_row(
        "talis-park",
        "Talis Park",
        "Collier",
        naplesgolfguy={
            "golf_structure": None,  # "One Time Initiation Fee" -- unmapped
            "golf_holes": 18,
            "golf_courses": 1,
            "club_type": "Private Country Club",
            "golf_initiation_fee": "$225,000",
            "golf_annual_dues": "$24,724",
            "social_initiation_fee": None,
            "social_annual_dues": "$10,000",
            "fnb_minimum_disclosed": True,
        },
        fiftyfive_places=None,
        hoa_comparison={
            "hoa_fee_range": "$700–$1,100/mo",
            "cdd_flag": True,
            "golf_structure": "optional",
            "is_estimate": False,
        },
    )
    assert row["golf_structure"] == "optional"  # filled from hoa_comparison
    assert row["golf_holes"] == 18  # naplesgolfguy's own detail, kept
    assert row["golf_courses"] == 1
    assert row["club_type"] == "Private Country Club"
    assert row["golf_initiation_fee"] == "$225,000"
    assert row["golf_annual_dues"] == "$24,724"
    assert row["social_initiation_fee"] is None
    assert row["social_annual_dues"] == "$10,000"
    assert row["fnb_minimum_disclosed"] is True
    # golf_source_url still points at naplesgolfguy -- it supplied the bulk
    # of the group (holes/club_type/fees); v1 has one url per group, not per
    # field (see merge.py's module docstring).
    assert row["golf_source_url"] == "https://naplesgolfguy.com/golf-communities/talis-park/"


def test_merge_carries_55places_listing_profile_fields():
    row = merge_community_row(
        "heritage-bay",
        "Heritage Bay",
        "Collier",
        naplesgolfguy=None,
        fiftyfive_places={
            "home_count": 1400,
            "gated": True,
            "price_range": "Low $200ks - Low $1Ms",
            "home_types": "Attached, Condos, Single-Family",
            "new_or_resale": "Resale Homes Only",
            "builder": "Lennar Homes",
            "years_built": "2005 - 2014",
            "age_restrictions": "No Age Restrictions",
            "activity_director": True,
        },
        hoa_comparison=None,
    )
    assert row["price_range"] == "Low $200ks - Low $1Ms"
    assert row["home_types"] == "Attached, Condos, Single-Family"
    assert row["new_or_resale"] == "Resale Homes Only"
    assert row["builder"] == "Lennar Homes"
    assert row["years_built"] == "2005 - 2014"
    assert row["age_restrictions"] == "No Age Restrictions"
    assert row["activity_director"] is True
    assert row["home_count_source_url"] == "https://www.55places.com/florida/communities/heritage-bay"


def test_merge_carries_fees_included_from_hoa_comparison():
    row = merge_community_row(
        "pelican-bay",
        "Pelican Bay",
        "Collier",
        naplesgolfguy=None,
        fiftyfive_places=None,
        hoa_comparison={
            "hoa_fee_range": "$175–$220/mo",
            "fees_included": "Beach tram, beach clubs, landscape, security",
            "cdd_flag": False,
            "golf_structure": "none",
            "is_estimate": False,
        },
    )
    assert row["fees_included"] == "Beach tram, beach clubs, landscape, security"


def test_merge_new_fields_stay_none_when_source_absent():
    row = merge_community_row(
        "some-slug", "Some Community", "Lee", naplesgolfguy=None, fiftyfive_places=None, hoa_comparison=None
    )
    assert row["club_type"] is None
    assert row["golf_initiation_fee"] is None
    assert row["social_initiation_fee"] is None
    assert row["fnb_minimum_disclosed"] is None
    assert row["price_range"] is None
    assert row["activity_director"] is None
    assert row["fees_included"] is None
