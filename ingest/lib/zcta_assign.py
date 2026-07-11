"""Assign a site ZIP to a parcel from its geometry (G1: centroid, never a mailing ZIP).

Shared because it is county-agnostic: any parcel layer that serves polygon geometry
can derive its site ZIP this way. Pure + offline — no network, no DB. The caller
supplies the geometry; this module reduces it to a point and point-in-polygons that
point against the vendored TIGER ZCTA polygons.
"""
from __future__ import annotations

import json
import os
import tempfile

# TIGER ZCTA polygons already vendored in the repo (see ingest/utils/zip_approx.py).
ZCTA_ASSET_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "public", "maps", "fl_zips.geojson")
)

# ZCTA feature property carrying the 5-digit ZIP.
ZCTA_PROP = "ZCTA5CE10"


def load_zcta() -> dict:
    with open(ZCTA_ASSET_PATH) as f:
        return json.load(f)


def ring_centroid(geom: dict | None) -> tuple[float, float] | None:
    """Mean of the outer-ring vertices — an adequate ZIP-grain locator (not
    area-weighted). Returns (lon, lat), or None when geometry is missing/empty."""
    if not geom:
        return None
    coords = geom.get("coordinates") or []
    if geom.get("type") == "MultiPolygon":
        ring = coords[0][0] if coords and coords[0] else None
    else:
        ring = coords[0] if coords else None
    if not ring:
        return None
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    if not xs:
        return None
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def assign_zip(centroids: list[dict], zcta_geojson: dict) -> list[dict]:
    """Point-in-polygon each parcel centroid against ZCTA polygons via DuckDB spatial.

    centroids: [{folioid, lon, lat}]. Returns exactly one row per input folioid:
    [{folioid, zip_code|None, method: "centroid_zcta"}]. The GROUP BY guarantees a
    single row even if a point lands on a shared ZCTA boundary.
    """
    import duckdb

    con = duckdb.connect()
    try:
        con.execute("INSTALL spatial; LOAD spatial;")
        with tempfile.TemporaryDirectory() as td:
            zpath = os.path.join(td, "zcta.geojson")
            with open(zpath, "w") as f:
                json.dump(zcta_geojson, f)
            # Explicit GEOMETRY column so the RTREE index below is accepted (a
            # CREATE TABLE AS SELECT does not preserve the GEOMETRY type).
            con.execute("CREATE TABLE zcta (zip_code TEXT, geom GEOMETRY)")
            con.execute(f"INSERT INTO zcta SELECT {ZCTA_PROP}, geom FROM ST_Read(?)", [zpath])
            # RTREE so ST_Contains is index-accelerated, not a ~540M-pair nested
            # loop (548k Lee parcels x ~980 FL ZCTAs).
            con.execute("CREATE INDEX zcta_geom_idx ON zcta USING RTREE (geom)")
            con.execute("CREATE TABLE pts(folioid TEXT, lon DOUBLE, lat DOUBLE)")
            con.executemany(
                "INSERT INTO pts VALUES (?,?,?)",
                [(c["folioid"], c["lon"], c["lat"]) for c in centroids],
            )
            rows = con.execute(
                """
                SELECT p.folioid, ANY_VALUE(z.zip_code) AS zip_code
                  FROM pts p
                  LEFT JOIN zcta z ON ST_Contains(z.geom, ST_Point(p.lon, p.lat))
                 GROUP BY p.folioid
                """
            ).fetchall()
    finally:
        con.close()
    return [{"folioid": f, "zip_code": z, "method": "centroid_zcta"} for (f, z) in rows]


def zip_by_folio(features: list[dict], zcta_geojson: dict | None = None) -> dict[str, str | None]:
    """GeoJSON features (properties.FOLIOID + geometry) -> {folioid: zip_code|None}.

    The one call the parcel ingest needs: hand it the layer's features, get the
    site-ZIP map back."""
    centroids: list[dict] = []
    for ft in features:
        fid = (ft.get("properties") or {}).get("FOLIOID")
        c = ring_centroid(ft.get("geometry"))
        if fid and c:
            centroids.append({"folioid": str(fid), "lon": c[0], "lat": c[1]})
    if not centroids:
        return {}
    rows = assign_zip(centroids, zcta_geojson if zcta_geojson is not None else load_zcta())
    return {r["folioid"]: r["zip_code"] for r in rows}
