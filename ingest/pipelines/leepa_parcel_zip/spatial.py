"""Pure spatial helpers for the Lee parcel -> ZIP crosswalk.

No network here. `ring_centroid` reduces a parcel polygon to one point;
`assign_zip` point-in-polygons those points against ZCTA polygons via DuckDB
spatial (the real join path, not a mock). Both are import-safe without a DB.
"""
from __future__ import annotations

import json
import os
import tempfile


def ring_centroid(geom: dict | None) -> tuple[float, float] | None:
    """Mean of the outer-ring vertices — an adequate ZIP-grain locator (not
    area-weighted). Returns (lon, lat) or None when geometry is missing/empty."""
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
    """Point-in-polygon each parcel centroid against ZCTA polygons.

    centroids: [{folioid, lon, lat}]. Returns exactly one row per input folioid:
    [{folioid, zip_code|None, method: "centroid_zcta"}]. The GROUP BY guarantees
    a single row even if a point lands on a shared ZCTA boundary.
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
            con.execute("INSERT INTO zcta SELECT ZCTA5CE10, geom FROM ST_Read(?)", [zpath])
            # RTREE index so the ST_Contains join is index-accelerated, not a
            # ~540M-pair nested loop (548k Lee parcels x ~980 FL ZCTAs) that would
            # risk the 30-min GHA runner. Cheap on the tiny test set, load-bearing
            # at prod scale.
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
