"""Constants for the Redfin Data Center → Lee County market-tracker ingest.

Source is a FREE static file on Redfin's public S3 bucket (no auth, no metered
API, no scraping). The national county-level "market tracker" is a single
gzipped TSV; we stream it, decompress incrementally, and keep only the
Lee County, FL rows. Same URL and format as redfin_collier — one file,
two county filters.
"""

# Redfin Data Center — county-grain market tracker (gzipped TSV).
REDFIN_COUNTY_TRACKER_URL = (
    "https://redfin-public-data.s3-us-west-2.amazonaws.com"
    "/redfin_market_tracker/county_market_tracker.tsv000.gz"
)

# Exact REGION string for Lee County in the county tracker.
# Same format as Collier ("Collier County, FL") — verified pattern.
LEE_REGION = "Lee County, FL"

# Headline property_type the brain reads for its direction signal.
HEADLINE_PROPERTY_TYPE = "All Residential"
