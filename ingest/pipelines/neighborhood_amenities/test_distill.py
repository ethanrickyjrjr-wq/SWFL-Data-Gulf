import json
from pathlib import Path

from ingest.pipelines.neighborhood_amenities.distill import (
    parse_amenities_response,
    point_in_polygon,
)

FIXTURE = Path(__file__).parent / "fixtures" / "amenities_naples_6588181567.json"


def _load():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_parses_neighborhood_row_from_real_response():
    nbhd, amenities, assignment = parse_amenities_response(_load(), as_of="2026-08-03")
    assert nbhd["slug_id"] == "Rural-Estates_Naples_FL"
    assert nbhd["name"] == "Rural Estates"
    assert nbhd["city"] == "Naples"
    assert nbhd["level"] == "macro_neighborhood"
    assert isinstance(nbhd["centroid_lat"], float)
    assert nbhd["boundary"]["type"] in ("Polygon", "MultiPolygon")
    # 12 location scores carried verbatim (label + value + text only)
    assert len(nbhd["scores"]) == 12
    assert {"label", "value", "text"} <= set(nbhd["scores"][0].keys())
    assert nbhd["as_of"] == "2026-08-03"
    assert nbhd["source_url"].startswith("https://api.steadyapi.com/")


def test_parses_amenity_business_rows_with_category_and_distance():
    _nbhd, amenities, _assignment = parse_amenities_response(_load(), as_of="2026-08-03")
    golf = [a for a in amenities if a["category"] == "golf"]
    assert golf, "fixture has a golf category"
    row = golf[0]
    assert row["slug_id"] == "Rural-Estates_Naples_FL"
    assert row["name"] == "Olde Florida Golf Club"
    assert isinstance(row["distance_from_property"], float)
    assert isinstance(row["lat"], float)
    # never invent: photo_url may be None in the source; we don't carry it at all
    assert "photo_url" not in row


def test_amenity_missing_address_line_becomes_empty_string_never_null():
    """address_line is part of the DB primary key (same-name chain branches
    collide otherwise — the Dunkin' failure, first live load 08/03/2026), and
    PK columns cannot be NULL."""
    data = {
        "meta": {"property_id": "1"},
        "body": {
            "neighborhoods": [{"slug_id": "S_X_FL", "name": "S"}],
            "amenities": {"by_category": {"golf": [{"name": "No Address Club", "address": {}}]}},
        },
    }
    _nbhd, amenities, _a = parse_amenities_response(data, as_of="2026-08-03")
    assert amenities[0]["address_line"] == ""


def test_assignment_row_pairs_property_to_neighborhood():
    _nbhd, _amenities, assignment = parse_amenities_response(_load(), as_of="2026-08-03")
    assert assignment == {
        "property_id": "6588181567",
        "slug_id": "Rural-Estates_Naples_FL",
        "as_of": "2026-08-03",
    }


def test_response_with_no_neighborhood_returns_none_triplet():
    nbhd, amenities, assignment = parse_amenities_response(
        {"meta": {"property_id": "123"}, "body": {"neighborhoods": []}}, as_of="2026-08-03"
    )
    assert nbhd is None
    assert amenities == []
    assert assignment is None


def test_point_in_polygon_ray_cast():
    square = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]
    assert point_in_polygon(5.0, 5.0, square) is True
    assert point_in_polygon(15.0, 5.0, square) is False
    assert point_in_polygon(-0.1, 5.0, square) is False
