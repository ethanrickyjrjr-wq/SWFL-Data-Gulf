"""Constants for the Redfin Data Center → SWFL city market-tracker ingest.

Source is a FREE static file on Redfin's public S3 bucket (no auth, no metered
API, no scraping) — the national CITY-level "market tracker" gzipped TSV (sibling
of the county tracker `redfin_lee`/`redfin_collier` stream). We stream it,
decompress incrementally, and keep only the three SWFL desk-hero cities.

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

# Exact REGION strings for the three desk-hero cities (verbatim, verified live
# 07/11/2026). Matching is EXACT after a cheap substring gate so sibling places
# ("North Fort Myers, FL", "Fort Myers Beach, FL", "Naples Park, FL") are excluded.
CITY_REGIONS = ("Cape Coral, FL", "Fort Myers, FL", "Naples, FL")

# desk `area` slug <- exact Redfin REGION (the desk hero keys on these slugs).
REGION_TO_AREA = {
    "Cape Coral, FL": "cape_coral",
    "Fort Myers, FL": "fort_myers",
    "Naples, FL": "naples",
}

# Headline property_type the desk reads for the sold anchor.
HEADLINE_PROPERTY_TYPE = "All Residential"
