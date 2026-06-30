"""API extractor for the listing lifecycle — RentCast (spine) + SteadyAPI (photos).

Replaces the Source-B crawl4ai scrape (extract.py) as the FEED, not the machine: the parsed rows
feed the same diff engine (transitions.py) and DB layer (distill.py), under a neutral
source_name='api_feed'. The pure parsers below are network-free and fully unit-testable; the
fetchers (paginated requests wrappers) live further down. Both APIs are empty-tolerant — a
bad/blocked/keyless call yields [] upstream, never a throw.

Field contract VERIFIED LIVE 2026-06-30 (RULE 0.4): RentCast countyFips is 3-digit ("071");
SteadyAPI location.county_fips is full 5-digit ("12071"); SteadyAPI paginates via meta.total.
"""
from __future__ import annotations

import math
import os
import re
from typing import Any

import requests

from ingest.pipelines.listing_lifecycle.address_key import address_key
from ingest.pipelines.listing_lifecycle.constants_api import (
    FL_STATE_FIPS,
    IN_SCOPE_FIPS,
    PROPERTY_TYPE_MAP,
    RENTCAST_BASE,
    STEADYAPI_BASE,
    STEADYAPI_HEADERS,
    SWFL_CITY_SEED,
)

_PERMALINK_ZIP = re.compile(r"_(\d{5})_")

_RC_PAGE = 500   # RentCast limit cap (verified: caps at 500, no total-count header)
_SA_PAGE = 200   # SteadyAPI page size (meta.returned/limit = 200)
_MAX_PAGES = 60  # backstop (~30k listings) — real cities exhaust far sooner


# ----------------------------------------------------------------------------- pure helpers

def map_property_type(raw: str | None) -> str:
    return PROPERTY_TYPE_MAP.get((raw or "").strip().lower(), "other")


def _num(v: Any) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _int(v: Any) -> int | None:
    f = _num(v)
    return None if f is None else int(f)


def _iso_date(v: Any) -> str | None:
    return v[:10] if isinstance(v, str) and len(v) >= 10 else None


# ----------------------------------------------------------------------------- pure parsers

def parse_rentcast(raw: dict, county_seed: str) -> dict | None:
    """One RentCast /listings/sale record -> the wide row shape the diff engine consumes.
    Returns None if it lacks identity or its county is out of SWFL scope (self-correcting gate)."""
    addr = raw.get("addressLine1") or ""
    zip_code = raw.get("zipCode") or ""
    if not addr or not zip_code:
        return None
    fips3 = raw.get("countyFips") or ""
    county_fips = (FL_STATE_FIPS + fips3) if fips3 else None
    if county_fips not in IN_SCOPE_FIPS:
        return None
    lot_sqft = _num(raw.get("lotSize"))
    return {
        "street_address": addr,
        "city": raw.get("city"),
        "zip_code": zip_code,
        "state": raw.get("state") or "FL",
        "county": IN_SCOPE_FIPS[county_fips],
        "county_fips": county_fips,
        "list_price": _int(raw.get("price")),
        "beds": _int(raw.get("bedrooms")),
        "baths": _num(raw.get("bathrooms")),
        "sqft": _int(raw.get("squareFootage")),
        "lot_acres": (lot_sqft / 43560.0) if lot_sqft else None,
        "property_type": map_property_type(raw.get("propertyType")),
        "listing_id": raw.get("id"),
        "sale_or_rent": "sale",
        "photo_url": None,                       # RentCast has no photos — SteadyAPI fills via merge
        "lat": _num(raw.get("latitude")),
        "lon": _num(raw.get("longitude")),
        "mls_number": raw.get("mlsNumber"),      # null on non-MLS rows (e.g. new construction)
        "mls_name": raw.get("mlsName"),
        "listing_type": raw.get("listingType"),
        "listed_date": _iso_date(raw.get("listedDate")),
        "days_on_market": _int(raw.get("daysOnMarket")),  # REAL DOM (RentCast)
    }


