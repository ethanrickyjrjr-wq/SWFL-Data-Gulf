"""SWFL city pulse — daily current-events capture -> Tier-1 cold + Tier-2 distilled.

Per city: the free news lake (data_lake.news_articles_swfl, crawl4ai-fed by the
news_swfl pipeline) is matched against the city name (ingest.lib.pulse_match)
and packed into the capture shape distill.py already consumes. The raw
matched-article set + flattened citations[] is written to Tier-1 cold storage;
distill.py then turns it into citation-backed rows in data_lake.city_pulse.

Retrofit (Phase 1, 07/07/2026): replaces the paid web_search_20250305 capture
(dead code removed) with the $0 lake-read capture. See
docs/superpowers/plans/2026-07-07-pulse-intelligence-engine/01-phase1-plan.md.

Env: ANTHROPIC_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_KEY +
DESTINATION__POSTGRES__CREDENTIALS.

CLI:
  python -m ingest.pipelines.city_pulse.pipeline
  python -m ingest.pipelines.city_pulse.pipeline --dry-run
  python -m ingest.pipelines.city_pulse.pipeline --city "Naples"
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

from ingest.lib.api_usage import RunBudget, RunBudgetExceeded, log_api_usage  # noqa: E402
from ingest.lib.pulse_lake import build_capture, load_recent_articles  # noqa: E402
from ingest.lib.storage_uploader import _upload_bytes  # noqa: E402
from ingest.lib.tier1_inventory import upsert_inventory_row  # noqa: E402
from ingest.pipelines.city_pulse.distill import (  # noqa: E402
    distill_capture, write_rows, prune_expired, reconcile_supersession,
)

CITIES = [
    "Lehigh Acres", "Cape Coral", "Fort Myers", "Naples",
    "Estero", "Bonita Springs", "Fort Myers Beach",
    "Sanibel", "North Fort Myers", "Marco Island",
    "East Naples", "North Naples", "Golden Gate",
]

MODEL = "claude-sonnet-4-6"
BUCKET = "lake-tier1"


def slug(city: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", city.lower()).strip("-")


def build_city_capture(city: str, run_at: str, articles: list) -> dict:
    """Lake-fed replacement for run_city_search: no paid web_search, no API call."""
    return build_capture("city", city, run_at, articles)


def to_ndjson(records: list[dict[str, Any]]) -> bytes:
    return ("\n".join(json.dumps(r, ensure_ascii=False) for r in records) + "\n").encode("utf-8")


def tier1_path(city: str, run_key: str, yyyy: str, mm: str) -> str:
    return f"city_pulse/{slug(city)}/year={yyyy}/month={mm}/run-{run_key}.ndjson"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--city", metavar="NAME", help="Run a single city by exact name.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Run search + distill; print rows, skip Tier-1 upload and DB write.")
    args = parser.parse_args(argv)

    cities = [args.city] if args.city else CITIES
    if args.city and args.city not in CITIES:
        parser.error(f"--city must be one of {CITIES}")

    now = datetime.now(timezone.utc)
    run_at = now.isoformat()
    run_key = now.strftime("%Y%m%dT%H%M%SZ")
    yyyy, mm = f"{now.year:04d}", f"{now.month:02d}"

    # Hard run budget (operator guard 07/05/2026): the retrofit's only paid call
    # left is the Sonnet distill (~$0.03-0.07/unit), so 13 cities structurally
    # ceilings well under $1. Crossing it = misbehaving run — abort loudly
    # rather than drain the account. Override: CITY_PULSE_MAX_USD.
    budget = RunBudget("city_pulse", default_usd=1.0, env_var="CITY_PULSE_MAX_USD")

    articles = load_recent_articles(window_days=7)
    print(f"city_pulse: {len(articles)} lake articles in the 7-day window")

    errors: list[str] = []
    total_new = 0
    for city in cities:
        print(f"city_pulse: querying '{city}'...")
        record = build_city_capture(city, run_at, articles)
        cited = len(record["citations"])
        print(f"  -> {cited} matched lake articles")
        if cited == 0:
            print(f"  -> no lake matches for '{city}' — zero LLM calls, skipping")

        path = tier1_path(city, run_key, yyyy, mm)
        body = to_ndjson([record])

        try:
            rows = distill_capture(record, budget)
        except RunBudgetExceeded:
            raise  # blown budget kills the whole run — never continue to the next city
        except Exception as exc:
            print(f"  -> ERROR (distill): {exc!r}")
            errors.append(city)
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
                                 byte_size=len(body), pack_id="city-pulse-swfl", source_url=None)
            new = write_rows(rows)
        except Exception as exc:
            # Tier-1 may have been written; Tier-2 can be re-distilled from it.
            print(f"  -> ERROR (persist): {exc!r} — Tier-1 raw may exist; re-distill from it.")
            errors.append(city)
            continue
        total_new += new
        print(f"  -> uploaded Tier-1 + wrote {new} new rows (deduped {len(rows) - new})")

        # Sequence is capture -> distill -> upsert -> prune. Prune runs ONCE here,
        # AFTER the full per-city loop, in this single process — never concurrent
        # with an upsert. Doubly safe: prune deletes only expires_at < now(), and a
        # just-refreshed row is fresh (expires_at > now()), so it is never pruned.
    if not args.dry_run:
        try:
            retired = reconcile_supersession()
            print(f"city_pulse: superseded {retired} non-head rows into story heads.")
        except Exception as exc:
            # Writes already committed; a reconcile failure must not red the cron or block prune.
            print(f"  -> WARNING (reconcile skipped this run): {exc!r}")
        pruned = prune_expired()
        print(f"city_pulse: pruned {pruned} expired Tier-2 rows (raw audit retained in Tier-1).")

    print(f"city_pulse: complete. {total_new} new rows across {len(cities)} cities.")
    if errors:
        print(f"city_pulse: {len(errors)} city(ies) errored: {errors}")
        if len(errors) == len(cities):
            raise RuntimeError("city_pulse: all cities failed — investigate.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
