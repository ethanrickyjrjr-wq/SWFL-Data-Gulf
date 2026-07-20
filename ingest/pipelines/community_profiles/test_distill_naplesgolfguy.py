from pathlib import Path

from ingest.pipelines.community_profiles.distill_naplesgolfguy import parse_naplesgolfguy_detail

FIXTURE = Path(__file__).parent / "fixtures" / "naplesgolfguy_fiddlers_creek.md"
FIXTURE_HERITAGE_BAY = Path(__file__).parent / "fixtures" / "naplesgolfguy_heritage_bay.md"
FIXTURE_TALIS_PARK = Path(__file__).parent / "fixtures" / "naplesgolfguy_talis_park.md"


def test_parses_fiddlers_creek_fixture():
    md = FIXTURE.read_text(encoding="utf-8")
    row = parse_naplesgolfguy_detail(md)
    assert row["golf_structure"] == "equity"
    assert row["golf_holes"] == 18
    assert row["golf_courses"] == 1
    assert row["pool"] is True
    assert row["tennis"] is True
    assert row["pickleball"] is True
    assert row["fitness"] is True
    assert row["clubhouse"] is True
    assert row["on_site_dining"] is False  # not in this fixture's amenity list
    assert row["boating_marina"] is False  # "Private Beach Club Access" is not boating/marina
    assert row["club_type"] == "Private Country Club"
    assert row["golf_initiation_fee"] == "$450,000 (equity)"  # annotation preserved verbatim
    assert row["golf_annual_dues"] == "$24,923"
    assert row["social_initiation_fee"] == "$18,000"
    assert row["social_annual_dues"] == "$3,884"
    assert row["fnb_minimum_disclosed"] is True  # page's own disclaimer text, not a dollar figure


def test_parses_heritage_bay_bundled_membership_fees_table():
    # Bundled membership type -- confirmed live 2026-07-20. The table's row
    # labels differ from the equity page's: row 1 is plural ("Fees:" not
    # "Fee:" -- same field, tolerated) and row 3 is "Annual Social Membership
    # Fee:" (not "Social Membership Initiation Fee:") -- a genuinely different
    # label, so social_initiation_fee must degrade to None, never guess.
    md = FIXTURE_HERITAGE_BAY.read_text(encoding="utf-8")
    row = parse_naplesgolfguy_detail(md)
    assert row["golf_structure"] == "bundled"
    # Real gap, not fixed here: "1.5 (27 Holes)" has a non-integer course
    # count -- _HOLES_RE requires \d+ so it doesn't match at all here. Honest
    # None, not a fabricated rounded "1".
    assert row["golf_holes"] is None
    assert row["golf_courses"] is None
    assert row["club_type"] == "Private Country Club"
    assert row["golf_initiation_fee"] == "Bundled"
    assert row["golf_annual_dues"] == "$10,216"
    assert row["social_initiation_fee"] is None  # labeled differently on this page -- not guessed
    assert row["social_annual_dues"] == "N/A"
    assert row["fnb_minimum_disclosed"] is True  # "Food and Beverage Minimum (Annual)" bullet
    assert row["pool"] is True
    assert row["tennis"] is True
    assert row["pickleball"] is True
    assert row["clubhouse"] is True


def test_parses_talis_park_one_time_initiation_fee_membership_fees_table():
    # "One Time Initiation Fee" membership type -- confirmed live 2026-07-20.
    # _MEMBERSHIP_RE/_STRUCTURE_MAP only recognize bundled/equity/optional/
    # none; "One Time Initiation Fee" -> \w+ captures "One" -> no map entry ->
    # golf_structure stays None. Real, pre-existing gap (not introduced or
    # fixed by this change) -- documented here so it isn't rediscovered cold.
    md = FIXTURE_TALIS_PARK.read_text(encoding="utf-8")
    row = parse_naplesgolfguy_detail(md)
    assert row["golf_structure"] is None
    assert row["golf_holes"] == 18
    assert row["golf_courses"] == 1
    assert row["club_type"] == "Private Country Club"
    assert row["golf_initiation_fee"] == "$225,000"
    assert row["golf_annual_dues"] == "$24,724"
    # This page's 3rd row is "Sports Membership Initiation Fee:" (not
    # "Social") -- a genuinely different label, degrades to None, not guessed.
    assert row["social_initiation_fee"] is None
    assert row["social_annual_dues"] == "$10,000"
    assert row["fnb_minimum_disclosed"] is True


def test_missing_fields_are_none_not_invented():
    row = parse_naplesgolfguy_detail("# Some Community\nNo membership info here.")
    assert row["golf_structure"] is None
    assert row["golf_holes"] is None
    assert row["club_type"] is None
    assert row["golf_initiation_fee"] is None
    assert row["golf_annual_dues"] is None
    assert row["social_initiation_fee"] is None
    assert row["social_annual_dues"] is None
    assert row["fnb_minimum_disclosed"] is None
