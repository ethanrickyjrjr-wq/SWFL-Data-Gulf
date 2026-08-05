"""One-shot, RE-RUNNABLE baths backfill for data_lake.listing_state.

Why this exists (07/26/2026): upsert_state's nightly MERGE erased every enriched baths value
until the COALESCE fix landed the same day — 34,139/34,478 rows were NULL-baths. The nightly
enrich lane never revisits known listings (known_ids skip), so existing NULLs stay NULL forever
without this. Re-runnable by design: it targets `baths IS NULL` rows each run, so listings that
miss their one first-seen enrich window (cluster cap, missing key) can be swept again later.

CENTERING FIX (08/05/2026, same-session postmortem): the original shape called
/nearby-home-values on GRID-CELL centers (`_cluster_by_latlon`) — measured live, that returns the
100 nearest properties to an arbitrary point, of which only ~9 were ever OUR null-baths rows
(75/100 carried baths, but they were neighbors, not targets). Yield decayed 5.9 -> 0.6 baths/call
over 2,600 calls (it kept re-walking the same now-exhausted cells), and the radius param is a
proven-dead knob (0.25mi/0.5mi/1mi/2mi returned identical results). Centering on a REMAINING
TARGET's own lat/lon instead of a grid cell fixes the "walking exhausted ground" failure — every
call is now centered where we KNOW at least one unresolved row lives — but does NOT guarantee
that target itself comes back: measured live 08/05/2026, a canary target's own property_id was
ABSENT from its own centered response (0/100 self-match), so the earlier "endpoint always returns
the queried point's own record" read (resolve-subject.ts, 326 Shore Dr) does not generalize — it
depends on local density, same as the grid method. The real win is never re-centering on ground
already swept clean; per-call yield is still bursty (canary: 15 calls, 11 filled, 10 of which came
from a single dense-pocket call). Re-measure the rate over a larger sample before quoting one.

Fetch reuses the audited pipeline pieces; the only new logic is fold_baths_updates. Write is a
narrow UPDATE ... WHERE baths IS NULL — it can never overwrite a real value. Run from repo root:
    .venv/Scripts/python.exe -m ingest.pipelines.listing_lifecycle.backfill_baths --dry-run
    .venv/Scripts/python.exe -m ingest.pipelines.listing_lifecycle.backfill_baths --limit 15   # canary
    .venv/Scripts/python.exe -m ingest.pipelines.listing_lifecycle.backfill_baths --limit 2000  # a chunk
"""
from __future__ import annotations

import argparse
import os
from typing import Any

from ingest.pipelines.listing_lifecycle import distill
from ingest.pipelines.listing_lifecycle.extract_api import (
    STEADYAPI_BASE,
    STEADYAPI_HEADERS,
    _ENRICH_LIMIT,
    _ENRICH_RADIUS,
    _get_with_retry,
)


def fold_baths_updates(props: list[dict], wanted_ids: set[str]) -> list[dict[str, Any]]:
    """Pure: /nearby-home-values properties -> UPDATE payloads for wanted NULL-baths ids.
    First value wins on duplicates (overlapping clusters return the same property twice)."""
    seen: set[str] = set()
    updates: list[dict[str, Any]] = []
    for prop in props:
        pid = str(prop.get("property_id") or "")
        if not pid or pid not in wanted_ids or pid in seen:
            continue
        baths = (prop.get("description") or {}).get("baths")
        if baths is None:
            continue
        try:
            val = float(baths)
        except (TypeError, ValueError):
            continue
        seen.add(pid)
        updates.append({"property_id": pid, "baths": val})
    return updates


