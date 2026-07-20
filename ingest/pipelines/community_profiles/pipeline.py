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
_MASTER_LIST_PATH = Path(__file__).parent / "golf_communities_master.json"

FetchFn = Callable[[str], str]

_FULL_DISCOVERY_SOURCES = ("naplesgolfguy", "55places")


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


def build_full_discovery_urls(master_list: list[dict], *, source: str) -> dict[str, str]:
    """{community_slug: detail_page_url} for every master_list entry that has
    a real per-source slug for `source` -- entries with a null/missing slug
    for that source are skipped (55places only covers 51/158 golf
    communities per the handoff's own live-verified count; that's a real
    source-coverage ceiling, not a bug, so it's silently absent here rather
    than guessed at)."""
    if source == "naplesgolfguy":
        slug_key, url_fn = "naplesgolfguy_slug", naplesgolfguy_url
    elif source == "55places":
        slug_key, url_fn = "fiftyfive_places_slug", fiftyfive_places_url
    else:
        raise ValueError(f"unknown source: {source!r} (expected one of {_FULL_DISCOVERY_SOURCES})")

    urls: dict[str, str] = {}
    for entry in master_list:
        source_slug = entry.get(slug_key)
        if not source_slug:
            continue
        urls[entry["slug"]] = url_fn(source_slug)
    return urls


def run_full_discovery(*, source: str, master_list_path: Path, out_path: Path) -> int:
    """Fetch (paced, cached) + distill ONE source's full detail-page set from
    the golf-community master list, writing {community_slug: partial_dict}
    to out_path. Source-scoped on purpose (never merges across sources here)
    so two invocations -- one per source -- can run concurrently against two
    different domains without either one bursting its own site (see
    raw_cache.fetch_all_paced's pacing + this pipeline's handoff doc).
    Empty-tolerant: a missing master list (a parallel task builds it
    separately) or a source with zero resolved urls exits 0 with a loud
    print, never a crash -- ODD-style defensive behavior."""
    from .raw_cache import fetch_all_paced

    if not master_list_path.exists():
        print(
            f"community_profiles --full-discovery: master list not found at "
            f"{master_list_path} yet -- nothing to do"
        )
        return 0

    master_list = json.loads(master_list_path.read_text(encoding="utf-8"))
    urls_by_slug = build_full_discovery_urls(master_list, source=source)
    if not urls_by_slug:
        print(f"community_profiles --full-discovery: no {source} urls resolved from {master_list_path}")
        return 0

    parser = parse_naplesgolfguy_detail if source == "naplesgolfguy" else parse_55places_detail
    markdown_by_url = fetch_all_paced(list(urls_by_slug.values()), source=source)

    partials: dict[str, dict] = {}
    for community_slug, url in urls_by_slug.items():
        md = markdown_by_url.get(url, "")
        partials[community_slug] = parser(md) if md else {}

    out_path.write_text(json.dumps(partials, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"community_profiles --full-discovery ({source}): {len(partials)} communities -> {out_path}")
    return 0


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
    p.add_argument(
        "--full-discovery",
        action="store_true",
        help="Run a full paced+cached fetch/distill pass for one source against golf_communities_master.json, writing partials to --out. Never writes to the dlt/postgres destination.",
    )
    p.add_argument(
        "--source",
        choices=_FULL_DISCOVERY_SOURCES,
        default=None,
        help="Required with --full-discovery: which source's detail pages to fetch.",
    )
    p.add_argument(
        "--master-list",
        type=Path,
        default=_MASTER_LIST_PATH,
        help="Path to the {slug,label,county,naplesgolfguy_slug,fiftyfive_places_slug} master list JSON.",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Required with --full-discovery: where to write the per-community partial dict JSON.",
    )
    args = p.parse_args(argv)

    if args.full_discovery:
        if not args.source or not args.out:
            p.error("--full-discovery requires --source and --out")
        return run_full_discovery(source=args.source, master_list_path=args.master_list, out_path=args.out)

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
