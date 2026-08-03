"""Pure parsers for SteadyAPI /neighborhood-amenities responses.

No network. Field census + verified response shape:
_RESEARCH/data-and-ingest/2026-08-03-neighborhood-amenities-full-scope.md.
Every value is carried verbatim from the response or absent — never invented.
"""
from __future__ import annotations

from typing import Any

SOURCE_URL = "https://api.steadyapi.com/v1/real-estate/neighborhood-amenities"

# Business fields carried into steadyapi_neighborhood_amenities. photo_url /
# icon_url / display_tags / reviews_url are deliberately dropped (presentation
# assets, not amenity facts).
_BUSINESS_FIELDS = ("name", "phone", "rating", "reviews_count", "categories", "yelp_url", "business_url")


def parse_amenities_response(
    data: dict, *, as_of: str
) -> tuple[dict | None, list[dict], dict | None]:
    """(neighborhood_row, amenity_rows, property_assignment_row).

    A response with no neighborhood (vendor has no polygon for this property)
    returns (None, [], None) — the caller records a gap, never a guess.
    """
    body = data.get("body") or {}
    meta = data.get("meta") or {}
    neighborhoods = body.get("neighborhoods") or []
    if not neighborhoods:
        return None, [], None

    nb = neighborhoods[0]
    slug_id = nb["slug_id"]
    centroid = nb.get("centroid") or {}

    nbhd_row = {
        "slug_id": slug_id,
        "name": nb["name"],
        "city": nb.get("city"),
        "state_code": nb.get("state_code"),
        "geo_type": nb.get("geo_type"),
        "level": nb.get("level"),
        "centroid_lat": float(centroid["lat"]) if centroid.get("lat") is not None else None,
        "centroid_lon": float(centroid["lon"]) if centroid.get("lon") is not None else None,
        "boundary": nb.get("boundary"),
        "scores": [
            {"label": s.get("label"), "value": s.get("value"), "text": s.get("text")}
            for s in (body.get("location_scores") or [])
        ],
        "search_radius": meta.get("search_radius"),
        "source_url": SOURCE_URL,
        "as_of": as_of,
    }

    amenity_rows: list[dict] = []
    by_category = ((body.get("amenities") or {}).get("by_category")) or {}
    for category, businesses in by_category.items():
        for biz in businesses or []:
            addr = biz.get("address") or {}
            row: dict[str, Any] = {"slug_id": slug_id, "category": category}
            for field in _BUSINESS_FIELDS:
                row[field] = biz.get(field)
            # '' (never NULL) — address_line is part of the amenity PK so that
            # same-name chain branches (two Dunkin's, one category) don't collide
            row["address_line"] = addr.get("line_one") or ""
            row["city"] = addr.get("city")
            row["postal_code"] = addr.get("postal_code")
            row["lat"] = float(addr["lat"]) if addr.get("lat") is not None else None
            row["lon"] = float(addr["lon"]) if addr.get("lon") is not None else None
            row["distance_from_property"] = (
                float(addr["distance_from_property"])
                if addr.get("distance_from_property") is not None
                else None
            )
            row["source_url"] = SOURCE_URL
            row["as_of"] = as_of
            amenity_rows.append(row)

    assignment = None
    property_id = meta.get("property_id")
    if property_id:
        assignment = {"property_id": str(property_id), "slug_id": slug_id, "as_of": as_of}

    return nbhd_row, amenity_rows, assignment


def point_in_polygon(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray-cast a point against one GeoJSON polygon ring ([lon, lat] pairs).
    Used to skip API calls for properties already inside a stored neighborhood
    boundary — a wrong False costs one redundant call, never wrong data."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat):
            x_cross = (xj - xi) * (lat - yi) / (yj - yi) + xi
            if lon < x_cross:
                inside = not inside
        j = i
    return inside


def property_in_boundary(lon: float, lat: float, boundary: dict | None) -> bool:
    """True when (lon, lat) falls inside a stored GeoJSON Polygon/MultiPolygon
    (outer rings only — holes are ignored; a hole miss costs one extra call)."""
    if not boundary:
        return False
    gtype = boundary.get("type")
    coords = boundary.get("coordinates") or []
    if gtype == "Polygon":
        return bool(coords) and point_in_polygon(lon, lat, coords[0])
    if gtype == "MultiPolygon":
        return any(poly and point_in_polygon(lon, lat, poly[0]) for poly in coords)
    return False
