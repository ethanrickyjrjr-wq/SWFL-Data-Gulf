"""Pure parcel→community assignment resolution — no I/O, fully unit-tested.

The spatial containment itself runs in DuckDB (`spatial_join.py`); this module owns
what happens AFTER containment returns raw (parcel, polygon) match pairs:

  - failure mode 1: `is_joinable` — the NAMED residential allowlist × exact
    Approved status. Never a negation; CPD (the layer's largest category —
    shopping centers) can never receive a home.
  - failure mode 4: multi-phase polygons of ONE community collapse to ONE row,
    keyed on the normalized community name.
  - failure mode 5: a parcel inside two DIFFERENT communities is resolved
    smallest-ACRES-wins AND flagged `ambiguous` — never silently first-wins; the
    count is a run metric.
  - failure mode 6: INPUTMETHOD travels onto every assignment row so consumers can
    stay silent for Sketched / "Bad Legal" boundaries.
  - auditability: every row records the criteria that produced it.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .constants import APPROVED_STATUS, RESIDENTIAL_ZONING_CATEGORIES

ASSIGNMENT_CRITERIA = (
    f"IMS_STATUS={APPROVED_STATUS} AND ZONING_CATEGORY IN "
    f"({','.join(sorted(RESIDENTIAL_ZONING_CATEGORIES))}); "
    "multi-phase same-community polygons collapse on community_name_normalized; "
    "cross-community multi-match resolves smallest-ACRES-wins and is flagged ambiguous"
)


def is_joinable(polygon: dict) -> bool:
    """Exact Approved status × named residential allowlist (failure mode 1)."""
    return (
        polygon.get("ims_status") == APPROVED_STATUS
        and polygon.get("zoning_category") in RESIDENTIAL_ZONING_CATEGORIES
    )


def _smallest_acres(matches: list[dict]) -> dict:
    """Deterministic representative: smallest ACRES, objectid as tiebreak. A null
    ACRES sorts last — a polygon with no recorded size never beats a measured one."""
    def key(m: dict):
        acres = m.get("acres")
        return (acres is None, acres if acres is not None else 0.0, m.get("pd_object_id") or 0)

    return sorted(matches, key=key)[0]


def resolve_matches(matches: list[dict]) -> tuple[list[dict], dict]:
    """Raw containment pairs → one assignment row per parcel + run metrics.

    Input rows carry: parcel_id, pd_object_id, community_name_normalized, case_name,
    zoning_category, inputmethod, acres. The caller has already applied `is_joinable`
    (in SQL); this function trusts nothing else.
    """
    assigned_at = datetime.now(timezone.utc).isoformat()
    by_parcel: dict[str, list[dict]] = {}
    for m in matches:
        pid = m.get("parcel_id")
        if not pid:
            continue
        by_parcel.setdefault(pid, []).append(m)

    rows: list[dict] = []
    ambiguous_count = 0
    for parcel_id, ms in by_parcel.items():
        distinct_names = {m.get("community_name_normalized") for m in ms}
        ambiguous = len(distinct_names) > 1
        winner = _smallest_acres(ms)
        if ambiguous:
            ambiguous_count += 1
        rows.append(
            {
                "parcel_id": parcel_id,
                "pd_object_id": winner.get("pd_object_id"),
                "community_name_normalized": winner.get("community_name_normalized"),
                "case_name_raw": winner.get("case_name"),
                "zoning_category": winner.get("zoning_category"),
                "input_method": winner.get("inputmethod"),
                "acres": winner.get("acres"),
                "ambiguous": ambiguous,
                "assignment_criteria": ASSIGNMENT_CRITERIA,
                "assigned_at": assigned_at,
            }
        )

    metrics = {"assigned": len(rows), "ambiguous": ambiguous_count}
    return rows, metrics
