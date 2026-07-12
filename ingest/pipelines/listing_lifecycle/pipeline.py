"""Orchestrator for the listing lifecycle state machine — SEED once, then daily tick + diff.

Per county: scan_county (full active walk) -> coverage_guard.scan_is_complete -> diff_states
(is_seed when we hold no prior state for that county) -> distill.upsert_state + append_transitions.

The operator's model: seed the bulk once; thereafter every listing still on the market ages a day
(DOM = days in the current active spell, ticked by diff_states); a listing that leaves the active
feed moves to HOLDING (never deleted); if it reappears it comes back out of holding (a relist). We
persist ONLY the changes — unchanged listings just age. Fail loud only if EVERY county returns 0.

Run:
  python -m ingest.pipelines.listing_lifecycle.pipeline [--dry-run] [--county NAME]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timezone

from ingest.lib.guards import ContentContractError
from ingest.quality.contracts import evaluate_batch
from ingest.pipelines.listing_lifecycle import distill
from ingest.pipelines.listing_lifecycle.distill import address_key_to_street
from ingest.pipelines.listing_lifecycle.address_key import address_key
from ingest.pipelines.listing_lifecycle.coverage_guard import scan_is_complete
from ingest.pipelines.listing_lifecycle.constants_api import API_SOURCE_NAME, SOLD_CHECK_CAP
from ingest.pipelines.listing_lifecycle.extract import SWFL_COUNTIES, scan_county
from ingest.pipelines.listing_lifecycle.extract_api import scan_county_api, fetch_sold_event
from ingest.pipelines.listing_lifecycle.transitions import (
    apply_off_market_resolutions,
    apply_price_recheck_results,
    diff_states,
    plan_off_market_checks,
    plan_price_rechecks,
)

# Counties the API feed covers (SteadyAPI scope gate = IN_SCOPE_FIPS). Hendry added 2026-07-02
# (operator call): its first scan holds no prior api_feed state, so diff_states auto-baselines it
# as is_seed — no catchup flip needed; the 298 stale lifecycle_seed Hendry rows stay inert history.
API_COUNTIES = ["Lee", "Collier", "Hendry"]


def _keyed_scan(rows: list[dict]) -> dict[tuple[str, str], dict]:
    """Build the diff's `scanned` dict keyed on (address_key, sale_or_rent). Source B is the active
    for-sale feed, so every card is state='active'; the source identity is composite (region:mls)."""
    out: dict[tuple[str, str], dict] = {}
    for r in rows:
        r["state"] = "active"
        # API rows carry their own listing_id (RentCast id / SteadyAPI property_id); the scrape rows
        # don't, so fall back to the composite (region:mls) source identity for those.
        r["listing_id"] = r.get("listing_id") or f"{r.get('mls_region')}:{r.get('mls')}"
        ak = address_key(r.get("street_address") or "", r.get("zip_code") or "")
        r["street_address"] = address_key_to_street(ak)
        out[(ak, r.get("sale_or_rent") or "sale")] = r
    return out


def run(*, dry_run: bool = False, only_county: str | None = None,
        today: str | None = None, source: str = "api", catchup: bool = False) -> dict:
    """`catchup=True` is the ONE-TIME bridge run after catchup.migrate flips the seed into api_feed:
    it FORCES is_seed=True so the first diff against the freshly-migrated seed stamps every emitted
    transition seed=True. Without it, prior is non-empty (10k migrated rows) → is_seed=False → every
    seed listing gone from the live sweep flips to holding with seed=False, and every price that
    differs from the sweep emits a real price-delta — a fabricated churn spike dated catch-up day, in
    exactly the flow metrics this platform refuses to fake. The catch-up IS the api_feed baseline;
    real flow starts from the NEXT steady-state run."""
    today = today or str(date.today())
    # The ONLY swapped part is the extractor + the source identity it lands under; the diff engine,
    # DB layer, coverage guard and state shape are reused unchanged (capture wide, slice late).
    src_name = API_SOURCE_NAME if source == "api" else distill.SOURCE_NAME
    scan = scan_county_api if source == "api" else scan_county
    counties = [only_county] if only_county else (API_COUNTIES if source == "api" else SWFL_COUNTIES)
    prior_all = distill.load_current_state(source_name=src_name)
    totals = {"scanned": 0, "upserts": 0, "transitions": 0}
    budget_calls = 0
    sold_budget_remaining = SOLD_CHECK_CAP  # paid /property-tax-history calls left this run (shared across counties)
    for county in counties:
        if source == "api":
            # Budget-bomb fix: thread this county's prior property_ids so enrichment only ever
            # fires for listings we don't already hold — and skip the network in dry_run so
            # `--dry-run` can't detonate the live call budget (it used to: scan() ran enrich_new
            # unconditionally, before dry_run was ever checked).
            known_ids = {v.get("property_id") for v in prior_all.values()
                         if v.get("county") == county and v.get("property_id")}
            result = scan_county_api(county, known_ids, dry_run=dry_run)
            budget_calls += result.get("search_calls", 0) + result.get("enrich_calls", 0)
        else:
            result = scan(county)
        rows = result["rows"]
        totals["scanned"] += len(rows)
        prior = {k: v for k, v in prior_all.items() if v.get("county") == county}
        # catchup forces the baseline stamp: the migrated seed makes prior non-empty, but this run IS
        # the api_feed baseline, so its transitions must be seed=True (no fabricated catch-up-day churn).
        # The `--catchup` flag alone is a hole the daily cron can't fill (it has no such input), so also
        # detect the baseline structurally: zero prior transitions for this source => this run IS the
        # first diff, regardless of how listing_state got populated. This is what would have prevented
        # the 2026-07-01 SteadyAPI cutover from stamping 25,616 rows as real flow. The instant any real
        # transition exists, every later run is steady-state.
        is_seed = catchup or len(prior) == 0 or distill.transition_count(source_name=src_name) == 0
        complete, why = scan_is_complete(
            {"exhausted": result["exhausted"], "count": len(rows), "last_status": result["last_status"]},
            last_trusted_count=(len(prior) or None),
            baseline_total=result.get("county_total"),  # cap-aware: flag a seed far below the printed total
        )
        if not complete:
            print(f"[skip] {county}: untrustworthy scan ({why}) — no diff emitted", flush=True)
            continue
        scanned = _keyed_scan(rows)
        ups, trans = diff_states(prior, scanned, today, scan_complete=complete, is_seed=is_seed)
        for u in ups:
            u.setdefault("county", county)
            if source != "api":
                # Scrape cards carry no real DOM, so the days-in-active-spell tick stands in for it.
                u["days_on_market"] = u.get("days_in_state")
            # API path: keep the row's own days_on_market — REAL (RentCast) or None (SteadyAPI-only).
            # NEVER fall back to days_in_state (0 on the seed): the view's avg(days_on_market) must
            # reflect only sourced DOM, else every photo-only listing fakes a 0-day average.

        # Off-market hook (Phase-2 Part A): resolve a budget-sampled subset of this county's ambiguous
        # `holding` departures (+ aged prior holdings) into `sold`/`withdrawn` via one live
        # /property-tax-history probe each. LIVE api runs only — never on --dry-run (must fire zero
        # network calls, mirrors the enrich dry-run fix) and never on a seed/catch-up baseline sweep.
        res_stats: dict | None = None
        checked_at = datetime.now(timezone.utc)
        if source == "api" and not dry_run and not is_seed and sold_budget_remaining > 0:
            checks, plan_stats = plan_off_market_checks(ups, trans, prior, today, cap=sold_budget_remaining)
            resolutions = [fetch_sold_event(c["property_id"], since=c["since"], at=today) for c in checks]
            res_stats = apply_off_market_resolutions(ups, trans, checks, resolutions, prior, today)
            budget_calls += len(checks)
            sold_budget_remaining -= len(checks)
            print(f"[sold] {county}: probed={len(checks)} sold={res_stats['sold']} "
                  f"withdrawn={res_stats['withdrawn']} holding={res_stats['holding_unresolved']} "
                  f"(dep={plan_stats['departures_checked']}/{plan_stats['departures_available']} "
                  f"recheck={plan_stats['rechecks_checked']}/{plan_stats['rechecks_available']} "
                  f"dropped={plan_stats['dropped']}; priority=list_price desc -> sold set skews "
                  f"higher-value)", flush=True)

        # ── LOCUS A: content contracts, on the batch that ACTUALLY LANDS. ────────────────
        # HERE, and not at diff_states: ups/trans are mutated in place between the two
        # (county/days_on_market set above; apply_off_market_resolutions rewrites states to
        # sold/withdrawn and attaches sold_price). A gate at diff_states would evaluate a
        # batch that is not the one that lands.
        #
        # ctx carries source_name: it is NOT a batch-row column (distill._STATE_COLS omits it;
        # upsert_state injects it as a scalar), so without ctx the price floor's
        # `source_name = 'api_feed'` predicate is unevaluable at this locus.
        #
        # evaluate_batch is PURE — it never raises. Abort comes back as data and the raise
        # happens here, in the orchestrator, which is the only place that knows what a run is.
        # COVERAGE GAP, stated: this gates upsert_state only. append_transitions (whose
        # _TRANS_COLS carries price/price_delta/sold_price) and update_sold_price (a targeted
        # out-of-band UPDATE guarded only by `sold_price > 0`) carry the same price class and
        # are NOT gated. Check: listing_lifecycle_ungated_write_paths.
        ups, quarantined, cstats = evaluate_batch(
            ups, "data_lake.listing_state", ctx={"source_name": src_name}
        )
        if cstats["abort"]:
            raise ContentContractError(cstats["abort_reason"])
        for c in cstats["contracts"]:
            if c["status"] != "PASS":
                print(f"[contract] {county}: {c['name']} {c['status']} — "
                      f"{c['violations']} of {c['in_scope']} in-scope ({c['share_pct']}%) "
                      f"policy={c['policy']}"
                      + (f" detail={c['detail']}" if c.get("detail") else ""), flush=True)
        if quarantined:
            print(f"[contract] {county}: QUARANTINED {len(quarantined)} rows — "
                  f"merging the clean {len(ups):,}", flush=True)

        n_u = distill.upsert_state(ups, source_name=src_name, dry_run=dry_run)
        n_t = distill.append_transitions(trans, source_name=src_name, dry_run=dry_run)
        # Stamp sold_check_at via a targeted UPDATE AFTER the MERGE (rows must exist), so it never bumps
        # last_seen — the holding-age anchor the re-check reads (see distill.stamp_sold_checked).
        if res_stats and res_stats["checked_keys"]:
            distill.stamp_sold_checked(res_stats["checked_keys"], source_name=src_name,
                                       checked_at=checked_at, dry_run=dry_run)
        totals["upserts"] += n_u
        totals["transitions"] += n_t
        print(f"[ok] {county}: scanned={len(rows)} seed={is_seed} upserts={n_u} transitions={n_t} ({why})", flush=True)
    # Sold-price backfill (approved 07/02/2026): sold rows captured with a 0/absent price (deed not
    # yet recorded, or an undisclosed land-trust sale) get ONLY the budget the county loop left over —
    # departures + holding re-checks always eat first, so backfill can never crowd out fresh sold
    # detection. Runs AFTER the loop precisely so "leftover" is global, not per-county. The stats line
    # is the instrumentation the build decision rests on: recovered vs still_pending over the next few
    # weeks IS the measured $0→priced recovery rate.
    if source == "api" and not dry_run and not catchup and sold_budget_remaining > 0:
        pending = distill.load_price_pending_solds(source_name=src_name)
        bf_checks, bf_plan = plan_price_rechecks(pending, today, cap=sold_budget_remaining)
        if bf_checks:
            bf_res = [fetch_sold_event(c["property_id"], since=c["since"], at=today) for c in bf_checks]
            applied = apply_price_recheck_results(bf_checks, bf_res)
            distill.update_sold_price(applied["upgrades"], source_name=src_name, dry_run=dry_run)
            if applied["checked_keys"]:
                distill.stamp_sold_checked(applied["checked_keys"], source_name=src_name, dry_run=dry_run)
            budget_calls += len(bf_checks)
            sold_budget_remaining -= len(bf_checks)
        if bf_plan["candidates"]:
            print(f"[backfill] price-pending={bf_plan['candidates']} eligible={bf_plan['eligible']} "
                  f"probed={bf_plan['checked']} recovered={applied['recovered'] if bf_checks else 0} "
                  f"still_pending={applied['still_pending'] if bf_checks else 0} "
                  f"(leftover budget only)", flush=True)

    if source == "api":
        print(f"[budget] this run = {budget_calls} SteadyAPI calls "
              f"(10,000/mo Starter cap; ~4,700/mo steady-state target)", flush=True)
    print(f"[done] {totals} dry_run={dry_run} source={source}", flush=True)
    if totals["scanned"] == 0:
        print("[fatal] every county returned 0 rows — failing loud (no silent fake-green)", flush=True)
        sys.exit(1)
    return totals


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows console: crawl4ai emits unicode
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="Listing lifecycle scan/diff (API feed | Source-B scrape).")
    ap.add_argument("--dry-run", action="store_true", help="extract + diff, print, no DB write")
    ap.add_argument("--county", help="scan one county only (e.g. Lee)")
    ap.add_argument("--source", choices=["api", "scrape"], default="api",
                    help="api = SteadyAPI sole spine (default); scrape = legacy Source-B crawl4ai")
    ap.add_argument("--catchup", action="store_true",
                    help="ONE-TIME first sweep after catchup.migrate: force is_seed=True (baseline stamp)")
    args = ap.parse_args()
    run(dry_run=args.dry_run, only_county=args.county, source=args.source, catchup=args.catchup)


if __name__ == "__main__":
    main()
