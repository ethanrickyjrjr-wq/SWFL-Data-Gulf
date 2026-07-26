"""One-shot, RE-RUNNABLE baths backfill for data_lake.listing_state.

Why this exists (07/26/2026): upsert_state's nightly MERGE erased every enriched baths value
until the COALESCE fix landed the same day — 34,139/34,478 rows were NULL-baths. The nightly
enrich lane never revisits known listings (known_ids skip), so existing NULLs stay NULL forever
without this. Re-runnable by design: it targets `baths IS NULL` rows each run, so listings that
miss their one first-seen enrich window (cluster cap, missing key) can be swept again later.

Fetch/cluster reuse the audited pipeline pieces; the only new logic is fold_baths_updates
(tested in test_backfill_baths.py). Write is a narrow UPDATE ... WHERE baths IS NULL — it can
never overwrite a real value. Run from repo root:
    .venv/Scripts/python.exe -m ingest.pipelines.listing_lifecycle.backfill_baths --dry-run
    .venv/Scripts/python.exe -m ingest.pipelines.listing_lifecycle.backfill_baths
"""
from __future__ import annotations

import argparse
import os
import time
from typing import Any

from ingest.pipelines.listing_lifecycle import distill
from ingest.pipelines.listing_lifecycle.extract_api import (
    STEADYAPI_BASE,
    STEADYAPI_HEADERS,
    _ENRICH_LIMIT,
    _ENRICH_RADIUS,
    _cluster_by_latlon,
    _get_with_retry,
)

# SteadyAPI is rate-limited to 1 req/s — pace every live call.
_CALL_SPACING_S = 1.1


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
    the UPDATE keys on property_id and only touches rows still NULL."""
    with distill._get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select distinct property_id, lat, lon from data_lake.listing_state
            where baths is null and property_type <> 'land'
              and property_id is not null and lat is not null and lon is not null
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


def run(*, dry_run: bool = False, max_calls: int = 1000) -> dict[str, int]:
    targets = load_null_baths_targets()
    wanted_ids = {t["property_id"] for t in targets}
    clusters = _cluster_by_latlon(targets)
    print(f"targets={len(targets)} clusters={len(clusters)} max_calls={max_calls} dry_run={dry_run}")
    if dry_run:
        return {"targets": len(targets), "clusters": len(clusters), "calls": 0, "filled": 0}

    key = os.environ.get("PHOTOS_API")
    if not key:
        raise SystemExit("PHOTOS_API not set — refusing to no-op silently (the enrich lane's silent no-key gap is finding #3 of the 07/26 audit)")

    calls = 0
    all_updates: list[dict[str, Any]] = []
    folded: set[str] = set()
    for lat, lon in clusters:
        if calls >= max_calls:
            print(f"max_calls backstop hit at {calls} — re-run to continue (re-runnable by design)")
            break
        r, attempts = _get_with_retry(
            f"{STEADYAPI_BASE}/nearby-home-values",
            params={"lat": lat, "lon": lon, "radius": _ENRICH_RADIUS, "limit": _ENRICH_LIMIT},
            headers={**STEADYAPI_HEADERS, "Authorization": f"Bearer {key}"},
        )
        calls += attempts
        time.sleep(_CALL_SPACING_S)
        if r is None or r.status_code != 200:
            continue
        try:
            props = ((r.json() or {}).get("body") or {}).get("properties") or []
        except Exception:
            continue
        for u in fold_baths_updates(props, wanted_ids):
            if u["property_id"] not in folded:
                folded.add(u["property_id"])
                all_updates.append(u)
        if calls % 50 < attempts:
            print(f"  progress: {calls} calls, {len(all_updates)} baths folded")

    filled = apply_updates(all_updates)
    print(f"done: calls={calls} folded={len(all_updates)} rows_updated={filled}")
    return {"targets": len(targets), "clusters": len(clusters), "calls": calls, "filled": filled}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-calls", type=int, default=1000)
    args = ap.parse_args()
    run(dry_run=args.dry_run, max_calls=args.max_calls)
