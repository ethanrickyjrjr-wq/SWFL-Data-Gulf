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
    assert row["price_range"] == "Low $200ks - Low $1Ms"
    assert row["home_types"] == "Attached, Condos, Single-Family"
    assert row["new_or_resale"] == "Resale Homes Only"
    assert row["builder"] == "Lennar Homes"
    assert row["years_built"] == "2005 - 2014"
    assert row["age_restrictions"] == "No Age Restrictions"
    assert row["activity_director"] is True


def test_missing_total_homes_is_none():
    row = parse_55places_detail("## Some Community\nNo stats block here.")
    assert row["home_count"] is None
    assert row["gated"] is None
    assert row["price_range"] is None
    assert row["home_types"] is None
    assert row["new_or_resale"] is None
    assert row["builder"] is None
    assert row["years_built"] is None
    assert row["age_restrictions"] is None
    assert row["activity_director"] is None
