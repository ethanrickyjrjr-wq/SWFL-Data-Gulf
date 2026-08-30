"""TDD guards for the parcel→community assignment resolution (spec failure modes 1, 4, 5, 6)."""

from ingest.pipelines.lee_planned_developments.assign import (
    ASSIGNMENT_CRITERIA,
    is_joinable,
    resolve_matches,
)


def _m(parcel="10-45-24-01-00001.0010", oid=1, name="Amavida", acres=38.5, **kw):
    row = {
        "parcel_id": parcel,
        "pd_object_id": oid,
        "community_name_normalized": name,
        "case_name": f"{name} RPD",
        "zoning_category": "RPD",
        "inputmethod": "Legal",
        "acres": acres,
    }
    row.update(kw)
    return row


# ── failure mode 1: commercial polygons must never receive homes ───────────────


def test_cpd_polygon_is_not_joinable():
    assert not is_joinable({"ims_status": "Approved", "zoning_category": "CPD"})


def test_ipd_polygon_is_not_joinable():
    assert not is_joinable({"ims_status": "Approved", "zoning_category": "IPD"})


def test_approved_rpd_is_joinable():
    assert is_joinable({"ims_status": "Approved", "zoning_category": "RPD"})


def test_pending_rpd_is_not_joinable():
    assert not is_joinable({"ims_status": "Pending", "zoning_category": "RPD"})


def test_approved_pending_combo_status_is_not_joinable():
    # The 1 "Approved/Pending" feature: exact match on Approved, never substring.
    assert not is_joinable({"ims_status": "Approved/Pending", "zoning_category": "RPD"})


def test_null_category_is_not_joinable():
    # NAMED allowlist, never a negation — null falls outside the list.
    assert not is_joinable({"ims_status": "Approved", "zoning_category": None})


# ── failure mode 4: multi-phase polygons of ONE community yield ONE row ────────


def test_two_polygons_one_community_yields_one_unambiguous_row():
    rows, metrics = resolve_matches(
        [_m(oid=1, acres=100.0), _m(oid=2, acres=40.0)]
    )
    assert len(rows) == 1
    assert rows[0]["ambiguous"] is False
    assert rows[0]["community_name_normalized"] == "Amavida"
    # Deterministic representative polygon: smallest acres.
    assert rows[0]["pd_object_id"] == 2
    assert metrics["assigned"] == 1
    assert metrics["ambiguous"] == 0


# ── failure mode 5: two DIFFERENT communities → flagged, smallest acres wins ───


def test_nested_polygons_two_communities_flagged_smallest_wins():
    rows, metrics = resolve_matches(
        [
            _m(oid=1, name="Big Master Plan", acres=5000.0),
            _m(oid=2, name="Small Enclave", acres=30.0),
        ]
    )
    assert len(rows) == 1
    assert rows[0]["community_name_normalized"] == "Small Enclave"
    assert rows[0]["ambiguous"] is True  # never silently first-wins
    assert metrics["ambiguous"] == 1


# ── failure mode 6: provenance travels — inputmethod lands on the row ──────────


def test_inputmethod_travels_to_assignment():
    rows, _ = resolve_matches([_m(inputmethod="Sketched")])
    assert rows[0]["input_method"] == "Sketched"


# ── auditability: the filter criteria are recorded on every row ────────────────


def test_every_row_carries_the_assignment_criteria():
    rows, _ = resolve_matches([_m()])
    assert rows[0]["assignment_criteria"] == ASSIGNMENT_CRITERIA
    assert "Approved" in ASSIGNMENT_CRITERIA and "RPD" in ASSIGNMENT_CRITERIA


def test_assigned_at_present_and_iso():
    rows, _ = resolve_matches([_m()])
    assert len(rows[0]["assigned_at"]) >= 10  # YYYY-MM-DD...
