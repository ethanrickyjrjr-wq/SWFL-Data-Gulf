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
from .discover import build_discovery_maps
from .distill_55places import parse_55places_detail
from .distill_naplesgolfguy import parse_naplesgolfguy_detail
from .distill_realtyofnaplesfl import parse_hoa_comparison_page
from .merge import merge_community_row
from .normalize import normalize_community_name, slugify

_SEED_PATH = Path(__file__).parent / "seed_communities.json"

FetchFn = Callable[[str], str]


def _load_seed() -> list[dict]:
    return json.loads(_SEED_PATH.read_text(encoding="utf-8"))


def build_rows(
    seed: list[dict],
    *,
    hoa_table: list[dict],
    fetch: FetchFn,
    ngg_map: dict[str, str] | None = None,
    fp_map: dict[str, str] | None = None,
) -> list[dict]:
    """Pure orchestration (network isolated behind `fetch`). For each seed name:
    resolve the REAL per-source URL slug via discover.py's directory maps
    (ngg_map/fp_map, normalized-name -> slug) when available, falling back to
    slugify(name) only when the community isn't in that source's directory —
    naive guessing alone is wrong often enough (naplesgolfguy's real URL for
    "Grey Oaks" is grey-oaks-country-club, not grey-oaks) to risk silently
    attributing a wrong page's content to the wrong community. Distill
    whatever came back (empty markdown -> that source's parser returns
    all-None, which merge.py already treats as absent), match the
    hoa_comparison table by normalized name, and merge. community_slug (our
    own identity/output key) always stays slugify(name) regardless of which
    per-source slug was actually fetched — merge_community_row tracks that
    separately via naplesgolfguy_slug/fiftyfive_places_slug so a discovered
    URL never gets silently re-derived from the wrong slug."""
    ngg_map = ngg_map or {}
    fp_map = fp_map or {}
    hoa_by_normalized = {normalize_community_name(r["name"]): r for r in hoa_table}

    rows: list[dict] = []
    for entry in seed:
        name = entry["name"]
        slug = slugify(name)
        county = entry["county"]
        normalized = normalize_community_name(name)

        ngg_fetch_slug = ngg_map.get(normalized, slug)
        ngg_md = fetch(naplesgolfguy_url(ngg_fetch_slug))
        ngg = parse_naplesgolfguy_detail(ngg_md) if ngg_md else None

        fp_fetch_slug = fp_map.get(normalized, slug)
        fp_md = fetch(fiftyfive_places_url(fp_fetch_slug))
        fp = parse_55places_detail(fp_md) if fp_md else None

        hoa = hoa_by_normalized.get(normalized)

        rows.append(
            merge_community_row(
                slug,
                name,
                county,
                naplesgolfguy=ngg,
                fiftyfive_places=fp,
                hoa_comparison=hoa,
                naplesgolfguy_slug=ngg_fetch_slug,
                fiftyfive_places_slug=fp_fetch_slug,
            )
        )
    return rows


@dlt.resource(name=TABLE_NAME, primary_key="community_slug", write_disposition="merge")
def community_profiles_resource(rows: list[dict]):
    yield from rows


def maybe_register_alias(slug: str, label: str, aliases: dict) -> dict:
    """Add a new slug -> {label, patterns} entry when `slug` isn't already in
    the shared fixture (fixtures/community-aliases.json, read by both this
    pipeline's normalize.normalize_community_name callers and
    refinery/lib/subdivision-aliases.mts). Existing entries are never
    overwritten — a human already curated that label/pattern set."""
    if slug in aliases:
        return aliases
    updated = dict(aliases)
    updated[slug] = {"label": label, "patterns": [normalize_community_name(label)]}
    return updated


def run_pipeline(*, fetch: FetchFn) -> None:
    from ingest.lib.crawl_client import fetch_page_markdown  # live import, keeps build_rows pure
    from ingest.lib.community_aliases import _FIXTURE_PATH, load_community_aliases

    seed = _load_seed()
    hoa_md = fetch_page_markdown(HOA_COMPARISON_URL)
    hoa_table = parse_hoa_comparison_page(hoa_md) if hoa_md else []
    ngg_map, fp_map = build_discovery_maps(fetch)

    rows = build_rows(seed, hoa_table=hoa_table, fetch=fetch, ngg_map=ngg_map, fp_map=fp_map)
    assert_min_rows(len(rows), minimum=1, label="community_profiles")

    pipeline = dlt.pipeline(
        pipeline_name="community_profiles",
        destination="postgres",
        dataset_name=SCHEMA,
    )
    load_info = pipeline.run(community_profiles_resource(rows))
    load_info.raise_on_failed_jobs()

    aliases = load_community_aliases()
    for row in rows:
        aliases = maybe_register_alias(row["community_slug"], row["label"], aliases)
    _FIXTURE_PATH.write_text(json.dumps(aliases, indent=2, sort_keys=True) + "\n", encoding="utf-8")


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
        ngg_map, fp_map = build_discovery_maps(fetch_page_markdown)
        rows = build_rows(
            seed, hoa_table=hoa_table, fetch=fetch_page_markdown, ngg_map=ngg_map, fp_map=fp_map
        )
        print(f"community_profiles dry-run: {len(rows)} rows (dlt write skipped)")
        for row in rows:
            print(row)
        return 0

    run_pipeline(fetch=fetch_page_markdown)
    return 0


if __name__ == "__main__":
    main()
