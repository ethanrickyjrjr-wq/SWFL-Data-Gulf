from pathlib import Path

from ingest.pipelines.community_profiles.distill_naplesgolfguy import parse_naplesgolfguy_detail

FIXTURE = Path(__file__).parent / "fixtures" / "naplesgolfguy_fiddlers_creek.md"


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


def test_missing_fields_are_none_not_invented():
    row = parse_naplesgolfguy_detail("# Some Community\nNo membership info here.")
    assert row["golf_structure"] is None
    assert row["golf_holes"] is None
