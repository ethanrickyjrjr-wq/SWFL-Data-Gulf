"""One-time DOM de-flooring backfill — probe /property-tax-history for the vendor `list_date` of
active for-sale listings that have none, and fold it onto listing_state via a TARGETED UPDATE.

WHY THIS EXISTS
    `/search` (the weekly sweep) never returns `list_date` (verified 07/07/2026, extract_api.py). So
    for ~80% of the active book — everything first seen on/before the 07/03/2026 coverage boundary —
    listing_dom.dom_days falls back to `first_seen`, a censored FLOOR ("138+ days"), and dom_is_floor
    is true. The vendor list date lives ONLY on the per-property /property-tax-history endpoint (inside
    property_history[].listing.list_date). We already parse it there (_pick_listed_date), we just never
    call that endpoint for still-active listings. This backfill does exactly that, once.

    Once listed_date lands, listing_dom de-floors the row automatically: its spell_anchor precedence
    puts listed_date first, and dom_is_floor requires listed_date IS NULL. No view change needed.

DESK-SAFE BY CONSTRUCTION (the operator's load-bearing constraint — "no 24,000 changes on the desk,
nothing looks like a new listing today"):
    The ONLY write is distill.update_listed_date — a targeted `UPDATE listing_state SET listed_date=…
    WHERE … AND listed_date IS NULL`. It writes exactly one column. It does NOT:
      • emit any listing_transitions row      → the /desk's movers/activity board (reads
        listing_transitions) sees nothing;
      • bump last_seen or scraped_at          → the /desk's "moved today" freshness sees nothing;
      • insert / reset first_seen             → no row can read as new (first_seen is insert-only);
      • run through diff_states               → and diff_states only diffs state+list_price, never
        listed_date, so this can't manufacture a phantom transition on the next daily sweep either.
    This job never touches the diff/upsert/transition path. That is the whole safety guarantee.

IDEMPOTENT + RESUMABLE: the target query filters `listed_date IS NULL`, and update_listed_date guards
the same, so a done row is excluded from every later run. Re-run with --limit to chunk; each run just
continues where the last stopped. No offset bookkeeping.

Run:
  python -m ingest.pipelines.listing_lifecycle.backfill_listed_date --dry-run          # DB read only, 0 calls
  python -m ingest.pipelines.listing_lifecycle.backfill_listed_date --limit 15         # canary
  python -m ingest.pipelines.listing_lifecycle.backfill_listed_date --limit 2000       # a chunk
  python -m ingest.pipelines.listing_lifecycle.backfill_listed_date --county Lee       # scope one county
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from typing import Any

from ingest.pipelines.listing_lifecycle import distill
from ingest.pipelines.listing_lifecycle.constants_api import API_SOURCE_NAME
from ingest.pipelines.listing_lifecycle.extract_api import fetch_sold_event

_STATE_TABLE = distill._STATE_TABLE  # data_lake.listing_state


def select_targets(
    *, source_name: str = API_SOURCE_NAME, limit: int | None = None, county: str | None = None,
) -> list[dict[str, Any]]:
    """Active for-sale listings with NO vendor list date and a probe-able property_id — the floored
    (or list_date-less) set. Ordered oldest-first (first_seen ASC): the longest-sitting listings are
    both the most censored and the most valuable to de-floor (a real '200 days' is the whole point).
    Read-only; returns [] on a missing/empty table (ODD-tolerant)."""
    where = [
        "source_name = %(src)s",
        "state = 'active'",
        "sale_or_rent = 'sale'",
        "listed_date IS NULL",
        "property_id IS NOT NULL",
        "zip_code IS NOT NULL",
    ]
    params: dict[str, Any] = {"src": source_name}
    if county:
        where.append("county = %(county)s")
        params["county"] = county
    sql = (
        f"SELECT address_key, sale_or_rent, property_id, zip_code, county, first_seen "
        f"FROM {_STATE_TABLE} WHERE {' AND '.join(where)} "
        f"ORDER BY first_seen ASC NULLS FIRST"
    )
    if limit is not None:
        sql += f" LIMIT {int(limit)}"
    cols = ["address_key", "sale_or_rent", "property_id", "zip_code", "county", "first_seen"]
    try:
        with distill._get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception as e:  # pragma: no cover — surfaced loud, never a silent empty
        print(f"[backfill-dom] target read failed: {e}", flush=True)
        return []


def remaining_count(*, source_name: str = API_SOURCE_NAME, county: str | None = None) -> int:
    """How many floored/list_date-less active rows are still un-backfilled (for progress logging)."""
    targets = select_targets(source_name=source_name, limit=None, county=county)
    return len(targets)


def fold_updates(
    targets: list[dict[str, Any]], resolutions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """PURE: pair each target with its probe result and build the update_listed_date input. We take
    ONLY `listed_date` from each resolution and ignore the sold/holding/withdrawn classification
    entirely — this job writes one column and never a state/transition. `resolutions[i]` corresponds
    to `targets[i]`. A result with no listed_date (no 'Listed' event, or an API gap) is skipped, and
    its row stays floored until a later run re-probes it (still listed_date IS NULL)."""
    updates: list[dict[str, Any]] = []
    stats = {"probed": len(targets), "wrote": 0, "no_list_date": 0, "gap": 0}
    for tgt, res in zip(targets, resolutions):
        res = res or {}
        if res.get("outcome") == "gap":
            stats["gap"] += 1
        listed_date = res.get("listed_date")
        if not listed_date:
            stats["no_list_date"] += 1
            continue
        updates.append({
            "key": (tgt["address_key"], tgt["sale_or_rent"]),
            "listed_date": listed_date,
        })
        stats["wrote"] += 1
    return updates, stats


def run(
    *, dry_run: bool = False, limit: int | None = None, county: str | None = None,
    today: str | None = None, batch: int = 200,
) -> dict[str, Any]:
    today = today or str(date.today())
    src = API_SOURCE_NAME

    if dry_run:
        # Show the target set WITHOUT a single network call or write.
        preview = select_targets(source_name=src, limit=limit, county=county)
        total = remaining_count(source_name=src, county=county)
        by_zip: dict[str, int] = {}
        for t in preview:
            by_zip[t["zip_code"]] = by_zip.get(t["zip_code"], 0) + 1
        print(
            f"[backfill-dom] DRY RUN — {len(preview)} target(s) this pass, {total} total floored/"
            f"list_date-less active rows remaining{f' in {county}' if county else ''}. "
            f"Zero calls, zero writes.",
            flush=True,
        )
        for t in preview[:10]:
            print(f"    {t['county']:>8} {t['zip_code']}  {t['address_key']}  pid={t['property_id']} "
                  f"first_seen={t['first_seen']}", flush=True)
        if len(preview) > 10:
            print(f"    … +{len(preview) - 10} more", flush=True)
        return {"dry_run": True, "targets": len(preview), "remaining": total}

    targets = select_targets(source_name=src, limit=limit, county=county)
    if not targets:
        print("[backfill-dom] nothing to backfill — every active row already has a list date.", flush=True)
        return {"probed": 0, "wrote": 0}

    totals = {"probed": 0, "wrote": 0, "no_list_date": 0, "gap": 0}
    # Probe + write in batches so a long run commits incrementally (resumable on interrupt). Pacing
    # (~1 req/s) is enforced module-wide inside fetch_sold_event -> _get_with_retry -> _pace.
    for i in range(0, len(targets), batch):
        chunk = targets[i:i + batch]
        resolutions = [
            fetch_sold_event(str(t["property_id"]), since=today, at=today) for t in chunk
        ]
        updates, stats = fold_updates(chunk, resolutions)
        distill.update_listed_date(updates, source_name=src, dry_run=False)
        for k in totals:
            totals[k] += stats[k]
        print(
            f"[backfill-dom] chunk {i // batch + 1}: probed={stats['probed']} wrote={stats['wrote']} "
            f"no_list_date={stats['no_list_date']} gap={stats['gap']}  "
            f"(running: wrote={totals['wrote']}/{totals['probed']})",
            flush=True,
        )

    remaining = remaining_count(source_name=src, county=county)
    print(
        f"[backfill-dom] DONE this run — probed={totals['probed']} wrote={totals['wrote']} "
        f"no_list_date={totals['no_list_date']} gap={totals['gap']}; ~{remaining} still remaining. "
        f"Wrote via update_listed_date ONLY (0 transitions, 0 last_seen/scraped_at touches).",
        flush=True,
    )
    return {**totals, "remaining": remaining}


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="De-floor active DOM by backfilling vendor listed_date.")
    ap.add_argument("--dry-run", action="store_true", help="show targets; zero calls, zero writes")
    ap.add_argument("--limit", type=int, default=None, help="cap probes this run (chunk / canary)")
    ap.add_argument("--county", help="scope one county (Lee | Collier | Hendry)")
    ap.add_argument("--batch", type=int, default=200, help="commit every N probes (default 200)")
    args = ap.parse_args()
    run(dry_run=args.dry_run, limit=args.limit, county=args.county, batch=args.batch)


if __name__ == "__main__":
    main()
