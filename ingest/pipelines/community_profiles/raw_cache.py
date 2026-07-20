"""Raw-markdown disk cache + paced batch-fetch wrapper for community_profiles'
~300+ live detail-page fetches (naplesgolfguy + 55places golf-community
discovery, per docs/superpowers/handoffs/2026-07-20-community-profiles-full-
golf-discovery-handoff.md). Two independent concerns:

  - Cache: every fetched page's markdown is written to disk under
    .raw_cache/<source>/<slug>.md (gitignored -- scratch, never committed) so a
    later re-run of distill logic (e.g. while iterating on a parser regex)
    costs zero network calls -- read straight from disk instead of re-hitting
    the live site. Idempotent: a url whose cache file already exists is never
    refetched.
  - Pacing: fetch_all_paced fetches a batch of urls SEQUENTIALLY with a
    randomized inter-request delay (default 1.5-3.5s, matching
    ingest.lib.crawl_client.fetch_sequential's own jitter precedent for "reads
    as normal traffic, not a burst") so ~300 real fetches against two small
    commercial sites never look like a scrape burst.

DESIGN NOTE -- does NOT call ingest.lib.crawl_client.fetch_sequential
directly, despite that being the named precedent: fetch_sequential returns
raw HTML (Crawl4aiSession.step() captures only r.html, discarding the
r.markdown crawl4ai also generates), while every distill_*.py parser in this
package operates on markdown. Extending Crawl4aiSession.step()'s shared
contract to also emit markdown, for this one caller, means touching
ingest/lib/crawl_client.py -- a file several OTHER pipelines
(lee_permits) import, on a repo that runs many concurrent Claude Code
sessions against the same checkout (see this pipeline's own handoff doc).
Given that, this module instead mirrors fetch_sequential's PACING precedent
(same 1.5-3.5s jitter window, one request at a time, no burst) using the sync
ingest.lib.crawl_client.fetch_page_markdown primitive this pipeline already
uses for every fetch today -- markdown output, zero changes to shared library
code. Flagged here so a future session can revisit true session-reuse
(cookie/context continuity across requests) if the paced-but-fresh-browser
approach ever proves insufficient against these two sites."""
from __future__ import annotations

import random
import time
from pathlib import Path
from typing import Callable

FetchFn = Callable[[str], str]

_CACHE_ROOT = Path(__file__).parent / ".raw_cache"


def _slug_from_url(url: str) -> str:
    """Last non-empty path segment of the url -- naplesgolfguy_url(slug) and
    fiftyfive_places_url(slug) (constants.py) both embed the real per-source
    slug there, so this recovers a stable, human-readable cache filename
    without needing the caller to pass one separately."""
    return url.rstrip("/").rsplit("/", 1)[-1]


def _cache_path(source: str, url: str) -> Path:
    return _CACHE_ROOT / source / f"{_slug_from_url(url)}.md"


def fetch_all_paced(
    urls: list[str],
    *,
    source: str,
    session_id: str = "community_profiles",
    jitter: tuple[float, float] = (1.5, 3.5),
    fetch: FetchFn | None = None,
) -> dict[str, str]:
    """Fetch every url in `urls`, in order, one at a time, sleeping a random
    jitter (default 1.5-3.5s) between requests that actually hit the network.
    A url whose cache file already exists under .raw_cache/<source>/ is read
    from disk instead of refetched (zero network, zero delay, no jitter
    consumed) -- safe to re-run against a partially-cached batch.

    `source` namespaces the cache dir (e.g. "naplesgolfguy", "55places",
    "realtyofnaplesfl") -- callers running two sources concurrently (one
    invocation per source, per the CLI's --full-discovery contract) never
    collide on cache files or rate-limit each other's site.

    `session_id` is accepted for signature parity with
    ingest.lib.crawl_client.fetch_sequential's own session_id kwarg and to
    keep this a drop-in target for a future true-session-reuse
    implementation; it is currently a no-op label since `fetch` (default
    ingest.lib.crawl_client.fetch_page_markdown) opens a fresh browser
    context per call rather than reusing one persistent session (see module
    docstring's DESIGN NOTE for why).

    `fetch` defaults to ingest.lib.crawl_client.fetch_page_markdown (a live
    import so this stays importable/patchable without crawl4ai installed at
    import time) but accepts an injected stub for instant, network-free
    tests -- same FetchFn convention pipeline.py's build_rows already uses."""
    del session_id  # see docstring -- accepted for signature parity only
    if fetch is None:
        from ingest.lib.crawl_client import fetch_page_markdown as fetch

    out: dict[str, str] = {}
    made_a_network_call = False
    for url in urls:
        path = _cache_path(source, url)
        if path.exists():
            out[url] = path.read_text(encoding="utf-8")
            continue
        if made_a_network_call and (jitter[1] > 0 or jitter[0] > 0):
            time.sleep(random.uniform(*jitter))
        made_a_network_call = True
        md = fetch(url)
        out[url] = md
        if md:
            path.parent.mkdir(parents=True, exist_ok=True)  # lazy -- no dir for an empty/all-cached batch
            path.write_text(md, encoding="utf-8")
    return out
