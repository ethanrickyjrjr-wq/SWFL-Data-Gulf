"""market_aggregates orchestrator — SteadyAPI Layer-B market aggregates (realtor.com origin).

Three resources (see docs/superpowers/specs/2026-06-30-market-cadence-three-tier-design.md):
  histogram   weekly  (~2 calls)  -> data_lake.listing_price_histogram_swfl  (price-distribution-swfl)
  details     monthly (~57 calls) -> data_lake.market_details_swfl           (market-temperature-swfl)
  geo-trends  monthly (~3 calls)  -> data_lake.realtor_geo_medians           (Redfin-retirement
              parallel run, 07/18/2026 — city/county/neighborhood medians off anchor properties;
              cutover decision check realtor_redfin_overlap_cutover)

`--dry-run` makes ZERO network calls and prints the intended call count. Provenance surfaced by the
brains is realtor.com; SteadyAPI (the access layer) is never surfaced.

Run:
  python -m ingest.pipelines.market_aggregates.pipeline --resource histogram  [--dry-run]
  python -m ingest.pipelines.market_aggregates.pipeline --resource details    [--dry-run]
  python -m ingest.pipelines.market_aggregates.pipeline --resource geo-trends [--dry-run]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date

from ingest.lib.guards import ContentContractError
from ingest.quality.contracts import evaluate_batch

from . import db
from .constants import COUNTY_LOCATIONS, GEO_TREND_ANCHORS, swfl_zip_counties
from .resources import (
    fetch_geo_trends,
    fetch_market_details,
    fetch_price_histogram,
    intended_call_counts,
)

_HIST_TABLE = "data_lake.listing_price_histogram_swfl"
_HIST_COLS = ["county", "band_min", "band_max", "band_range", "listing_count",
              "total_listings", "status", "captured_date", "source_tag"]
_HIST_CONFLICT = ["county", "band_min", "captured_date"]

_DET_TABLE = "data_lake.market_details_swfl"
_DET_COLS = ["zip_code", "county", "median_sold_price", "median_listing_price", "median_rent_price",
             "median_days_on_market", "median_price_per_sqft", "local_hotness_score",
             "national_hotness_score", "local_temperature", "national_temperature",
             "hot_market_badge", "hot_market_rank",
             "ratio_of_days_on_market_vs_typical_property_in_county",
             "ratio_of_days_on_market_vs_typical_property_in_us",
             "ratio_of_ldp_views_vs_typical_property_in_county",
             "ratio_of_ldp_views_vs_typical_property_in_us",
             "list_to_sold_ratio_pct", "sold_to_rent_ratio", "market_strength", "is_competitive",
             "captured_date", "source_tag"]
_DET_CONFLICT = ["zip_code", "captured_date"]

_GEO_TABLE = "data_lake.realtor_geo_medians"
_GEO_COLS = ["geo_type", "name", "slug_id", "state_code", "county", "level",
             "median_listing_price", "median_sold_price", "median_days_on_market",
             "median_price_per_sqft", "anchor_label", "anchor_property_id",
             "captured_date", "source_tag"]
_GEO_CONFLICT = ["slug_id", "captured_date"]


def run_histogram(*, dry_run: bool = False, today: str | None = None) -> dict:
    captured = today or str(date.today())
    rows: list[dict] = []
    calls = 0
    for county in COUNTY_LOCATIONS:
        res = fetch_price_histogram(county, captured=captured, dry_run=dry_run)
        rows.extend(res["rows"])
        calls += res["calls"]
    n = db.upsert(_HIST_TABLE, _HIST_COLS, _HIST_CONFLICT, rows, dry_run=dry_run)
    intended = intended_call_counts()["histogram"]
    print(f"[budget] histogram = {calls if not dry_run else intended} price-histogram calls "
          f"(weekly; ~{intended}/run)", flush=True)
    print(f"[done] histogram rows={n} dry_run={dry_run}", flush=True)
    return {"rows": n, "calls": calls}


def run_details(*, dry_run: bool = False, today: str | None = None) -> dict:
    captured = today or str(date.today())
    zips = swfl_zip_counties()
    rows: list[dict] = []
    calls = 0
    for zip_code, county in zips:
        res = fetch_market_details(zip_code, county, captured=captured, dry_run=dry_run)
        if res["row"]:
            rows.append(res["row"])
        calls += res["calls"]
    # ── LOCUS A: content contracts on the whole-batch details load. ─────────────────────
    # THE ONLY clean whole-batch site of the three loci: run_details accumulates `rows` across
    # every ZIP and merges ONCE, so the contamination SHARE here really is a share of the whole
    # load — which is what the abort model assumes. (listing_lifecycle merges per county by
    # design, so its abort has per-county semantics.)
    #
    # policy is `report`: the band drops NOTHING. Withholding a ZIP row changes what
    # market-temperature-swfl ships (47 ZIPs instead of 49) — a live-surface change, ask-first.
    # Check: market_details_band_quarantine_flip.
    #
    # The abort path is for a vendor UNITS FLIP (sold_to_rent_ratio annual -> monthly): the whole
    # fleet goes out of band at once — share+count trips at full scale, if_no_clean_rows backstops
    # a 100%-flipped partial batch under the count floor — and the run STOPS rather than landing
    # ~49 uninterpretable ratios behind a green cron.
    # No gate on run_histogram: listing_price_histogram_swfl carries no content contract.
    rows, quarantined, cstats = evaluate_batch(rows, _DET_TABLE)
    if cstats["abort"]:
        raise ContentContractError(cstats["abort_reason"])
    for c in cstats["contracts"]:
        if c["status"] != "PASS":
            print(f"[contract] {c['name']} {c['status']} — {c['violations']} of "
                  f"{c['in_scope']} in-scope ({c['share_pct']}%) policy={c['policy']}"
                  + (f" detail={c['detail']}" if c.get("detail") else ""), flush=True)
    if quarantined:
        print(f"[contract] QUARANTINED {len(quarantined)} ZIP rows — merging the clean "
              f"{len(rows)}", flush=True)
    n = db.upsert(_DET_TABLE, _DET_COLS, _DET_CONFLICT, rows, dry_run=dry_run)
    intended = intended_call_counts()["details"]
    print(f"[budget] details = {calls if not dry_run else intended} housing-market-details calls "
          f"(monthly; ~{intended}/run)", flush=True)
    print(f"[done] details rows={n} dry_run={dry_run}", flush=True)
    return {"rows": n, "calls": calls}


def run_geo_trends(*, dry_run: bool = False, today: str | None = None) -> dict:
    """Monthly city/county/neighborhood median pull off the anchor properties — the
    Redfin-retirement parallel run (operator-commissioned 07/18/2026). Rows land in
    data_lake.realtor_geo_medians; the overlap-vs-Redfin read is the
    data_lake.realtor_redfin_median_overlap view, decision check
    realtor_redfin_overlap_cutover. Dedupes shared geo blocks (both Lee anchors
    return the same Lee county block) by slug_id before the upsert."""
    captured = today or str(date.today())
    rows: list[dict] = []
    seen: set[str] = set()
    calls = 0
    for label, pid in GEO_TREND_ANCHORS:
        res = fetch_geo_trends(label, pid, captured=captured, dry_run=dry_run)
        calls += res["calls"]
        if not dry_run and not res["rows"]:
            # A stale/unresolvable anchor must be LOUD (see GEO_TREND_ANCHORS note),
            # but one dead anchor must not sink the other cities' rows.
            print(f"[warn] geo_trends anchor '{label}' (pid {pid}) returned no rows — "
                  f"replace the anchor from listing_state", flush=True)
        for r in res["rows"]:
            if r["slug_id"] in seen:
                continue
            seen.add(r["slug_id"])
            rows.append(r)
    n = db.upsert(_GEO_TABLE, _GEO_COLS, _GEO_CONFLICT, rows, dry_run=dry_run)
    intended = intended_call_counts()["geo_trends"]
    print(f"[budget] geo_trends = {calls if not dry_run else intended} "
          f"neighborhood-market-trends calls (monthly; ~{intended}/run)", flush=True)
    print(f"[done] geo_trends rows={n} dry_run={dry_run}", flush=True)
    return {"rows": n, "calls": calls}


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(
        description="SteadyAPI market aggregates (histogram | details | geo-trends).")
    ap.add_argument("--resource", choices=["histogram", "details", "geo-trends"], required=True)
    ap.add_argument("--dry-run", action="store_true",
                    help="fetch nothing (zero network calls), print the intended call count")
    args = ap.parse_args(argv)
    if args.resource == "histogram":
        run_histogram(dry_run=args.dry_run)
    elif args.resource == "geo-trends":
        run_geo_trends(dry_run=args.dry_run)
    else:
        run_details(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
