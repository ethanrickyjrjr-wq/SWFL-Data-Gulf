"""Geocode ladder for pulse rows (Phase C, zip-page-destination spec).

Vendor terms verified live 07/09/2026 (SESSION_LOG same date): Census geocoder
free/public-domain/storable (single-record REST carries ZCTA; batch does NOT);
Nominatim public API requires caching + <=4 req/min for scheduled scripts +
identifying User-Agent + OSM attribution where displayed (ODbL); Mapbox
excluded (temporary results may not be cached; Search Box POI is
temporary-use only; Permanent tier bars distribution/sublicense).

Ladder (G1: a ZIP is written ONLY from a resolved lat/lon via Census ZCTA
polygons — never invented):
  cache -> address? Census onelineaddress (coords+ZCTA in one call)
        -> else Nominatim (SWFL-bounded) -> Census coords->ZCTA
        -> miss => {} (row keeps native grain; geo fields NULL)
"""
from __future__ import annotations

import re
import time
from typing import Any, Optional

import requests

from ingest.lib.tier1_inventory import _get_connection

CENSUS_ONELINE = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
CENSUS_COORDS = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
ZCTA_LAYER = "2020 Census ZIP Code Tabulation Areas"
# Identifying UA per Nominatim policy (stock library UAs are rejected).
USER_AGENT = "SWFLDataGulf-pulse-geocode/1.0 (https://www.swfldatagulf.com)"
# Lee + Collier bounding box (left,top,right,bottom) — bounded=1 hard-limits hits.
SWFL_VIEWBOX = "-82.35,27.10,-81.20,25.75"
# Policy: scripts at regular intervals <= 4 req/min.
NOMINATIM_MIN_INTERVAL_S = 15.0
MISS_RETRY_DAYS = 30

_last_nominatim_at = 0.0

# Nominatim place types that mean a named area, not a pin.
_NEIGHBORHOOD_TYPES = {"suburb", "neighbourhood", "quarter", "hamlet", "village",
                       "residential"}


def normalize_anchor(anchor: str) -> str:
    return re.sub(r"\s+", " ", anchor.strip().lower())


def is_address(anchor: str) -> bool:
    """Street-number-first strings are Census-geocodable addresses."""
    return bool(re.match(r"^\d{1,6}\s+\S", anchor.strip()))


