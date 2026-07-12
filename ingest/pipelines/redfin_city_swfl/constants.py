"""Constants for the Redfin Data Center → FL city market-tracker ingest.

Source is a FREE static file on Redfin's public S3 bucket (no auth, no metered
API, no scraping) — the national CITY-level "market tracker" gzipped TSV (sibling
of the county tracker `redfin_lee`/`redfin_collier` stream). We stream it,
decompress incrementally, and keep EVERY Florida city — separation happens in the
lake, not at ingest (operator directive 07/12/2026: "bring in all the data and
separate in lake"; adding a city downstream is a query, never a pipeline PR).

City grain is what the daily desk hero needs for a source-faithful SOLD anchor:
`/housing-market-details` (SteadyAPI) is ZIP-only and the Redfin *county* tracker
is county-only, so neither serves a true city-grain median sale price. This file
does (verified live 07/11/2026: REGION == "Cape Coral, FL"/"Fort Myers, FL"/
"Naples, FL" all present with MEDIAN_SALE_PRICE). Cadence is monthly — this is the
monthly SOLD anchor beneath the daily ASKING line (active-inventory list price).
"""

# Redfin Data Center — CITY-grain market tracker (gzipped TSV, ~1 GB compressed).
REDFIN_CITY_TRACKER_URL = (
    "https://redfin-public-data.s3-us-west-2.amazonaws.com"
    "/redfin_market_tracker/city_market_tracker.tsv000.gz"
)

# Ingest keeps every region with this exact suffix (Florida-wide; other states
# would be paid storage with no consumer). Matching is on the parsed REGION cell,
# suffix-exact, so "Naples, ME" / "Miami, OH" style collisions are excluded.
FL_REGION_SUFFIX = ", FL"

# The three desk-hero cities (verbatim REGION strings, verified live 07/11/2026).
# NOT an ingest filter anymore — this is the consumer-side selection the desk
# reads, and the ingest's own landing guard (all three must be present in every
# pull, or the run goes red).
DESK_HERO_REGIONS = ("Cape Coral, FL", "Fort Myers, FL", "Naples, FL")

# desk `area` slug <- exact Redfin REGION for the hero trio. Slugs for ALL rows
# are DERIVED (resources._area_slug); this map is pinned by tests so the derived
# slugs can never drift from what the desk hero keys on.
REGION_TO_AREA = {
    "Cape Coral, FL": "cape_coral",
    "Fort Myers, FL": "fort_myers",
    "Naples, FL": "naples",
}

# Headline property_type the desk reads for the sold anchor.
HEADLINE_PROPERTY_TYPE = "All Residential"
