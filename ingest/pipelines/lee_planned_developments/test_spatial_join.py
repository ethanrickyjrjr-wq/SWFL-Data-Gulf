"""TDD guards for the DuckDB containment step (spec failure modes 1, 2, 4).

These run against a real in-memory DuckDB with the spatial extension — the same SQL
`spatial_join.py` runs in production. If any code path swaps lon/lat (failure mode 2:
compiles fine, silently matches nothing) the known-containment fixture here returns
zero matches and the test FAILS.
"""

import pytest

duckdb = pytest.importorskip("duckdb")

from ingest.pipelines.lee_planned_developments.assign import resolve_matches
from ingest.pipelines.lee_planned_developments.spatial_join import (
    containment_pairs,
    joinable_polygons,
    load_parcels,
    load_polygons,
    open_spatial_connection,
)


def _poly_row(oid, name, category="RPD", status="Approved", acres=40.0, ring=None):
    ring = ring or [
        [-81.81, 26.49],
        [-81.79, 26.49],
        [-81.79, 26.51],
        [-81.81, 26.51],
        [-81.81, 26.49],
    ]
    import json

    return {
        "objectid": oid,
        "case_name": f"{name} {category}",
        "community_name_normalized": name,
        "zoning_category": category,
        "ims_status": status,
        "inputmethod": "Legal",
        "acres": acres,
        "geometry": json.dumps({"type": "Polygon", "coordinates": [ring]}),
    }


INSIDE = ("10-45-24-01-00001.0010", -81.80, 26.50)  # (parcel_id, lon, lat)
OUTSIDE = ("10-45-24-01-00099.0990", -81.60, 26.70)


def _run(polys, parcels):
    con = open_spatial_connection()
    load_polygons(con, joinable_polygons(polys))
    load_parcels(con, parcels)
    return containment_pairs(con)


def test_known_containment_matches_nonzero():
    # THE lon/lat-swap tripwire: a fixture parcel with known containment in a known
    # PD. Zero matches here means a swapped axis somewhere — fail, never ship.
    pairs = _run([_poly_row(1, "Amavida")], [INSIDE, OUTSIDE])
    assert len(pairs) == 1
    assert pairs[0]["parcel_id"] == INSIDE[0]
    assert pairs[0]["community_name_normalized"] == "Amavida"


def test_cpd_fixture_assigns_zero_parcels():
    # failure mode 1: a commercial polygon containing the parcel must yield nothing.
    pairs = _run([_poly_row(2, "Shoppes At Somewhere", category="CPD")], [INSIDE])
    assert pairs == []


def test_multi_phase_polygons_collapse_end_to_end():
    # failure mode 4: parcel inside two polygons of ONE community → one row.
    pairs = _run(
        [_poly_row(1, "West Bay Club", acres=100.0), _poly_row(2, "West Bay Club", acres=40.0)],
        [INSIDE],
    )
    rows, metrics = resolve_matches(pairs)
    assert len(rows) == 1
    assert rows[0]["ambiguous"] is False
    assert metrics["ambiguous"] == 0
