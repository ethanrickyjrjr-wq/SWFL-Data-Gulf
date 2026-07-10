"""SWFL corridor pulse — weekly current-events capture -> Tier-1 cold + Tier-2 distilled (Build #2).

Corridor-grained, weekly sibling of ingest/pipelines/city_pulse. Per corridor: the
free news lake (data_lake.news_articles_swfl, crawl4ai-fed by the news_swfl
pipeline) is matched against the corridor's road name (ingest.lib.pulse_match)
and packed into the capture shape distill.py already consumes. The raw
matched-article set + flattened citations[] is written to Tier-1 cold storage;
distill.py then turns it into citation-backed rows in data_lake.city_pulse_corridors.

Retrofit (Phase 1, 07/07/2026): replaces the paid web_search_20250305 capture
(dead code removed) with the $0 lake-read capture. See
docs/superpowers/plans/2026-07-07-pulse-intelligence-engine/01-phase1-plan.md.

Grain: the 25 verified CRE corridors in public.corridor_profiles (live runtime
authority). Live runs key every row on `corridor_name`. A --dry-run with no DB falls
back to fixtures/corridor-centroids.json (keyed on corridor_label) so the path is
exercisable offline — that fallback NEVER writes.

Distill is SYNCHRONOUS (one forced-tool call per corridor) — 25 corridors/week does
not justify the Batch API poll loop (Build #2 decision).

Env: ANTHROPIC_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_KEY +
DESTINATION__POSTGRES__CREDENTIALS.

CLI:
  python -m ingest.pipelines.city_pulse_corridors.pipeline
  python -m ingest.pipelines.city_pulse_corridors.pipeline --dry-run
  python -m ingest.pipelines.city_pulse_corridors.pipeline --corridor "Immokalee Rd North Naples"
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env.local")

from ingest.lib.api_usage import RunBudget, RunBudgetExceeded  # noqa: E402
from ingest.lib.geo_ladder import annotate_geo  # noqa: E402
from ingest.lib.pulse_lake import build_capture, known_urls_by_unit, load_recent_articles  # noqa: E402
from ingest.lib.storage_uploader import _upload_bytes  # noqa: E402
from ingest.lib.tier1_inventory import (  # noqa: E402
    _get_connection,
    upsert_inventory_row,
)
from ingest.pipelines.city_pulse_corridors.distill import (  # noqa: E402
    distill_capture, write_rows, prune_expired, reconcile_supersession,
)

MODEL = "claude-sonnet-4-6"
BUCKET = "lake-tier1"
PACK_ID = "corridor-pulse-swfl"

CENTROIDS_FIXTURE = Path(__file__).resolve().parents[3] / "fixtures" / "corridor-centroids.json"


def build_corridor_capture(
    corridor: str, run_at: str, articles: list, exclude_urls=frozenset()
) -> dict:
    """Lake-fed replacement for run_corridor_search: no paid web_search, no API call.
    exclude_urls = articles already distilled for this corridor (skip before the paid call)."""
    return build_capture("corridor", corridor, run_at, articles, exclude_urls)


def slug(corridor: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", corridor.lower()).strip("-")


def get_corridors(corridor_filter: str | None = None) -> list[str]:
    """Fetch verified corridor_name values from public.corridor_profiles (the live
    runtime authority). Mirrors ingest/pipelines/corridor_grounded/pipeline.py."""
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            if corridor_filter:
                cur.execute(
                    "SELECT corridor_name FROM corridor_profiles "
                    "WHERE corridor_name = %s AND deleted_at IS NULL "
                    "AND verification_status = 'verified'",
                    (corridor_filter,),
                )
            else:
                cur.execute(
                    "SELECT corridor_name FROM corridor_profiles "
                    "WHERE deleted_at IS NULL AND verification_status = 'verified' "
                    "ORDER BY city, corridor_name"
                )
            return [r[0] for r in cur.fetchall()]
    finally:
        conn.close()


def _fixture_corridors() -> list[str]:
    """Dry-run fallback corridor list from fixtures/corridor-centroids.json, keyed on
    corridor_label. NOTE: corridor_label is an APPROXIMATION of corridor_name and is
    used ONLY when the DB is unreachable under --dry-run, which never writes rows."""
    data = json.loads(CENTROIDS_FIXTURE.read_text(encoding="utf-8"))
    return [row["corridor_label"] for row in data]


def resolve_corridors(corridor_arg: str | None, dry_run: bool) -> list[str]:
    """Resolve the corridor work-list. Live mode keys on corridor_name from the DB
    and RAISES if the DB is unreachable (a corridor pulse with no corridors is a real
    failure). Only --dry-run falls back to the fixture labels."""
    if corridor_arg:
        return [corridor_arg]
    try:
        corridors = get_corridors()
    except Exception as exc:
        if dry_run:
            print(f"  -> corridor_profiles unreachable ({exc!r}); --dry-run fixture fallback")
            return _fixture_corridors()
        raise
    if not corridors and dry_run:
        return _fixture_corridors()
    return corridors


def to_ndjson(records: list[dict[str, Any]]) -> bytes:
    return ("\n".join(json.dumps(r, ensure_ascii=False) for r in records) + "\n").encode("utf-8")


def tier1_path(corridor: str, run_key: str, yyyy: str, mm: str) -> str:
    return f"city_pulse_corridors/{slug(corridor)}/year={yyyy}/month={mm}/run-{run_key}.ndjson"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corridor", metavar="NAME",
                        help="Run a single corridor by exact corridor_name.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Run search + distill; print rows, skip Tier-1 upload and DB write.")
    args = parser.parse_args(argv)

    corridors = resolve_corridors(args.corridor, args.dry_run)
    if not corridors:
        raise RuntimeError("corridor_pulse: no corridors resolved — investigate corridor_profiles.")

    now = datetime.now(timezone.utc)
    run_at = now.isoformat()
    run_key = now.strftime("%Y%m%dT%H%M%SZ")
    yyyy, mm = f"{now.year:04d}", f"{now.month:02d}"

    # Hard run budget (operator guard 07/05/2026): the retrofit's only paid call
    # left is the Sonnet distill (~$0.03-0.07/unit), so ~25 corridors structurally
    # ceilings well under $1. Crossing it = misbehaving run — abort loudly
    # rather than drain the account. Override: CORRIDOR_PULSE_MAX_USD.
    budget = RunBudget(
        "corridor_pulse", default_usd=1.0, env_var="CORRIDOR_PULSE_MAX_USD"
    )

    # 14-day window: corridor pulse runs WEEKLY, so a 14d lookback gives overlap
    # tolerance (a missed weekly run still catches the prior week). Dedup-before-
    # distill makes the overlap free (already-distilled articles are skipped).
    articles = load_recent_articles(window_days=14)
    print(f"corridor_pulse: {len(articles)} lake articles in the 14-day window")
    known = known_urls_by_unit("city_pulse_corridors", "corridor")

    errors: list[str] = []
    total_new = 0
    for corridor in corridors:
        print(f"corridor_pulse: querying '{corridor}'...")
        record = build_corridor_capture(corridor, run_at, articles, exclude_urls=known.get(corridor, frozenset()))
        cited = len(record["citations"])
        print(f"  -> {cited} matched lake articles")
        if cited == 0:
            print(f"  -> no lake matches for '{corridor}' — zero LLM calls, skipping")

        path = tier1_path(corridor, run_key, yyyy, mm)
        body = to_ndjson([record])

        try:
            rows = distill_capture(record, budget)
            # Phase C geocode ladder ($0 vendors, cached): anchored facts gain
            # lat/lon/zip; misses stay native corridor grain (geo_grain NULL —
            # the spec grain enum has no 'corridor'). dry-run = no network.
            rows = annotate_geo(rows, context="FL",
                                fallback_grain=None, dry_run=args.dry_run)
        except RunBudgetExceeded:
            raise  # blown budget kills the whole run — never continue to the next corridor
        except Exception as exc:
            print(f"  -> ERROR (distill): {exc!r}")
            errors.append(corridor)
            continue
        print(f"  -> distilled {len(rows)} citation-backed facts")

        if args.dry_run:
            for r in rows:
                print(f"     [{r['topic']}] {r['fact']}  <{r['source_url']}>")
            print(f"  -> --dry-run: would upload {len(body)} bytes to {BUCKET}/{path} and write {len(rows)} rows")
            continue

        try:
            _upload_bytes(BUCKET, path, body, "application/x-ndjson")
            upsert_inventory_row(bucket=BUCKET, path=path, vintage=f"{yyyy}-{mm}",
                                 byte_size=len(body), pack_id=PACK_ID, source_url=None)
            new = write_rows(rows)
        except Exception as exc:
            print(f"  -> ERROR (persist): {exc!r} — Tier-1 raw may exist; re-distill from it.")
            errors.append(corridor)
            continue
        total_new += new
        print(f"  -> uploaded Tier-1 + wrote {new} new rows (deduped {len(rows) - new})")

    # Reconcile -> prune ONCE after the full loop, in this single process. Order is
    # reconcile then prune so freshly-capped expired children are cleaned this run.
    if not args.dry_run:
        try:
            retired = reconcile_supersession()
            print(f"corridor_pulse: superseded {retired} non-head rows into story heads.")
        except Exception as exc:
            # Writes already committed; a reconcile failure must not red the cron or block prune.
            print(f"  -> WARNING (reconcile skipped this run): {exc!r}")
        pruned = prune_expired()
        print(f"corridor_pulse: pruned {pruned} expired Tier-2 rows (raw audit retained in Tier-1).")

    print(f"corridor_pulse: complete. {total_new} new rows across {len(corridors)} corridors.")
    if errors:
        print(f"corridor_pulse: {len(errors)} corridor(s) errored: {errors}")
        if len(errors) == len(corridors):
            raise RuntimeError("corridor_pulse: all corridors failed — investigate.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
