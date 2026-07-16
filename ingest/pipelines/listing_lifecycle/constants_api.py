"""Constants for the API-fed listing extractor — SteadyAPI sole spine (RentCast retired 06/30).

Field contract VERIFIED LIVE 2026-06-30 (RULE 0.4): SteadyAPI search returns location.county_fips
as a FULL 5-DIGIT code ("12071") + meta.total for pagination; /nearby-home-values returns
body.properties[].property_id + description.baths (string, e.g. "2.5") for batched baths enrich.
"""

import os

STEADYAPI_BASE = "https://api.steadyapi.com/v1/real-estate"

# Sold-capture (Phase-2 Part A) paid-call budget, per pipeline invocation. Target ~500/mo: Lee + Collier
# run on separate daily crons, so ~8/county-run (8 * 2 counties * 30d ~= 480/mo). Env-overridable for
# tuning once the real departure-vs-recheck yield is observed. 0 disables the hook entirely.
SOLD_CHECK_CAP = int(os.environ.get("SOLD_CHECK_CAP", "8"))

# Neutral internal source identity (no vendor name in the table; the brain CITES the real source).
API_SOURCE_NAME = "api_feed"

# Enumeration seed — COUNTY-LEVEL (migrated 07/16/2026, check
# steadyapi_migrate_city_seed_to_county_level; design in docs/handoff/
# 2026-07-07-steadyapi-full-scope-handoff.md Finding 2). "Lee County" slugs to
# "Lee-County_FL", which /search resolves directly — verified live 07/07/2026
# (autocomplete slug_id) and re-probed live 07/16/2026: meta.total Lee 22,158 /
# Collier 7,877 / Hendry 1,077, with every returned row's county_fips matching its
# county (zero cross-bleed). One location per county replaces the retired 15-city
# curated list (SWFL_CITY_SEED), which silently dropped unincorporated places —
# ~4% of Lee's listings (Alva, Boca Grande, St. James City, Pine Island, Captiva…).
# Rows still self-label by API-returned county FIPS; the IN_SCOPE_FIPS gate stays.
# Widening scope = adding a county here (rentals/market_aggregates already use
# county-level location strings — this closes the one pipeline that predated them).
COUNTY_SEED = {"Lee": "Lee County", "Collier": "Collier County", "Hendry": "Hendry County"}

# County FIPS we keep (the scope gate; everything else self-drops). 5-digit FL state+county.
IN_SCOPE_FIPS = {"12071": "Lee", "12021": "Collier", "12051": "Hendry"}

# RentCast countyFips is the 3-digit county code ("071"); prefix the FL state FIPS to get "12071".
FL_STATE_FIPS = "12"

# Browser-like headers SteadyAPI's Cloudflare requires (ported from lib/listings/steadyapi.ts).
STEADYAPI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://steadyapi.com",
    "Referer": "https://steadyapi.com/",
}

# RentCast/SteadyAPI type strings -> the lifecycle property_type tokens. Unknown -> "other".
PROPERTY_TYPE_MAP = {
    "single family": "single_family", "single-family": "single_family", "single_family": "single_family",
    "condo": "condo", "condominium": "condo", "condos": "condo",
    "townhouse": "townhouse", "townhomes": "townhouse",
    "multi-family": "multi_family", "multifamily": "multi_family", "multi family": "multi_family",
    "multi_family": "multi_family", "duplex_triplex": "multi_family",
    "manufactured": "manufactured", "mobile": "manufactured", "mobile/manufactured": "manufactured",
    "land": "land", "lot": "land", "vacant land": "land", "lots/land": "land",
    "apartment": "multi_family",
}

# /search property_type FILTER values we sweep to type-stamp rows (verified live 07/07/2026, RULE 0.4:
# docs.steadyapi.com/collection.json + direct probe across Naples/Fort Myers/Cape Coral/Marco Island).
# `single_family` + `condos` + `townhomes` + `multi_family` cover the field: `condos` + `townhomes`
# together equal `condo_townhome_rowhome_coop` almost exactly (off by 0-2 rows per city, a negligible
# pure-rowhome/coop remainder) — so sweeping the broader combined filter too would just double-count
# the same property_ids for zero new information. `condo_townhome` and `duplex_triplex` returned ZERO
# results on every one of the 4 test cities — dead/non-functional filter values, excluded. Land and
# manufactured/mobile are NOT filterable at all (confirmed in docs); land keeps the existing
# beds-is-None-and-lot_sqft heuristic, manufactured has no reliable signal yet and falls to "other".
STEADYAPI_TYPE_FILTERS = ["single_family", "condos", "townhomes", "multi_family"]