def load_null_baths_targets() -> list[dict]:
    """All fillable rows: NULL baths, not land, has property_id + lat/lon. Every source_name —
    the UPDATE keys on property_id and only touches rows still NULL.

    ORDER BY random() (08/05/2026, advisor-flagged): a per-target centered call only self-hits
    ~7% of the time (measured live), so with a fixed order a bounded --limit run would keep
    re-probing the SAME non-resolving front of the list forever with zero forward progress —
    the exact "stuck at cluster 0" failure this rewrite was meant to fix, just at row instead of
    grid-cell granularity. Fresh random order each call means a different slice of targets gets
    centered on every run, so any target that doesn't self-hit still has repeated future chances
    to land as a bonus fill from a nearby dense-pocket call. Wrapped in a subquery because
    Postgres rejects `ORDER BY random()` directly on `SELECT DISTINCT` (the order expression
    must appear in the select list)."""
    with distill._get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select property_id, lat, lon from (
                select distinct property_id, lat, lon from data_lake.listing_state
                where baths is null and property_type <> 'land'
                  and property_id is not null and lat is not null and lon is not null
            ) t
            order by random()
            """
        )
        return [{"property_id": str(r[0]), "lat": r[1], "lon": r[2]} for r in cur.fetchall()]


def apply_updates(updates: list[dict[str, Any]], *, dry_run: bool = False) -> int:
    if not updates or dry_run:
        return 0
    with distill._get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                # Narrow by design: only ever fills a NULL, never overwrites a stored value.
                "update data_lake.listing_state set baths = %(baths)s "
                "where property_id = %(property_id)s and baths is null",
                updates,
            )
        conn.commit()
    return len(updates)


def run(
    *, dry_run: bool = False, limit: int | None = None, max_calls: int = 1000, batch: int = 25,
) -> dict[str, int]:
    targets = load_null_baths_targets()
    wanted_ids = {t["property_id"] for t in targets}
    chunk = targets[:limit] if limit else targets
    print(f"targets={len(targets)} remaining, this_run={len(chunk)} max_calls={max_calls} "
          f"dry_run={dry_run}", flush=True)
    if dry_run:
        return {"targets": len(targets), "calls": 0, "filled": 0}

    key = os.environ.get("PHOTOS_API")
    if not key:
        raise SystemExit("PHOTOS_API not set — refusing to no-op silently (the enrich lane's silent no-key gap is finding #3 of the 07/26 audit)")

    calls = 0
    total_filled = 0
    pending_updates: list[dict[str, Any]] = []
    folded: set[str] = set()
    for i, t in enumerate(chunk):
        if calls >= max_calls:
            print(f"max_calls backstop hit at {calls} — re-run to continue (re-runnable by design)", flush=True)
            break
        if t["property_id"] in folded:
            continue  # already resolved by an earlier call this run — no offset bookkeeping needed
        r, attempts = _get_with_retry(
            f"{STEADYAPI_BASE}/nearby-home-values",
            params={"lat": t["lat"], "lon": t["lon"], "radius": _ENRICH_RADIUS, "limit": _ENRICH_LIMIT},
            headers={**STEADYAPI_HEADERS, "Authorization": f"Bearer {key}"},
        )
        calls += attempts
        if r is None or r.status_code != 200:
            continue
        try:
            props = ((r.json() or {}).get("body") or {}).get("properties") or []
        except Exception:
            continue
        for u in fold_baths_updates(props, wanted_ids):
            if u["property_id"] not in folded:
                folded.add(u["property_id"])
                pending_updates.append(u)
        # Commit incrementally (not one giant batch at the end) — a timeout or crash mid-run
        # keeps whatever already landed instead of losing the whole pass.
        if pending_updates and (i + 1) % batch == 0:
            total_filled += apply_updates(pending_updates)
            pending_updates = []
        print(f"  [{i + 1}/{len(chunk)}] calls={calls} folded={len(folded)} filled={total_filled + len(pending_updates)}",
              flush=True)

    total_filled += apply_updates(pending_updates)
    print(f"done: calls={calls} rows_updated={total_filled} folded_this_run={len(folded)}/{len(chunk)} "
          f"(re-run to continue — no offset bookkeeping, the NULL query naturally advances)", flush=True)
    return {"targets": len(targets), "calls": calls, "filled": total_filled, "folded": len(folded)}


def main() -> None:
    ap = argparse.ArgumentParser(description="Baths backfill via /nearby-home-values, centered on each target's own coords.")
    ap.add_argument("--dry-run", action="store_true", help="show target count; zero calls, zero writes")
    ap.add_argument("--limit", type=int, default=None, help="cap targets attempted this run (chunk / canary)")
    ap.add_argument("--max-calls", type=int, default=1000, help="hard backstop on live API calls this run")
    ap.add_argument("--batch", type=int, default=25, help="commit every N targets (default 25)")
    args = ap.parse_args()
    run(dry_run=args.dry_run, limit=args.limit, max_calls=args.max_calls, batch=args.batch)


if __name__ == "__main__":
    main()
