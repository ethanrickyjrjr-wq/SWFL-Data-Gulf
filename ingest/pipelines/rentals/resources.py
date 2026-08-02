"""Pure parser + paginated fetcher for SteadyAPI /rentals-search.

Parser is pure (the unit-test surface, verified against the real 07/01 response shape — a live 20-row
Naples, FL probe). The fetcher owns the network call; `dry_run=True` makes ZERO network calls so
`--dry-run` is safe to run against the live budget.

Response shape (verified live 07/01/2026): meta.{total,returned,limit,offset}; body[] = {property_id,
price:{min,max,display}, permalink, photo_url, description:{type,beds:{min,max},baths:{min,max},
sqft:{min,max}}, address:{line,city,state,zip,full}}. No lat/lon on rental rows.
"""
from __future__ import annotations

from typing import Any

from .constants import COUNTY_LOCATIONS, PAGE_SIZE, SOURCE_TAG
from .steady_client import get_json

# Approximate live totals (verified 07/01/2026, ~23 real calls this session) — used ONLY to print the
# `--dry-run` intended page count. Live inventory churns day to day; the real run reads the true total
# from meta.total on its first page per county.
APPROX_TOTAL_LISTINGS = {"Lee": 5211, "Collier": 4182}


def _int(v: Any) -> int | None:
    try:
        return int(round(float(v))) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def parse_rentals_page(raw: dict, county: str, captured: str) -> list[dict]:
    """SteadyAPI /rentals-search body -> one row per rental listing. Never fabricates a row: a listing
    missing property_id is dropped (no stable identity to upsert against)."""
    body = raw.get("body")
    out: list[dict] = []
    for r in body if isinstance(body, list) else []:
        property_id = r.get("property_id")
        if not property_id:
            continue
        price = r.get("price") or {}
        desc = r.get("description") or {}
        beds = desc.get("beds") or {}
        baths = desc.get("baths") or {}
        sqft = desc.get("sqft") or {}
        addr = r.get("address") or {}
        out.append({
            "property_id": str(property_id),
            "county": county,
            "zip_code": addr.get("zip"),
            "city": addr.get("city"),
            "address_line": addr.get("line"),
            "property_type": desc.get("type"),
            "price_min": _int(price.get("min")),
            "price_max": _int(price.get("max")),
            "beds_min": _int(beds.get("min")),
            "beds_max": _int(beds.get("max")),
            "baths_min": _int(baths.get("min")),
            "baths_max": _int(baths.get("max")),
            "sqft_min": _int(sqft.get("min")),
            "sqft_max": _int(sqft.get("max")),
            "captured_date": captured,
            "source_tag": SOURCE_TAG,
        })
    return out


def collect_raw_items(raw: dict, county: str) -> list[dict]:
    """Pure: one raw-landing row per listing item in a /rentals-search page — the FULL vendor
    item, not the parsed subset (raw-landing decree 08/02/2026). Items without a property_id are
    skipped (no stable upsert identity — same rule as parse_rentals_page)."""
    body = raw.get("body")
    return [
        {"property_id": str(r["property_id"]), "county": county, "body": r}
        for r in (body if isinstance(body, list) else [])
        if isinstance(r, dict) and r.get("property_id")
    ]


def fetch_rentals_county(
    county: str, *, captured: str, dry_run: bool = False, key: str | None = None,
) -> dict:
    """Paginate /rentals-search to completion for one county. Returns {rows, calls, total, raw}.
    `raw` = full vendor items for the raw landing (empty on dry-run/gap — a failed call must
    never land a body). dry_run -> zero network calls, returns the approximate intended page count."""
    loc = COUNTY_LOCATIONS.get(county)
    if not loc:
        return {"rows": [], "calls": 0, "total": None, "raw": []}
    if dry_run:
        approx_total = APPROX_TOTAL_LISTINGS.get(county, 0)
        pages = -(-approx_total // PAGE_SIZE)  # ceil
        return {"rows": [], "calls": pages, "total": approx_total, "raw": []}

    rows: list[dict] = []
    raw_items: list[dict] = []
    calls = 0
    offset = 0
    total: int | None = None
    while True:
        st, data = get_json("rentals-search", {"location": loc, "offset": offset}, key=key)
        calls += 1
        if st != 200 or not isinstance(data, dict):
            break
        meta = data.get("meta") or {}
        total = _int(meta.get("total"))
        returned = _int(meta.get("returned")) or 0
        rows.extend(parse_rentals_page(data, county, captured))
        raw_items.extend(collect_raw_items(data, county))
        if returned < PAGE_SIZE or total is None or offset + returned >= total:
            break
        offset += PAGE_SIZE
    return {"rows": rows, "calls": calls, "total": total, "raw": raw_items}


def intended_call_counts() -> dict:
    """What a live full sweep WOULD cost (printed by --dry-run), from the last measured totals."""
    return {
        county: -(-total // PAGE_SIZE)  # ceil
        for county, total in APPROX_TOTAL_LISTINGS.items()
    }