def parse_steadyapi(raw: dict, city: str, state: str) -> dict | None:
    """One SteadyAPI search record -> the wide row shape. Street + zip parsed from the permalink slug
    (mirrors lib/listings/steadyapi.ts). Property type derived (record carries none): lot + no beds =
    land. Returns None without identity or out of SWFL scope."""
    pid = raw.get("property_id")
    if not pid:
        return None
    permalink = raw.get("permalink") or ""
    last = permalink.split("/")[-1]
    parts = last.split("_")
    street = (parts[0].replace("-", " ") if parts else "").strip()
    zm = _PERMALINK_ZIP.search(permalink)
    zip_code = zm.group(1) if zm else next((p for p in parts if p.isdigit() and len(p) == 5), "")
    loc = raw.get("location") or {}
    county_fips = loc.get("county_fips")
    if county_fips not in IN_SCOPE_FIPS:
        return None
    desc = raw.get("description") or {}
    beds = _int(desc.get("beds"))
    lot_sqft = _num(desc.get("lot_sqft"))
    ptype = "land" if (beds is None and lot_sqft) else "single_family"
    price = raw.get("price") or {}
    return {
        "street_address": street or None,
        "city": city,
        "zip_code": zip_code or None,
        "state": state,
        "county": IN_SCOPE_FIPS[county_fips],
        "county_fips": county_fips,
        "list_price": _int(price.get("amount")),
        "beds": beds,
        "baths": None,                           # SteadyAPI record has no bathrooms
        "sqft": _int(desc.get("sqft")),
        "lot_acres": (lot_sqft / 43560.0) if lot_sqft else None,
        "property_type": ptype,
        "listing_id": str(pid),
        "sale_or_rent": "sale",
        "photo_url": raw.get("photo_url") or None,
        "lat": _num(loc.get("lat")),
        "lon": _num(loc.get("lon")),
        "mls_number": None,
        "mls_name": raw.get("source_type"),
        "listing_type": None,
        "listed_date": None,                     # SteadyAPI gives no list date
        "days_on_market": None,                  # and no DOM — stays NULL (never faked to 0)
    }


def _row_key(row: dict) -> str:
    return address_key(row.get("street_address") or "", row.get("zip_code") or "")


def merge_by_proximity(rentcast_rows: list[dict], steadyapi_rows: list[dict],
                       threshold_deg: float = 0.002) -> list[dict]:
    """RentCast is the spine; graft each SteadyAPI photo onto the nearest RentCast row within ~200m
    (0.002deg ~= 200m at 27N), mirroring lib/listings/select.ts. RentCast rows with no photo match
    keep photo_url=None. SteadyAPI listings RentCast missed are appended so the active set isn't
    narrowed — EXCEPT a SteadyAPI row whose address_key already exists among the RentCast rows: that
    is the same property, so we drop the sparse SteadyAPI duplicate and keep the RentCast spine (real
    DOM/MLS#). This guards both the clobber AND the double-count when proximity misses on geocode
    variance (advisor Gap #3)."""
    sa_coord = [s for s in steadyapi_rows if s.get("lat") is not None and s.get("lon") is not None]
    grafted: set[int] = set()
    for rc in rentcast_rows:
        if rc.get("lat") is None or rc.get("lon") is None or rc.get("photo_url"):
            continue
        best_i, best_d = None, threshold_deg
        for i, sa in enumerate(sa_coord):
            d = math.hypot(rc["lat"] - sa["lat"], rc["lon"] - sa["lon"])
            if d < best_d:
                best_d, best_i = d, i
        if best_i is not None:
            rc["photo_url"] = sa_coord[best_i].get("photo_url")
            grafted.add(id(sa_coord[best_i]))

    rc_keys = {_row_key(rc) for rc in rentcast_rows}
    extras = [s for s in steadyapi_rows if id(s) not in grafted and _row_key(s) not in rc_keys]
    return rentcast_rows + extras


