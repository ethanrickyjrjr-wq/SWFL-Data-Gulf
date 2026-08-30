"""Pure normalization for Lee Planned Development features — no I/O, fully unit-tested.

Two jobs:
  1. `normalize_case_name` — CASE_NAME is dirty by design (zoning suffixes, FKA
     parentheticals, street addresses). The normalized name is BOTH the display label
     AND the key that collapses the 32 multi-phase repeats (failure mode 4), so it is
     load-bearing, not cosmetic. It strips KNOWN zoning noise only — it never invents
     a nicer name, and the raw CASE_NAME always travels beside it verbatim.
  2. `normalize_feature` — one GeoJSON Feature → one row dict, or None (dropped +
     counted by the caller) when the name is empty (failure mode 8) or the geometry
     is absent. Every vertex is bounds-asserted inside Lee County's lat/lon envelope:
     State Plane feet leaking through as degrees fails LOUD before any write
     (failure mode 3).
"""

from __future__ import annotations

import json
import re

from ingest.lib.coercion import coerce_date

from .constants import LEE_LAT_MAX, LEE_LAT_MIN, LEE_LON_MAX, LEE_LON_MIN


class BoundsViolation(ValueError):
    """Raised when polygon coordinates fall outside Lee County's lat/lon envelope —
    the signature of an unreprojected State Plane (feet) geometry. Fail loud, never
    write (spec failure mode 3)."""


# The zoning vocabulary observed in the live ZONING_CATEGORY census (08/28/2026),
# plus bare "PD". Only a TRAILING run of these (optionally chained with / or -)
# is noise; an interior or leading token is part of the name.
_ZONING_TOKENS = (
    "RPD|CPD|MPD|IPD|CFPD|PUD|MHPD|RVPD|AOPD|MEPD|PRFPD|CCPD|DRI|PD"
)
_TRAILING_ZONING_RE = re.compile(
    rf"\s+(?:{_ZONING_TOKENS})(?:\s*[/-]\s*(?:{_ZONING_TOKENS}))*\s*$",
    re.IGNORECASE,
)
# Parenthetical former-name notes: "(FKA Corkscrew Pines)", "(f.k.a. ...)", "(AKA ...)",
# "(formerly ...)". Only these — an arbitrary parenthetical may be real identity.
_FORMER_NAME_PAREN_RE = re.compile(
    r"\s*\(\s*(?:f\.?\s*k\.?\s*a\.?|a\.?\s*k\.?\s*a\.?|formerly)\b[^)]*\)\s*",
    re.IGNORECASE,
)


def normalize_case_name(raw: str | None) -> str:
    """Strip former-name parentheticals and trailing zoning suffix chains. Returns ""
    for empty input — the caller drops (and counts) those rows."""
    if not raw:
        return ""
    name = _FORMER_NAME_PAREN_RE.sub(" ", str(raw))
    # Trailing suffix chains can stack ("... DRI/RPD/CPD"); one pass handles a chain,
    # loop in case stripping a parenthetical exposed another trailing suffix.
    while True:
        stripped = _TRAILING_ZONING_RE.sub("", name)
        if stripped == name:
            break
        name = stripped
    return re.sub(r"\s+", " ", name).strip()


def _iter_coords(coords) -> "list[tuple[float, float]]":
    """Flatten any GeoJSON coordinate nesting to (lon, lat) pairs."""
    out: list[tuple[float, float]] = []
    if not isinstance(coords, (list, tuple)):
        return out
    if (
        len(coords) >= 2
        and isinstance(coords[0], (int, float))
        and isinstance(coords[1], (int, float))
    ):
        out.append((float(coords[0]), float(coords[1])))
        return out
    for c in coords:
        out.extend(_iter_coords(c))
    return out


def assert_geometry_in_lee_bounds(geometry: dict) -> None:
    """Every vertex must sit inside Lee County's generous lat/lon envelope. GeoJSON
    order is [lon, lat] (see lib/geo/ray-cast.ts's header for the swap trap this
    ordering discipline exists to stop)."""
    pairs = _iter_coords((geometry or {}).get("coordinates"))
    if not pairs:
        raise BoundsViolation("geometry has no coordinates")
    for lon, lat in pairs:
        if not (LEE_LON_MIN <= lon <= LEE_LON_MAX and LEE_LAT_MIN <= lat <= LEE_LAT_MAX):
            raise BoundsViolation(
                f"vertex (lon={lon}, lat={lat}) outside Lee County envelope — "
                "unreprojected State Plane geometry? Refusing to write."
            )


def normalize_feature(feature: dict) -> dict | None:
    """One GeoJSON Feature → one row, or None to drop (empty name / no geometry).
    Raises BoundsViolation on out-of-envelope coordinates — never returns a bad row."""
    props = feature.get("properties") or feature.get("attributes") or {}
    geometry = feature.get("geometry")

    case_name = props.get("CASE_NAME")
    if not case_name or not str(case_name).strip():
        return None
    normalized = normalize_case_name(str(case_name))
    if not normalized:
        return None

    if not geometry or not (geometry.get("coordinates")):
        return None
    assert_geometry_in_lee_bounds(geometry)

    return {
        "objectid": props.get("OBJECTID"),
        "case_name": str(case_name),  # raw, never overwritten
        "community_name_normalized": normalized,
        "zoning_category": props.get("ZONING_CATEGORY"),
        "ims_status": props.get("IMS_STATUS"),
        "inputmethod": props.get("INPUTMETHOD"),
        "acres": props.get("ACRES"),
        "initialapproval": coerce_date(props.get("INITIALAPPROVAL")),
        "master_no": props.get("MASTER_NO"),
        "pc_id": props.get("PC_ID"),
        "last_edited_date": coerce_date(props.get("last_edited_date")),
        "geometry": json.dumps(geometry, separators=(",", ":")),
    }
