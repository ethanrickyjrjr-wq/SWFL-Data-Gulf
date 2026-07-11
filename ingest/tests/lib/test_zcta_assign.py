"""Pure-logic tests for centroid -> ZCTA site-ZIP assignment.

Isolated: a fake 2-ZCTA GeoJSON, no network. DuckDB spatial does the real
point-in-polygon, so the actual join path is exercised, not a mock of it.
"""
from ingest.lib.zcta_assign import assign_zip, ring_centroid, zip_by_folio

_ZCTA = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {"ZCTA5CE10": "33901"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-82.0, 26.6], [-82.0, 26.7], [-81.9, 26.7], [-81.9, 26.6], [-82.0, 26.6]]],
            },
        },
        {
            "type": "Feature",
            "properties": {"ZCTA5CE10": "34102"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-81.8, 26.1], [-81.8, 26.2], [-81.7, 26.2], [-81.7, 26.1], [-81.8, 26.1]]],
            },
        },
    ],
}


def test_point_inside_zcta_gets_that_zip():
    out = assign_zip([{"folioid": "A", "lon": -81.95, "lat": 26.65}], _ZCTA)
    assert out == [{"folioid": "A", "zip_code": "33901", "method": "centroid_zcta"}]


def test_point_in_second_zcta_gets_that_zip():
    out = assign_zip([{"folioid": "C", "lon": -81.75, "lat": 26.15}], _ZCTA)
    assert out == [{"folioid": "C", "zip_code": "34102", "method": "centroid_zcta"}]


def test_point_outside_all_zctas_gets_none():
    out = assign_zip([{"folioid": "B", "lon": 0.0, "lat": 0.0}], _ZCTA)
    assert out == [{"folioid": "B", "zip_code": None, "method": "centroid_zcta"}]


def test_every_parcel_gets_exactly_one_row():
    pts = [
        {"folioid": "A", "lon": -81.95, "lat": 26.65},
        {"folioid": "B", "lon": 0.0, "lat": 0.0},
        {"folioid": "C", "lon": -81.75, "lat": 26.15},
    ]
    out = assign_zip(pts, _ZCTA)
    assert len(out) == 3
    assert {r["folioid"] for r in out} == {"A", "B", "C"}


def test_ring_centroid_polygon_mean_of_outer_ring():
    geom = {"type": "Polygon", "coordinates": [[[0.0, 0.0], [0.0, 4.0], [4.0, 4.0], [4.0, 0.0], [0.0, 0.0]]]}
    assert ring_centroid(geom) == (8.0 / 5.0, 8.0 / 5.0)


def test_ring_centroid_multipolygon_uses_first_ring():
    geom = {
        "type": "MultiPolygon",
        "coordinates": [[[[0.0, 0.0], [0.0, 2.0], [2.0, 2.0], [2.0, 0.0], [0.0, 0.0]]]],
    }
    assert ring_centroid(geom) == (4.0 / 5.0, 4.0 / 5.0)


def test_ring_centroid_none_geometry_returns_none():
    assert ring_centroid(None) is None
    assert ring_centroid({"type": "Polygon", "coordinates": []}) is None


def test_zip_by_folio_maps_features_to_site_zip():
    """The one call the parcel ingest makes: features -> {folioid: zip}."""
    features = [
        {
            "properties": {"FOLIOID": 10289421, "Just": 250000},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-81.96, 26.64], [-81.96, 26.66], [-81.94, 26.66], [-81.94, 26.64], [-81.96, 26.64]]],
            },
        },
        {   # no geometry -> absent from the map, never invented
            "properties": {"FOLIOID": 99999999, "Just": 1},
            "geometry": None,
        },
    ]
    out = zip_by_folio(features, _ZCTA)
    assert out["10289421"] == "33901"
    assert "99999999" not in out
