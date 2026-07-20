from pathlib import Path

from ingest.pipelines.community_profiles.distill_55places import parse_55places_detail

FIXTURE = Path(__file__).parent / "fixtures" / "fiftyfive_places_heritage_bay.md"


def test_parses_heritage_bay_fixture():
    md = FIXTURE.read_text(encoding="utf-8")
    row = parse_55places_detail(md)
    assert row["home_count"] == 1400
    assert row["gated"] is True
    assert row["clubhouse"] is True
    assert row["fitness"] is True
    assert row["pool"] is True
    assert row["on_site_dining"] is True  # "Restaurant"
    assert row["tennis"] is False  # not listed for Heritage Bay's 55places amenity list
    assert row["boating_marina"] is False


def test_missing_total_homes_is_none():
    row = parse_55places_detail("## Some Community\nNo stats block here.")
    assert row["home_count"] is None
    assert row["gated"] is None
