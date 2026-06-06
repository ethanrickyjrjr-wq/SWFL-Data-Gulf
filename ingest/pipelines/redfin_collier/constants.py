"""Constants for the Redfin Data Center → Collier County market-tracker ingest.

Source is a FREE static file on Redfin's public S3 bucket (no auth, no metered
API, no scraping). The national county-level "market tracker" is a single
gzipped TSV; we stream it, decompress incrementally, and keep only the
Collier County, FL rows. Verified live 2026-06-06: HTTP 200, ~241 MB gz,
REGION values formatted "Collier County, FL".
"""

# Redfin Data Center — county-grain market tracker (gzipped TSV).
REDFIN_COUNTY_TRACKER_URL = (
    "https://redfin-public-data.s3-us-west-2.amazonaws.com"
    "/redfin_market_tracker/county_market_tracker.tsv000.gz"
)

# Exact REGION string for Collier County in the county tracker (verified live).
COLLIER_REGION = "Collier County, FL"

# Headline property_type the brain reads for its direction signal. Redfin emits
# one aggregate "All Residential" row per region/period alongside the per-type
# breakdowns (Single Family Residential, Condo/Co-op, Townhouse, ...).
HEADLINE_PROPERTY_TYPE = "All Residential"
