"""Pure parsers + network fetchers for the two SteadyAPI market aggregates.

Parsers are pure (the unit-test surface, verified against the real 06/30 response shapes). Fetchers
own the single network call each; `dry_run=True` returns an empty result with ZERO network calls so
`--dry-run` is safe to run against the live budget."""
from __future__ import annotations

from typing import Any

from .constants import (
    COUNTY_LOCATIONS,
    GEO_TREND_ANCHORS,
    HISTOGRAM_STATUS,
    SOURCE_TAG,
    swfl_zip_counties,
)
from .steady_client import get_json


def _int(v: Any) -> int | None:
    try:
        return int(round(float(v))) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _num(v: Any) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


# ── price histogram ────────────────────────────────────────────────────────────

def parse_histogram(raw: dict, county: str, captured: str) -> list[dict]:
    """SteadyAPI /price-histogram body -> one row per $50k band. meta.total_listings is stamped on
    every band (constant per county) so the brain reads the county total without a second call."""
    meta = raw.get("meta") or {}
    body = raw.get("body")
    total = _int(meta.get("total_listings"))
    status = meta.get("status")
    status_s = ",".join(status) if isinstance(status, list) else (status or None)
    out: list[dict] = []
    for b in body if isinstance(body, list) else []:
        band_min = _int(b.get("min_price"))
        if band_min is None:
            continue
        out.append({
            "county": county,
            "band_min": band_min,
            "band_max": _int(b.get("max_price")),
            "band_range": b.get("range"),
            "listing_count": _int(b.get("count")) or 0,
            "total_listings": total,
            "status": status_s,
            "captured_date": captured,
            "source_tag": SOURCE_TAG,
        })
    return out


def fetch_price_histogram(county: str, *, captured: str, dry_run: bool = False, key: str | None = None) -> dict:
    """One /price-histogram call for a county. Returns {rows, calls, ok}. dry_run -> zero network."""
    loc = COUNTY_LOCATIONS.get(county)
    if dry_run or not loc:
        return {"rows": [], "calls": 0, "ok": bool(loc)}
    st, data = get_json("price-histogram", {"location": loc, "status[]": HISTOGRAM_STATUS}, key=key)
    if st != 200 or not isinstance(data, dict):
        return {"rows": [], "calls": 1, "ok": False}
    return {"rows": parse_histogram(data, county, captured), "calls": 1, "ok": True}


# ── housing market details (per ZIP) ────────────────────────────────────────────

def parse_market_details(raw: dict, zip_code: str, county: str, captured: str) -> dict | None:
    """SteadyAPI /housing-market-details body -> one flat per-ZIP row. Returns None if the body carries
    no metrics (a gap; never fabricate a row). The net-new field is sold_to_rent_ratio.

    market_comparison + the market_temperature extras were silently dropped until 07/16/2026
    (check market_aggregates_details_dropped_fields) — same paid response, zero extra calls.
    Comparison column names are the vendor's verbatim keys (docs.steadyapi.com collection);
    note the "ratio_of_days_on_market_*" values arrive as signed day DELTAS (e.g. -8), not
    ratios, despite the vendor's key name — stored as written, never reinterpreted."""
    meta = raw.get("meta") or {}
    body = raw.get("body") or {}
    mm = body.get("market_metrics") or {}
    mt = body.get("market_temperature") or {}
    mc = body.get("market_comparison") or {}
    dv = body.get("derived_metrics") or {}
    if not mm and not dv:
        return None
    return {
        "zip_code": zip_code,
        "county": county,
        "median_sold_price": _int(mm.get("median_sold_price")),
        "median_listing_price": _int(mm.get("median_listing_price")),
        "median_rent_price": _int(mm.get("median_rent_price")),
        "median_days_on_market": _int(mm.get("median_days_on_market")),
        "median_price_per_sqft": _int(mm.get("median_price_per_sqft")),
        "local_hotness_score": _num(mt.get("local_hotness_score")),
        "national_hotness_score": _num(mt.get("national_hotness_score")),
        "local_temperature": mt.get("local_temperature"),
        "national_temperature": mt.get("national_temperature"),
        "hot_market_badge": mt.get("hot_market_badge"),
        "hot_market_rank": _int(mt.get("hot_market_rank")),
        "ratio_of_days_on_market_vs_typical_property_in_county": _num(
            mc.get("ratio_of_days_on_market_vs_typical_property_in_county")),
        "ratio_of_days_on_market_vs_typical_property_in_us": _num(
            mc.get("ratio_of_days_on_market_vs_typical_property_in_us")),
        "ratio_of_ldp_views_vs_typical_property_in_county": _num(
            mc.get("ratio_of_ldp_views_vs_typical_property_in_county")),
        "ratio_of_ldp_views_vs_typical_property_in_us": _num(
            mc.get("ratio_of_ldp_views_vs_typical_property_in_us")),
        "list_to_sold_ratio_pct": _num(dv.get("list_to_sold_ratio_percentage")),
        "sold_to_rent_ratio": _num(dv.get("sold_to_rent_ratio")),
        "market_strength": dv.get("market_strength") or meta.get("market_strength"),
        "is_competitive": bool(dv.get("is_competitive_market")),
        "captured_date": captured,
        "source_tag": SOURCE_TAG,
    }


