"""One-time catch-up bridge — flip the Source-B seed into the API feed's source_name so the live brain
(which reads source_name='api_feed') un-orphans the 10,459 seed rows, then the first
`pipeline --source api --catchup` sweep freshens them (stamps property_id/photo, moves gone listings to
holding, inserts new) with is_seed=True.

WHY A SOURCE FLIP AND NOT A RE-KEY (evidence, 2026-06-30):
  The seed's stored address_key ALREADY equals what the hardened SteadyAPI sweep produces for
  short-form rows — verified against 10,161 live Lee+Collier seed rows: every directional is SHORT
  ("2906 NW 22nd Ave" -> "2906NW22NDAVE"), long_quad=0, and distill.address_key_to_street round-trips
  short directionals + ordinals cleanly, so recomputing the hardened key reproduces the SAME key. The
  hardening's directional canon (NORTHEAST->NE) never fires on the seed (no long forms), and the
  COVE/POINT canon cannot fix the ~110 rows whose reconstructed street is glued ("Pelicancove") — those
  stay a known unmatched bucket that inserts as fresh baseline under is_seed=True, harmless. Net:
  re-keying is a matching-noop, so we do NOT churn the key column; we only flip the source_name. The
  earlier "CATCH-UP RE-KEY" warning (address_key.py docstring) assumed the seed carried long forms; the
  live rows refute it. The whole seed lane in listing_TRANSITIONS is left under 'lifecycle_seed' — it is
  all seed=True baseline (excluded from flow metrics), and the api_feed transition history starts clean
  from the catch-up run forward.

WHY is_seed ON THE FIRST SWEEP: see pipeline.run(catchup=...) — the catch-up IS the api_feed baseline;
without the flag every gone/repriced seed row would emit an undate-able transition as fabricated
catch-up-day churn.

ZERO SteadyAPI calls: this migration is pure DB (an UPDATE of source_name). The only call-spend is the
separate `pipeline --source api --catchup` run, which the operator authorizes.

Run:
  python -m ingest.pipelines.listing_lifecycle.catchup --dry-run     # plan only, NO write
  python -m ingest.pipelines.listing_lifecycle.catchup               # execute the flip (0 API calls)
  # then, when authorized: python -m ingest.pipelines.listing_lifecycle.pipeline --source api --catchup
"""
from __future__ import annotations

import argparse
import sys
from typing import Any

from ingest.pipelines.listing_lifecycle import distill
from ingest.pipelines.listing_lifecycle.constants_api import API_SOURCE_NAME

# The catch-up only bridges counties the API sweep actually covers (Lee + Collier = IN_SCOPE_FIPS).
# Seed rows in other counties (Hendry ~298) have no live feed yet and stay under lifecycle_seed
# untouched — a documented scope gap, not a break: widening is adding a county to COUNTY_SEED +
# FIPS to IN_SCOPE_FIPS, then re-running the flip for that county.
CATCHUP_COUNTIES = ("Lee", "Collier")
SEED_SOURCE = distill.SOURCE_NAME  # 'lifecycle_seed'


def summarize_seed(rows: list[dict[str, Any]], counties: tuple[str, ...] = CATCHUP_COUNTIES) -> dict[str, Any]:
    """Pure: the migration plan + the known unmatched floor, over already-loaded seed rows.

    `suffix_mismatch_risk` = in-scope rows whose stored key still holds a long suffix token the sweep
    abbreviates (COVE/POINT) — the one bucket whose seed key will NOT equal the hardened sweep key, so
    they insert as fresh baseline rather than stamping onto an existing row. Reported so the dry-run's
    expected unmatched floor is honest, not a surprise on the first live sweep."""
    in_scope = [r for r in rows if r.get("county") in counties]
    by_county: dict[str, int] = {}
    for r in in_scope:
        by_county[r.get("county")] = by_county.get(r.get("county"), 0) + 1
    suffix_risk = sum(
        1 for r in in_scope
        if "COVE" in (r.get("address_key") or "") or "POINT" in (r.get("address_key") or "")
    )
    return {
        "total_seed": len(rows),
        "in_scope": len(in_scope),
        "out_of_scope": len(rows) - len(in_scope),
        "by_county": by_county,
        "suffix_mismatch_risk": suffix_risk,
        "missing_latlon": sum(1 for r in in_scope if r.get("lat") is None),
        "missing_pid": sum(1 for r in in_scope if not r.get("property_id")),
    }