def _parse_census_oneline(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    matches = (payload.get("result") or {}).get("addressMatches") or []
    if not matches:
        return None
    m = matches[0]
    coords = m.get("coordinates") or {}
    lat, lon = coords.get("y"), coords.get("x")
    zctas = (m.get("geographies") or {}).get(ZCTA_LAYER) or []
    zcta = zctas[0].get("ZCTA5") if zctas else None
    if lat is None or lon is None or not zcta:
        return None
    return {"lat": float(lat), "lon": float(lon), "zip_code": str(zcta)}


def _parse_census_coords(payload: dict[str, Any]) -> Optional[str]:
    zctas = ((payload.get("result") or {}).get("geographies") or {}).get(ZCTA_LAYER) or []
    return str(zctas[0]["ZCTA5"]) if zctas and zctas[0].get("ZCTA5") else None


def _parse_nominatim(hits: list[dict[str, Any]]) -> Optional[tuple[float, float, str]]:
    if not hits:
        return None
    h = hits[0]
    try:
        lat, lon = float(h["lat"]), float(h["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    grain = ("neighborhood"
             if h.get("class") == "place" and h.get("type") in _NEIGHBORHOOD_TYPES
             else "point")
    return (lat, lon, grain)


def census_onelineaddress(anchor: str, context: str) -> Optional[dict[str, Any]]:
    """Address -> {lat, lon, zip_code} in ONE free call. Title-cased: the Census
    geocoder silently returns no matches for ALL-CAPS input (zip_approx lesson)."""
    try:
        resp = requests.get(CENSUS_ONELINE, params={
            "address": f"{anchor.strip().title()}, {context}",
            "benchmark": "Public_AR_Current", "vintage": "Current_Current",
            "layers": ZCTA_LAYER, "format": "json"}, timeout=8)
        resp.raise_for_status()
        return _parse_census_oneline(resp.json())
    except Exception:
        return None


def census_coords_to_zcta(lat: float, lon: float) -> Optional[str]:
    try:
        resp = requests.get(CENSUS_COORDS, params={
            "x": lon, "y": lat,
            "benchmark": "Public_AR_Current", "vintage": "Current_Current",
            "layers": ZCTA_LAYER, "format": "json"}, timeout=8)
        resp.raise_for_status()
        return _parse_census_coords(resp.json())
    except Exception:
        return None


def nominatim_search(anchor: str, context: str) -> Optional[tuple[float, float, str]]:
    """SWFL-bounded landmark/neighborhood lookup. Throttled to policy."""
    global _last_nominatim_at
    wait = NOMINATIM_MIN_INTERVAL_S - (time.monotonic() - _last_nominatim_at)
    if wait > 0:
        time.sleep(wait)
    _last_nominatim_at = time.monotonic()
    try:
        resp = requests.get(NOMINATIM_SEARCH, params={
            "q": f"{anchor}, {context}", "format": "jsonv2", "limit": 1,
            "countrycodes": "us", "viewbox": SWFL_VIEWBOX, "bounded": 1},
            headers={"User-Agent": USER_AGENT}, timeout=8)
        resp.raise_for_status()
        return _parse_nominatim(resp.json())
    except Exception:
        return None


def _cache_get(anchor_norm: str, city: str) -> Optional[dict[str, Any]]:
    """Best-effort cache read. Returns {} for a fresh miss row (negative cache),
    a resolved dict for a hit, None for absent/stale-miss/DB-unavailable."""
    try:
        conn = _get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT lat, lon, zip_code, geo_grain, provider "
                    "FROM data_lake.geo_anchor_cache "
                    "WHERE anchor_norm = %(a)s AND city = %(c)s "
                    # MISS_RETRY_DAYS is a module-literal int, safe to inline;
                    # psycopg params cannot live inside a quoted interval.
                    f"AND (provider <> 'miss' OR resolved_at > now() - interval '{MISS_RETRY_DAYS} days')",
                    {"a": anchor_norm, "c": city})
                row = cur.fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        lat, lon, zip_code, geo_grain, provider = row
        if provider == "miss":
            return {}
        return {"lat": lat, "lon": lon, "zip_code": zip_code, "geo_grain": geo_grain}
    except Exception:
        return None


def _cache_put(anchor_norm: str, city: str, provider: str,
               lat=None, lon=None, zip_code=None, geo_grain=None) -> None:
    try:
        conn = _get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO data_lake.geo_anchor_cache "
                    "(anchor_norm, city, lat, lon, zip_code, geo_grain, provider, resolved_at) "
                    "VALUES (%(a)s, %(c)s, %(lat)s, %(lon)s, %(z)s, %(g)s, %(p)s, now()) "
                    "ON CONFLICT (anchor_norm, city) DO UPDATE SET "
                    "lat=EXCLUDED.lat, lon=EXCLUDED.lon, zip_code=EXCLUDED.zip_code, "
                    "geo_grain=EXCLUDED.geo_grain, provider=EXCLUDED.provider, "
                    "resolved_at=EXCLUDED.resolved_at",
                    {"a": anchor_norm, "c": city, "lat": lat, "lon": lon,
                     "z": zip_code, "g": geo_grain, "p": provider})
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass  # cache is an optimization + policy nicety, never a failure source


def resolve_anchor(anchor: str, context: str) -> dict[str, Any]:
    """Full ladder for one anchor. Returns {lat, lon, zip_code, geo_grain} or {}."""
    anchor_norm = normalize_anchor(anchor)
    cached = _cache_get(anchor_norm, context)
    if cached is not None:
        return cached
    if is_address(anchor):
        hit = census_onelineaddress(anchor, context)
        if hit:
            out = {**hit, "geo_grain": "point"}
            _cache_put(anchor_norm, context, "census", **hit, geo_grain="point")
            return out
    else:
        nom = nominatim_search(anchor, context)
        if nom:
            lat, lon, grain = nom
            zcta = census_coords_to_zcta(lat, lon)
            if zcta:
                out = {"lat": lat, "lon": lon, "zip_code": zcta, "geo_grain": grain}
                _cache_put(anchor_norm, context, "nominatim", lat=lat, lon=lon,
                           zip_code=zcta, geo_grain=grain)
                return out
    _cache_put(anchor_norm, context, "miss")
    return {}


def annotate_geo(rows: list[dict[str, Any]], context: str,
                 fallback_grain: Optional[str], dry_run: bool = False) -> list[dict[str, Any]]:
    """Set lat/lon/zip_code/geo_grain on EVERY row. dry_run: no network, no DB —
    every row gets the fallback (offline-exercisable per pipeline --dry-run)."""
    for r in rows:
        geo: dict[str, Any] = {}
        anchor = r.get("location_anchor")
        if anchor and not dry_run:
            geo = resolve_anchor(anchor, context)
        r["lat"] = geo.get("lat")
        r["lon"] = geo.get("lon")
        r["zip_code"] = geo.get("zip_code")
        r["geo_grain"] = geo.get("geo_grain") or fallback_grain
    return rows
