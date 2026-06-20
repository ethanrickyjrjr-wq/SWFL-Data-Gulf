"""SWFL corridor pulse — weekly current-events capture -> Tier-1 cold + Tier-2 distilled (Build #2).

Corridor-grained, weekly sibling of ingest/pipelines/city_pulse. Per corridor: one
capture (Anthropic web_search_20250305)
surfaces recent commercial-real-estate / current-events signals on that corridor;
the raw response + flattened citations[] is written to Tier-1 cold storage; distill.py
then turns it into citation-backed rows in data_lake.city_pulse_corridors.

Grain: the 25 verified CRE corridors in public.corridor_profiles (live runtime
authority). Live runs key every row on `corridor_name`. A --dry-run with no DB falls
back to fixtures/corridor-centroids.json (keyed on corridor_label) so the path is
exercisable offline — that fallback NEVER writes.

Distill is SYNCHRONOUS (one forced-tool call per corridor) — 25 corridors/week does
not justify the Batch API poll loop (Build #2 decision).

Tool version: web_search_20250305 — NOT web_search_20260209 (which suppresses
per-claim citations[], the no-hallucination spine). See the daily city_pulse pipeline.

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
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env.local")

from ingest.lib.storage_uploader import _upload_bytes  # noqa: E402
from ingest.lib.tier1_inventory import (  # noqa: E402
    _get_connection,
    upsert_inventory_row,
)
from ingest.pipelines.city_pulse_corridors.distill import (  # noqa: E402
    distill_capture, write_rows, prune_expired, reconcile_supersession,
)

MODEL = "claude-sonnet-4-6"
SEARCH_TOOL_VERSION = "web_search_20250305"
BUCKET = "lake-tier1"
PACK_ID = "corridor-pulse-swfl"

CENTROIDS_FIXTURE = Path(__file__).resolve().parents[3] / "fixtures" / "corridor-centroids.json"

# Audited domains — brokerages + county/gov/state + Gulfshore Business (the one SWFL
# paper that does NOT block Anthropic's crawler). Mirrors corridor_grounded's set.
# Do NOT add news-press.com or naplesnews.com (block the crawler).
ALLOWED_DOMAINS = [
    "cushmanwakefield.com",
    "lsicompanies.com",
    "creconsultants.com",
    "ipcnaples.com",
    "cbre.com",
    "colliers.com",
    "leegov.com",
    "colliercountyfl.gov",
    "leepa.org",
    "collierappraiser.com",
    "gulfshorebusiness.com",
    "businessobserverfl.com",
    "bls.gov",
    "census.gov",
    "fdot.gov",
]

USER_LOCATION = {
    "type": "approximate",
    "city": "Fort Myers",
    "region": "Florida",
    "country": "US",
    "timezone": "America/New_York",
}

QUERY_TEMPLATE = (
    "Provide a current-events briefing for the {corridor} corridor in Southwest "
    "Florida (Lee or Collier County) covering the LAST 90 DAYS. Surface concrete, "
    "dated commercial-real-estate and business developments on or immediately along "
    "this corridor:\n"
    "- Commercial building sales, large lease signings, or land acquisitions.\n"
    "- Construction starts, planning-board approvals, or permit milestones.\n"
    "- New business openings, closings, expansions, or major hiring/layoffs.\n"
    "- Storm, flood, or disaster impacts to the corridor's economy.\n\n"
    "Quote specific figures, company names, dollar amounts, and dates. Cite each "
    "claim to its primary source (broker reports, county records, local news)."
)


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


def _extract_citations(content: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten all non-null citations from model_dump() content blocks, deduped."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for block in content:
        for c in block.get("citations") or []:
            key = f"{c.get('url')}|{c.get('cited_text', '')[:60]}"
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "url": c.get("url"),
                "title": c.get("title"),
                "cited_text": c.get("cited_text"),
                "type": c.get("type"),
            })
    return out


def build_record(corridor: str, query: str, response_dump: dict[str, Any], run_at: str) -> dict[str, Any]:
    content = response_dump.get("content", [])
    citations = _extract_citations(content)
    usage = response_dump.get("usage", {}) or {}
    return {
        "corridor": corridor,
        "corridor_slug": slug(corridor),
        "query": query,
        "model": MODEL,
        "tool_version": SEARCH_TOOL_VERSION,
        "run_at": run_at,
        "input_tokens": usage.get("input_tokens"),
        "output_tokens": usage.get("output_tokens"),
        "stop_reason": response_dump.get("stop_reason"),
        "response": response_dump,
        "citations": citations,
        "cited_text_count": len(citations),
    }


def run_corridor_search(corridor: str, run_at: str) -> dict[str, Any]:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    query = QUERY_TEMPLATE.format(corridor=corridor)
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        tools=[{
            "type": SEARCH_TOOL_VERSION,
            "name": "web_search",
            "max_uses": 8,
            "allowed_domains": ALLOWED_DOMAINS,
            "user_location": USER_LOCATION,
        }],
        messages=[{"role": "user", "content": query}],
    )
    return build_record(corridor, query, response.model_dump(), run_at)




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

    errors: list[str] = []
    total_new = 0
    for corridor in corridors:
        print(f"corridor_pulse: querying '{corridor}'...")
        try:
            record = run_corridor_search(corridor, run_at)
        except Exception as exc:
            print(f"  -> ERROR (search): {exc!r}")
            errors.append(corridor)
            continue

        cited = record["cited_text_count"]
        print(f"  -> {cited} cited_text spans | {record['input_tokens']} in / {record['output_tokens']} out")

        path = tier1_path(corridor, run_key, yyyy, mm)
        body = to_ndjson([record])

        try:
            rows = distill_capture(record)
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
