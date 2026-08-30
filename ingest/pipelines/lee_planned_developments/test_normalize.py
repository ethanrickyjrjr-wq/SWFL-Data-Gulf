"""TDD guards for the Planned Developments normalizer — each test is named for the
failure mode it stops (spec: docs/superpowers/specs/2026-08-12-community-crosswalk-design.md).
"""

import pytest

from ingest.pipelines.lee_planned_developments.normalize import (
    BoundsViolation,
    assert_geometry_in_lee_bounds,
    normalize_case_name,
    normalize_feature,
)


def _feature(props: dict | None = None, geometry: dict | None = None) -> dict:
    base_props = {
        "OBJECTID": 7,
        "CASE_NAME": "Amavida RPD",
        "ZONING_CATEGORY": "RPD",
        "IMS_STATUS": "Approved",
        "INPUTMETHOD": "Legal",
        "ACRES": 38.5,
        "INITIALAPPROVAL": None,
        "MASTER_NO": None,
        "PC_ID": None,
        "last_edited_date": None,
    }
    base_props.update(props or {})
    return {
        "type": "Feature",
        "properties": base_props,
        "geometry": geometry
        or {
            "type": "Polygon",
            "coordinates": [
                [[-81.8, 26.5], [-81.79, 26.5], [-81.79, 26.51], [-81.8, 26.51], [-81.8, 26.5]]
            ],
        },
    }


# ── failure mode 4 groundwork: the normalized name is the collapse key ─────────


def test_zoning_suffix_stripped():
    assert normalize_case_name("Amavida RPD") == "Amavida"


def test_compound_zoning_suffix_stripped():
    # Real row shape: "Stoneybrook DRI/RPD/CPD (FKA Corkscrew Pines)"
    assert normalize_case_name("Stoneybrook DRI/RPD/CPD (FKA Corkscrew Pines)") == "Stoneybrook"


def test_fka_parenthetical_stripped():
    assert normalize_case_name("Pelican Preserve (FKA Sun City Center)") == "Pelican Preserve"


def test_multi_phase_names_collapse_to_one_key():
    # 32 CASE_NAMEs repeat as multi-phase polygons of ONE community — both phases
    # must normalize to the same key, or the collapse in the join never happens.
    a = normalize_case_name("West Bay Club RPD")
    b = normalize_case_name("West Bay Club")
    assert a == b == "West Bay Club"


def test_name_without_suffix_is_verbatim():
    # A street-address CASE_NAME is dirty by design and stays as-is — the
    # normalizer strips known zoning noise only, it never invents a nicer name.
    assert normalize_case_name("11101 New Moon Ct") == "11101 New Moon Ct"


def test_interior_zoning_token_not_stripped():
    # Only TRAILING suffixes are zoning noise; an interior token is part of the name.
    assert normalize_case_name("PUD Plaza Estates") == "PUD Plaza Estates"


# ── failure mode 8: empty names dropped, counted, never a blank community ──────


def test_empty_case_name_returns_none():
    assert normalize_feature(_feature({"CASE_NAME": None})) is None
    assert normalize_feature(_feature({"CASE_NAME": "   "})) is None


# ── failure mode 3: State Plane feet read as degrees must fail loud ────────────


def test_state_plane_feet_coordinates_fail_bounds():
    feet_geom = {
        "type": "Polygon",
        "coordinates": [[[658000.0, 780000.0], [659000.0, 780000.0], [659000.0, 781000.0]]],
    }
    with pytest.raises(BoundsViolation):
        assert_geometry_in_lee_bounds(feet_geom)


def test_wgs84_lee_coordinates_pass_bounds():
    assert_geometry_in_lee_bounds(_feature()["geometry"])  # must not raise


def test_normalize_feature_raises_on_out_of_bounds_geometry():
    bad = _feature(
        geometry={
            "type": "Polygon",
            "coordinates": [[[658000.0, 780000.0], [659000.0, 780000.0], [659000.0, 781000.0]]],
        }
    )
    with pytest.raises(BoundsViolation):
        normalize_feature(bad)


# ── row shape: raw CASE_NAME preserved verbatim beside the normalized key ──────


def test_row_carries_raw_and_normalized_names():
    row = normalize_feature(_feature({"CASE_NAME": "Amavida RPD"}))
    assert row is not None
    assert row["case_name"] == "Amavida RPD"  # verbatim, never overwritten
    assert row["community_name_normalized"] == "Amavida"
    assert row["objectid"] == 7
    assert row["zoning_category"] == "RPD"
    assert row["ims_status"] == "Approved"
    assert row["inputmethod"] == "Legal"
    assert row["acres"] == 38.5
    # geometry lands as a GeoJSON string (WGS84) for DuckDB ST_GeomFromGeoJSON.
    assert isinstance(row["geometry"], str)
    assert '"Polygon"' in row["geometry"]


def test_missing_geometry_returns_none():
    # A polygon-less feature cannot ever be joined; drop + count, never land NULL
    # geometry (Gate 4 guard column).
    row = normalize_feature({"type": "Feature", "properties": _feature()["properties"]})
    assert row is None
