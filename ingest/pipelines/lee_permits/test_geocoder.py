"""Unit tests for lee_permits geocoder — pure functions only, no network."""
from __future__ import annotations

import pytest
from .geocoder import _split_lee_address, assign_corridor


@pytest.mark.parametrize("address,expected_street,expected_city,expected_zip", [
    (
        "12345 US 41 N, FORT MYERS, FL 33903",
        "12345 US 41 N", "FORT MYERS", "33903",
    ),
    (
        "100 LEE BLVD, LEHIGH ACRES, FL 33936",
        "100 LEE BLVD", "LEHIGH ACRES", "33936",
    ),
    (
        "8800 Daniels Pkwy, FORT MYERS, FL 33912",
        "8800 Daniels Pkwy", "FORT MYERS", "33912",
    ),
    # No state/zip suffix — falls back gracefully
    (
        "123 MAIN ST, CAPE CORAL",
        "123 MAIN ST", "CAPE CORAL", "",
    ),
    # No commas at all
    (
        "123 MAIN ST CAPE CORAL FL 33904",
        "123 MAIN ST CAPE CORAL", "Fort Myers", "33904",
    ),
])
def test_split_lee_address(address, expected_street, expected_city, expected_zip):
    street, city, zip_code = _split_lee_address(address)
    assert street == expected_street
    assert city == expected_city
    assert zip_code == expected_zip


def test_assign_corridor_returns_nearest_within_radius():
    centroids = [
        {"corridor_id": "lee-blvd-lehigh-acres", "center_lat": 26.61, "center_lon": -81.67},
        {"corridor_id": "joel-blvd-lehigh-acres", "center_lat": 26.63, "center_lon": -81.598},
    ]
    # Point very close to lee-blvd centroid
    result = assign_corridor(26.61, -81.67, centroids)
    assert result == "lee-blvd-lehigh-acres"


def test_assign_corridor_returns_none_beyond_radius():
    centroids = [
        {"corridor_id": "lee-blvd-lehigh-acres", "center_lat": 26.61, "center_lon": -81.67},
    ]
    # Miami — well outside 1.5 mi
    result = assign_corridor(25.77, -80.19, centroids)
    assert result is None


def test_assign_corridor_none_on_null_coords():
    centroids = [{"corridor_id": "x", "center_lat": 26.61, "center_lon": -81.67}]
    assert assign_corridor(None, None, centroids) is None
    assert assign_corridor(None, -81.67, centroids) is None
