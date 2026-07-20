"""community_profiles amenity-scrape pipeline. Manual run only (no GHA cron —
per the design spec's cadence decision). No LLM anywhere in this file."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Callable

import dlt

from ingest.lib.guards import assert_min_rows
from .constants import HOA_COMPARISON_URL, SCHEMA, TABLE_NAME, fiftyfive_places_url, naplesgolfguy_url
from .distill_55places import parse_55places_detail
from .distill_naplesgolfguy import parse_naplesgolfguy_detail
from .distill_realtyofnaplesfl import parse_hoa_comparison_page
from .merge import merge_community_row
from .normalize import normalize_community_name, slugify

_SEED_PATH = Path(__file__).parent / "seed_communities.json"

FetchFn = Callable[[str], str]


def _load_seed() -> list[dict]:
    return json.loads(_SEED_PATH.read_text(encoding="utf-8"))


def build_rows(seed: list[dict], *, hoa_table: list[dict], fetch: FetchFn) -> list[dict]:
    """Pure orchestration (network isolated behind `fetch`). For each seed name:
    fetch naplesgolfguy + 55places detail pages by slug guess, distill whatever
    came back (empty markdown -> that source's parser returns all-None, which
    merge.py already treats as absent), match the hoa_comparison table by
    normalized name, and merge. A source with no page for this community
    contributes nothing — never raises, never invents."""
    hoa_by_normalized = {normalize_community_name(r["name"]): r for r in hoa_table}

    rows: list[dict] = []
    for entry in seed:
        name = entry["name"]
        slug = slugify(name)
        county = entry["county"]

        ngg_md = fetch(naplesgolfguy_url(slug))
        ngg = parse_naplesgolfguy_detail(ngg_md) if ngg_md else None

        fp_md = fetch(fiftyfive_places_url(slug))
        fp = parse_55places_detail(fp_md) if fp_md else None

        hoa = hoa_by_normalized.get(normalize_community_name(name))

        rows.append(
            merge_community_row(
                slug,
                name,
                county,
                naplesgolfguy=ngg,
                fiftyfive_places=fp,
                hoa_comparison=hoa,
            )
        )
    return rows


@dlt.resource(name=TABLE_NAME, primary_key="community_slug", write_disposition="merge")
def community_profiles_resource(rows: list[dict]):
    yield from rows


def run_pipeline(*, fetch: FetchFn) -> None:
    from ingest.lib.crawl_client import fetch_page_markdown  # live import, keeps build_rows pure

    seed = _load_seed()
    hoa_md = fetch_page_markdown(HOA_COMPARISON_URL)
    hoa_table = parse_hoa_comparison_page(hoa_md) if hoa_md else []

    rows = build_rows(seed, hoa_table=hoa_table, fetch=fetch)
    assert_min_rows(len(rows), minimum=1, label="community_profiles")

    pipeline = dlt.pipeline(
        pipeline_name="community_profiles",
        destination="postgres",
        dataset_name=SCHEMA,
    )
    load_info = pipeline.run(community_profiles_resource(rows))
    load_info.raise_on_failed_jobs()


def main(argv: list[str] | None = None) -> int:
    from ingest.lib.crawl_client import fetch_page_markdown

    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="Fetch and distill only; skip the dlt write.")
    p.add_argument("--limit", type=int, default=None, help="Only process the first N seed entries (dry-run probing).")
    args = p.parse_args(argv)

    seed = _load_seed()
    if args.limit:
        seed = seed[: args.limit]

    if args.dry_run:
        hoa_md = fetch_page_markdown(HOA_COMPARISON_URL)
        hoa_table = parse_hoa_comparison_page(hoa_md) if hoa_md else []
        rows = build_rows(seed, hoa_table=hoa_table, fetch=fetch_page_markdown)
        print(f"community_profiles dry-run: {len(rows)} rows (dlt write skipped)")
        for row in rows:
            print(row)
        return 0

    run_pipeline(fetch=fetch_page_markdown)
    return 0


if __name__ == "__main__":
    main()