def decide(summary: dict[str, Any], existing_api_count: int, dry_run: bool) -> dict[str, Any]:
    """Pure guard: what the migration should do given the seed summary + the CURRENT api_feed count.

    Abort (loud, exit 1) if api_feed is already populated — flipping into it risks
    (source_name, address_key, sale_or_rent) unique-key collisions, so a human resolves the prior
    partial run first. Abort if there is nothing in scope. Otherwise dry-run reports, live flips."""
    if existing_api_count > 0:
        return {"action": "abort",
                "reason": f"{API_SOURCE_NAME} already holds {existing_api_count} rows "
                          f"(prior partial run) — resolve collisions manually before flipping"}
    if summary["in_scope"] == 0:
        return {"action": "abort", "reason": "0 in-scope seed rows to migrate — nothing to do"}
    if dry_run:
        return {"action": "dryrun", "count": summary["in_scope"]}
    return {"action": "flip", "count": summary["in_scope"]}


def _flip_source_name(counties: tuple[str, ...]) -> int:
    """Execute the flip: lifecycle_seed -> api_feed for the in-scope counties. An UPDATE (not a
    re-insert) so first_seen / days_on_market / baths and all history ride along untouched."""
    sql = f"""
        UPDATE {distill._STATE_TABLE}
        SET source_name = %s
        WHERE source_name = %s AND county = ANY(%s)
    """
    with distill._get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (API_SOURCE_NAME, SEED_SOURCE, list(counties)))
            n = cur.rowcount
        conn.commit()
    return int(n)


def migrate(*, dry_run: bool = False, counties: tuple[str, ...] = CATCHUP_COUNTIES) -> dict[str, Any]:
    prior = distill.load_current_state(source_name=SEED_SOURCE)
    summary = summarize_seed(list(prior.values()), counties)
    print(f"[catchup] seed summary: {summary}", flush=True)

    existing_api = distill.current_state_count(source_name=API_SOURCE_NAME)
    plan = decide(summary, existing_api, dry_run)

    if plan["action"] == "abort":
        print(f"[abort] {plan['reason']}", flush=True)
        sys.exit(1)

    if plan["action"] == "dryrun":
        print(f"[dry-run] would flip {plan['count']} rows "
              f"({SEED_SOURCE} -> {API_SOURCE_NAME}) for {list(counties)}; NO write.", flush=True)
        print(f"[dry-run] expected unmatched floor on first sweep ~= {summary['suffix_mismatch_risk']} "
              f"COVE/POINT rows (insert as fresh baseline, is_seed=True).", flush=True)
        print("[budget] this migration = 0 SteadyAPI calls (pure DB).", flush=True)
        return {"flipped": 0, "dry_run": True, **summary}

    moved = _flip_source_name(counties)
    print(f"[ok] flipped {moved} rows {SEED_SOURCE} -> {API_SOURCE_NAME}. "
          f"Next: pipeline --source api --catchup (operator-authorized live sweep).", flush=True)
    print("[budget] this migration = 0 SteadyAPI calls (pure DB).", flush=True)
    return {"flipped": moved, "dry_run": False, **summary}


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(
        description="One-time catch-up: flip the Source-B seed into the API feed's source_name (0 API calls)."
    )
    ap.add_argument("--dry-run", action="store_true", help="summarize + plan, no DB write")
    args = ap.parse_args()
    migrate(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
