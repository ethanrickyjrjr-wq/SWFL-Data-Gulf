"""Stage 1 discovery, per the design spec (docs/superpowers/specs/2026-07-20-
community-profiles-amenity-scrape-design.md): build a name -> real-URL-slug
map from each source's own directory/nav pages, instead of guessing
slugify(seed_name) as the detail-page URL.

The naive guess is wrong often enough to matter: naplesgolfguy's real URL for
"Grey Oaks" is grey-oaks-country-club, not grey-oaks; for "Bay Colony" it's
bay-colony-golf-club, not bay-colony. A wrong-but-live guessed URL can still
return a page (redirect or otherwise) whose regex-matched content gets
silently attributed to the wrong community — this module is how that risk
gets closed.

Matches by the URL SLUG'S OWN words, not the page's link text: 55places
truncates long display names with "..." ("Gulf Harbour Yacht & ..."), but the
URL slug is always the whole name. Re-deriving a normalized name from the
slug and reusing the same normalize_community_name() as the rest of this
pipeline means a truncated display string never breaks a match.
"""
from __future__ import annotations

import re
import time
from typing import Callable

from .normalize import normalize_community_name

FetchFn = Callable[[str], str]

# Greater Sarasota is a 4th naplesgolfguy regional page but deliberately
# excluded — out of SCOPE (CLAUDE.md: Lee + Collier only).
#
# The 3 regional pages and the 3 cross-cutting membership-type pages
# (bundled/equity/luxury) are NOT fully redundant — found live 07/20/2026:
# "Bonita National Golf & Country Club" is listed on the Bundled page's
# Bonita Springs/Estero section but absent from the Bonita Springs/Estero
# regional page itself. Fetching both sets is the only way to get real
# coverage; a duplicate slug across pages is harmless (parse_directory
# keeps the first one seen).
NAPLESGOLFGUY_REGIONAL_URLS = [
    "https://naplesgolfguy.com/golf-community/naples-golf-communities/",
    "https://naplesgolfguy.com/golf-community/bonita-springs-estero-golf-communities/",
    "https://naplesgolfguy.com/golf-community/fort-myers-golf-communities/",
    "https://naplesgolfguy.com/golf-community/bundled-golf-communities/",
    "https://naplesgolfguy.com/golf-community/equity-golf-communities/",
    "https://naplesgolfguy.com/golf-community/luxury-golf-communities/",
]

FIFTYFIVE_PLACES_AREA_URLS = [
    "https://www.55places.com/florida/area/naples-bonita-springs-area",
    "https://www.55places.com/florida/area/fort-myers-cape-coral-area",
]

_NAPLESGOLFGUY_LINK_RE = re.compile(r"/golf-communities/([a-z0-9-]+)/?\)")
_FIFTYFIVE_PLACES_LINK_RE = re.compile(r"/florida/communities/([a-z0-9-]+)\)")


def _slug_to_normalized_name(slug: str) -> str:
    return normalize_community_name(slug.replace("-", " "))


def _parse_directory(markdown: str, link_re: re.Pattern) -> dict[str, str]:
    """{normalized_name (derived from the slug): slug}. A community linked
    more than once on the same page (nav duplicates, image + text links,
    related-listings sidebars) keeps the first slug seen — harmless since
    it's the same URL every time."""
    found: dict[str, str] = {}
    for match in link_re.finditer(markdown):
        slug = match.group(1)
        found.setdefault(_slug_to_normalized_name(slug), slug)
    return found


def parse_naplesgolfguy_directory(markdown: str) -> dict[str, str]:
    return _parse_directory(markdown, _NAPLESGOLFGUY_LINK_RE)


def parse_55places_directory(markdown: str) -> dict[str, str]:
    return _parse_directory(markdown, _FIFTYFIVE_PLACES_LINK_RE)


def build_discovery_maps(
    fetch: FetchFn, *, delay_seconds: float = 1.5
) -> tuple[dict[str, str], dict[str, str]]:
    """Fetch every directory/nav page for both sources (8 fetches total — a
    one-time discovery cost, not a per-community sweep) and merge into two
    normalized-name -> slug maps. A page that fails to fetch (empty markdown)
    is skipped, never raises — partial discovery still beats none.

    delay_seconds: a fixed pause BEFORE each fetch after the first — low
    volume (8 fetches) so low risk either way, but kept consistent with the
    pacing standard the rest of this effort holds detail-page fetches to (see
    ingest.lib.crawl_client.fetch_sequential's jitter). Tests pass
    delay_seconds=0 to stay fast."""
    ngg_map: dict[str, str] = {}
    fp_map: dict[str, str] = {}
    all_urls = list(NAPLESGOLFGUY_REGIONAL_URLS) + list(FIFTYFIVE_PLACES_AREA_URLS)

    for i, url in enumerate(all_urls):
        if i > 0 and delay_seconds:
            time.sleep(delay_seconds)
        md = fetch(url)
        if not md:
            continue
        if url in NAPLESGOLFGUY_REGIONAL_URLS:
            ngg_map.update(parse_naplesgolfguy_directory(md))
        else:
            fp_map.update(parse_55places_directory(md))

    return ngg_map, fp_map