# ----------------------------------------------------------------------------- fetchers (network)
# Each fetcher returns (raw_rows, ok). `ok` is the completeness signal the coverage guard needs:
# True  = paginated to NATURAL exhaustion (a short/empty page, or reached meta.total) — trustworthy,
#         INCLUDING a city that legitimately holds 0 listings.
# False = a GAP: no key, a non-200 (e.g. 429 quota), a bad body, a network error, or the _MAX_PAGES
#         backstop — i.e. the pull may be TRUNCATED, so a disappearance must not be inferred from it.

def fetch_rentcast_city(city: str, state: str = "FL", key: str | None = None) -> tuple[list[dict], bool]:
    """Enumerate one city's active for-sale listings via offset pagination. Never throws."""
    key = key or os.environ.get("RENTCAST_API_KEY")
    if not key or not city:
        return [], False
    out: list[dict] = []
    for page in range(_MAX_PAGES):
        params = {"city": city, "state": state, "status": "Active",
                  "limit": _RC_PAGE, "offset": page * _RC_PAGE}
        try:
            r = requests.get(f"{RENTCAST_BASE}/listings/sale", params=params,
                             headers={"X-Api-Key": key, "Accept": "application/json"}, timeout=30)
            if r.status_code != 200:
                return out, False
            batch = r.json()
            if not isinstance(batch, list):
                return out, False
            if not batch:
                return out, True            # clean empty page = natural exhaustion
            out.extend(batch)
            if len(batch) < _RC_PAGE:
                return out, True            # short page = last page
        except Exception:
            return out, False
    return out, False                       # hit the backstop without exhausting = possibly truncated


def fetch_steadyapi_city(city: str, state: str = "FL", key: str | None = None) -> tuple[list[dict], bool]:
    """Enumerate one city via SteadyAPI (location slug 'City-Name_FL', offset += 200 until meta.total)."""
    key = key or os.environ.get("PHOTOS_API")
    if not key or not city:
        return [], False
    slug = f"{city.strip().replace(' ', '-')}_{state}"
    out: list[dict] = []
    total: int | None = None
    for page in range(_MAX_PAGES):
        params = {"location": slug, "offset": page * _SA_PAGE}
        try:
            r = requests.get(f"{STEADYAPI_BASE}/search", params=params,
                             headers={**STEADYAPI_HEADERS, "Authorization": f"Bearer {key}"}, timeout=30)
            if r.status_code != 200:
                return out, False
            data = r.json()
            body = data.get("body") if isinstance(data, dict) else None
            if not isinstance(body, list):
                return out, False
            if not body:
                return out, True
            out.extend(body)
            total = (data.get("meta") or {}).get("total", total)
            if total is not None and (page + 1) * _SA_PAGE >= total:
                return out, True            # reached the printed total
            if len(body) < _SA_PAGE:
                return out, True            # short page = last
        except Exception:
            return out, False
    return out, False


def scan_county_api(county: str) -> dict[str, Any]:
    """Enumerate every seed city for one county via both APIs, parse + scope-filter + merge, and
    return the coverage-guard payload pipeline.py already consumes:
    {rows, exhausted, count, last_status, county_total}. The county is COMPLETE only if every city's
    pull reached natural exhaustion (a cleanly-empty city stays complete; a truncated/blocked one
    does not — so an incomplete pull never manufactures fake withdrawals)."""
    cities = SWFL_CITY_SEED.get(county, [])
    rc_rows: list[dict] = []
    sa_rows: list[dict] = []
    all_ok = True
    for city in cities:
        rc_raw, rc_ok = fetch_rentcast_city(city)
        sa_raw, sa_ok = fetch_steadyapi_city(city)
        all_ok = all_ok and rc_ok and sa_ok
        rc_rows.extend(p for p in (parse_rentcast(x, county) for x in rc_raw) if p)
        sa_rows.extend(p for p in (parse_steadyapi(x, city, "FL") for x in sa_raw) if p)
    rows = [r for r in merge_by_proximity(rc_rows, sa_rows) if r.get("county") == county]
    return {"rows": rows, "exhausted": all_ok, "count": len(rows),
            "last_status": 200 if all_ok else 429, "county_total": len(rows)}