def fetch_market_details(zip_code: str, county: str, *, captured: str, dry_run: bool = False, key: str | None = None) -> dict:
    """One /housing-market-details call for a ZIP. Returns {row, calls}. dry_run -> zero network."""
    if dry_run:
        return {"row": None, "calls": 0}
    st, data = get_json("housing-market-details", {"zipcode": zip_code}, key=key)
    if st != 200 or not isinstance(data, dict):
        return {"row": None, "calls": 1}
    return {"row": parse_market_details(data, zip_code, county, captured), "calls": 1}


# ── neighborhood market trends (city/county/neighborhood medians per anchor) ────

def parse_geo_trends(raw: dict, anchor_label: str, anchor_pid: str, captured: str) -> list[dict]:
    """SteadyAPI /neighborhood-market-trends body -> one row per geo block (city + county +
    each neighborhood). Verbatim vendor medians (median is REAL here — never recomputed).
    A block with no metrics is skipped (a gap; never fabricate a row). Neighborhood rows carry
    the vendor's `level`; city/county rows leave it NULL."""
    body = raw.get("body") or {}
    out: list[dict] = []

    def _row(block: dict, geo_type: str) -> dict | None:
        if not isinstance(block, dict):
            return None
        mm = block.get("market_metrics") or {}
        if not mm:
            return None
        slug = block.get("slug_id")
        name = block.get("name")
        if not slug or not name:
            return None
        return {
            "geo_type": geo_type,
            "name": name,
            "slug_id": slug,
            "state_code": block.get("state_code"),
            "county": block.get("county"),
            "level": block.get("level"),
            "median_listing_price": _int(mm.get("median_listing_price")),
            "median_sold_price": _int(mm.get("median_sold_price")),
            "median_days_on_market": _int(mm.get("median_days_on_market")),
            "median_price_per_sqft": _int(mm.get("median_price_per_sqft")),
            "anchor_label": anchor_label,
            "anchor_property_id": anchor_pid,
            "captured_date": captured,
            "source_tag": SOURCE_TAG,
        }

    for block, geo_type in ((body.get("city"), "city"), (body.get("county"), "county")):
        r = _row(block, geo_type)
        if r:
            out.append(r)
    for nb in body.get("neighborhoods") or []:
        r = _row(nb, "neighborhood")
        if r:
            out.append(r)
    return out


def fetch_geo_trends(anchor_label: str, anchor_pid: str, *, captured: str,
                     dry_run: bool = False, key: str | None = None) -> dict:
    """One /neighborhood-market-trends call for an anchor property. Returns {rows, calls}.
    dry_run -> zero network."""
    if dry_run:
        return {"rows": [], "calls": 0}
    st, data = get_json("neighborhood-market-trends", {"propertyId": anchor_pid}, key=key)
    if st != 200 or not isinstance(data, dict):
        return {"rows": [], "calls": 1}
    return {"rows": parse_geo_trends(data, anchor_label, anchor_pid, captured), "calls": 1}


def intended_call_counts() -> dict:
    """What a live run WOULD cost (printed by --dry-run). histogram = counties; details = in-scope
    ZIPs; geo_trends = anchor properties."""
    return {"histogram": len(COUNTY_LOCATIONS), "details": len(swfl_zip_counties()),
            "geo_trends": len(GEO_TREND_ANCHORS)}
